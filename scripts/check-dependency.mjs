import assert from 'node:assert/strict';
import * as chunking from 'arkiv-chunking';

// This gate tests the installed public entry point, never a private dependency path.
assert.equal(typeof chunking.writeWithPolicy, 'function', 'arkiv-chunking must publicly export writeWithPolicy');
assert.equal(typeof chunking.WriteConfirmationPendingError, 'function', 'arkiv-chunking must publicly export WriteConfirmationPendingError');
console.log('Chunking public write policy is available.');
