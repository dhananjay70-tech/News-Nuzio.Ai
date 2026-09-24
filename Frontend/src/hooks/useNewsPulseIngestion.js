import { useState, useEffect, useRef, useCallback } from 'react';
import { newsPulseAPI } from '../api/api';
import { classifyPulseError, isCanceledRequest } from '../utils/newsPulse';

// Poll about every 10 seconds - never faster: the backend rate limit (100
// requests / 15 min per IP) is shared with the rest of the app, and a full
// ingestion takes a few minutes.
export const POLL_INTERVAL_MS = 10000;
// Give up polling after this long (the job may still be running server-side)
// so a stuck job can't burn through the shared rate limit indefinitely.
const MAX_POLL_MS = 10 * 60 * 1000;
const MAX_CONSECUTIVE_POLL_FAILURES = 3;

// The active job id survives reloads/navigation so coming back to the page
// resumes watching the same job instead of allowing a duplicate trigger.
const STORAGE_KEY = 'nuzio_newspulse_job';

const readStoredJob = () => {
  try {
    const job = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return job && typeof job.jobId === 'string' ? job : null;
  } catch {
    return null;
  }
};

const storeJob = (job) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(job));
  } catch {
    // Private mode / storage blocked - resuming after a reload just won't work
  }
};

const clearStoredJob = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};

const IDLE = { phase: 'idle', jobId: null, jobStatus: null, startedAt: null, result: null, failure: null };

/**
 * Refresh-news workflow: POST /ingest/trigger -> poll /ingest/status/:jobId
 * every ~10s until COMPLETED or FAILED.
 *
 * phase: 'idle' | 'triggering' | 'running' | 'completed' | 'failed'
 * failure.kind (when phase === 'failed'):
 *   'trigger'     - the job could not be started (failure.errorKind says why)
 *   'job'         - the service reported the job FAILED
 *   'lost'        - the service no longer knows the job (e.g. it restarted)
 *   'unreachable' - status checks kept failing; the job may still be running
 *   'timeout'     - still not finished after MAX_POLL_MS; may still be running
 *
 * `onCompleted(result)` runs once when a job is seen COMPLETED.
 */
const useNewsPulseIngestion = ({ onCompleted } = {}) => {
  // A job left running on a previous visit shows as running from the first
  // render (Refresh stays disabled); the effect below resumes watching it.
  const [state, setState] = useState(() => {
    const stored = readStoredJob();
    return stored ? { ...IDLE, phase: 'running', jobId: stored.jobId, startedAt: stored.startedAt } : IDLE;
  });

  // busyRef blocks duplicate triggers synchronously, before a re-render can
  // disable the button (e.g. a fast double-click).
  const busyRef = useRef(false);
  const mountedRef = useRef(false);
  const sessionRef = useRef(0);
  const timerRef = useRef(null);
  const abortRef = useRef(null);
  const onCompletedRef = useRef(onCompleted);

  useEffect(() => {
    onCompletedRef.current = onCompleted;
  });

  // Invalidates any scheduled or in-flight poll.
  const stopPolling = useCallback(() => {
    sessionRef.current += 1;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const startPolling = useCallback(
    (jobId, startedAt, { immediate }) => {
      stopPolling();
      const session = sessionRef.current;
      const sessionStart = Date.now();
      const isCurrent = () => session === sessionRef.current;

      const fail = (failure, { keepJob = false } = {}) => {
        busyRef.current = false;
        if (!keepJob) clearStoredJob();
        setState({ ...IDLE, phase: 'failed', jobId, startedAt, failure });
      };

      const schedule = (failures) => {
        if (Date.now() - sessionStart >= MAX_POLL_MS) {
          fail({ kind: 'timeout' }, { keepJob: true });
          return;
        }
        timerRef.current = setTimeout(() => tick(failures), POLL_INTERVAL_MS);
      };

      const tick = async (failures) => {
        if (!isCurrent()) return;
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          const job = await newsPulseAPI.getIngestionStatus(jobId, { signal: controller.signal });
          if (!isCurrent()) return;

          if (job.status === 'COMPLETED') {
            busyRef.current = false;
            clearStoredJob();
            setState({ ...IDLE, phase: 'completed', jobId, startedAt, jobStatus: job.status, result: job });
            onCompletedRef.current?.(job);
            return;
          }
          if (job.status === 'FAILED') {
            // The raw error text is for debugging only - not shown in the UI.
            console.error('[NewsPulse] ingestion job failed:', job.error);
            fail({ kind: 'job' });
            return;
          }

          setState((prev) => ({ ...prev, phase: 'running', jobId, startedAt, jobStatus: job.status }));
          schedule(0);
        } catch (err) {
          if (isCanceledRequest(err) || !isCurrent()) return;
          if (err?.response?.status === 404) {
            fail({ kind: 'lost' });
            return;
          }
          console.error('[NewsPulse] ingestion status check failed:', err);
          if (failures + 1 >= MAX_CONSECUTIVE_POLL_FAILURES) {
            fail({ kind: 'unreachable' }, { keepJob: true });
            return;
          }
          schedule(failures + 1);
        }
      };

      if (immediate) tick(0);
      else schedule(0);
    },
    [stopPolling]
  );

  const start = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setState({ ...IDLE, phase: 'triggering' });

    try {
      const { jobId, status } = await newsPulseAPI.triggerIngestion();
      if (!jobId) throw new Error('Ingestion trigger returned no job id');

      const startedAt = Date.now();
      storeJob({ jobId, startedAt });
      if (!mountedRef.current) return; // left the page mid-request; the stored job resumes next visit

      setState({ ...IDLE, phase: 'running', jobId, jobStatus: status || 'QUEUED', startedAt });
      startPolling(jobId, startedAt, { immediate: false });
    } catch (err) {
      busyRef.current = false;
      console.error('[NewsPulse] could not start ingestion:', err);
      if (mountedRef.current) {
        setState({ ...IDLE, phase: 'failed', failure: { kind: 'trigger', errorKind: classifyPulseError(err) } });
      }
    }
  }, [startPolling]);

  // After 'unreachable' / 'timeout': look at the same job again.
  const checkAgain = useCallback(() => {
    const job = readStoredJob();
    if (!job || busyRef.current) return;
    busyRef.current = true;
    setState({ ...IDLE, phase: 'running', jobId: job.jobId, startedAt: job.startedAt });
    startPolling(job.jobId, job.startedAt, { immediate: true });
  }, [startPolling]);

  const dismiss = useCallback(() => {
    if (busyRef.current) return;
    clearStoredJob();
    setState(IDLE);
  }, []);

  // Resume a job that was running when the page was last left, and stop all
  // polling on unmount (the stored job id stays, so it resumes next visit).
  useEffect(() => {
    mountedRef.current = true;
    const stored = readStoredJob();
    if (stored) {
      busyRef.current = true;
      startPolling(stored.jobId, stored.startedAt, { immediate: true });
    }
    return () => {
      mountedRef.current = false;
      busyRef.current = false;
      stopPolling();
    };
  }, [startPolling, stopPolling]);

  return {
    ...state,
    isBusy: state.phase === 'triggering' || state.phase === 'running',
    start,
    checkAgain,
    dismiss,
  };
};

export default useNewsPulseIngestion;
