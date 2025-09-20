// Simple per-voxel mesher worker - emits one quad per visible face.
// This is intentionally simple (no greedy merging) to ensure correct per-block UVs
// when using an atlas. If you need higher performance, reintroduce greedy
// meshing later with atlas-aware UV handling.

type Block = { x: number; y: number; z: number; type: number };

interface AtlasTile {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

interface AtlasMeta {
  tileSize: number;
  // mappings can be either a single tile (legacy) or per-face tiles
  mappings: { [blockType: number]: AtlasTile | { all?: AtlasTile; top?: AtlasTile; bottom?: AtlasTile; side?: AtlasTile } };
}

interface MeshRequest {
  type: "meshChunk";
  chunkKey: string;
  cx: number;
  cy: number;
  cz: number;
  blocks?: Block[];
  // fast-path sparse typed arrays: local indices (0..4095) and block types
  indices?: Uint16Array;
  types?: Uint16Array;
  atlasMeta: AtlasMeta | null;
}

interface MeshResponse {
  type: "meshResult";
  chunkKey: string;
  positions: ArrayBuffer;
  normals: ArrayBuffer;
  uvs: ArrayBuffer;
  indices: ArrayBuffer;
}

const CHUNK_SIZE = 16;

function idx(x: number, y: number, z: number) {
  return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
}

onmessage = function (ev: MessageEvent) {
  const msg = ev.data as MeshRequest;
  if (!msg || msg.type !== "meshChunk") return;

  const baseX = msg.cx * CHUNK_SIZE;
  const baseY = msg.cy * CHUNK_SIZE;
  const baseZ = msg.cz * CHUNK_SIZE;

  // Build a sparse volume from provided typed arrays if present (preferred),
  // otherwise fall back to legacy blocks array.
  const volume = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
  if ((msg as any).indices && (msg as any).types) {
    const inds = msg.indices as Uint16Array;
    const types = msg.types as Uint16Array;
    const n = Math.min(inds.length, types.length);
    for (let i = 0; i < n; i++) {
      const localIdx = inds[i];
      if (localIdx < 0 || localIdx >= CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE) continue;
      volume[localIdx] = types[i];
    }
  } else if ((msg as any).blocks && Array.isArray((msg as any).blocks)) {
    for (const b of (msg as any).blocks) {
      const lx = b.x - baseX;
      const ly = b.y - baseY;
      const lz = b.z - baseZ;
      if (lx < 0 || lx >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue;
      volume[idx(lx, ly, lz)] = b.type;
    }
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vi = 0;
  const meshStart = Date.now();

  // Directions: +X, -X, +Y, -Y, +Z, -Z
  const dirs = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];

  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const t = volume[idx(x, y, z)];
        if (!t) continue;

        const bx = baseX + x - 0.5;
        const by = baseY + y - 0.5;
        const bz = baseZ + z - 0.5;

        for (let face = 0; face < dirs.length; face++) {
          const dir = dirs[face];
          const nx = x + dir[0],
            ny = y + dir[1],
            nz = z + dir[2];
          let neighbor = 0;
          if (nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE) {
            neighbor = volume[idx(nx, ny, nz)];
          }
          if (neighbor !== 0) continue; // face occluded

          // compute normal
          const normal = [0, 0, 0];
          if (face === 0) normal[0] = 1;
          else if (face === 1) normal[0] = -1;
          if (face === 2) normal[1] = 1;
          else if (face === 3) normal[1] = -1;
          if (face === 4) normal[2] = 1;
          else if (face === 5) normal[2] = -1;

          // corners per face (matching original orientation)
          let corners: number[][] = [];
          switch (face) {
            case 0:
              corners = [
                [bx + 1, by, bz],
                [bx + 1, by + 1, bz],
                [bx + 1, by + 1, bz + 1],
                [bx + 1, by, bz + 1],
              ];
              break; // +X
            case 1:
              corners = [
                [bx, by, bz + 1],
                [bx, by + 1, bz + 1],
                [bx, by + 1, bz],
                [bx, by, bz],
              ];
              break; // -X
            case 2:
              corners = [
                [bx, by + 1, bz],
                [bx, by + 1, bz + 1],
                [bx + 1, by + 1, bz + 1],
                [bx + 1, by + 1, bz],
              ];
              break; // +Y
            case 3:
              corners = [
                [bx, by, bz + 1],
                [bx, by, bz],
                [bx + 1, by, bz],
                [bx + 1, by, bz + 1],
              ];
              break; // -Y
            case 4:
              corners = [
                [bx, by, bz + 1],
                [bx + 1, by, bz + 1],
                [bx + 1, by + 1, bz + 1],
                [bx, by + 1, bz + 1],
              ];
              break; // +Z
            case 5:
              corners = [
                [bx + 1, by, bz],
                [bx, by, bz],
                [bx, by + 1, bz],
                [bx + 1, by + 1, bz],
              ];
              break; // -Z
          }

          for (let ci = 0; ci < 4; ci++) {
            positions.push(corners[ci][0], corners[ci][1], corners[ci][2]);
            normals.push(normal[0], normal[1], normal[2]);
          }

          // UVs: atlas mapping if present. atlasMeta.mappings may be legacy single-tile
          // or a per-face mapping object. Handle both and compute per-corner UVs so
          // the V axis always maps world Y (up) -> texture top.
          let pushed = false;
          if (msg.atlasMeta && msg.atlasMeta.mappings && msg.atlasMeta.mappings[t]) {
            const mapEntry = msg.atlasMeta.mappings[t] as any;
            // if legacy single tile (has u0), use it with per-corner orientation
            if (mapEntry.u0 !== undefined) {
              const m = mapEntry as AtlasTile;
              // corners order -> map so that v corresponds to y (top corners get v1)
              for (let ci = 0; ci < 4; ci++) {
                const cx = corners[ci][0];
                const cy = corners[ci][1];
                const cz = corners[ci][2];
                let uLocal = 0;
                let vLocal = 0;
                // Determine local UV axes per face so V always maps to world Y (up)
                switch (face) {
                  case 0: // +X face: U <- +Z, V <- +Y (flip V for correct orientation)
                    uLocal = cz - bz;
                    vLocal = 1 - (cy - by);
                    break;
                  case 1: // -X face: U <- -Z, V <- +Y (flip V)
                    uLocal = 1 - (cz - bz);
                    vLocal = 1 - (cy - by);
                    break;
                  case 2: // +Y top: U <- +X, V <- +Z
                    uLocal = cx - bx;
                    vLocal = cz - bz;
                    break;
                  case 3: // -Y bottom: U <- +X, V <- -Z
                    uLocal = cx - bx;
                    vLocal = 1 - (cz - bz);
                    break;
                  case 4: // +Z face: U <- -X, V <- +Y (flip V)
                    uLocal = 1 - (cx - bx);
                    vLocal = 1 - (cy - by);
                    break;
                  case 5: // -Z face: U <- +X, V <- +Y (flip V)
                    uLocal = cx - bx;
                    vLocal = 1 - (cy - by);
                    break;
                }
                const u = m.u0 + uLocal * (m.u1 - m.u0);
                const v = m.v0 + vLocal * (m.v1 - m.v0);
                uvs.push(u, v);
              }
              pushed = true;
            } else {
              // choose face-specific mapping: prefer explicit face mapping, then side, then all
              const per = mapEntry as { all?: AtlasTile; top?: AtlasTile; bottom?: AtlasTile; side?: AtlasTile };
              let tile: AtlasTile | undefined = undefined;
              if (per.all) tile = per.all;
              else if (face === 2 && per.top) tile = per.top;
              else if (face === 3 && per.bottom) tile = per.bottom;
              else if (per.side) tile = per.side;
              if (!tile) tile = per.top || per.side || per.bottom || per.all;
              if (tile) {
                for (let ci = 0; ci < 4; ci++) {
                  const cx = corners[ci][0];
                  const cy = corners[ci][1];
                  const cz = corners[ci][2];
                  let uLocal = 0;
                  let vLocal = 0;
                  switch (face) {
                    case 0:
                      uLocal = cz - bz;
                      vLocal = 1 - (cy - by);
                      break;
                    case 1:
                      uLocal = 1 - (cz - bz);
                      vLocal = 1 - (cy - by);
                      break;
                    case 2:
                      uLocal = cx - bx;
                      vLocal = cz - bz;
                      break;
                    case 3:
                      uLocal = cx - bx;
                      vLocal = 1 - (cz - bz);
                      break;
                    case 4:
                      uLocal = 1 - (cx - bx);
                      vLocal = 1 - (cy - by);
                      break;
                    case 5:
                      uLocal = cx - bx;
                      vLocal = 1 - (cy - by);
                      break;
                  }
                  const u = tile.u0 + uLocal * (tile.u1 - tile.u0);
                  const v = tile.v0 + vLocal * (tile.v1 - tile.v0);
                  uvs.push(u, v);
                }
                pushed = true;
              }
            }
          }
          if (!pushed) {
            uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
          }

          // winding: keep consistent so lighting works
          if (normal[0] + normal[1] + normal[2] > 0) {
            indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
          } else {
            indices.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2);
          }
          vi += 4;
        }
      }
    }
  }

  const meshMs = Date.now() - meshStart;
  const posBuf = new Float32Array(positions).buffer;
  const normBuf = new Float32Array(normals).buffer;
  const uvBuf = new Float32Array(uvs).buffer;
  const idxBuf = new Uint32Array(indices).buffer;

  const resp: MeshResponse & { meshMs?: number } = {
    type: "meshResult",
    chunkKey: msg.chunkKey,
    positions: posBuf,
    normals: normBuf,
    uvs: uvBuf,
    indices: idxBuf,
    meshMs,
  };

  // Transfer buffers back to main thread
  // @ts-ignore
  postMessage(resp, [posBuf, normBuf, uvBuf, idxBuf]);
};
