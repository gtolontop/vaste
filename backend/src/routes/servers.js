import express from 'express';
import { GameServer } from '../models/GameServer.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { validateServerCreation } from '../middleware/validation.js';

const router = express.Router();

// Get list of public servers
router.get('/', optionalAuth, async (req, res) => {
  try {
    const servers = await GameServer.getPublicServers();
    
    res.json({
      success: true,
      data: {
        servers: servers.map(server => ({
          uuid: server.uuid,
          name: server.name,
          description: server.description,
          websocket_url: server.websocket_url,
          max_players: server.max_players,
          current_players: server.current_players,
          is_online: server.is_online,
          version: server.version,
          tags: server.tags,
          created_at: server.created_at
        }))
      }
    });

  } catch (error) {
    console.error('[SERVERS] Servers retrieval error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error retrieving servers'
    });
  }
});

// Get servers of connected user
router.get('/my-servers', authenticateToken, async (req, res) => {
  try {
    const servers = await GameServer.getByOwner(req.user.id);
    
    res.json({
      success: true,
      data: {
        servers
      }
    });

  } catch (error) {
    console.error('[SERVERS] User servers retrieval error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error retrieving your servers'
    });
  }
});

// Create a new server
router.post('/', authenticateToken, validateServerCreation, async (req, res) => {
  try {
    const { name, description, host, port, websocket_url, max_players, is_public, version, tags } = req.body;

    const server = await GameServer.create({
      name,
      description,
      host,
      port,
      websocket_url,
      max_players: max_players || 10,
      owner_id: req.user.id,
      is_public: is_public !== false, // Par défaut public
      version: version || '1.0.0',
      tags: tags || ''
    });

    res.status(201).json({
      success: true,
      message: 'Server created successfully',
      data: {
        server
      }
    });

  } catch (error) {
    console.error('[SERVERS] Server creation error:', error.message);
    res.status(400).json({
      success: false,
      message: 'Error creating server'
    });
  }
});

// Get server by UUID
router.get('/:uuid', optionalAuth, async (req, res) => {
  try {
    const server = await GameServer.findByUuid(req.params.uuid);
    
    if (!server) {
      return res.status(404).json({
        success: false,
        message: 'Server not found'
      });
    }

    // If server is not public, only owner can view it
    if (!server.is_public && (!req.user || req.user.id !== server.owner_id)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to this server'
      });
    }

    res.json({
      success: true,
      data: {
        server
      }
    });

  } catch (error) {
    console.error('[SERVERS] Server retrieval error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error retrieving server'
    });
  }
});

// Update a server
router.put('/:uuid', authenticateToken, async (req, res) => {
  try {
    const server = await GameServer.findByUuid(req.params.uuid);
    
    if (!server) {
      return res.status(404).json({
        success: false,
        message: 'Server not found'
      });
    }

    // Verify that user is the owner
    if (server.owner_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to modify this server'
      });
    }

    const { name, description, max_players, is_public, version, tags } = req.body;
    
    await server.update({
      name,
      description,
      max_players,
      is_public,
      version,
      tags
    });

    res.json({
      success: true,
      message: 'Server updated successfully',
      data: {
        server
      }
    });

  } catch (error) {
    console.error('[SERVERS] Server update error:', error.message);
    res.status(400).json({
      success: false,
      message: 'Error updating server'
    });
  }
});

// Delete a server
router.delete('/:uuid', authenticateToken, async (req, res) => {
  try {
    const server = await GameServer.findByUuid(req.params.uuid);
    
    if (!server) {
      return res.status(404).json({
        success: false,
        message: 'Server not found'
      });
    }

    // Verify that user is the owner
    if (server.owner_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this server'
      });
    }

    await server.delete();

    res.json({
      success: true,
      message: 'Server deleted successfully'
    });

  } catch (error) {
    console.error('[SERVERS] Server deletion error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error deleting server'
    });
  }
});

// Endpoint for game servers to update their status (ping)
router.post('/:uuid/ping', async (req, res) => {
  try {
    const server = await GameServer.findByUuid(req.params.uuid);
    
    if (!server) {
      return res.status(404).json({
        success: false,
        message: 'Server not found'
      });
    }

    const { current_players } = req.body;
    
    await server.updateStatus(true, current_players || 0);

    res.json({
      success: true,
      message: 'Server status updated'
    });

  } catch (error) {
    console.error('[SERVERS] Server ping error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error updating status'
    });
  }
});

export default router;