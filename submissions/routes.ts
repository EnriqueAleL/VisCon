import type { Express, Request, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { PassThrough } from 'node:stream';
import { createActorResolver, sendError } from '../admin/actor';
import { AdminError } from '../admin/errors';
import type { AdminService } from '../admin/service';
import type { AuthPlayer } from '../auth/routes';
import { isSlot, receiveUpload, type UploadLimits } from './files';
import { createSubmissionService, type SubmissionService } from './service';

export interface MountSubmissionsDeps {
  db: DatabaseSync;
  playerFromCookie(cookie?: string): AuthPlayer | null;
  admin: AdminService;
  /** Where files live. Must be outside any folder that is served to browsers; never committed to git. */
  uploadsDir: string;
  limits?: UploadLimits;
  clock?: () => number;
  reverifyDays?: number;
  isNumberReserved?: (courseId: string, number: number) => boolean;
  onApproved?: (submission: import('./service').Submission) => void;
  onRemoved?: (submission: import('./service').Submission) => void | Promise<void>;
}

export function mountSubmissions(app: Express, deps: MountSubmissionsDeps): SubmissionService {
  const service = createSubmissionService(deps.db, deps.admin, { uploadsDir: deps.uploadsDir, limits: deps.limits, clock: deps.clock, isNumberReserved: deps.isNumberReserved, onApproved: deps.onApproved, onRemoved: deps.onRemoved });
  const actorOf = createActorResolver({ db: deps.db, playerFromCookie: deps.playerFromCookie, clock: deps.clock, reverifyDays: deps.reverifyDays });
  const body = (req: Request) => (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const param = (req: Request, name: string) => String(req.params[name] ?? '');

  const handle = (fn: (actor: string, req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const result = await fn(actorOf(req), req, res);
      if (!res.headersSent) res.json(result);
    } catch (error) { sendError(res, error, 'submissions'); }
  };

  // ---- submitting
  app.post('/api/courses/:id/submissions', handle((actor, req, res) => res.status(201).json(service.create(actor, param(req, 'id'), body(req)))));
  app.get('/api/me/submissions', handle(actor => ({ submissions: service.listMine(actor) })));
  app.get('/api/submissions/:id', handle((actor, req) => service.get(actor, param(req, 'id'))));
  app.post('/api/submissions/:id/submit', handle((actor, req) => service.submit(actor, param(req, 'id'))));
  app.post('/api/submissions/:id/withdraw', handle((actor, req) => service.withdraw(actor, param(req, 'id'))));

  /**
   * Raw upload: `PUT` the file bytes as the body (Content-Type: application/octet-stream), with a Content-Length and an
   * optional X-Filename. Streamed to disk, hashed and checked as it arrives, so a wrong or oversized file stops early.
   */
  app.put('/api/submissions/:id/files/:slot', async (req, res) => {
    const id = param(req, 'id');
    let tmpPath = '';
    let release: (() => void) | undefined;
    try {
      res.setHeader('Cache-Control', 'no-store');
      const actor = actorOf(req);
      const declared = Number(req.headers['content-length']);
      if (!req.headers['content-length'] || !Number.isSafeInteger(declared) || declared <= 0) throw new AdminError('length_required', 'Send the file with a Content-Length header.');
      if (!isSlot(req.params.slot)) throw new AdminError('invalid_input', 'Unknown file slot.');
      const prepared = service.prepareUpload(actor, id, req.params.slot, declared);
      tmpPath = prepared.tmpPath;
      release = service.holdDraft(prepared.submission.id); // the hourly clean-up must not delete the draft under a running upload
      await service.ensureDir(id);
      // Piping through a PassThrough keeps the socket alive when the pipeline aborts, so the error can still be answered.
      const source = new PassThrough();
      req.pipe(source);
      req.once('error', error => source.destroy(error));
      req.once('close', () => { if (!req.complete) source.destroy(new Error('aborted')); });
      const stored = await receiveUpload(source, tmpPath, prepared.slot, prepared.max, declared);
      res.status(201).json(await service.commitFile(actor, id, prepared.slot, stored, req.headers['x-filename'], tmpPath));
    } catch (error) {
      if (!req.complete) { res.setHeader('Connection', 'close'); res.once('finish', () => req.destroy()); }
      sendError(res, error, 'submissions');
    } finally { release?.(); }
  });

  app.get('/api/submissions/:id/files/:slot', async (req, res) => {
    try {
      const file = service.fileForDownload(actorOf(req), param(req, 'id'), param(req, 'slot'));
      // Always a download, never rendered in our origin: uploaded files are untrusted.
      res.set({ 'Content-Type': file.mime, 'Content-Disposition': `attachment; filename="${file.filename}"`, 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'", 'Cache-Control': 'private, no-store' });
      res.sendFile(file.path, { dotfiles: 'allow' }, error => { if (error && !res.headersSent) sendError(res, new AdminError('not_found', 'There is no such file.'), 'submissions'); });
    } catch (error) { sendError(res, error, 'submissions'); }
  });

  // ---- reviewing (administrators and the course's admins)
  app.get('/api/courses/:id/submissions', handle((actor, req) => ({ submissions: service.listForCourse(actor, param(req, 'id'), req.query.status) })));
  app.post('/api/submissions/:id/approve', handle((actor, req) => service.approve(actor, param(req, 'id'), body(req).note)));
  app.post('/api/submissions/:id/reject', handle((actor, req) => service.reject(actor, param(req, 'id'), body(req).note)));
  app.post('/api/admin/submissions/:id/remove', handle((actor, req) => service.remove(actor, param(req, 'id'), body(req).reason)));

  return service;
}
