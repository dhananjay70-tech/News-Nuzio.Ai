import React from 'react';
import { AlertCircle } from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';

// Shared error card with a Retry action. Callers pass a specific message
// (see getErrorMessage) - never a generic "Something went wrong", per spec.
const ErrorState = ({ message, onRetry, maxWidth }) => {
  const { t } = usePreferences();

  return (
    <div
      className="card-glass"
      style={{
        padding: '32px 20px',
        textAlign: 'center',
        borderRadius: '20px',
        background: 'var(--danger-bg)',
        border: '1px solid var(--danger-border)',
        maxWidth,
      }}
    >
      <AlertCircle size={32} color="#F87171" style={{ margin: '0 auto 12px' }} />
      <p style={{ color: '#FCA5A5', fontSize: '14px', marginBottom: onRetry ? '16px' : 0 }}>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: '#FFFFFF',
            background: 'var(--primary)',
            padding: '10px 20px',
            borderRadius: '12px',
            boxShadow: '0 4px 14px rgba(124, 92, 255, 0.4)',
          }}
        >
          {t('retry')}
        </button>
      )}
    </div>
  );
};

export default ErrorState;
