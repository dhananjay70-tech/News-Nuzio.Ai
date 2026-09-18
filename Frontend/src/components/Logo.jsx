import React from 'react';

const Logo = ({ size = 'medium', showIcon = true, className = '' }) => {
  const sizeStyles = {
    small: {
      fontSize: '18px',
      iconSize: 24,
      gap: '8px',
    },
    medium: {
      fontSize: '24px',
      iconSize: 32,
      gap: '12px',
    },
    large: {
      fontSize: '36px',
      iconSize: 48,
      gap: '16px',
    },
  };

  const style = sizeStyles[size] || sizeStyles.medium;

  return (
    <div
      className={`nuzio-logo ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: style.gap,
        userSelect: 'none',
      }}
    >
      {showIcon && (
        <div
          style={{
            width: style.iconSize,
            height: style.iconSize,
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 50%, #4F46E5 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(139, 92, 246, 0.4), 0 0 40px rgba(139, 92, 246, 0.2)',
            color: '#FFFFFF',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* AI Wave Symbol */}
          <svg
            width={style.iconSize * 0.6}
            height={style.iconSize * 0.6}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ position: 'relative', zIndex: 1 }}
          >
            {/* Central waveform */}
            <path
              d="M12 4C12 4 12 4 12 4C12 4 12 4 12 4"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M12 8C12 8 12 8 12 8C12 8 12 8 12 8"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M12 12C12 12 12 12 12 12C12 12 12 12 12 12"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M12 16C12 16 12 16 12 16C12 16 12 16 12 16"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M12 20C12 20 12 20 12 20C12 20 12 20 12 20"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {/* Side waves */}
            <path
              d="M8 10C8 10 8 10 8 10"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.7"
            />
            <path
              d="M8 14C8 14 8 14 8 14"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.7"
            />
            <path
              d="M16 10C16 10 16 10 16 10"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.7"
            />
            <path
              d="M16 14C16 14 16 14 16 14"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.7"
            />
          </svg>
          {/* Subtle glow overlay */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.15) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />
        </div>
      )}
      <span
        style={{
          fontSize: style.fontSize,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          background: 'linear-gradient(180deg, #FFFFFF 0%, #E8E8F0 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        Nuzio
        <span
          style={{
            background: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontWeight: 800,
          }}
        >
          AI
        </span>
      </span>
    </div>
  );
};

export default Logo;
