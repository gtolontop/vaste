import React, { useState, useEffect } from 'react';
import Button from '../ui/Button';
import { gameServerService, GameServer } from '../../services/gameServerService';
import { CreateServerForm } from './CreateServerForm';

export const ServerManagement: React.FC = () => {
  const [servers, setServers] = useState<GameServer[]>([]);
  const [publicServers, setPublicServers] = useState<GameServer[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedServer, setSelectedServer] = useState<GameServer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadServers();
  }, []);

  const loadServers = async () => {
    setIsLoading(true);
    try {
      const [myServers, pubServers] = await Promise.all([
        gameServerService.getMyServers(),
        gameServerService.getPublicServers()
      ]);
      setServers(myServers);
      setPublicServers(pubServers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load servers');
    } finally {
      setIsLoading(false);
    }
  };

  const handleServerCreated = (result: { server: GameServer; message: string }) => {
    setServers(prev => [result.server, ...prev]);
    setShowCreateForm(false);
    setSelectedServer(result.server);
    alert(`Server created! License Key: ${result.server.license_key}`);
  };

  const handleDeleteServer = async (server: GameServer) => {
    if (!confirm(`Are you sure you want to delete "${server.name}"?`)) return;

    try {
      await gameServerService.deleteServer(server.uuid);
      setServers(prev => prev.filter(s => s.uuid !== server.uuid));
      if (selectedServer?.uuid === server.uuid) {
        setSelectedServer(null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete server');
    }
  };

  const handleRenewLicense = async (server: GameServer) => {
    try {
      await gameServerService.renewLicense(server.uuid);
      loadServers(); // Reload to get updated data
      alert('License renewed successfully!');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to renew license');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const isLicenseExpiringSoon = (expiresAt: string) => {
    const expiryDate = new Date(expiresAt);
    const now = new Date();
    const daysUntilExpiry = (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return daysUntilExpiry <= 30;
  };

  if (showCreateForm) {
    return (
      <CreateServerForm
        onServerCreated={handleServerCreated}
        onCancel={() => setShowCreateForm(false)}
      />
    );
  }

  return (
    <div className="text-white space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Server Management</h2>
        <Button onClick={() => setShowCreateForm(true)}>
          Create New Server
        </Button>
      </div>

      {error && (
        <div className="bg-red-600 text-white p-3 rounded">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-8">Loading servers...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* My Servers */}
          <div>
            <h3 className="text-xl font-semibold mb-4">My Servers ({servers.length})</h3>
            {servers.length === 0 ? (
              <div className="bg-gray-800 p-6 rounded-lg text-center">
                <p className="text-gray-400 mb-4">You haven't created any servers yet.</p>
                <Button onClick={() => setShowCreateForm(true)}>
                  Create Your First Server
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {servers.map(server => (
                  <div
                    key={server.uuid}
                    className={`bg-gray-800 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                      selectedServer?.uuid === server.uuid 
                        ? 'border-blue-500' 
                        : 'border-transparent hover:border-gray-600'
                    }`}
                    onClick={() => setSelectedServer(server)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold text-lg">{server.name}</h4>
                        <p className="text-gray-400 text-sm">{server.description}</p>
                        <div className="flex items-center space-x-4 mt-2 text-sm">
                          <span className={`px-2 py-1 rounded ${
                            server.is_online ? 'bg-green-600' : 'bg-red-600'
                          }`}>
                            {server.is_online ? 'Online' : 'Offline'}
                          </span>
                          <span className={`px-2 py-1 rounded ${
                            server.is_license_active ? 'bg-blue-600' : 'bg-yellow-600'
                          }`}>
                            {server.is_license_active ? 'Active' : 'Inactive'}
                          </span>
                          {isLicenseExpiringSoon(server.license_expires_at) && (
                            <span className="px-2 py-1 rounded bg-orange-600">
                              Expires Soon
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Players: {server.current_players}/{server.max_players}
                        </p>
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          onClick={() => handleRenewLicense(server)}
                          variant="secondary"
                          size="small"
                        >
                          Renew
                        </Button>
                        <Button
                          onClick={() => handleDeleteServer(server)}
                          variant="danger"
                          size="small"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Server Details */}
          <div>
            {selectedServer ? (
              <div className="bg-gray-800 p-6 rounded-lg">
                <h3 className="text-xl font-semibold mb-4">Server Details</h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <strong>Name:</strong> {selectedServer.name}
                  </div>
                  <div>
                    <strong>Description:</strong> {selectedServer.description || 'None'}
                  </div>
                  <div>
                    <strong>WebSocket URL:</strong> 
                    <code className="bg-gray-700 px-2 py-1 rounded ml-2">
                      {selectedServer.websocket_url}
                    </code>
                  </div>
                  <div>
                    <strong>License Key:</strong>
                    <code className="bg-gray-700 px-2 py-1 rounded ml-2 text-xs">
                      {selectedServer.license_key?.substring(0, 32)}...
                    </code>
                    <Button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedServer.license_key || '');
                        alert('License key copied to clipboard!');
                      }}
                      size="small"
                      variant="secondary"
                      className="ml-2"
                    >
                      Copy
                    </Button>
                  </div>
                  <div>
                    <strong>License Expires:</strong> {formatDate(selectedServer.license_expires_at)}
                  </div>
                  <div>
                    <strong>Created:</strong> {formatDate(selectedServer.created_at)}
                  </div>
                  <div>
                    <strong>Version:</strong> {selectedServer.version}
                  </div>
                  <div>
                    <strong>Public:</strong> {selectedServer.is_public ? 'Yes' : 'No'}
                  </div>
                </div>

                <div className="mt-6 p-4 bg-gray-700 rounded">
                  <h4 className="font-semibold mb-2">Setup Instructions</h4>
                  <ol className="text-sm space-y-2 list-decimal list-inside">
                    <li>Copy the server-config.example.json file to server-config.json</li>
                    <li>Replace the license_key with your actual license key</li>
                    <li>Run: <code className="bg-gray-800 px-2 py-1 rounded">node server.js</code></li>
                    <li>Your server will validate with the backend and start!</li>
                  </ol>
                </div>
              </div>
            ) : (
              <div className="bg-gray-800 p-6 rounded-lg text-center">
                <p className="text-gray-400">Select a server to view details</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Public Servers */}
      <div>
        <h3 className="text-xl font-semibold mb-4">Public Servers ({publicServers.length})</h3>
        {publicServers.length === 0 ? (
          <div className="bg-gray-800 p-6 rounded-lg text-center">
            <p className="text-gray-400">No public servers available</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {publicServers.map(server => (
              <div key={server.uuid} className="bg-gray-800 p-4 rounded-lg">
                <h4 className="font-semibold">{server.name}</h4>
                <p className="text-gray-400 text-sm mb-2">{server.description}</p>
                <div className="flex justify-between items-center text-xs">
                  <span className={`px-2 py-1 rounded ${
                    server.is_online ? 'bg-green-600' : 'bg-red-600'
                  }`}>
                    {server.is_online ? 'Online' : 'Offline'}
                  </span>
                  <span>
                    {server.current_players}/{server.max_players} players
                  </span>
                </div>
                <code className="text-xs bg-gray-700 px-2 py-1 rounded block mt-2">
                  {server.websocket_url}
                </code>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};