import React, { useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';
import SkeletonList from './SkeletonList';
import EmptyState from './EmptyState';
import ErrorState from './ErrorState';
import { formatRelative, previewText, pulseErrorMessage } from '../utils/newsPulse';

// With no multi-article topics, show only this many before "show all"
const PREVIEW_COUNT = 8;

const time = (iso) => (iso ? new Date(iso).getTime() : 0);

const ClusterRow = ({ cluster, latestArticle, active, onSelect }) => {
  const { t, tf, language } = usePreferences();
  const countLabel = tf(cluster.articleCount === 1 ? 'pulseArticleOne' : 'pulseArticleMany', { count: cluster.articleCount });
  const latestWhen = formatRelative(cluster.latestPublishedAt, language);

  return (
    <li>
      <button
        onClick={() => onSelect({ id: cluster.id, label: cluster.label, articleCount: cluster.articleCount })}
        aria-label={`${t('pulseOpenTopic')}: ${cluster.label}, ${countLabel}`}
        aria-haspopup="dialog"
        data-testid="cluster-row"
        className="pulse-row"
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '12px 14px',
          borderRadius: '14px',
          background: active ? 'rgba(118, 87, 255, 0.1)' : 'var(--bg-card)',
          border: active ? '1px solid var(--border-active)' : '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.3, overflowWrap: 'anywhere' }}>
            {cluster.label}
          </span>
          <span
            style={{
              flexShrink: 0,
              fontSize: '11px',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              color: cluster.articleCount > 1 ? '#35D39A' : 'var(--text-muted)',
              background: cluster.articleCount > 1 ? 'rgba(53, 211, 154, 0.1)' : 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${cluster.articleCount > 1 ? 'var(--border-green)' : 'var(--border-subtle)'}`,
              padding: '2px 9px',
              borderRadius: '999px',
            }}
          >
            {countLabel}
          </span>
        </span>

        {latestWhen && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{tf('pulseLatest', { time: latestWhen })}</span>
        )}

        {latestArticle && (
          <span className="pulse-clamp-2" style={{ fontSize: '12px', lineHeight: 1.45, color: 'var(--text-secondary)' }}>
            {previewText(latestArticle.title, 110)}
            {latestArticle.source ? ` · ${latestArticle.source}` : ''}
          </span>
        )}
      </button>
    </li>
  );
};

// Topic clusters, largest first. Real data is dominated by single-story
// clusters, so multi-article topics lead and the rest sit behind a toggle.
const PulseClusters = ({ clusters, latestByCluster, activeId, onSelect, onRetry }) => {
  const { t, tf } = usePreferences();
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(
    () =>
      [...clusters.items].sort(
        (a, b) => b.articleCount - a.articleCount || time(b.latestPublishedAt) - time(a.latestPublishedAt)
      ),
    [clusters.items]
  );

  const defaultVisible = useMemo(() => {
    const multi = sorted.filter((cluster) => cluster.articleCount > 1);
    return multi.length > 0 ? multi : sorted.slice(0, PREVIEW_COUNT);
  }, [sorted]);

  const visible = showAll ? sorted : defaultVisible;
  const canToggle = sorted.length > defaultVisible.length;

  const renderBody = () => {
    if (clusters.status === 'loading') return <SkeletonList count={4} height="76px" />;

    if (clusters.status === 'error') {
      return <ErrorState message={pulseErrorMessage(clusters.errorKind, t)} onRetry={onRetry} />;
    }

    if (sorted.length === 0) {
      return <EmptyState icon={Layers} title={t('pulseNoTopicsTitle')} description={t('pulseNoTopicsDesc')} />;
    }

    return (
      <>
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {visible.map((cluster) => (
            <ClusterRow
              key={cluster.id}
              cluster={cluster}
              latestArticle={latestByCluster.get(cluster.id)}
              active={cluster.id === activeId}
              onSelect={onSelect}
            />
          ))}
        </ul>
        {canToggle && (
          <button
            onClick={() => setShowAll((value) => !value)}
            aria-expanded={showAll}
            style={{
              width: '100%',
              marginTop: '12px',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              padding: '10px 16px',
              borderRadius: '12px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {showAll ? t('pulseShowFewerTopics') : tf('pulseShowAllTopics', { count: sorted.length })}
          </button>
        )}
      </>
    );
  };

  return (
    <section aria-labelledby="pulse-topics-heading">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <h2 id="pulse-topics-heading" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
          {t('pulseTopics')}
        </h2>
        {clusters.status === 'ready' && sorted.length > 0 && (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#8B6CFF',
              background: 'rgba(124, 92, 255, 0.14)',
              padding: '2px 10px',
              borderRadius: '999px',
              border: '1px solid rgba(124, 92, 255, 0.25)',
            }}
          >
            {sorted.length}
          </span>
        )}
      </div>
      {renderBody()}
    </section>
  );
};

export default PulseClusters;
