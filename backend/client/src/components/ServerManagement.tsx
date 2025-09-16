import React, { useState, useEffect } from 'react';
import { gameServerService, GameServer } from '../services/gameServerService';
import Button from './ui/Button';
import CreateServerForm from './CreateServerForm';

const ServerManagement: React.FC = () => {
  const [servers, setServers] = useState<GameServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedServer, setSelectedServer] = useState<GameServer | null>(null);

  const loadServers = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await gameServerService.getMyServers();
      setServers(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load servers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServers();
  }, []);

  const handleServerCreated = (result: any) => {
    setShowCreateForm(false);
    loadServers();
    alert(`Server created successfully!\n\nLicense Key: ${result.server.license_key}\n\nSave this key safely - you'll need it to configure your game server!`);
  };

  const handleDeleteServer = async (server: GameServer) => {
    if (!confirm(`Are you sure you want to delete "${server.name}"?`)) return;
    
    try {
      await gameServerService.deleteServer(server.uuid);
      loadServers();
    } catch (err: any) {
      alert('Failed to delete server: ' + err.message);
    }
  };

  const handleRenewLicense = async (server: GameServer) => {
    try {
      await gameServerService.renewLicense(server.uuid);
      loadServers();
      alert('License renewed successfully!');
    } catch (err: any) {
      alert('Failed to renew license: ' + err.message);
    }
  };

  const handleToggleLicense = async (server: GameServer) => {
    try {
      if (server.is_license_active) {
        await gameServerService.deactivateLicense(server.uuid);
      } else {
        await gameServerService.reactivateLicense(server.uuid);
      }
      loadServers();
    } catch (err: any) {
      alert('Failed to toggle license: ' + err.message);
    }
  };

  const showServerDetails = async (server: GameServer) => {
    try {
      const detailedServer = await gameServerService.getServer(server.uuid);
      setSelectedServer(detailedServer);
    } catch (err: any) {
      alert('Failed to load server details: ' + err.message);
    }
  };

  const copyLicenseKey = (licenseKey: string) => {
    navigator.clipboard.writeText(licenseKey);
    alert('License key copied to clipboard!');
  };

  const containerStyle: React.CSSProperties = {
    padding: '2rem',
    maxWidth: '1200px',
    margin: '0 auto',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
  };

  const titleStyle: React.CSSProperties = {
    color: '#61dafb',
    fontSize: '2rem',
    margin: 0,
  };

  const serverGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
    gap: '1.5rem',
    marginTop: '2rem',
  };

  const serverCardStyle: React.CSSProperties = {
    background: 'rgba(30, 30, 30, 0.9)',
    border: '1px solid #444',
    borderRadius: '12px',
    padding: '1.5rem',
  };

  const serverHeaderStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1rem',
  };

  const serverNameStyle: React.CSSProperties = {
    color: '#61dafb',
    fontSize: '1.25rem',
    margin: 0,
  };

  const statusBadgeStyle = (isOnline: boolean, isActive: boolean): React.CSSProperties => ({
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: 'bold',
    background: isActive ? (isOnline ? '#22c55e' : '#ef4444') : '#6b7280',
    color: 'white',
  });

  const serverInfoStyle: React.CSSProperties = {
    color: '#ccc',
    fontSize: '0.9rem',
    lineHeight: '1.5',
    marginBottom: '1rem',
  };

  const actionsStyle: React.CSSProperties = {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap' as any,
  };

  const errorStyle: React.CSSProperties = {
    background: 'rgba(220, 53, 69, 0.2)',
    color: '#ff6b6b',
    padding: '1rem',
    borderRadius: '8px',
    border: '1px solid rgba(220, 53, 69, 0.3)',
    marginBottom: '1rem',
  };

  const emptyStyle: React.CSSProperties = {
    textAlign: 'center' as any,
    color: '#888',
    padding: '3rem',
  };

  const modalOverlayStyle: React.CSSProperties = {
    position: 'fixed' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  };

  const modalContentStyle: React.CSSProperties = {
    background: 'rgba(20, 20, 20, 0.95)',
    border: '1px solid #444',
    borderRadius: '12px',
    padding: '2rem',
    maxWidth: '600px',
    width: '90%',
    maxHeight: '80vh',
    overflow: 'auto',
  };

  if (showCreateForm) {
    return (
      <div style={modalOverlayStyle}>
        <div style={modalContentStyle}>
          <CreateServerForm
            onServerCreated={handleServerCreated}
            onCancel={() => setShowCreateForm(false)}
          />
        </div>
      </div>
    );
  }

  if (selectedServer) {
    return (
      <div style={modalOverlayStyle}>
        <div style={modalContentStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ color: '#61dafb', margin: 0 }}>Server Details</h3>
            <Button variant="secondary" onClick={() => setSelectedServer(null)}>
              Close
            </Button>
          </div>
          
          <div style={serverInfoStyle}>
            <p><strong>Name:</strong> {selectedServer.name}</p>
            <p><strong>Description:</strong> {selectedServer.description || 'No description'}</p>
            <p><strong>WebSocket URL:</strong> {selectedServer.websocket_url}</p>
            <p><strong>Max Players:</strong> {selectedServer.max_players}</p>
            <p><strong>Current Players:</strong> {selectedServer.current_players}</p>
            <p><strong>Version:</strong> {selectedServer.version}</p>
            <p><strong>Tags:</strong> {selectedServer.tags || 'None'}</p>
            <p><strong>License Expires:</strong> {new Date(selectedServer.license_expires_at).toLocaleDateString()}</p>
            <p><strong>License Key:</strong> 
              <code style={{ background: '#222', padding: '0.25rem', marginLeft: '0.5rem', borderRadius: '4px' }}>
                {selectedServer.license_key}
              </code>
              <Button 
                variant="secondary" 
                onClick={() => copyLicenseKey(selectedServer.license_key!)}
                style={{ marginLeft: '0.5rem', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
              >
                Copy
              </Button>
            </p>
          </div>

          <div style={actionsStyle}>
            <Button variant="primary" onClick={() => handleRenewLicense(selectedServer)}>
              Renew License
            </Button>
            <Button 
              variant={selectedServer.is_license_active ? "danger" : "primary"}
              onClick={() => handleToggleLicense(selectedServer)}
            >
              {selectedServer.is_license_active ? 'Deactivate' : 'Activate'} License
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>My Game Servers</h1>
        <Button onClick={() => setShowCreateForm(true)}>
          Create New Server
        </Button>
      </div>

      {error && <div style={errorStyle}>{error}</div>}

      {loading ? (
        <div style={emptyStyle}>Loading servers...</div>
      ) : servers.length === 0 ? (
        <div style={emptyStyle}>
          <p>No servers created yet.</p>
          <p>Create your first server to get started!</p>
        </div>
      ) : (
        <div style={serverGridStyle}>
          {servers.map((server) => (
            <div key={server.id} style={serverCardStyle}>
              <div style={serverHeaderStyle}>
                <h3 style={serverNameStyle}>{server.name}</h3>
                <span style={statusBadgeStyle(server.is_online, server.is_license_active)}>
                  {server.is_license_active ? (server.is_online ? 'Online' : 'Offline') : 'Inactive'}
                </span>
              </div>

              <div style={serverInfoStyle}>
                <p><strong>URL:</strong> {server.websocket_url}</p>
                <p><strong>Players:</strong> {server.current_players}/{server.max_players}</p>
                <p><strong>Version:</strong> {server.version}</p>
                {server.description && <p><strong>Description:</strong> {server.description}</p>}
                <p><strong>License expires:</strong> {new Date(server.license_expires_at).toLocaleDateString()}</p>
              </div>

              <div style={actionsStyle}>
                <Button variant="primary" onClick={() => showServerDetails(server)}>
                  View Details
                </Button>
                <Button variant="secondary" onClick={() => handleRenewLicense(server)}>
                  Renew License
                </Button>
                <Button variant="danger" onClick={() => handleDeleteServer(server)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ServerManagement;