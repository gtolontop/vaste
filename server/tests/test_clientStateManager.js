const path = require('path');
const csm = require(path.join(__dirname, '..', 'clientStateManager'));

function run() {
  const id = 'test-client-123';
  csm.clearState(id);
  const s = { outstanding: ['a','b'], sendQueue: ['c'] };
  csm.saveState(id, s);
  const loaded = csm.loadState(id);
  if (!loaded || !Array.isArray(loaded.outstanding) || loaded.outstanding.length !== 2) {
    console.error('clientStateManager test failed'); process.exit(2);
  }
  csm.clearState(id);
  console.log('clientStateManager test passed');
  process.exit(0);
}

run();
