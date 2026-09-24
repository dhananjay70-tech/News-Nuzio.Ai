import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Layers, X } from 'lucide-react';
import { newsPulseAPI } from '../api/api';
import { usePreferences } from '../context/PreferencesContext';
import SkeletonList from './SkeletonList';
import EmptyState from './EmptyState';
import ErrorState from './ErrorState';
import PulseArticleActions from './PulseArticleActions';
import {
  classifyPulseError,
  formatDateTime,
  isCanceledRequest,
  previewText,
  pulseErrorMessage,
  sortNewestFirst,
} from '../utils/newsPulse';

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

const DrawerArticle = ({ article, listen }) => {
  const { language } = usePreferences();
  const preview = previewText(article.description, 180);
  const when = formatDateTime(article.publishedAt, language);

  return (
    <li
      data-testid="cluster-article"
      className="card-glass"
      style={{ padding: '14px 16px', borderRadius: '14px', listStyle: 'none' }}
    >
      <h3 style={{ fontSize: '15px', fontWeight: 700, lineHeight: 1.35, color: 'var(--text-main)', margin: '0 0 6px', overflowWrap: 'anywhere' }}>
        {article.title}
      </h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
        {article.source && <strong style={{ color: '#8B6CFF', fontWeight: 700 }}>{article.source}</strong>}
        {article.source && when && <span aria-hidden="true">·</span>}
        {when && <time dateTime={article.publishedAt}>{when}</time>}
      </div>
      {preview && (
        <p className="pulse-clamp-3" style={{ fontSize: '13px', lineHeight: 1.5, color: 'var(--text-secondary)', marginTop: '8px' }}>
          {preview}
        </p>
      )}
      <PulseArticleActions article={article} listen={listen} marginTop="10px" />
    </li>
  );
};

/**
 * Topic detail (GET /news-pulse/clusters/:id) shown in a right-hand drawer
 * (bottom sheet on mobile). Mounted only while a topic is open - the parent
 * keys it by cluster id, so state and the in-flight request reset per topic.
 * `cluster` is the { id, label, articleCount? } the user clicked; the label and
 * count are shown immediately while the articles load. `listen` is the page's
 * shared Listen controller (useNewsPulseListen).
 */
const ClusterDrawer = ({ cluster, listen, onClose }) => {
  const { t, tf } = usePreferences();
  const [state, setState] = useState({ status: 'loading', detail: null, errorKind: null });
  const drawerRef = useRef(null);
  const closeButtonRef = useRef(null);
  const controllerRef = useRef(null);

  // Read through a ref so the modal effect below runs once per open, whatever
  // identity the parent gives `onClose` (a re-run would yank focus around).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const fetchDetail = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    newsPulseAPI
      .getCluster(cluster.id, { signal: controller.signal })
      .then((detail) => {
        if (!controller.signal.aborted) setState({ status: 'ready', detail, errorKind: null });
      })
      .catch((err) => {
        if (isCanceledRequest(err) || controller.signal.aborted) return;
        console.error('[NewsPulse] failed to load topic:', err);
        setState({ status: 'error', detail: null, errorKind: classifyPulseError(err) });
      });
  }, [cluster.id]);

  useEffect(() => {
    fetchDetail();
    return () => controllerRef.current?.abort();
  }, [fetchDetail]);

  const retry = useCallback(() => {
    setState({ status: 'loading', detail: null, errorKind: null });
    fetchDetail();
  }, [fetchDetail]);

  // Modal behavior: lock page scroll, move focus in (and back out on close),
  // close on Escape, and keep Tab inside the drawer.
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusable = [...drawerRef.current.querySelectorAll(FOCUSABLE)];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  const { detail } = state;
  const label = detail?.label || cluster.label;
  const articles = detail ? sortNewestFirst(detail.articles) : [];
  const count = detail ? articles.length : cluster.articleCount;

  const renderBody = () => {
    if (state.status === 'loading') return <SkeletonList count={3} height="104px" />;

    if (state.status === 'error') {
      // The topic id is gone (topics are rebuilt on every refresh): retrying can't help.
      if (state.errorKind === 'notFound') {
        return <EmptyState icon={Layers} title={t('pulseTopicGone')} />;
      }
      return <ErrorState message={pulseErrorMessage(state.errorKind, t)} onRetry={retry} />;
    }

    if (articles.length === 0) return <EmptyState icon={Layers} title={t('pulseTopicEmpty')} />;

    return (
      <ul style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: 0 }}>
        {articles.map((article) => (
          <DrawerArticle key={article.id} article={article} listen={listen} />
        ))}
      </ul>
    );
  };

  return (
    <>
      <div className="pulse-backdrop" onClick={onClose} aria-hidden="true" data-testid="cluster-backdrop" />
      <div
        ref={drawerRef}
        className="pulse-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pulse-drawer-title"
        data-testid="cluster-drawer"
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '20px 20px 16px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
              {t('pulseTopicDetails')}
            </div>
            <h2
              id="pulse-drawer-title"
              style={{ fontSize: '20px', fontWeight: 800, lineHeight: 1.25, color: 'var(--text-main)', margin: 0, overflowWrap: 'anywhere' }}
            >
              {label}
            </h2>
            {count != null && (
              <span
                data-testid="cluster-article-count"
                style={{
                  display: 'inline-block',
                  marginTop: '10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#35D39A',
                  background: 'rgba(53, 211, 154, 0.1)',
                  border: '1px solid var(--border-green)',
                  padding: '2px 10px',
                  borderRadius: '999px',
                }}
              >
                {tf(count === 1 ? 'pulseArticleOne' : 'pulseArticleMany', { count })}
              </span>
            )}
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label={t('pulseClose')}
            title={t('pulseClose')}
            style={{
              flexShrink: 0,
              display: 'flex',
              padding: '8px',
              borderRadius: '10px',
              color: 'var(--text-secondary)',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 24px' }}>{renderBody()}</div>
      </div>
    </>
  );
};

export default ClusterDrawer;
