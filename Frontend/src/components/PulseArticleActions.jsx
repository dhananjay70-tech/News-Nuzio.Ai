import React from 'react';
import { AlertTriangle, ExternalLink, Loader2, Volume2 } from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';
import { safeExternalUrl } from '../utils/newsPulse';

const LISTEN_STYLES = {
  idle: { color: 'var(--primary)', background: 'rgba(124, 92, 255, 0.1)', border: '1px solid var(--border-active)' },
  loading: { color: 'var(--primary)', background: 'rgba(124, 92, 255, 0.1)', border: '1px solid var(--border-active)' },
  playing: { color: '#FFFFFF', background: 'var(--primary)', border: '1px solid transparent' },
  error: { color: '#F87171', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)' },
};

const ListenButton = ({ article, state, onListen }) => {
  const { t } = usePreferences();

  const label = {
    idle: t('pulseListen'),
    loading: t('pulsePreparing'),
    playing: t('pulsePlaying'),
    error: t('pulseTryAgain'),
  }[state];
  const Icon = { idle: Volume2, loading: Loader2, playing: Volume2, error: AlertTriangle }[state];

  return (
    <button
      type="button"
      // Not `disabled`: that would drop keyboard focus mid-request. The click
      // is ignored while the audio is being prepared instead.
      onClick={() => state !== 'loading' && onListen(article)}
      aria-label={`${label}: ${article.title}`}
      aria-busy={state === 'loading'}
      title={state === 'playing' ? t('pause') : undefined}
      data-testid="listen-button"
      data-state={state}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '13px',
        fontWeight: 600,
        padding: '6px 14px',
        borderRadius: '10px',
        cursor: state === 'loading' ? 'progress' : 'pointer',
        ...LISTEN_STYLES[state],
      }}
    >
      <Icon size={14} style={state === 'loading' ? { animation: 'spin 1s linear infinite' } : undefined} />
      {label}
    </button>
  );
};

// The action area of a News Pulse article card: [ Listen ] [ Read article ↗ ].
// `listen` is the shared useNewsPulseListen() controller.
const PulseArticleActions = ({ article, listen, marginTop }) => {
  const { t } = usePreferences();
  const link = safeExternalUrl(article.url);
  const state = listen.stateFor(article.id);

  return (
    <div style={{ marginTop }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}>
        <ListenButton article={article} state={state} onListen={listen.start} />
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--primary)',
              textDecoration: 'none',
            }}
          >
            {t('pulseReadArticle')}
            <ExternalLink size={13} />
          </a>
        )}
      </div>

      {/* Always mounted so screen readers announce the text when it appears */}
      <div aria-live="polite" data-testid="listen-status">
        {(state === 'loading' || state === 'error') && (
          <p style={{ fontSize: '12px', marginTop: '8px', color: state === 'error' ? '#FCA5A5' : 'var(--text-secondary)' }}>
            {state === 'error' ? t('pulseListenFailed') : t('pulsePreparingAudio')}
          </p>
        )}
      </div>
    </div>
  );
};

export default PulseArticleActions;
