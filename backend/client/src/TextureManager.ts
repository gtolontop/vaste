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
  private atlasTexture: THREE.Texture | null = null;
  private atlasMeta: { tileSize: number; mappings: { [blockType: number]: { u0:number; v0:number; u1:number; v1:number } } } | null = null;

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

  // Build a simple texture atlas by arranging loaded textures into a square grid.
  // This is a simple packer that assumes all tiles are square and equal size.
  async buildAtlas(tileSize: number = 32) {
    // Collect entries for block types
    const entries: Array<{ id: number; name: string; tex: THREE.Texture | undefined }> = [];
    for (const [id, def] of this.blockDefs.entries()) {
      // prefer 'all' then 'side' then first texture
      const texPath = def.textures.all || def.textures.side || Object.values(def.textures)[0];
      if (!texPath) continue;
      const key = texPath.startsWith('/') ? texPath : texPath;
      const tex = this.getTexture(`${def.name}_all`) || this.getTexture(`${def.name}_side`) || this.getTexture(key) || undefined;
      entries.push({ id, name: def.name, tex });
    }

    const count = entries.length;
    if (count === 0) return null;
    const cols = Math.ceil(Math.sqrt(count));
    const atlasSize = cols * tileSize;

    // create canvas
    const canvas = document.createElement('canvas');
    canvas.width = atlasSize;
    canvas.height = atlasSize;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(0,0,atlasSize,atlasSize);

    const mappings: any = {};
    for (let i = 0; i < entries.length; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = c * tileSize;
      const y = r * tileSize;
      const ent = entries[i];
      if (ent.tex && ent.tex.image) {
        try {
          ctx.drawImage(ent.tex.image, x, y, tileSize, tileSize);
        } catch (e) {
          // drawing may fail if image not ready; attempt to use placeholder
          ctx.fillStyle = '#888'; ctx.fillRect(x,y,tileSize,tileSize);
        }
      } else {
        ctx.fillStyle = '#888'; ctx.fillRect(x,y,tileSize,tileSize);
      }

      mappings[ent.id] = {
        u0: x / atlasSize, v0: y / atlasSize,
        u1: (x + tileSize) / atlasSize, v1: (y + tileSize) / atlasSize
      };
    }

    // create THREE texture from canvas
  const atlasTex = new THREE.CanvasTexture(canvas);
  atlasTex.magFilter = THREE.NearestFilter;
  atlasTex.minFilter = THREE.NearestFilter;
  atlasTex.wrapS = THREE.RepeatWrapping;
  atlasTex.wrapT = THREE.RepeatWrapping;
  // Canvas drawing uses top-left origin; make sure Three's UV orientation matches
  // by disabling automatic flip on the texture.
  atlasTex.flipY = false;
  atlasTex.needsUpdate = true;

    this.atlasTexture = atlasTex;
    this.atlasMeta = { tileSize, mappings };
    logger.info(`[TextureManager] Built atlas size=${atlasSize} tile=${tileSize} entries=${count}`);
    // log a sample of mappings to help debugging
    const sampleKeys = Object.keys(mappings).slice(0, 8);
    for (const k of sampleKeys) {
      const m = mappings[k];
      logger.info(`[TextureManager] atlas mapping block=${k} -> u0=${m.u0.toFixed(3)} v0=${m.v0.toFixed(3)} u1=${m.u1.toFixed(3)} v1=${m.v1.toFixed(3)}`);
    }
    return { atlasTex, atlasMeta: this.atlasMeta };
  }

  getAtlasMeta() {
    return this.atlasMeta;
  }

  getAtlasTexture() {
    return this.atlasTexture;
  }

  // Create material(s) for a block type id based on its textures
  createBlockMaterial(blockType: number): THREE.Material | THREE.Material[] {
    // return cached if present
    if (this.materialCache.has(blockType)) return this.materialCache.get(blockType)!;
    const def = this.blockDefs.get(blockType);
    if (!def) return new THREE.MeshLambertMaterial({ color: 0x8B4513 });

    // If 'all' provided, return single material
    if (def.textures.all) {
      // If atlas available, use single material with atlas
      const atlasAvailable = !!this.atlasTexture && !!this.atlasMeta && this.atlasMeta.mappings[blockType];
      if (atlasAvailable) {
        const mat = new THREE.MeshLambertMaterial({ map: this.atlasTexture, color: 0xffffff });
        logger.info(`[TextureManager] createBlockMaterial: block=${blockType} using atlas`);
        this.materialCache.set(blockType, mat);
        return mat;
      }
      const tex = this.getTexture(`${def.name}_all`) || this.getTexture(def.name + '_all') || this.getTexture(def.name + '_texture') || this.getTexture(def.textures.all);
      const mat = new THREE.MeshLambertMaterial({ map: tex, color: tex ? 0xffffff : 0x8B4513 });
      if (tex) logger.info(`[TextureManager] createBlockMaterial: block=${blockType} using individual texture`);
      else logger.warn(`[TextureManager] createBlockMaterial: block=${blockType} no texture found, using fallback color`);
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
