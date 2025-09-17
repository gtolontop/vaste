// Network message types
export interface PlayerMoveMessage {
  type: 'player_move';
  x: number;
  y: number;
  z: number;
}

export interface BreakBlockMessage {
  type: 'break_block';
  x: number;
  y: number;
  z: number;
}

export interface PlaceBlockMessage {
  type: 'place_block';
  x: number;
  y: number;
  z: number;
}

export type ClientMessage = PlayerMoveMessage | BreakBlockMessage | PlaceBlockMessage;

export interface WorldInitMessage {
  type: 'world_init';
  playerId: string;
  blocks: Block[];
  worldSize: number;
}

export interface ChunksUpdateMessage {
  type: 'chunks_update';
  blocks: Block[];
}

export interface BlockUpdateMessage {
  type: 'block_update';
  action: 'break' | 'place';
  x: number;
  y: number;
  z: number;
  blockType?: number;
}

export interface PlayerUpdateMessage {
  type: 'player_update';
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface PlayerDisconnectMessage {
  type: 'player_disconnect';
  id: string;
}

export interface TeleportMessage {
  type: 'teleport';
  x: number;
  y: number;
  z: number;
}

export type ServerMessage = WorldInitMessage | ChunksUpdateMessage | BlockUpdateMessage | PlayerUpdateMessage | PlayerDisconnectMessage | TeleportMessage;

// Game state types
export interface Block {
  x: number;
  y: number;
  z: number;
  type: number;
}

export interface Player {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface WorldBounds {
  x: number;
  y: number;
  z: number;
}

export interface WorldSize {
  width: number;
  height: number;
  depth: number;
  minBounds: WorldBounds;
  maxBounds: WorldBounds;
}

export interface GameState {
  playerId: string | null;
  players: Map<string, Player>;
  blocks: Map<string, Block>;
  worldSize: WorldSize | number; // Support both old and new format
  connected: boolean;
  playerPosition: { x: number; y: number; z: number } | null;
}

// Helper function to create block key
export const getBlockKey = (x: number, y: number, z: number): string => {
  return `${x},${y},${z}`;
};
