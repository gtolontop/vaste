const path = require('path');
const fs = require('fs');
const csm = require(path.join(__dirname, '..', 'clientStateManager'));

function run() {
  const id = 'recovery-client-1';
  csm.clearState(id);
  const s = { outstanding: [{chunkKey:'0,0,0:1:1', seq:1}], sendQueue: ['0,0,0:1:1'] };
  csm.saveState(id, s);
  // create a corrupted main file
  const p = path.join(__dirname, '..', 'client_state', id + '.json');
  fs.writeFileSync(p, '{ this is : not valid json', 'utf8');

  const loaded = csm.loadState(id);
  if (!loaded || !Array.isArray(loaded.outstanding) || loaded.outstanding.length !== 1) {
    console.error('clientStateManager recovery test failed', loaded);
    process.exit(2);
  }
  csm.clearState(id);
  console.log('clientStateManager recovery test passed');
  process.exit(0);
}

run();
