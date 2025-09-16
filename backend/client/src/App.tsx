import React, { useState } from 'react';
import Game from './Game';
import { NetworkManager } from './network';
import { GameState } from './types';
import { AuthScreen } from './components/screens';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoadingScreen } from './components/ui';

// Main component with authentication
const AppContent: React.FC = () => {
  const { state: authState } = useAuth();
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [serverUrl, setServerUrl] = useState('ws://localhost:25565');
  const [networkManager, setNetworkManager] = useState<NetworkManager | null>(null);
  const [error, setError] = useState<string>('');

  // Handle game server connection
  const handleConnect = async () => {
    if (connecting) return;

    setConnecting(true);
    setError('');

    try {
      const manager = new NetworkManager(
        (_gameState: GameState) => {
          // State updates are handled within the Game component
        },
        (connectionState: boolean) => {
          setConnected(connectionState);
          if (!connectionState) {
            setNetworkManager(null);
          }
        },
        authState.user || undefined // Pass authenticated user information
      );

      await manager.connect(serverUrl);
      setNetworkManager(manager);
    } catch (err) {
      setError('Failed to connect to server. Make sure the server is running.');
      console.error('[CLIENT] Connection error:', err);
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

  // Show loading screen while checking authentication
  if (authState.isLoading) {
    return <LoadingScreen message="Checking authentication..." />;
  }

  // Show auth screen if not authenticated or not connected to game
  if (!authState.isAuthenticated || !authState.user || !connected || !networkManager) {
    return (
      <AuthScreen
        serverUrl={serverUrl}
        onServerUrlChange={setServerUrl}
        onConnect={handleConnect}
        connecting={connecting}
        error={error}
      />
    );
  }

  return (
    <Game 
      networkManager={networkManager} 
      onDisconnect={handleDisconnect}
    />
  );
};

// Main App component with authentication provider
const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
