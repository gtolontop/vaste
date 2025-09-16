import React from 'react';
import { Button, Input } from '../ui';

export interface ConnectionScreenProps {
  serverUrl: string;
  onServerUrlChange: (url: string) => void;
  onConnect: () => void;
  connecting: boolean;
  error?: string;
}

const ConnectionScreen: React.FC<ConnectionScreenProps> = ({
  serverUrl,
  onServerUrlChange,
  onConnect,
  connecting,
  error,
}) => {
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
    color: '#999',
    textAlign: 'center',
    marginBottom: '32px',
  };

  const errorStyles: React.CSSProperties = {
    backgroundColor: '#222',
    border: '1px solid #555',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '20px',
    color: '#ccc',
    fontSize: '14px',
  };

  const instructionsStyles: React.CSSProperties = {
    marginTop: '32px',
    padding: '20px',
    backgroundColor: '#0d0d0d',
    borderRadius: '8px',
    border: '1px solid #222',
  };

  const instructionsTitleStyles: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '12px',
    color: '#ffffff',
  };

  const instructionItemStyles: React.CSSProperties = {
    fontSize: '14px',
    color: '#999',
    marginBottom: '4px',
    paddingLeft: '16px',
    position: 'relative',
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !connecting && serverUrl.trim()) {
      onConnect();
    }
  };

  return (
    <div style={containerStyles}>
      <div style={cardStyles}>
        <h1 style={titleStyles}>Vaste</h1>
        <p style={subtitleStyles}>Multiplayer Voxel Game</p>
        
        {error && (
          <div style={errorStyles}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: '24px' }} onKeyPress={handleKeyPress}>
          <Input
            label="Server URL"
            value={serverUrl}
            onChange={onServerUrlChange}
            placeholder="ws://localhost:25565"
            disabled={connecting}
            error={error ? '' : undefined}
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
          {connecting ? 'Connecting' : 'Connect'}
        </Button>

        <div style={instructionsStyles}>
          <div style={instructionsTitleStyles}>Getting Started:</div>
          <div style={instructionItemStyles}>• Start the server: node server.js</div>
          <div style={instructionItemStyles}>• Enter server URL above</div>
          <div style={instructionItemStyles}>• Click Connect to join</div>
          <div style={instructionItemStyles}>• Use WASD to move, mouse to look</div>
          <div style={instructionItemStyles}>• Left click = break, Right click = place</div>
        </div>
      </div>
    </div>
  );
};

export default ConnectionScreen;
