import * as THREE from "three";
import { Block } from "../types";

// Système de raycasting optimisé pour les chunks
export class OptimizedRaycaster {
  private raycaster: THREE.Raycaster;

  constructor() {
    this.raycaster = new THREE.Raycaster();
  }

  // Raycast uniquement sur les blocs proches du joueur pour de meilleures performances
  raycastBlocks(camera: THREE.Camera, blocks: Map<string, Block>, playerPosition: THREE.Vector3, maxDistance: number = 10): { blockPos: THREE.Vector3; normal: THREE.Vector3; distance: number } | null {
    // Use Amanatides & Woo voxel traversal (grid stepping) for efficient block selection
    const mouse = new THREE.Vector2(0, 0);
    this.raycaster.setFromCamera(mouse, camera);
    const origin = this.raycaster.ray.origin.clone();
    const dir = this.raycaster.ray.direction.clone();

    // If direction is zero, nothing to do
    if (dir.lengthSq() === 0) return null;

    // Our blocks are centered on integer coordinates (a block at x spans [x-0.5 .. x+0.5]).
    // To use a standard voxel traversal (which assumes voxels cover [i..i+1)),
    // shift the origin by +0.5 so flooring maps correctly to block indices.
    const originAdj = origin.clone().addScalar(0.5);
    // Current voxel coordinates (floor of adjusted position)
    let x = Math.floor(originAdj.x + 0.000001);
    let y = Math.floor(originAdj.y + 0.000001);
    let z = Math.floor(originAdj.z + 0.000001);

    const stepX = dir.x >= 0 ? 1 : -1;
    const stepY = dir.y >= 0 ? 1 : -1;
    const stepZ = dir.z >= 0 ? 1 : -1;

    const tDeltaX = dir.x === 0 ? Infinity : Math.abs(1 / dir.x);
    const tDeltaY = dir.y === 0 ? Infinity : Math.abs(1 / dir.y);
    const tDeltaZ = dir.z === 0 ? Infinity : Math.abs(1 / dir.z);

    const voxelBound = (v: number, s: number) => (s > 0 ? Math.floor(v) + 1 : Math.floor(v));

    // Use adjusted origin for tMax calculations so the boundaries align with centered blocks
    let tMaxX = dir.x === 0 ? Infinity : Math.abs((voxelBound(originAdj.x, stepX) - originAdj.x) / dir.x);
    let tMaxY = dir.y === 0 ? Infinity : Math.abs((voxelBound(originAdj.y, stepY) - originAdj.y) / dir.y);
    let tMaxZ = dir.z === 0 ? Infinity : Math.abs((voxelBound(originAdj.z, stepZ) - originAdj.z) / dir.z);

    const maxDist = Math.max(0.001, maxDistance);
    let traveled = 0;

    // Helper to format key
    const keyFor = (xx: number, yy: number, zz: number) => `${xx},${yy},${zz}`;

    // If starting inside a block, report it immediately (useful when clicking blocks you're inside)
    const startKey = keyFor(x, y, z);
    if (blocks.has(startKey)) {
      return { blockPos: new THREE.Vector3(x, y, z), normal: new THREE.Vector3(0, 0, 0), distance: 0 };
    }

    // Traverse the grid
    while (traveled <= maxDist) {
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          // step X
          x += stepX;
          traveled = tMaxX;
          tMaxX += tDeltaX;
          // normal points opposite to step direction
          const key = keyFor(x, y, z);
          if (blocks.has(key)) {
            const normal = new THREE.Vector3(-stepX, 0, 0);
            return { blockPos: new THREE.Vector3(x, y, z), normal, distance: traveled };
          }
        } else {
          // step Z
          z += stepZ;
          traveled = tMaxZ;
          tMaxZ += tDeltaZ;
          const key = keyFor(x, y, z);
          if (blocks.has(key)) {
            const normal = new THREE.Vector3(0, 0, -stepZ);
            return { blockPos: new THREE.Vector3(x, y, z), normal, distance: traveled };
          }
        }
      } else {
        if (tMaxY < tMaxZ) {
          // step Y
          y += stepY;
          traveled = tMaxY;
          tMaxY += tDeltaY;
          const key = keyFor(x, y, z);
          if (blocks.has(key)) {
            const normal = new THREE.Vector3(0, -stepY, 0);
            return { blockPos: new THREE.Vector3(x, y, z), normal, distance: traveled };
          }
        } else {
          // step Z
          z += stepZ;
          traveled = tMaxZ;
          tMaxZ += tDeltaZ;
          const key = keyFor(x, y, z);
          if (blocks.has(key)) {
            const normal = new THREE.Vector3(0, 0, -stepZ);
            return { blockPos: new THREE.Vector3(x, y, z), normal, distance: traveled };
          }
        }
      }
    }

    return null;
  }
}

export default OptimizedRaycaster;
