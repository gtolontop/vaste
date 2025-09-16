import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Button, Input } from '../ui';
import ServerManagement from '../ServerManagement';

interface AuthScreenProps {
  serverUrl: string;
  onServerUrlChange: (url: string) => void;
  onConnect: () => void;
  connecting: boolean;
  error?: string;
}

const AuthScreen: React.FC<AuthScreenProps> = ({
  serverUrl,
  onServerUrlChange,
  onConnect,
  connecting,
  error: gameError
}) => {
  const { state, login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [activeTab, setActiveTab] = useState<'play' | 'servers'>('play');
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const containerStyles: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    backgroundColor: '#0a0a0a',
    color: 'white',
    fontFamily: 'Arial, sans-serif',
    backgroundImage: 'radial-gradient(circle at 25% 25%, #1a1a1a 0%, #0a0a0a 50%)',
  };

  const cardStyles: React.CSSProperties = {
    backgroundColor: '#111',
    borderRadius: '16px',
    padding: '40px',
    border: '1px solid #333',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
    minWidth: '420px',
    maxWidth: '500px',
    width: '100%',
  };

  const titleStyles: React.CSSProperties = {
    fontSize: '32px',
    fontWeight: '700',
    marginBottom: '8px',
    textAlign: 'center',
    background: 'linear-gradient(135deg, #ffffff 0%, #999 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  };

  const subtitleStyles: React.CSSProperties = {
    fontSize: '16px',
    color: '#888',
    textAlign: 'center',
    marginBottom: '32px',
  };

  const errorStyles: React.CSSProperties = {
    backgroundColor: '#ff4444',
    color: 'white',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '20px',
    fontSize: '14px',
    textAlign: 'center',
  };

  const toggleStyles: React.CSSProperties = {
    textAlign: 'center',
    marginBottom: '24px',
  };

  const toggleButtonStyles: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: '#4A90E2',
    textDecoration: 'underline',
    cursor: 'pointer',
    fontSize: '14px',
  };

  const gameConnectionStyles: React.CSSProperties = {
    marginTop: '32px',
    padding: '24px',
    backgroundColor: '#0f0f0f',
    borderRadius: '12px',
    border: '1px solid #333',
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setAuthError('');
  };

  const handleAuth = async () => {
    setAuthError('');
    setAuthLoading(true);

    try {
      if (isLogin) {
        // Login
        const result = await login(formData.email, formData.password);
        if (!result.success) {
          setAuthError(result.message || 'Login error');
        }
      } else {
        // Registration
        if (formData.password !== formData.confirmPassword) {
          setAuthError('Passwords do not match');
          setAuthLoading(false);
          return;
        }

        if (formData.password.length < 8) {
          setAuthError('Password must be at least 8 characters long');
          setAuthLoading(false);
          return;
        }

        const result = await register(formData.username, formData.email, formData.password);
        if (!result.success) {
          setAuthError(result.message || 'Error creating account');
        }
      }
    } catch (error) {
      setAuthError('Server connection error');
    } finally {
      setAuthLoading(false);
    }
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

  // If user is authenticated, show game connection interface
  if (state.isAuthenticated && state.user) {
    const tabStyles: React.CSSProperties = {
      display: 'flex',
      marginBottom: '24px',
      borderBottom: '1px solid #333',
    };

    const tabButtonStyles = (active: boolean): React.CSSProperties => ({
      flex: 1,
      padding: '12px 20px',
      background: 'none',
      border: 'none',
      color: active ? '#61dafb' : '#999',
      cursor: 'pointer',
      fontSize: '16px',
      fontWeight: active ? '600' : '400',
      borderBottom: active ? '2px solid #61dafb' : '2px solid transparent',
      transition: 'all 0.2s ease',
    });

    const contentStyles: React.CSSProperties = {
      minHeight: '400px',
    };

    return (
      <div style={containerStyles}>
        <div style={{ ...cardStyles, maxWidth: '800px', width: '90%' }}>
          <h1 style={titleStyles}>Welcome, {state.user.username}!</h1>
          <p style={subtitleStyles}>Manage your servers and play</p>
          
          <div style={tabStyles}>
            <button 
              style={tabButtonStyles(activeTab === 'play')}
              onClick={() => setActiveTab('play')}
            >
              Play Game
            </button>
            <button 
              style={tabButtonStyles(activeTab === 'servers')}
              onClick={() => setActiveTab('servers')}
            >
              My Servers
            </button>
          </div>

          <div style={contentStyles}>
            {activeTab === 'play' ? (
              <div style={gameConnectionStyles}>
                <h3 style={{ marginBottom: '16px', color: '#fff' }}>Server Connection</h3>
                
                {gameError && (
                  <div style={errorStyles}>
                    {gameError}
                  </div>
                )}

                <div style={{ marginBottom: '24px' }}>
                  <Input
                    label="Server URL"
                    value={serverUrl}
                    onChange={onServerUrlChange}
                    placeholder="ws://localhost:25565"
                    disabled={connecting}
                    fullWidth
                    type="url"
                  />
                </div>

                <Button
                  onClick={onConnect}
                  disabled={connecting || !serverUrl.trim()}
                  loading={connecting}
                  variant="primary"
                  size="large"
                  fullWidth
                >
                  {connecting ? 'Connecting...' : 'Connect to Server'}
                </Button>

                <div style={{ marginTop: '16px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
                  <div>• WASD to move</div>
                  <div>• Mouse to look around</div>
                  <div>• Left click = break, Right click = place</div>
                </div>
              </div>
            ) : (
              <ServerManagement />
            )}
          </div>
        </div>
      </div>
    );
  }

  // Authentication screen
  return (
    <div style={containerStyles}>
      <div style={cardStyles}>
        <h1 style={titleStyles}>Vaste</h1>
        <p style={subtitleStyles}>Multiplayer voxel game</p>
        
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

        <form>
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

export default AuthScreen;