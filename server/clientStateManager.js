const fs = require('fs');
const path = require('path');

const STATE_DIR = path.resolve(__dirname, 'client_state');
try { if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true }); } catch (e) { /* ignore */ }

function clientStatePath(clientId) {
  return path.join(STATE_DIR, `${clientId}.json`);
}

function clientStateBakPath(clientId) {
  return path.join(STATE_DIR, `${clientId}.json.bak`);
}

function saveState(clientId, state) {
  const p = clientStatePath(clientId);
  const tmp = p + '.tmp';
  const bak = clientStateBakPath(clientId);
  try {
    const data = JSON.stringify(state);
    // write to tmp file first
    fs.writeFileSync(tmp, data, { encoding: 'utf8' });
    // make a backup of the existing file if present
    try {
      if (fs.existsSync(p)) fs.copyFileSync(p, bak);
    } catch (e) {
      // non-fatal
    }
    // atomic rename - on Windows this can fail if another process has file open (EPERM)
    try {
      fs.renameSync(tmp, p);
    } catch (e) {
      // If rename fails (often EPERM on Windows), attempt a fallback: copy tmp -> p then unlink tmp
      console.warn(`clientStateManager: rename failed for ${tmp} -> ${p}, attempting copy fallback: ${e && e.code ? e.code : e}`);
      try {
        fs.copyFileSync(tmp, p);
        try { fs.unlinkSync(tmp); } catch (e2) { /* ignore */ }
      } catch (copyErr) {
        console.error('clientStateManager: fallback copy also failed', copyErr);
        throw copyErr; // bubble up to outer catch
      }
    }
  } catch (e) {
    console.error('Failed to save client state', clientId, e);
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (e2) {}
  }
}

function loadState(clientId) {
  const p = clientStatePath(clientId);
  const bak = clientStateBakPath(clientId);
  try {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    try {
      return JSON.parse(raw);
    } catch (parseErr) {
      console.error(`Failed to parse client state ${clientId}, attempting recovery from backup`, parseErr.message);
      // attempt to recover from backup
      if (fs.existsSync(bak)) {
        try {
          const rawBak = fs.readFileSync(bak, 'utf8');
          return JSON.parse(rawBak);
        } catch (bakErr) {
          console.error('Failed to recover client state from backup', clientId, bakErr.message);
          return null;
        }
      }
      return null;
    }
  } catch (e) {
    console.error('Failed to load client state', clientId, e.message || e);
    return null;
  }
}

function clearState(clientId) {
  try {
    const p = clientStatePath(clientId);
    const bak = clientStateBakPath(clientId);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    if (fs.existsSync(bak)) fs.unlinkSync(bak);
  } catch (e) {
    console.error('Failed to clear client state', clientId, e);
  }
}

module.exports = { saveState, loadState, clearState };
