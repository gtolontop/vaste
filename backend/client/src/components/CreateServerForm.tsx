import React, { useState } from 'react';
import { gameServerService, CreateServerData } from '../services/gameServerService';
import Button from './ui/Button';
import Input from './ui/Input';

interface CreateServerFormProps {
  onServerCreated: (server: any) => void;
  onCancel: () => void;
}

const CreateServerForm: React.FC<CreateServerFormProps> = ({ onServerCreated, onCancel }) => {
  const [formData, setFormData] = useState<CreateServerData>({
    name: '',
    description: '',
    host: 'localhost',
    port: 25565,
    websocket_url: 'ws://localhost:25565',
    max_players: 20,
    is_public: true,
    version: '1.0.0',
    tags: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmitClick = () => {
    const form = document.querySelector('form');
    if (form) {
      form.requestSubmit();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await gameServerService.createServer(formData);
      onServerCreated(result);
    } catch (err: any) {
      setError(err.message || 'Failed to create server');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof CreateServerData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const formContainerStyle: React.CSSProperties = {
    maxWidth: '600px',
    margin: '0 auto',
    padding: '2rem',
    background: 'rgba(30, 30, 30, 0.9)',
    borderRadius: '12px',
    border: '1px solid #444',
  };

  const titleStyle: React.CSSProperties = {
    color: '#61dafb',
    marginBottom: '1.5rem',
    textAlign: 'center',
  };

  const formGroupStyle: React.CSSProperties = {
    marginBottom: '1rem',
  };

  const formRowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1rem',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: '#ccc',
    marginBottom: '0.5rem',
    fontWeight: 500,
  };

  const textareaStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.75rem',
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid #555',
    borderRadius: '8px',
    color: 'white',
    fontFamily: 'inherit',
    resize: 'vertical' as any,
    minHeight: '80px',
    boxSizing: 'border-box',
  };

  const checkboxLabelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    color: '#ccc',
  };

  const formActionsStyle: React.CSSProperties = {
    display: 'flex',
    gap: '1rem',
    justifyContent: 'flex-end',
    marginTop: '2rem',
  };

  const errorStyle: React.CSSProperties = {
    background: 'rgba(220, 53, 69, 0.2)',
    color: '#ff6b6b',
    padding: '0.75rem',
    borderRadius: '8px',
    border: '1px solid rgba(220, 53, 69, 0.3)',
    marginBottom: '1rem',
  };

  return (
    <div style={formContainerStyle}>
      <h3 style={titleStyle}>Create New Game Server</h3>
      <form onSubmit={handleSubmit}>
        <div style={formGroupStyle}>
          <label style={labelStyle}>Server Name *</label>
          <Input
            value={formData.name}
            onChange={(value) => handleChange('name', value)}
            placeholder="My Awesome Server"
            fullWidth
          />
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>Description</label>
          <textarea
            value={formData.description || ''}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Describe your server..."
            style={textareaStyle}
          />
        </div>

        <div style={formRowStyle}>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Host *</label>
            <Input
              value={formData.host}
              onChange={(value) => handleChange('host', value)}
              placeholder="localhost"
              fullWidth
            />
          </div>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Port *</label>
            <Input
              value={formData.port.toString()}
              onChange={(value) => handleChange('port', parseInt(value) || 25565)}
              placeholder="25565"
              fullWidth
            />
          </div>
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>WebSocket URL *</label>
          <Input
            value={formData.websocket_url}
            onChange={(value) => handleChange('websocket_url', value)}
            placeholder="ws://localhost:25565"
            fullWidth
          />
        </div>

        <div style={formRowStyle}>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Max Players *</label>
            <Input
              value={formData.max_players.toString()}
              onChange={(value) => handleChange('max_players', parseInt(value) || 20)}
              placeholder="20"
              fullWidth
            />
          </div>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Version</label>
            <Input
              value={formData.version || '1.0.0'}
              onChange={(value) => handleChange('version', value)}
              placeholder="1.0.0"
              fullWidth
            />
          </div>
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>Tags</label>
          <Input
            value={formData.tags || ''}
            onChange={(value) => handleChange('tags', value)}
            placeholder="survival,creative,pvp"
            fullWidth
          />
        </div>

        <div style={formGroupStyle}>
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={formData.is_public}
              onChange={(e) => handleChange('is_public', e.target.checked)}
              style={{ margin: 0 }}
            />
            Make server public
          </label>
        </div>

        {error && <div style={errorStyle}>{error}</div>}

        <div style={formActionsStyle}>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={loading} onClick={handleSubmitClick}>
            {loading ? 'Creating...' : 'Create Server'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default CreateServerForm;