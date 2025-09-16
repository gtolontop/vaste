import { ClientMessage, ServerMessage, GameState, getBlockKey } from './types';

export class NetworkManager {
  private ws: WebSocket | null = null;
  private gameState: GameState;
  private onStateUpdate: (state: GameState) => void;
  private onConnectionChange: (connected: boolean) => void;

  constructor(
    onStateUpdate: (state: GameState) => void,
    onConnectionChange: (connected: boolean) => void
  ) {
    this.gameState = {
      playerId: null,
      players: new Map(),
      blocks: new Map(),
      worldSize: 16,
      connected: false
    };
    this.onStateUpdate = onStateUpdate;
    this.onConnectionChange = onConnectionChange;
  }

  connect(serverUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(serverUrl);

        this.ws.onopen = () => {
          console.log('[CLIENT] Connected to server');
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
    } else {
      console.warn('[CLIENT] Cannot send message: not connected');
    }
  }

  private handleServerMessage(message: ServerMessage) {
    switch (message.type) {
      case 'world_init':
        this.handleWorldInit(message);
        break;
      case 'block_update':
        this.handleBlockUpdate(message);
        break;
      case 'player_update':
        this.handlePlayerUpdate(message);
        break;
      case 'player_disconnect':
        this.handlePlayerDisconnect(message);
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

  getGameState(): GameState {
    return { ...this.gameState };
  }
}
