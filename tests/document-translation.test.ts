import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { mountDocumentTranslation } from '../server/document-translation';

async function listen(server: Server) {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
test('document gateway forwards only supported document endpoints and preserves service errors', async () => {
  const upstream = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/ask') { res.statusCode = 400; res.end(JSON.stringify({ error: 'Book index required.' })); }
      else res.end(JSON.stringify({ translation: JSON.parse(body).text, source: 'cache' }));
    });
  });
  const serviceURL = await listen(upstream);
  const app = express(); app.use(express.json({ limit: '48kb' }));
  mountDocumentTranslation(app, serviceURL);
  const gateway = createServer(app); const url = await listen(gateway);
  const post = (endpoint: string, payload: unknown) => fetch(`${url}/translate-api/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  try {
    const translated = await post('translate', { text: 'definition', pdf: 'ti_book.pdf', page: 10 });
    assert.equal(translated.status, 200);
    assert.equal(translated.headers.get('cache-control'), 'no-store');
    assert.equal((await translated.json()).translation, 'definition');
    const ask = await post('ask', { question: 'definition?' });
    assert.equal(ask.status, 400); assert.equal((await ask.json()).error, 'Book index required.');
    assert.equal((await post('other', {})).status, 404);
    assert.equal((await post('translate', { text: 'a'.repeat(17000) })).status, 413);
    await close(upstream);
    const offline = await post('translate', { text: 'definition' });
    assert.equal(offline.status, 503); assert.match((await offline.json()).error, /keep reading/);
  } finally {
    if (upstream.listening) await close(upstream);
    await close(gateway);
  }
});
