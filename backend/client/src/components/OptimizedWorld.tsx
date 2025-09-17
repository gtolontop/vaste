import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TextureManager } from '../TextureManager';
import { Block as BlockData } from '../types';

interface ChunkProps {
  blocks: Map<string, BlockData>;
  chunkX: number;
  chunkY: number;
  chunkZ: number;
  playerPosition: THREE.Vector3;
}

interface WorldMeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
  materialGroups: { start: number; count: number; materialIndex: number }[];
}

const CHUNK_SIZE = 16;
const RENDER_DISTANCE = 10; // Distance de rendu étendue

// Directions des faces d'un cube
const FACE_DIRECTIONS = [
  { dir: [1, 0, 0], normal: [1, 0, 0] },   // +X (right)
  { dir: [-1, 0, 0], normal: [-1, 0, 0] }, // -X (left)
  { dir: [0, 1, 0], normal: [0, 1, 0] },   // +Y (top)
  { dir: [0, -1, 0], normal: [0, -1, 0] }, // -Y (bottom)
  { dir: [0, 0, 1], normal: [0, 0, 1] },   // +Z (front)
  { dir: [0, 0, -1], normal: [0, 0, -1] }  // -Z (back)
];

// Vertices pour chaque face d'un cube
const FACE_VERTICES = [
  // +X (right)
  [
    [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]
  ],
  // -X (left)
  [
    [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]
  ],
  // +Y (top)
  [
    [-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]
  ],
  // -Y (bottom)
  [
    [-0.5, -0.5, 0.5], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5]
  ],
  // +Z (front)
  [
    [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]
  ],
  // -Z (back)
  [
    [0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]
  ]
];

// UVs pour chaque face
const FACE_UVS = [
  [0, 0], [1, 0], [1, 1], [0, 1]
];

// Utilitaires
const getBlockKey = (x: number, y: number, z: number): string => `${x},${y},${z}`;

const getChunkKey = (chunkX: number, chunkY: number, chunkZ: number): string => 
  `${chunkX},${chunkY},${chunkZ}`;

const worldToChunk = (worldCoord: number): number => Math.floor(worldCoord / CHUNK_SIZE);

const isBlockSolid = (blocks: Map<string, BlockData>, x: number, y: number, z: number): boolean => {
  const key = getBlockKey(x, y, z);
  const block = blocks.get(key);
  return block ? block.type !== 0 : false;
};

const isFaceVisible = (
  blocks: Map<string, BlockData>, 
  blockX: number, 
  blockY: number, 
  blockZ: number, 
  faceIndex: number
): boolean => {
  const direction = FACE_DIRECTIONS[faceIndex].dir;
  const neighborX = blockX + direction[0];
  const neighborY = blockY + direction[1];
  const neighborZ = blockZ + direction[2];
  
  // Si le voisin est solide, cette face n'est pas visible
  return !isBlockSolid(blocks, neighborX, neighborY, neighborZ);
};

// Composant Chunk optimisé
const OptimizedChunk: React.FC<ChunkProps> = ({ blocks, chunkX, chunkY, chunkZ, playerPosition }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Créer une clé stable pour ce chunk basée uniquement sur les blocs qu'il contient
  const chunkBlocksHash = useMemo(() => {
    const startX = chunkX * CHUNK_SIZE;
    const startY = chunkY * CHUNK_SIZE;
    const startZ = chunkZ * CHUNK_SIZE;
    const endX = startX + CHUNK_SIZE;
    const endY = startY + CHUNK_SIZE;
    const endZ = startZ + CHUNK_SIZE;
    
    const chunkBlockKeys: string[] = [];
    for (let x = startX; x < endX; x++) {
      for (let y = startY; y < endY; y++) {
        for (let z = startZ; z < endZ; z++) {
          const key = getBlockKey(x, y, z);
          const block = blocks.get(key);
          if (block && block.type !== 0) {
            chunkBlockKeys.push(`${key}:${block.type}`);
          }
        }
      }
    }
    
    return chunkBlockKeys.sort().join('|');
  }, [blocks, chunkX, chunkY, chunkZ]);
  
  // Mémoriser uniquement sur les changements de blocs dans ce chunk
  const { geometry, materials } = useMemo(() => {
    console.log(`[OptimizedChunk] Processing chunk (${chunkX}, ${chunkY}, ${chunkZ})`);
    
    const textureManager = TextureManager.getInstance();
    
    // Collecter tous les blocs dans ce chunk
    const chunkBlocks: BlockData[] = [];
    const startX = chunkX * CHUNK_SIZE;
    const startY = chunkY * CHUNK_SIZE;
    const startZ = chunkZ * CHUNK_SIZE;
    const endX = startX + CHUNK_SIZE;
    const endY = startY + CHUNK_SIZE;
    const endZ = startZ + CHUNK_SIZE;
    
    console.log(`[OptimizedChunk] Searching blocks in range X:[${startX}-${endX}), Y:[${startY}-${endY}), Z:[${startZ}-${endZ})`);
    
    for (let x = startX; x < endX; x++) {
      for (let y = startY; y < endY; y++) {
        for (let z = startZ; z < endZ; z++) {
          const key = getBlockKey(x, y, z);
          const block = blocks.get(key);
          if (block && block.type !== 0) {
            chunkBlocks.push(block);
            console.log(`[OptimizedChunk] Found block at (${x}, ${y}, ${z}) type ${block.type}`);
          }
        }
      }
    }
    
    console.log(`[OptimizedChunk] Chunk (${chunkX}, ${chunkY}, ${chunkZ}) has ${chunkBlocks.length} blocks`);
    
    if (chunkBlocks.length === 0) {
      console.log(`[OptimizedChunk] No blocks to render in chunk (${chunkX}, ${chunkY}, ${chunkZ})`);
      return { geometry: new THREE.BufferGeometry(), materials: [] };
    }
    
    // Générer les faces visibles
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const materialGroups: { start: number; count: number; materialIndex: number; blockType: number }[] = [];
    
    let vertexIndex = 0;
    let indexStart = 0;
    
    // Grouper par type de bloc pour optimiser les draw calls
    const blocksByType = new Map<number, BlockData[]>();
    chunkBlocks.forEach(block => {
      if (!blocksByType.has(block.type)) {
        blocksByType.set(block.type, []);
      }
      blocksByType.get(block.type)!.push(block);
    });
    
    blocksByType.forEach((blocksOfType, blockType) => {
      const groupStartIndex = indices.length;
      
      blocksOfType.forEach(block => {
        for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
          if (isFaceVisible(blocks, block.x, block.y, block.z, faceIndex)) {
            const faceVertices = FACE_VERTICES[faceIndex];
            const faceNormal = FACE_DIRECTIONS[faceIndex].normal;
            
            // Ajouter les vertices de la face
            faceVertices.forEach(vertex => {
              positions.push(
                block.x + vertex[0],
                block.y + vertex[1],
                block.z + vertex[2]
              );
              normals.push(faceNormal[0], faceNormal[1], faceNormal[2]);
            });
            
            // Ajouter les UVs
            FACE_UVS.forEach(uv => {
              uvs.push(uv[0], uv[1]);
            });
            
            // Ajouter les indices pour les triangles (2 triangles par face)
            indices.push(
              vertexIndex, vertexIndex + 1, vertexIndex + 2,
              vertexIndex, vertexIndex + 2, vertexIndex + 3
            );
            
            vertexIndex += 4;
          }
        }
      });
      
      const groupIndexCount = indices.length - groupStartIndex;
      if (groupIndexCount > 0) {
        materialGroups.push({
          start: groupStartIndex,
          count: groupIndexCount,
          materialIndex: blockType,
          blockType: blockType
        });
      }
    });
    
    // Créer la géométrie
    const geometry = new THREE.BufferGeometry();
    
    if (positions.length > 0) {
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      
      // Ajouter les groupes de matériaux
      materialGroups.forEach(group => {
        geometry.addGroup(group.start, group.count, group.materialIndex);
      });
    }
    
    // Créer les matériaux pour chaque type de bloc
    const materials: THREE.Material[] = [];
    const materialMap = new Map<number, number>();
    
    materialGroups.forEach(group => {
      if (!materialMap.has(group.blockType)) {
        const materialIndex = materials.length;
        materialMap.set(group.blockType, materialIndex);
        materials.push(textureManager.createBlockMaterial(group.blockType) as THREE.Material);
        
        // Mettre à jour l'index du matériau dans le groupe
        geometry.groups.forEach(geometryGroup => {
          if (geometryGroup.start === group.start) {
            geometryGroup.materialIndex = materialIndex;
          }
        });
      }
    });
    
    return { geometry, materials };
    
  }, [chunkBlocksHash]); // Dépend uniquement du hash des blocs dans ce chunk
  
  // Ne pas rendre si pas de géométrie
  if (!geometry.attributes.position) {
    return null;
  }
  
  return (
    <mesh ref={meshRef} geometry={geometry} material={materials} frustumCulled={true}>
    </mesh>
  );
};

// Composant World optimisé
interface OptimizedWorldProps {
  blocks: Map<string, BlockData>;
  playerPosition: THREE.Vector3;
}

export const OptimizedWorld: React.FC<OptimizedWorldProps> = ({ blocks, playerPosition }) => {
  // Séparer la logique : chunks existants vs chunks visibles
  const existingChunks = useMemo(() => {
    // Diviser les blocs en chunks (ne change que quand les blocs changent)
    const chunkMap = new Map<string, { chunkX: number; chunkY: number; chunkZ: number }>();
    
    blocks.forEach((block, key) => {
      const chunkX = worldToChunk(block.x);
      const chunkY = worldToChunk(block.y);
      const chunkZ = worldToChunk(block.z);
      const chunkKey = getChunkKey(chunkX, chunkY, chunkZ);
      
      if (!chunkMap.has(chunkKey)) {
        chunkMap.set(chunkKey, { chunkX, chunkY, chunkZ });
      }
    });
    
    return Array.from(chunkMap.values());
  }, [blocks, blocks.size]); // Ajout de blocks.size pour forcer le recalcul

  const visibleChunks = useMemo(() => {
    // Filtrer les chunks selon la distance de rendu avec limite de blocs optimisée
    const playerChunkX = worldToChunk(playerPosition.x);
    const playerChunkY = worldToChunk(playerPosition.y);
    const playerChunkZ = worldToChunk(playerPosition.z);
    
    const MAX_BLOCKS = 50000; // Augmenté drastiquement pour 10 chunks
    let totalBlocks = 0;
    
    const chunksInRange = existingChunks.filter(({ chunkX, chunkY, chunkZ }) => {
      const distance = Math.sqrt(
        Math.pow(chunkX - playerChunkX, 2) +
        Math.pow(chunkY - playerChunkY, 2) +
        Math.pow(chunkZ - playerChunkZ, 2)
      );
      
      return distance <= RENDER_DISTANCE;
    });
    
    // Trier par distance et limiter le nombre de blocs
    chunksInRange.sort((a, b) => {
      const distA = Math.sqrt(
        Math.pow(a.chunkX - playerChunkX, 2) +
        Math.pow(a.chunkY - playerChunkY, 2) +
        Math.pow(a.chunkZ - playerChunkZ, 2)
      );
      const distB = Math.sqrt(
        Math.pow(b.chunkX - playerChunkX, 2) +
        Math.pow(b.chunkY - playerChunkY, 2) +
        Math.pow(b.chunkZ - playerChunkZ, 2)
      );
      return distA - distB;
    });
    
    const result = [];
    for (const chunk of chunksInRange) {
      // Compter approximativement les blocs dans ce chunk
      const chunkBlocks = Array.from(blocks.values()).filter(block => {
        const chunkX = worldToChunk(block.x);
        const chunkY = worldToChunk(block.y);
        const chunkZ = worldToChunk(block.z);
        return chunkX === chunk.chunkX && chunkY === chunk.chunkY && chunkZ === chunk.chunkZ;
      });
      
      if (totalBlocks + chunkBlocks.length <= MAX_BLOCKS) {
        totalBlocks += chunkBlocks.length;
        result.push(chunk);
      } else {
        break; // Stop when we reach the limit
      }
    }
    
    return result;
  }, [existingChunks, playerPosition, blocks, blocks.size]); // Ajout de blocks.size
  
  return (
    <>
      {visibleChunks.map(({ chunkX, chunkY, chunkZ }) => (
        <OptimizedChunk
          key={getChunkKey(chunkX, chunkY, chunkZ)}
          blocks={blocks}
          chunkX={chunkX}
          chunkY={chunkY}
          chunkZ={chunkZ}
          playerPosition={playerPosition}
        />
      ))}
    </>
  );
};

export default OptimizedWorld;