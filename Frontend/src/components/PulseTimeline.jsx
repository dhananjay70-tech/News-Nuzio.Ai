import React, { useMemo, useState } from 'react';
import { Layers, Newspaper } from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';
import SkeletonList from './SkeletonList';
import EmptyState from './EmptyState';
import ErrorState from './ErrorState';
import PulseArticleActions from './PulseArticleActions';
import {
  formatDateTime,
  formatDayLabel,
  formatTime,
  groupByDay,
  previewText,
  pulseErrorMessage,
} from '../utils/newsPulse';

const PAGE_SIZE = 30;

const TimelineItem = ({ article, listen, onOpenCluster }) => {
  const { t, language } = usePreferences();
  const preview = previewText(article.description);
  const time = formatTime(article.publishedAt, language);

  return (
    <li className="pulse-item" data-testid="timeline-item">
      <article className="card-glass pulse-row" style={{ padding: '16px 18px', borderRadius: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px', marginBottom: '8px' }}>
          {time && (
            <time
              dateTime={article.publishedAt}
              title={formatDateTime(article.publishedAt, language)}
              style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}
            >
              {time}
            </time>
          )}
          {article.source && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#8B6CFF',
                background: 'rgba(124, 92, 255, 0.14)',
                border: '1px solid rgba(124, 92, 255, 0.25)',
                padding: '2px 10px',
                borderRadius: '999px',
              }}
            >
              {article.source}
            </span>
          )}
          {article.clusterId != null && article.clusterLabel && (
            <button
              onClick={() => onOpenCluster({ id: article.clusterId, label: article.clusterLabel })}
              aria-label={`${t('pulseOpenTopic')}: ${article.clusterLabel}`}
              title={t('pulseOpenTopic')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                maxWidth: '100%',
                fontSize: '11px',
                fontWeight: 600,
                color: '#35D39A',
                background: 'rgba(53, 211, 154, 0.1)',
                border: '1px solid var(--border-green)',
                padding: '2px 10px',
                borderRadius: '999px',
              }}
            >
              <Layers size={11} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{article.clusterLabel}</span>
            </button>
          )}
        </div>

        <h4
          style={{
            fontSize: '16px',
            fontWeight: 700,
            lineHeight: 1.35,
            color: 'var(--text-main)',
            margin: 0,
            overflowWrap: 'anywhere',
          }}
        >
          {article.title}
        </h4>

        {preview && (
          <p className="pulse-clamp-3" style={{ fontSize: '13px', lineHeight: 1.55, color: 'var(--text-secondary)', marginTop: '6px' }}>
            {preview}
          </p>
        )}

        <PulseArticleActions article={article} listen={listen} marginTop="12px" />
      </article>
    </li>
  );
};

// Chronological (newest first, by published_at) timeline grouped by day. Every
// request state has a visible treatment - loading, error, empty (all sources /
// a specific source) and ready.
const PulseTimeline = ({ timeline, source, listen, onClearSource, onOpenCluster, onRetry }) => {
  const { t, tf, language } = usePreferences();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const groups = useMemo(() => groupByDay(timeline.items), [timeline.items]);
  const total = timeline.items.length;

  // Reveal the newest `visibleCount` articles across the day groups
  let remaining = visibleCount;
  const visibleGroups = [];
  for (const group of groups) {
    if (remaining <= 0) break;
    visibleGroups.push({ ...group, articles: group.articles.slice(0, remaining) });
    remaining -= group.articles.length;
  }

  const renderBody = () => {
    if (timeline.status === 'loading') return <SkeletonList count={4} height="120px" />;

    if (timeline.status === 'error') {
      return <ErrorState message={pulseErrorMessage(timeline.errorKind, t)} onRetry={onRetry} />;
    }

    if (total === 0) {
      return (
        <div>
          <EmptyState
            icon={Newspaper}
            title={source ? tf('pulseNoSourceTitle', { source }) : t('pulseNoArticlesTitle')}
            description={source ? t('pulseNoSourceDesc') : t('pulseNoArticlesDesc')}
          />
          {source && (
            <div style={{ textAlign: 'center', marginTop: '14px' }}>
              <button
                onClick={onClearSource}
                style={{ fontSize: '13px', fontWeight: 600, color: 'var(--primary)', padding: '8px 16px', borderRadius: '10px', border: '1px solid var(--border-active)' }}
              >
                {t('pulseAllSources')}
              </button>
            </div>
          )}
        </div>
      );
    }

    return (
      <>
        {visibleGroups.map((group) => (
          <div key={group.key} style={{ marginBottom: '22px' }}>
            <h3
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                margin: '0 0 12px',
              }}
            >
              {group.date ? formatDayLabel(group.date, language, t) : '—'}
            </h3>
            <ol className="pulse-rail">
              {group.articles.map((article) => (
                <TimelineItem key={article.id} article={article} listen={listen} onOpenCluster={onOpenCluster} />
              ))}
            </ol>
          </div>
        ))}

        {total > visibleCount && (
          <div style={{ textAlign: 'center' }}>
            <button
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                padding: '10px 22px',
                borderRadius: '12px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {t('pulseShowMore')} ({total - visibleCount})
            </button>
          </div>
        )}
      </>
    );
  };

  return (
    <section aria-labelledby="pulse-timeline-heading" style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <h2 id="pulse-timeline-heading" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
          {t('pulseTimeline')}
        </h2>
        {timeline.status === 'ready' && total > 0 && (
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
            {total}
          </span>
        )}
      </div>
      {renderBody()}
    </section>
  );
};

export default PulseTimeline;
