import React from 'react';

const CategoryPill = ({ label, active = false, onClick, count = null }) => {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 16px',
        borderRadius: '9999px',
        fontSize: '13px',
        fontWeight: active ? 600 : 500,
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        border: active
          ? '1px solid var(--border-active)'
          : '1px solid var(--border-subtle)',
        background: active ? 'rgba(118, 87, 255, 0.16)' : 'transparent',
        color: active ? '#FFFFFF' : 'var(--text-secondary)',
        transition: 'all 0.2s ease',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.color = '#FFFFFF';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.18)';
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.color = '#9EA2B0';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
        }
      }}
    >
      {active && (
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#35D39A',
          }}
        />
      )}
      <span>{label}</span>
      {count !== null && (
        <span
          style={{
            fontSize: '11px',
            opacity: 0.7,
            marginLeft: '2px',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
};

export default CategoryPill;
