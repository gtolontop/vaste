import * as THREE from 'three';
import { logger } from './utils/logger';

type BlockDef = {
  id: number;
  name: string;
  textures: { [key: string]: string };
};

export class TextureManager {
  private static instance: TextureManager;
  private textureLoader: THREE.TextureLoader;
  private textures: Map<string, THREE.Texture> = new Map();
  private blockDefs: Map<number, BlockDef> = new Map();
  private materialCache: Map<number, THREE.Material | THREE.Material[]> = new Map();

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
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestFilter;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          // store by friendly name and by path for flexible lookup
          this.textures.set(name, texture);
          // normalized path key (as requested by registry)
          const pkey = path.startsWith('/') ? path : path;
          this.textures.set(pkey, texture);
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

  // Load block definitions from /blockpacks (served by server static files)
  async loadBlockDefinitions(): Promise<void> {
    try {
      const res = await fetch('/blockpacks/index.json');
      if (!res.ok) throw new Error('no registry');
      const list: BlockDef[] = await res.json();
      for (const b of list) {
        this.blockDefs.set(b.id, b);
      }
    } catch (e) {
      logger.warn('Could not load block definitions registry, falling back to defaults');
      // fallback: ensure existing built-in ids are present
      this.blockDefs.set(1, { id: 1, name: 'stone', textures: { all: '/textures/stone.png' } });
      this.blockDefs.set(2, { id: 2, name: 'dirt', textures: { all: '/textures/dirt.png' } });
      this.blockDefs.set(3, { id: 3, name: 'grass', textures: { top: '/textures/grass_top.png', side: '/textures/grass_side.png', bottom: '/textures/dirt.png' } });
      this.blockDefs.set(4, { id: 4, name: 'wood', textures: { all: '/textures/wood.png' } });
      this.blockDefs.set(5, { id: 5, name: 'sand', textures: { all: '/textures/sand.png' } });
    }
  }

  async preloadTexturesFromRegistry(): Promise<void> {
    // collect unique texture paths
    const seen = new Map<string, string>(); // name -> path
    for (const b of this.blockDefs.values()) {
      for (const [k, p] of Object.entries(b.textures)) {
        const name = `${b.name}_${k}`;
        // Normalize leading slash
        const path = p.startsWith('/') ? p : `/${p}`;
        if (!seen.has(name)) seen.set(name, path);
      }
    }

    const promises: Promise<any>[] = [];
    for (const [name, p] of seen.entries()) {
      promises.push(this.loadTexture(name, p).catch(() => {
        logger.warn(`Optional texture ${name} (${p}) not found`);
      }));
    }

    await Promise.allSettled(promises);
  }

  // Create material(s) for a block type id based on its textures
  createBlockMaterial(blockType: number): THREE.Material | THREE.Material[] {
    // return cached if present
    if (this.materialCache.has(blockType)) return this.materialCache.get(blockType)!;
    const def = this.blockDefs.get(blockType);
    if (!def) return new THREE.MeshLambertMaterial({ color: 0x8B4513 });

    // If 'all' provided, return single material
    if (def.textures.all) {
      const tex = this.getTexture(`${def.name}_all`) || this.getTexture(def.name + '_all') || this.getTexture(def.name + '_texture') || this.getTexture(def.textures.all);
      const mat = new THREE.MeshLambertMaterial({ map: tex, color: tex ? 0xffffff : 0x8B4513 });
      this.materialCache.set(blockType, mat);
      return mat;
    }

    // Per-face materials: right, left, top, bottom, front, back (order used by Three)
    const faces = ['side', 'side', 'top', 'bottom', 'side', 'side'];
    const mats: THREE.Material[] = faces.map((faceKey) => {
      let tpath = def.textures[faceKey];
      if (!tpath) {
        // fallback to 'side' or 'all'
        tpath = def.textures['side'] || def.textures['all'];
      }
      const tex = tpath ? this.getTexture(`${def.name}_${faceKey}`) || this.getTexture(tpath) : undefined;
      return new THREE.MeshLambertMaterial({ map: tex, color: tex ? 0xffffff : 0x8B4513 });
    });

    // cache and return
    this.materialCache.set(blockType, mats);
    return mats;
  }
}
