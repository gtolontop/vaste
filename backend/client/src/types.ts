// Network message types
export interface PlayerMoveMessage {
  type: "player_move";
  x: number;
  y: number;
  z: number;
}

export interface BreakBlockMessage {
  type: "break_block";
  x: number;
  y: number;
  z: number;
  actionId?: string;
}

export interface PlaceBlockMessage {
  type: "place_block";
  x: number;
  y: number;
  z: number;
  blockType?: number;
  actionId?: string;
}

export type ClientMessage = PlayerMoveMessage | BreakBlockMessage | PlaceBlockMessage;

export interface WorldInitMessage {
  type: "world_init";
  playerId: string;
  blocks: Block[];
  worldSize: number;
}

export interface ChunksUpdateMessage {
  type: "chunks_update";
  blocks: Block[];
}

export interface BlockUpdateMessage {
  type: "block_update";
  action: "break" | "place";
  x: number;
  y: number;
  z: number;
  blockType?: number;
  // Optional action id for correlating optimistic client actions
  actionId?: string;
}

export interface BlockActionResultMessage {
  type: "block_action_result";
  actionId: string;
  success: boolean;
  reason?: string;
  x?: number;
  y?: number;
  z?: number;
}

export interface PlayerUpdateMessage {
  type: "player_update";
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface PlayerDisconnectMessage {
  type: "player_disconnect";
  id: string;
}

export interface TeleportMessage {
  type: "teleport";
  x: number;
  y: number;
  z: number;
}

export type ServerMessage = WorldInitMessage | ChunksUpdateMessage | BlockUpdateMessage | PlayerUpdateMessage | PlayerDisconnectMessage | TeleportMessage | BlockActionResultMessage;

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
  // Legacy flat map kept for compatibility; prefer using `chunks`
  blocks: Map<string, Block>;
  // Chunked storage: Map<chunkKey, Map<blockKey, Block>>
  chunks: Map<string, Map<string, Block>>;
  // Per-chunk version map to know when a chunk changed
  chunkVersions: Map<string, number>;
  worldSize: WorldSize | number; // Support both old and new format
  connected: boolean;
  playerPosition: { x: number; y: number; z: number } | null;
}

// Helper function to create block key
export const getBlockKey = (x: number, y: number, z: number): string => {
  return `${x},${y},${z}`;
};

export const CHUNK_SIZE = 16;
export const getChunkKey = (cx: number, cy: number, cz: number): string => `${cx},${cy},${cz}`;
export const worldToChunk = (coord: number) => Math.floor(coord / CHUNK_SIZE);
