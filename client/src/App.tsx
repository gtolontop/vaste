import React, { useState } from 'react';
import Game from './Game';
import { NetworkManager } from './network';
import { GameState } from './types';
import { ConnectionScreen } from './components/screens';

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

  if (!connected || !networkManager) {
    return (
      <ConnectionScreen
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

export default App;
