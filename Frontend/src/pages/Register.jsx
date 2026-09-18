import React, { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import Button from '../components/Button';
import { AlertCircle, User, Mail, Lock, Eye, EyeOff } from 'lucide-react';

const Register = () => {
  const { register, isAuthenticated, user, loading, authError, setAuthError } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated && !loading) {
    if (user?.preferences?.profession) {
      return <Navigate to="/home" replace />;
    }
    return <Navigate to="/onboarding" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setAuthError(null);

    try {
      await register({ name, email, password });
      navigate('/onboarding');
    } catch (err) {
      console.error('Registration error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px',
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #0a0a0f 0%, #0d0c13 50%, #0a0a0f 100%)',
      }}
    >
      {/* Subtle background glow */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <div
        className="card-glass"
        style={{
          width: '100%',
          maxWidth: '520px',
          padding: 'clamp(32px, 5vw, 48px)',
          borderRadius: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          position: 'relative',
          zIndex: 1,
          boxShadow: '0 20px 60px -10px rgba(0, 0, 0, 0.6), 0 0 40px rgba(139, 92, 246, 0.1)',
          border: '1px solid rgba(139, 92, 246, 0.2)',
          background: 'rgba(21, 20, 27, 0.95)',
        }}
      >
        <div style={{ marginBottom: '32px' }}>
          <Logo size="large" />
        </div>

        <h1
          style={{
            fontSize: 'clamp(30px, 4vw, 38px)',
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
            marginBottom: '12px',
            color: '#FFFFFF',
          }}
        >
          Create your account
        </h1>

        <p
          style={{
            fontSize: '15px',
            lineHeight: 1.6,
            color: '#A6A1B5',
            maxWidth: '360px',
            marginBottom: '36px',
          }}
        >
          High-signal audio briefings, tailored to your industry.
        </p>

        {authError && (
          <div
            style={{
              width: '100%',
              padding: '14px 16px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#FCA5A5',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '24px',
              textAlign: 'left',
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{authError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <User size={18} style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', color: '#6F6A7C', zIndex: 1 }} />
            <input
              type="text"
              required
              autoComplete="name"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '18px 18px 18px 50px',
                borderRadius: '16px',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#FFFFFF',
                fontSize: '15px',
                fontFamily: 'inherit',
                outline: 'none',
                transition: 'all 0.2s ease',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.15)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              }}
            />
          </div>

          <div style={{ position: 'relative', width: '100%' }}>
            <Mail size={18} style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', color: '#6F6A7C', zIndex: 1 }} />
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '18px 18px 18px 50px',
                borderRadius: '16px',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#FFFFFF',
                fontSize: '15px',
                fontFamily: 'inherit',
                outline: 'none',
                transition: 'all 0.2s ease',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.15)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              }}
            />
          </div>

          <div style={{ position: 'relative', width: '100%' }}>
            <Lock size={18} style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', color: '#6F6A7C', zIndex: 1 }} />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Password (min. 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '18px 50px 18px 50px',
                borderRadius: '16px',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#FFFFFF',
                fontSize: '15px',
                fontFamily: 'inherit',
                outline: 'none',
                transition: 'all 0.2s ease',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.15)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#6F6A7C',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 0.2s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#A6A1B5'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#6F6A7C'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={isSubmitting || loading}
            loadingText="Creating account..."
            disabled={isSubmitting || loading}
            style={{
              height: '58px',
              fontSize: '16px',
              fontWeight: 600,
              borderRadius: '16px',
              marginTop: '8px',
            }}
          >
            Create account
          </Button>
        </form>

        <p
          style={{
            fontSize: '14px',
            color: '#A6A1B5',
            marginTop: '28px',
          }}
        >
          Already have an account?{' '}
          <Link 
            to="/login" 
            style={{ 
              color: '#8B5CF6', 
              fontWeight: 600, 
              textDecoration: 'none',
              transition: 'color 0.2s ease' 
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#A78BFA'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#8B5CF6'}
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
