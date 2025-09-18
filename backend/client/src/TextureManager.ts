import * as THREE from 'three';
import { logger } from './utils/logger';

export class TextureManager {
  private static instance: TextureManager;
  private textureLoader: THREE.TextureLoader;
  private textures: Map<string, THREE.Texture> = new Map();

  private constructor() {
    this.textureLoader = new THREE.TextureLoader();
  }

  static getInstance(): TextureManager {
    if (!TextureManager.instance) {
      TextureManager.instance = new TextureManager();
    }
    return TextureManager.instance;
  }

  async loadTexture(name: string, path: string): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      if (this.textures.has(name)) {
        resolve(this.textures.get(name)!);
        return;
      }

      this.textureLoader.load(
        path,
        (texture) => {
          // Configure texture for pixel art
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestFilter;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          
          this.textures.set(name, texture);
          resolve(texture);
        },
        undefined,
        (error) => {
          logger.error(`Failed to load texture ${name}:`, error);
          reject(error);
        }
      );
    });
  }

  getTexture(name: string): THREE.Texture | undefined {
    return this.textures.get(name);
  }

  async preloadTextures(): Promise<void> {
    const textureList = [
      { name: 'stone', path: '/textures/stone.png' },
      { name: 'dirt', path: '/textures/dirt.png' },
      { name: 'grass_top', path: '/textures/grass_top.png' },
      { name: 'grass_side', path: '/textures/grass_side.png' },
      { name: 'wood', path: '/textures/wood.png' },
      { name: 'sand', path: '/textures/sand.png' },
    ];

    const promises = textureList.map(({ name, path }) => 
      this.loadTexture(name, path).catch(() => {
        logger.warn(`Optional texture ${name} not found, using fallback`);
      })
    );

    await Promise.allSettled(promises);
  }

  // Create material for different block types
  createBlockMaterial(blockType: number): THREE.Material | THREE.Material[] {
    switch (blockType) {
      case 1: // Stone
        const stoneTexture = this.getTexture('stone');
        return new THREE.MeshLambertMaterial({ 
          map: stoneTexture,
          color: stoneTexture ? 0xffffff : 0x8B4513 
        });
      
      case 2: // Dirt
        const dirtTexture = this.getTexture('dirt');
        return new THREE.MeshLambertMaterial({ 
          map: dirtTexture,
          color: dirtTexture ? 0xffffff : 0x8B4513 
        });
      
      case 3: // Grass (multiple textures)
        return this.createGrassMaterial();
      
      case 4: // Wood
        const woodTexture = this.getTexture('wood');
        return new THREE.MeshLambertMaterial({ 
          map: woodTexture,
          color: woodTexture ? 0xffffff : 0x8B4513 
        });
      
      case 5: // Sand
        const sandTexture = this.getTexture('sand');
        return new THREE.MeshLambertMaterial({ 
          map: sandTexture,
          color: sandTexture ? 0xffffff : 0xC2B280 
        });
      
      default:
        return new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    }
  }

  // Special material for grass blocks (different textures on different faces)
  private createGrassMaterial(): THREE.Material[] {
    const grassTop = this.getTexture('grass_top');
    const grassSide = this.getTexture('grass_side');
    const dirt = this.getTexture('dirt');

    return [
      // Right face
      new THREE.MeshLambertMaterial({ 
        map: grassSide, 
        color: grassSide ? 0xffffff : 0x7CFC00 
      }),
      // Left face
      new THREE.MeshLambertMaterial({ 
        map: grassSide, 
        color: grassSide ? 0xffffff : 0x7CFC00 
      }),
      // Top face
      new THREE.MeshLambertMaterial({ 
        map: grassTop, 
        color: grassTop ? 0xffffff : 0x32CD32 
      }),
      // Bottom face
      new THREE.MeshLambertMaterial({ 
        map: dirt, 
        color: dirt ? 0xffffff : 0x8B4513 
      }),
      // Front face
      new THREE.MeshLambertMaterial({ 
        map: grassSide, 
        color: grassSide ? 0xffffff : 0x7CFC00 
      }),
      // Back face
      new THREE.MeshLambertMaterial({ 
        map: grassSide, 
        color: grassSide ? 0xffffff : 0x7CFC00 
      }),
    ];
  }
}
