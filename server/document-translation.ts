import type { Express } from 'express';

// Keep document requests separate from the lecture API in production as well as Vite.
export function mountDocumentTranslation(app: Express, serviceURL = process.env.TRANSLATION_SERVICE_URL || 'http://127.0.0.1:8788') {
  const endpoints = new Set(['translate', 'translate-page', 'ask']);
  app.post('/translate-api/:endpoint', async (req, res) => {
    if (!endpoints.has(String(req.params.endpoint))) return res.status(404).json({ error: 'Document endpoint not found.' });
    const body = JSON.stringify(req.body);
    if (!body || Buffer.byteLength(body) > 16384) return res.status(413).json({ error: 'Document request is too large.' });
    try {
      const upstream = await fetch(new URL(`/api/${req.params.endpoint}`, serviceURL), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
        signal: AbortSignal.timeout(90000),
      });
      const result = await upstream.json();
      res.setHeader('Cache-Control', 'no-store');
      return res.status(upstream.status).json(result);
    } catch {
      return res.status(503).json({ error: 'The reading companion is temporarily unavailable. You can keep reading and try again shortly.' });
    }
  });
}
