import React, { useState } from 'react';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { gameServerService, CreateServerData } from '../../services/gameServerService';

interface CreateServerFormProps {
  onServerCreated: (server: any) => void;
  onCancel: () => void;
}

export const CreateServerForm: React.FC<CreateServerFormProps> = ({ onServerCreated, onCancel }) => {
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await gameServerService.createServer(formData);
      onServerCreated(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create server');
    } finally {
      setIsLoading(false);
    }
  };

  const updateField = (field: keyof CreateServerData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg max-w-md mx-auto">
      <h3 className="text-xl font-bold text-white mb-4">Create New Game Server</h3>
      
      {error && (
        <div className="bg-red-600 text-white p-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <Input
          type="text"
          placeholder="Server Name"
          value={formData.name}
          onChange={(value) => updateField('name', value)}
        />

        <Input
          type="text"
          placeholder="Description (optional)"
          value={formData.description || ''}
          onChange={(value) => updateField('description', value)}
        />

        <div className="grid grid-cols-2 gap-2">
          <Input
            type="text"
            placeholder="Host"
            value={formData.host}
            onChange={(value) => updateField('host', value)}
          />
          <Input
            type="text"
            placeholder="Port"
            value={formData.port.toString()}
            onChange={(value) => updateField('port', parseInt(value) || 25565)}
          />
        </div>

        <Input
          type="text"
          placeholder="WebSocket URL"
          value={formData.websocket_url}
          onChange={(value) => updateField('websocket_url', value)}
        />

        <Input
          type="text"
          placeholder="Max Players"
          value={formData.max_players.toString()}
          onChange={(value) => updateField('max_players', parseInt(value) || 20)}
        />

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="is_public"
            checked={formData.is_public}
            onChange={(e) => updateField('is_public', e.target.checked)}
            className="rounded"
          />
          <label htmlFor="is_public" className="text-white">Public Server</label>
        </div>

        <div className="flex space-x-2">
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            fullWidth
          >
            {isLoading ? 'Creating...' : 'Create Server'}
          </Button>
          <Button
            onClick={onCancel}
            variant="secondary"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};