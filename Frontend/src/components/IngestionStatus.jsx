import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';
import { formatElapsed, pulseErrorMessage } from '../utils/newsPulse';

// Ticks locally each second - no network involved.
const ElapsedTime = ({ since }) => {
  const { tf } = usePreferences();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return <>{tf('pulseElapsed', { time: formatElapsed(now - since) })}</>;
};

const FAILURE_TEXT = {
  job: ['pulseRefreshFailed', 'pulseRefreshFailedDesc'],
  lost: ['pulseRefreshLost', 'pulseRefreshLostDesc'],
  unreachable: ['pulseRefreshUnreachable', 'pulseRefreshUnreachableDesc'],
  timeout: ['pulseRefreshTimeout', 'pulseRefreshTimeoutDesc'],
};

const bannerStyle = (tone) => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '14px',
  padding: '16px 18px',
  borderRadius: '16px',
  marginBottom: '20px',
  background: tone.background,
  border: `1px solid ${tone.border}`,
});

const DismissButton = ({ onClick, label }) => (
  <button
    onClick={onClick}
    aria-label={label}
    title={label}
    style={{ color: 'var(--text-muted)', padding: '4px', borderRadius: '8px', flexShrink: 0 }}
  >
    <X size={16} />
  </button>
);

// Status banner for the Refresh News workflow: running (with elapsed time and
// an indeterminate bar), completed, or failed (with a specific message).
const IngestionStatus = ({ ingestion }) => {
  const { t, tf } = usePreferences();
  const { phase, jobStatus, startedAt, result, failure, checkAgain, dismiss } = ingestion;

  if (phase === 'idle') return null;

  if (phase === 'triggering' || phase === 'running') {
    const statusLabel = jobStatus === 'RUNNING' ? t('pulseJobRunning') : jobStatus === 'QUEUED' ? t('pulseJobQueued') : '';
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="ingestion-running"
        style={bannerStyle({ background: 'var(--bg-card)', border: 'var(--border-active)' })}
      >
        <Loader2 size={22} className="animate-spin" color="#8B6CFF" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 12px', marginBottom: '4px' }}>
            <strong style={{ fontSize: '15px', color: 'var(--text-main)' }}>{t('pulseRefreshRunning')}</strong>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {statusLabel}
              {statusLabel && startedAt ? ' · ' : ''}
              {startedAt && <ElapsedTime since={startedAt} />}
            </span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>{t('pulseRefreshRunningDesc')}</p>
          <div className="pulse-progress" aria-hidden="true" />
        </div>
      </div>
    );
  }

  if (phase === 'completed') {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="ingestion-completed"
        style={bannerStyle({ background: 'rgba(53, 211, 154, 0.08)', border: 'var(--border-green)' })}
      >
        <CheckCircle2 size={22} color="#35D39A" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: '15px', color: 'var(--text-main)', marginBottom: '2px' }}>{t('pulseRefreshDone')}</strong>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {tf('pulseRefreshDoneDesc', { articles: result?.articlesInserted ?? 0, topics: result?.clustersCreated ?? 0 })}
          </span>
        </div>
        <DismissButton onClick={dismiss} label={t('pulseDismiss')} />
      </div>
    );
  }

  // phase === 'failed'
  const kind = failure?.kind;
  const [titleKey, descKey] = FAILURE_TEXT[kind] || [];
  const title = kind === 'trigger' ? t('pulseTriggerFailed') : t(titleKey || 'pulseRefreshFailed');
  const description = kind === 'trigger' ? pulseErrorMessage(failure.errorKind, t) : t(descKey || 'pulseRefreshFailedDesc');
  const canCheckAgain = kind === 'unreachable' || kind === 'timeout';

  return (
    <div
      role="alert"
      data-testid="ingestion-failed"
      style={bannerStyle({ background: 'var(--danger-bg)', border: 'var(--danger-border)' })}
    >
      <AlertTriangle size={22} color="#F87171" style={{ flexShrink: 0, marginTop: '2px' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: 'block', fontSize: '15px', color: 'var(--text-main)', marginBottom: '2px' }}>{title}</strong>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: canCheckAgain ? '12px' : 0 }}>{description}</p>
        {canCheckAgain && (
          <button
            onClick={checkAgain}
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#FFFFFF',
              background: 'var(--primary)',
              padding: '8px 16px',
              borderRadius: '10px',
            }}
          >
            {t('pulseCheckAgain')}
          </button>
        )}
      </div>
      <DismissButton onClick={dismiss} label={t('pulseDismiss')} />
    </div>
  );
};

export default IngestionStatus;
