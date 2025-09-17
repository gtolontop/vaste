import { ClientMessage, ServerMessage, GameState, getBlockKey } from './types';
import { User } from './services/auth.types';

// Lightweight unique id generator for action correlation (RFC4122 v4 style-ish)
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class NetworkManager {
  private ws: WebSocket | null = null;
  private gameState: GameState;
  private onStateUpdate: (state: GameState) => void;
  private onConnectionChange: (connected: boolean) => void;
  public onTeleport?: (x: number, y: number, z: number) => void;
  private authenticatedUser: User | null = null;

  constructor(
    onStateUpdate: (state: GameState) => void,
    onConnectionChange: (connected: boolean) => void,
    user?: User
  ) {
    this.gameState = {
      playerId: null,
      players: new Map(),
      blocks: new Map(),
      worldSize: 16,
      connected: false,
      playerPosition: null
    };
    this.onStateUpdate = onStateUpdate;
    this.onConnectionChange = onConnectionChange;
    this.authenticatedUser = user || null;
  }

  connect(serverUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(serverUrl);

        this.ws.onopen = () => {
          console.log('[CLIENT] Connected to server');
          
          // Send authentication info with JWT token
          if (this.authenticatedUser) {
            // Get the token from localStorage
            const token = localStorage.getItem('vaste_token');
            
            this.sendMessage({
              type: 'auth_info',
              username: this.authenticatedUser.username,
              uuid: this.authenticatedUser.uuid,
              token: token
            } as any); // Temporaire jusqu'à ce qu'on mette à jour les types
          }
          
          this.gameState.connected = true;
          this.onConnectionChange(true);
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: ServerMessage = JSON.parse(event.data);
            this.handleServerMessage(message);
          } catch (error) {
            console.error('[CLIENT] Error parsing server message:', error);
          }
        };

        this.ws.onclose = () => {
          console.log('[CLIENT] Disconnected from server');
          this.gameState.connected = false;
          this.onConnectionChange(false);
        };

        this.ws.onerror = (error) => {
          console.error('[CLIENT] WebSocket error:', error);
          this.gameState.connected = false;
          this.onConnectionChange(false);
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  sendMessage(message: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      
      // Track player position locally
      if (message.type === 'player_move') {
        this.gameState.playerPosition = {
          x: message.x,
          y: message.y,
          z: message.z
        };
      }
    } else {
      console.warn('[CLIENT] Cannot send message: not connected');
    }
  }

  // Send a block action (place/break) with optimistic update and an actionId for reconciliation
  sendBlockAction(message: ClientMessage & { actionId?: string }) {
  const actionId = (message as any).actionId || generateId();
    (message as any).actionId = actionId;

    // Apply optimistic update locally
    if (message.type === 'break_block') {
      const key = getBlockKey(message.x, message.y, message.z);
      // store previous block so we can rollback if needed
      const prev = this.gameState.blocks.get(key) || null;
      this.pendingActions.set(actionId, { type: 'break', key, prev });
      this.gameState.blocks.delete(key);
      this.onStateUpdate({ ...this.gameState });
    } else if (message.type === 'place_block') {
      const key = getBlockKey(message.x, message.y, message.z);
      const prev = this.gameState.blocks.get(key) || null;
      this.pendingActions.set(actionId, { type: 'place', key, prev });
      this.gameState.blocks.set(key, {
        x: (message as any).x,
        y: (message as any).y,
        z: (message as any).z,
        type: (message as any).blockType || 1
      });
      this.onStateUpdate({ ...this.gameState });
    }

    // Send to server
    this.sendMessage(message as ClientMessage);
    return actionId;
  }

  // Map of pending optimistic actions by actionId
  private pendingActions: Map<string, { type: 'break' | 'place'; key: string; prev: any }> = new Map();

  private handleServerMessage(message: ServerMessage) {
    switch (message.type) {
      case 'world_init':
        this.handleWorldInit(message);
        break;
      case 'chunks_update':
        this.handleChunksUpdate(message);
        break;
      case 'block_update':
        this.handleBlockUpdate(message);
        break;
      case 'block_action_result':
        this.handleBlockActionResult(message as any);
        break;
      case 'player_update':
        this.handlePlayerUpdate(message);
        break;
      case 'player_disconnect':
        this.handlePlayerDisconnect(message);
        break;
      case 'teleport':
        this.handleTeleport(message);
        break;
      default:
        console.warn('[CLIENT] Unknown server message type:', (message as any).type);
    }
  }

  private handleWorldInit(message: any) {
    console.log('[CLIENT] Received world initialization');
    this.gameState.playerId = message.playerId;
    this.gameState.worldSize = message.worldSize;
    this.gameState.blocks.clear();

    // Load blocks
    message.blocks.forEach((block: any) => {
      const key = getBlockKey(block.x, block.y, block.z);
      this.gameState.blocks.set(key, block);
    });

    this.onStateUpdate({ ...this.gameState });
  }

  private handleChunksUpdate(message: any) {
    console.log(`[CLIENT] Received chunks update with ${message.blocks.length} blocks`);
    
    // Ajouter/mettre à jour les nouveaux blocs (ne pas clear la map existante)
    message.blocks.forEach((block: any) => {
      const key = getBlockKey(block.x, block.y, block.z);
      this.gameState.blocks.set(key, block);
    });

    this.onStateUpdate({ ...this.gameState });
  }

  private handleBlockUpdate(message: any) {
    const key = getBlockKey(message.x, message.y, message.z);
    
    if (message.action === 'break') {
      this.gameState.blocks.delete(key);
      console.log(`[CLIENT] Block broken at (${message.x}, ${message.y}, ${message.z})`);
    } else if (message.action === 'place') {
      this.gameState.blocks.set(key, {
        x: message.x,
        y: message.y,
        z: message.z,
        type: message.blockType || 1
      });
      console.log(`[CLIENT] Block placed at (${message.x}, ${message.y}, ${message.z})`);
    }

    this.onStateUpdate({ ...this.gameState });
  }

  private handleBlockActionResult(message: any) {
    const { actionId, success, reason } = message;
    if (!actionId) return;

    const pending = this.pendingActions.get(actionId);
    if (!pending) return; // might be old or already reconciled

    if (success) {
      // Server accepted: nothing to do, the block_update message from server will ensure consistency
      this.pendingActions.delete(actionId);
      console.log(`[CLIENT] Block action ${actionId} confirmed by server`);
    } else {
      // Server rejected: rollback optimistic change
      console.warn(`[CLIENT] Block action ${actionId} rejected: ${reason}`);
      if (pending.type === 'break') {
        if (pending.prev) {
          this.gameState.blocks.set(pending.key, pending.prev);
        }
      } else if (pending.type === 'place') {
        if (pending.prev) {
          this.gameState.blocks.set(pending.key, pending.prev);
        } else {
          this.gameState.blocks.delete(pending.key);
        }
      }
      this.pendingActions.delete(actionId);
      this.onStateUpdate({ ...this.gameState });
    }
  }

  private handlePlayerUpdate(message: any) {
    const existingPlayer = this.gameState.players.get(message.id);
    
    this.gameState.players.set(message.id, {
      id: message.id,
      x: message.x,
      y: message.y,
      z: message.z
    });

    if (!existingPlayer) {
      console.log(`[CLIENT] Player ${message.id} joined`);
    }

    this.onStateUpdate({ ...this.gameState });
  }

  private handlePlayerDisconnect(message: any) {
    this.gameState.players.delete(message.id);
    console.log(`[CLIENT] Player ${message.id} left`);
    this.onStateUpdate({ ...this.gameState });
  }

  private handleTeleport(message: any) {
    // Callback to update camera position (will be set by Game component)
    if (this.onTeleport) {
      this.onTeleport(message.x, message.y + 1.6, message.z); // +1.6 for eye level
    }
  }

  getGameState(): GameState {
    return { ...this.gameState };
  }
}
