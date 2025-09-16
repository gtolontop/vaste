import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button, Input } from '../components/ui';

const LoginPage: React.FC = () => {
  const { state, login, register } = useAuth();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (state.isAuthenticated) {
      navigate('/');
    }
  }, [state.isAuthenticated, navigate]);

  const containerStyles: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 'calc(100vh - 80px)',
    padding: '2rem',
  };

  const cardStyles: React.CSSProperties = {
    backgroundColor: 'rgba(17, 17, 17, 0.9)',
    borderRadius: '16px',
    padding: '40px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
    minWidth: '420px',
    maxWidth: '500px',
    width: '100%',
    backdropFilter: 'blur(10px)',
  };

  const titleStyles: React.CSSProperties = {
    fontSize: '32px',
    fontWeight: '700',
    marginBottom: '8px',
    textAlign: 'center',
    background: 'linear-gradient(135deg, #61dafb 0%, #ffffff 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  };

  const subtitleStyles: React.CSSProperties = {
    fontSize: '16px',
    color: '#999',
    textAlign: 'center',
    marginBottom: '32px',
  };

  const toggleStyles: React.CSSProperties = {
    textAlign: 'center',
    marginBottom: '24px',
  };

  const toggleButtonStyles: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: '#61dafb',
    cursor: 'pointer',
    textDecoration: 'underline',
    fontSize: 'inherit',
  };

  const errorStyles: React.CSSProperties = {
    backgroundColor: 'rgba(220, 53, 69, 0.2)',
    border: '1px solid rgba(220, 53, 69, 0.3)',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '20px',
    color: '#ff6b6b',
    fontSize: '14px',
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setAuthError(''); // Clear error when user types
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setAuthError('');
    setFormData({
      username: '',
      email: '',
      password: '',
      confirmPassword: ''
    });
  };

  const handleAuth = async () => {
    if (authLoading) return;

    // Validation
    if (!formData.email || !formData.password) {
      setAuthError('Please fill in all required fields');
      return;
    }

    if (!isLogin) {
      if (!formData.username) {
        setAuthError('Username is required');
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        setAuthError('Passwords do not match');
        return;
      }
      if (formData.password.length < 6) {
        setAuthError('Password must be at least 6 characters long');
        return;
      }
    }

    setAuthLoading(true);
    setAuthError('');

    try {
      if (isLogin) {
        const result = await login(formData.email, formData.password);
        if (!result.success) {
          setAuthError(result.message || 'Login failed');
          return;
        }
      } else {
        const result = await register(formData.username, formData.email, formData.password);
        if (!result.success) {
          setAuthError(result.message || 'Registration failed');
          return;
        }
      }
      // Redirect will happen automatically via useEffect
    } catch (error: any) {
      setAuthError(error.message || `${isLogin ? 'Login' : 'Registration'} failed`);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAuth();
    }
  };

  return (
    <div style={containerStyles}>
      <div style={cardStyles}>
        <h1 style={titleStyles}>Vaste</h1>
        <p style={subtitleStyles}>
          {isLogin ? 'Welcome back!' : 'Join the community'}
        </p>
        
        <div style={toggleStyles}>
          <span style={{ color: '#ccc' }}>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
          </span>
          <button style={toggleButtonStyles} onClick={toggleMode}>
            {isLogin ? "Sign Up" : "Sign In"}
          </button>
        </div>

        {authError && (
          <div style={errorStyles}>
            {authError}
          </div>
        )}

        <form onKeyPress={handleKeyPress}>
          {!isLogin && (
            <div style={{ marginBottom: '20px' }}>
              <Input
                label="Username"
                value={formData.username}
                onChange={(value) => handleInputChange('username', value)}
                placeholder="Your username"
                disabled={authLoading}
                fullWidth
              />
            </div>
          )}

          <div style={{ marginBottom: '20px' }}>
            <Input
              label="Email address"
              value={formData.email}
              onChange={(value) => handleInputChange('email', value)}
              placeholder="your@email.com"
              disabled={authLoading}
              fullWidth
              type="email"
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <Input
              label="Password"
              value={formData.password}
              onChange={(value) => handleInputChange('password', value)}
              placeholder="Password"
              disabled={authLoading}
              fullWidth
              type="password"
            />
          </div>

          {!isLogin && (
            <div style={{ marginBottom: '20px' }}>
              <Input
                label="Confirm password"
                value={formData.confirmPassword}
                onChange={(value) => handleInputChange('confirmPassword', value)}
                placeholder="Confirm password"
                disabled={authLoading}
                fullWidth
                type="password"
              />
            </div>
          )}

          <Button
            onClick={handleAuth}
            disabled={authLoading}
            loading={authLoading}
            variant="primary"
            size="large"
            fullWidth
          >
            {authLoading 
              ? (isLogin ? 'Signing in...' : 'Creating account...') 
              : (isLogin ? 'Sign In' : 'Create Account')
            }
          </Button>
        </form>

        <div style={{ marginTop: '24px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
          <div>Create an account to save your progress</div>
          <div>and access community servers</div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;