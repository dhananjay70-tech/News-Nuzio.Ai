import React from 'react';
import { Loader2 } from 'lucide-react';

const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  loadingText,
  disabled = false,
  icon: Icon,
  iconPosition = 'left',
  onClick,
  className = '',
  type = 'button',
  ...props
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return {
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
          color: '#FFFFFF !important',
          border: '2px solid #8b5cf6',
          boxShadow: '0 6px 20px rgba(139, 92, 246, 0.6), 0 0 30px rgba(139, 92, 246, 0.3)',
          textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
        };
      case 'secondary':
        return {
          background: 'var(--bg-card)',
          color: 'var(--text-main)',
          border: '1px solid var(--border-subtle)',
        };
      case 'outline':
        return {
          background: 'transparent',
          color: '#FFFFFF',
          border: '1px solid rgba(255, 255, 255, 0.18)',
        };
      case 'ghost':
        return {
          background: 'transparent',
          color: '#9EA2B0',
          border: 'none',
        };
      default:
        return {};
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return {
          padding: '8px 14px',
          fontSize: '13px',
          borderRadius: '10px',
        };
      case 'lg':
        return {
          padding: '16px 24px',
          fontSize: '16px',
          borderRadius: '16px',
        };
      case 'md':
      default:
        return {
          padding: '12px 20px',
          fontSize: '14px',
          borderRadius: '14px',
        };
    }
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`custom-button ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        fontFamily: 'inherit',
        fontWeight: 600,
        letterSpacing: '-0.01em',
        width: fullWidth ? '100%' : 'auto',
        opacity: disabled ? 0.45 : 1,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        transition: 'transform 0.15s ease, filter 0.2s ease, box-shadow 0.2s ease',
        ...getVariantStyles(),
        ...getSizeStyles(),
      }}
      onMouseEnter={(e) => {
        if (!disabled && !loading) {
          e.currentTarget.style.filter = 'brightness(1.15)';
          e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)';
          e.currentTarget.style.boxShadow = '0 8px 25px rgba(139, 92, 246, 0.7), 0 0 40px rgba(139, 92, 246, 0.4)';
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !loading) {
          e.currentTarget.style.filter = 'brightness(1)';
          e.currentTarget.style.transform = 'translateY(0) scale(1)';
          e.currentTarget.style.boxShadow = variant === 'primary' ? '0 6px 20px rgba(139, 92, 246, 0.6), 0 0 30px rgba(139, 92, 246, 0.3)' : 'none';
        }
      }}
      onMouseDown={(e) => {
        if (!disabled && !loading) {
          e.currentTarget.style.transform = 'scale(0.98)';
        }
      }}
      onMouseUp={(e) => {
        if (!disabled && !loading) {
          e.currentTarget.style.transform = 'scale(1)';
        }
      }}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 size={18} className="animate-spin" style={{ animation: 'spin 1s linear infinite', color: '#FFFFFF' }} />
          <span style={{ color: '#FFFFFF' }}>{loadingText || (typeof children === 'string' ? children : 'Please wait...')}</span>
        </>
      ) : (
        <>
          {Icon && iconPosition === 'left' && <Icon size={18} style={{ color: variant === 'primary' ? '#FFFFFF' : 'inherit' }} />}
          <span style={{ color: variant === 'primary' ? '#FFFFFF' : 'inherit' }}>{children}</span>
          {Icon && iconPosition === 'right' && <Icon size={18} style={{ color: variant === 'primary' ? '#FFFFFF' : 'inherit' }} />}
        </>
      )}
    </button>
  );
};

export default Button;
