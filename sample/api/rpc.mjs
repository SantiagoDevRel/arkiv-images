// Read-only, bounded Rabdi transport. Access keys and upstream errors stay on the server.
const scalarFields = new Set(['key', 'owner', 'creator', 'createdAt', 'updatedAt', 'expiresAt', 'creationFlags', 'attributeSchema']);
const names = new Set(['arkiv.schema', 'type', 'mode', 'mime', 'filename', 'sha256', 'size', 'width', 'height', 'manifest', 'data', 'metadata', 'complete', 'totalbytes', 'chunkcount', 'chunksize', 'seq']);
export function allowedRequest(body) {
  if (!body || Array.isArray(body) || body.jsonrpc !== '2.0' || !['string', 'number'].includes(typeof body.id)) return false;
  if (String(body.id).length > 128 || JSON.stringify(body).length > 8192) return false;
  if (body.method === 'eth_chainId' || body.method === 'eth_blockNumber' || body.method === 'arkiv_getBlockTiming') return !body.params || body.params.length === 0;
  if (body.method !== 'arkiv_query' || !Array.isArray(body.params) || body.params.length !== 2) return false;
  const [query, options] = body.params;
  if (typeof query !== 'string' || query.length > 2048 || !options || typeof options !== 'object' || Array.isArray(options)) return false;
  // Exact generated query forms: a single key, or bounded immutable chunk pages.
  const singleKey = /^\$key = key\(0x[\da-f]{64}\)$/i.test(query);
  const terms = query.replace(/ ORDER BY \$key:key ASC$/, '').split(' AND ');
  const chunkPatterns = [/^type = str\('arkiv-chunking\/chunk\/v2'\)$/, /^manifest = key\(0x[\da-f]{64}\)$/i, /^\$owner = addr\(0x[\da-f]{40}\)$/i, /^\$creator = addr\(0x[\da-f]{40}\)$/i];
  const afterPattern = /^\$key > key\(0x[\da-f]{64}\)$/i;
  const chunks = / ORDER BY \$key:key ASC$/.test(query) && chunkPatterns.every(pattern => terms.filter(term => pattern.test(term)).length === 1) && terms.every(term => chunkPatterns.some(pattern => pattern.test(term)) || afterPattern.test(term)) && terms.filter(term => afterPattern.test(term)).length <= 1;
  if (!singleKey && !chunks) return false;
  if (Object.keys(options).some(name => !['select', 'limit'].includes(name))) return false;
  if (typeof options.limit !== 'string' || !/^0x[\da-f]+$/i.test(options.limit) || BigInt(options.limit) < 1n || BigInt(options.limit) > (singleKey ? 1n : 10n)) return false;
  const select = options.select;
  if (!select || typeof select !== 'object' || Array.isArray(select)) return false;
  for (const [name, value] of Object.entries(select)) {
    if (name === 'attributes') {
      // Full typed inspection uses the same bounded owner/creator/manifest chunk pages.
      // The page limit and streamed response-size ceiling still apply.
      if (value === true) continue;
      if (value === false) continue;
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.entries(value).some(([n, v]) => !names.has(n) || v !== true)) return false;
    } else if (!scalarFields.has(name) || typeof value !== 'boolean') return false;
  }
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const respond = (status, value) => res.status(status).json(value);
  const origin = req.headers?.origin;
  if (origin !== undefined) {
    try {
      if (typeof origin !== 'string' || new URL(origin).host !== String(req.headers?.host ?? '').toLowerCase()) return respond(403, { error: 'Origin not allowed.' });
    } catch { return respond(403, { error: 'Origin not allowed.' }); }
  }
  if (String(req.headers?.['sec-fetch-site'] ?? '').split(',').some(site => site.trim().toLowerCase() === 'cross-site')) return respond(403, { error: 'Origin not allowed.' });
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return respond(405, { error: 'Use POST for image reads.' }); }
  const contentType = req.headers?.['content-type'];
  if (typeof contentType !== 'string' || contentType.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return respond(415, { error: 'Use application/json for image reads.' });
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return respond(400, { error: 'Invalid read request.' }); }
  if (!allowedRequest(body)) return respond(400, { error: 'Unsupported read request.' });
  const id = body.id;
  if (!process.env.ARKIV_ACCESS_KEY) return respond(503, { jsonrpc: '2.0', id, error: { code: -32000, message: 'Rabdi reads are unavailable. Configure the server access key from https://hub.arkiv.network/access-keys.' } });
  try {
    const response = await fetch(`https://rpc.rabdi.db-chain.testnet.arkiv.network/${encodeURIComponent(process.env.ARKIV_ACCESS_KEY)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(25_000), cache: 'no-store', redirect: 'error',
    });
    if (!response.ok || !response.body) throw Error('Unavailable');
    const reader = response.body.getReader(), chunks = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 3_000_000) { await reader.cancel(); throw Error('Read exceeds response budget'); }
      chunks.push(value);
    }
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (result.error || result.jsonrpc !== '2.0' || !('result' in result)) throw Error('Read failed');
    return respond(200, { jsonrpc: '2.0', id, result: result.result });
  } catch {
    return respond(502, { jsonrpc: '2.0', id, error: { code: -32000, message: 'Rabdi read failed. Check the image key, connection and server access-key quota.' } });
  }
}
