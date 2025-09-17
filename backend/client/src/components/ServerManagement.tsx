import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { gameServerService, GameServer } from '../services/gameServerService';
import Button from './ui/Button';

const ServerManagement: React.FC = () => {
  const [servers, setServers] = useState<GameServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

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

  const handleCreateServer = () => {
    navigate('/create-server');
  };

  const handleServerClick = (server: GameServer) => {
    navigate(`/my-servers/${server.uuid}`);
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '1rem 2rem',
    width: '100%',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
  };

  const titleStyle: React.CSSProperties = {
    color: '#ffffff',
    fontSize: '2rem',
    fontWeight: 'bold',
    margin: 0,
  };

  const serverGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
    gap: '1rem',
    marginTop: '1rem',
  };

  const serverCardStyle: React.CSSProperties = {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    padding: '1.5rem',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  };

  const serverHeaderStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1rem',
  };

  const serverNameStyle: React.CSSProperties = {
    color: '#ffffff',
    fontSize: '1.25rem',
    fontWeight: 'bold',
    margin: 0,
  };

  const statusBadgeStyle = (isOnline: boolean, isActive: boolean): React.CSSProperties => ({
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: 'bold',
    background: isActive ? (isOnline ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)') : 'rgba(107, 114, 128, 0.8)',
    color: 'white',
  });

  const serverInfoStyle: React.CSSProperties = {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: '0.9rem',
    lineHeight: '1.5',
    marginBottom: '1rem',
  };

  const errorStyle: React.CSSProperties = {
    background: 'rgba(239, 68, 68, 0.1)',
    color: 'rgba(239, 68, 68, 0.9)',
    padding: '1rem',
    borderRadius: '8px',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    marginBottom: '1rem',
  };

  const emptyStyle: React.CSSProperties = {
    textAlign: 'center' as any,
    color: 'rgba(255, 255, 255, 0.5)',
    padding: '3rem',
  };

  const loadingStyle: React.CSSProperties = {
    textAlign: 'center' as any,
    color: 'rgba(255, 255, 255, 0.7)',
    padding: '2rem',
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>My Servers</h1>
        <Button variant="primary" onClick={handleCreateServer}>
          Create New Server
        </Button>
      </div>

      {error && (
        <div style={errorStyle}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={loadingStyle}>
          Loading servers...
        </div>
      ) : servers.length === 0 ? (
        <div style={emptyStyle}>
          <h3>No servers found</h3>
          <p>Create your first server to get started!</p>
        </div>
      ) : (
        <div style={serverGridStyle}>
          {servers.map((server) => (
            <div
              key={server.uuid}
              style={serverCardStyle}
              onClick={() => handleServerClick(server)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              }}
            >
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ServerManagement;