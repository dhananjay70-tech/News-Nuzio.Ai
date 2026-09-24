import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { newsPulseAPI } from '../api/api';
import { classifyPulseError, isCanceledRequest } from '../utils/newsPulse';

// The timeline API takes a limit (max 500) but no offset, so a generous window
// is loaded once and revealed progressively in the UI.
export const TIMELINE_LIMIT = 200;

// The service defaults to the newest 100 clusters, which would silently drop
// older topics. Clustering only ever covers the newest 500 articles, so 500 (the
// service's maximum) always returns every cluster.
export const CLUSTER_LIMIT = 500;

const LOADING = { status: 'loading', items: [], errorKind: null };

// Only an error needs to flip back to "loading" (to show the skeleton); a
// reload otherwise keeps the current items visible.
const markLoading = (prev) => (prev.status === 'error' ? { ...prev, status: 'loading', errorKind: null } : prev);

/**
 * Loads News Pulse data from the Node gateway:
 *  - topic clusters
 *  - the unfiltered timeline (also the source of the source-filter options and
 *    each cluster's latest headline)
 *  - the timeline for the selected source, requested server-side
 *    (GET /timeline?source=...) whenever a source is selected
 *
 * Each list is `{ status: 'loading' | 'ready' | 'error', items, errorKind }`.
 * Reloads keep the previous items visible instead of flashing a skeleton, and
 * superseded requests are aborted so a stale response can never overwrite a
 * newer one.
 */
const useNewsPulseData = (source) => {
  const [clusters, setClusters] = useState(LOADING);
  const [allTimeline, setAllTimeline] = useState(LOADING);
  const [sourceTimeline, setSourceTimeline] = useState({ ...LOADING, source: '' });

  const controllers = useRef({});
  const sourceRef = useRef(source);
  useEffect(() => {
    sourceRef.current = source;
  });

  const load = useCallback(async (key, fetcher, apply) => {
    controllers.current[key]?.abort();
    const controller = new AbortController();
    controllers.current[key] = controller;
    try {
      const items = await fetcher(controller.signal);
      if (controller.signal.aborted) return;
      apply({ status: 'ready', items, errorKind: null });
    } catch (err) {
      if (isCanceledRequest(err) || controller.signal.aborted) return;
      console.error(`[NewsPulse] failed to load ${key}:`, err);
      apply({ status: 'error', items: [], errorKind: classifyPulseError(err) });
    }
  }, []);

  // fetch*: request only. Used by the effects below - the state already reads
  // "loading" on mount and (via the derivation further down) for a newly
  // selected source, so there is nothing to set first.
  const fetchClusters = useCallback(
    () => load('clusters', (signal) => newsPulseAPI.getClusters({ limit: CLUSTER_LIMIT }, { signal }), setClusters),
    [load]
  );

  const fetchAllTimeline = useCallback(
    () => load('timeline', (signal) => newsPulseAPI.getTimeline({ limit: TIMELINE_LIMIT }, { signal }), setAllTimeline),
    [load]
  );

  const fetchSourceTimeline = useCallback(
    (name) =>
      load(
        'sourceTimeline',
        (signal) => newsPulseAPI.getTimeline({ source: name, limit: TIMELINE_LIMIT }, { signal }),
        (next) => setSourceTimeline({ ...next, source: name })
      ),
    [load]
  );

  // load*: for retries and reloads after a refresh - show the skeleton if
  // there's an error on screen, otherwise keep the current items while fetching.
  const loadClusters = useCallback(() => {
    setClusters(markLoading);
    return fetchClusters();
  }, [fetchClusters]);

  const loadAllTimeline = useCallback(() => {
    setAllTimeline(markLoading);
    return fetchAllTimeline();
  }, [fetchAllTimeline]);

  const loadSourceTimeline = useCallback(
    (name) => {
      setSourceTimeline((prev) => (prev.source === name ? markLoading(prev) : { ...LOADING, source: name }));
      return fetchSourceTimeline(name);
    },
    [fetchSourceTimeline]
  );

  useEffect(() => {
    fetchClusters();
    fetchAllTimeline();
    const active = controllers.current;
    return () => Object.values(active).forEach((controller) => controller.abort());
  }, [fetchClusters, fetchAllTimeline]);

  useEffect(() => {
    if (source) fetchSourceTimeline(source);
  }, [source, fetchSourceTimeline]);

  const reloadAll = useCallback(() => {
    loadClusters();
    loadAllTimeline();
    if (sourceRef.current) loadSourceTimeline(sourceRef.current);
  }, [loadClusters, loadAllTimeline, loadSourceTimeline]);

  const retryTimeline = useCallback(() => {
    if (sourceRef.current) loadSourceTimeline(sourceRef.current);
    else loadAllTimeline();
  }, [loadAllTimeline, loadSourceTimeline]);

  // While a newly selected source's first response is pending, show loading
  // (not the previous source's articles).
  const timeline = source
    ? sourceTimeline.source === source
      ? sourceTimeline
      : { ...LOADING, source }
    : allTimeline;

  // Source options come from the unfiltered timeline (the API has no sources
  // endpoint); the active source stays listed even if it isn't in that window.
  const sources = useMemo(() => {
    const names = new Set(allTimeline.items.map((article) => article.source).filter(Boolean));
    if (source) names.add(source);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [allTimeline.items, source]);

  // Newest known article per cluster - the "representative" headline shown on
  // each topic. Always derived from the unfiltered timeline so a source filter
  // doesn't change what a topic's latest story is.
  const latestByCluster = useMemo(() => {
    const latest = new Map();
    for (const article of allTimeline.items) {
      if (article.clusterId == null) continue;
      const current = latest.get(article.clusterId);
      if (!current || new Date(article.publishedAt) > new Date(current.publishedAt)) {
        latest.set(article.clusterId, article);
      }
    }
    return latest;
  }, [allTimeline.items]);

  return { clusters, timeline, sources, latestByCluster, loadClusters, retryTimeline, reloadAll };
};

export default useNewsPulseData;
