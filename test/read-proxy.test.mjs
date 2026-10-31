import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { allowedRequest } from '../sample/api/rpc.mjs';
import { createPublicClient } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { and, asc, eq, gt } from '@arkiv-network/sdk/query';
import { key as entityKey, str } from '@arkiv-network/sdk/schema';
import { custom } from 'viem';

const key = `0x${'12'.repeat(32)}`;
const query = { jsonrpc: '2.0', id: 1, method: 'arkiv_query', params: [`$key = key(${key})`, { select: { key: true, attributes: true }, limit: '0x1' }] };
test('proxy permits bounded key reads and blocks signing, batches, history and unconstrained reads', () => {
  assert.equal(allowedRequest(query), true);
  for (const body of [[], { ...query, method: 'eth_sendTransaction' }, { ...query, params: ['1 = 1', query.params[1]] }, { ...query, params: [query.params[0], { ...query.params[1], atBlock: '0x1' }] }, { ...query, params: [query.params[0], { ...query.params[1], limit: '0x2' }] }]) assert.equal(allowedRequest(body), false);
});
test('actual SDK root and keyset chunk requests pass; injected or broader forms fail', async () => {
  const account = `0x${'12'.repeat(20)}`;
  const requests = [];
  const client = createPublicClient({ chain: rabdi({ accessKey: 'example-test' }), transport: custom({ request: async args => {
    const body = { jsonrpc: '2.0', id: 1, ...args }; requests.push(body); assert.equal(allowedRequest(body), true); return { data: [], blockNumber: '0x1' };
  } }, { retryCount: 0 }) });
  await client.select({ $key: true, $attributes: true, $expiresAt: true }).where(eq('$key', entityKey(key))).limit(1).fetch();
  await client.select({ $key: true, seq: true, data: true }).where(and(eq('type', str('arkiv-chunking/chunk/v2')), eq('manifest', entityKey(key)), gt('$key', entityKey(key)))).ownedBy(account).createdBy(account).orderBy(asc('$key')).limit(10).fetch();
  // The sample inspector reads actual typed columns, not only the reconstruction fields.
  await client.select({ $key: true, $owner: true, $creator: true, $expiresAt: true, $creationFlags: true, $attributes: true }).where(and(eq('manifest', entityKey(key)), eq('type', str('arkiv-chunking/chunk/v2')))).ownedBy(account).createdBy(account).orderBy(asc('$key')).limit(10).fetch();
  const chunk = requests[1];
  for (const altered of [chunk.params[0].replace(' AND ', ' OR '), chunk.params[0].replace(' AND ', ' or '), chunk.params[0] + ' AND size > u64(0)']) assert.equal(allowedRequest({ ...chunk, params: [altered, chunk.params[1]] }), false);
});
test('missing server key fails closed with safe configuration guidance', async () => {
  const previous = process.env.ARKIV_ACCESS_KEY;
  delete process.env.ARKIV_ACCESS_KEY;
  const result = { headers: {}, setHeader(k,v) { this.headers[k] = v; }, status(v) { this.code = v; return this; }, json(v) { this.body = v; return this; } };
  try { await handler({ method: 'POST', body: query }, result); }
  finally { if (previous !== undefined) process.env.ARKIV_ACCESS_KEY = previous; }
  assert.equal(result.code, 503); assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.match(result.body.error.message, /hub\.arkiv\.network\/access-keys/);
});
