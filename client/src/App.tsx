import React, { useState } from 'react';
import Game from './Game';
import { NetworkManager } from './network';
import { GameState } from './types';

const App: React.FC = () => {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [serverUrl, setServerUrl] = useState('ws://localhost:25565');
  const [networkManager, setNetworkManager] = useState<NetworkManager | null>(null);
  const [error, setError] = useState<string>('');

  const handleConnect = async () => {
    if (connecting) return;

    setConnecting(true);
    setError('');

    try {
      const manager = new NetworkManager(
        (state: GameState) => {
          // State updates are handled within the Game component
        },
        (connectionState: boolean) => {
          setConnected(connectionState);
          if (!connectionState) {
            setNetworkManager(null);
          }
        }
      );

      await manager.connect(serverUrl);
      setNetworkManager(manager);
    } catch (err) {
      setError('Failed to connect to server. Make sure the server is running.');
      console.error('Connection error:', err);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    if (networkManager) {
      networkManager.disconnect();
      setNetworkManager(null);
    }
    setConnected(false);
  };

  if (!connected || !networkManager) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#1a1a1a',
        color: 'white',
        fontFamily: 'Arial, sans-serif'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '40px',
          backgroundColor: '#2d2d2d',
          borderRadius: '10px',
          boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
          minWidth: '400px'
        }}>
          <h1 style={{ marginBottom: '30px', color: '#fff' }}>
            Vaste
          </h1>
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '10px', fontSize: '16px' }}>
              Server URL:
            </label>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="ws://localhost:25565"
              disabled={connecting}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '16px',
                border: '1px solid #555',
                borderRadius: '5px',
                backgroundColor: '#3d3d3d',
                color: 'white',
                outline: 'none'
              }}
            />
          </div>

          {error && (
            <div style={{
              color: '#ff6b6b',
              marginBottom: '20px',
              padding: '10px',
              backgroundColor: '#4d1f1f',
              borderRadius: '5px',
              border: '1px solid #ff6b6b'
            }}>
              {error}
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={connecting || !serverUrl.trim()}
            style={{
              width: '100%',
              padding: '12px 24px',
              fontSize: '16px',
              backgroundColor: connecting ? '#666' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: connecting ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.3s'
            }}
            >
            {connecting ? 'Connecting...' : 'Connect'}
          </button>          <div style={{
            marginTop: '30px',
            fontSize: '14px',
            color: '#aaa',
            textAlign: 'left'
          }}>
            <h3 style={{ color: '#fff', marginBottom: '10px' }}>Instructions:</h3>
            <div style={{ marginBottom: '5px' }}>1. Start the server: <code>node server.js</code></div>
            <div style={{ marginBottom: '5px' }}>2. Enter server URL above</div>
            <div style={{ marginBottom: '5px' }}>3. Click Connect</div>
            <div style={{ marginBottom: '5px' }}>4. Use WASD to move, mouse to look</div>
            <div>5. Left click = break, Right click = place</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <Game networkManager={networkManager} />
      
      {/* Disconnect button */}
      <button
        onClick={handleDisconnect}
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          padding: '8px 16px',
          backgroundColor: '#ff4444',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
          fontSize: '14px',
          zIndex: 1000
        }}
      >
        Disconnect
      </button>
    </div>
  );
};

export default App;
