const fs = require('fs');
const path = require('path');

class BlockRegistry {
  constructor(root) {
    this.root = root || path.join(__dirname, '..', '..', '..');
    this.blockpacksDir = path.join(this.root, 'blockpacks');
    this.blocksById = new Map();
    this.load();
  }

  load() {
    if (!fs.existsSync(this.blockpacksDir)) return;
    const packs = fs.readdirSync(this.blockpacksDir);
    for (const p of packs) {
      const metaPath = path.join(this.blockpacksDir, p, 'block.json');
      if (!fs.existsSync(metaPath)) continue;
      try {
        const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        if (data && typeof data.id === 'number') {
          this.blocksById.set(data.id, data);
        }
      } catch (e) {
        // ignore malformed
      }
    }
  }

  getById(id) {
    return this.blocksById.get(id) || null;
  }
}

module.exports = new BlockRegistry();
