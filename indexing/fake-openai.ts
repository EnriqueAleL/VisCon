import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeOpenAI { url: string; requests: { path: string; body: any }[]; close(): Promise<void> }

/**
 * A tiny stand-in for the OpenAI Responses API, so the real Python pipeline (and the real OpenAI client) can be tested
 * without a key or a network. It answers chapter-indexing requests with two chapters that point at valid transcript lines.
 * `failWith` makes every request fail with that status, e.g. 401 to test how errors are reported.
 */
export function startFakeOpenAI(options: { failWith?: number } = {}): Promise<FakeOpenAI> {
  const requests: FakeOpenAI['requests'] = [];
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      let body: any = {};
      try { body = JSON.parse(raw || '{}'); } catch { /* keep empty */ }
      requests.push({ path: req.url ?? '', body });
      const send = (status: number, payload: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(payload)); };
      if (options.failWith) return send(options.failWith, { error: { message: 'Incorrect API key provided: sk-proj-SECRETSECRETSECRET12345.', type: 'invalid_request_error', code: 'invalid_api_key' } });
      if (!req.url?.endsWith('/responses') || req.method !== 'POST') return send(404, { error: { message: 'not found', type: 'invalid_request_error' } });
      const input: string = typeof body.input === 'string' ? body.input : JSON.stringify(body.input);
      const lines = (input.match(/^\[\d+\]/gm) ?? []).length;
      const chapters = [{ start_line: 0, title: 'Introduction', summary: 'What the lecture is about.', key_terms: ['overview'] }];
      if (lines >= 4) chapters.push({ start_line: Math.floor(lines / 2), title: 'Main topic', summary: 'The core explanation.', key_terms: ['pipelining', 'hazard'] });
      send(200, {
        id: 'resp_fake', object: 'response', created_at: 1, status: 'completed', model: body.model ?? 'fake', error: null, incomplete_details: null,
        output: [{ type: 'message', id: 'msg_fake', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ chapters }), annotations: [] }] }],
        parallel_tool_calls: false, tool_choice: 'auto', tools: [], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      });
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, requests,
    close: () => new Promise<void>(done => { server.close(() => done()); server.closeAllConnections?.(); }),
  })));
}
