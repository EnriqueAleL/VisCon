import type { Express, Request, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { createActorResolver, sendError } from '../admin/actor';
import type { AdminService } from '../admin/service';
import type { AuthPlayer } from '../auth/routes';
import type { SubmissionService } from '../submissions/service';
import { createIndexingService, type IndexingOptions, type IndexingService } from './service';

export interface MountIndexingDeps extends Omit<IndexingOptions, 'submissions'> {
  db: DatabaseSync;
  playerFromCookie(cookie?: string): AuthPlayer | null;
  admin: AdminService;
  submissions: SubmissionService;
  reverifyDays?: number;
}

export function mountIndexing(app: Express, deps: MountIndexingDeps): IndexingService {
  const service = createIndexingService(deps.db, deps.admin, deps);
  const actorOf = createActorResolver({ db: deps.db, playerFromCookie: deps.playerFromCookie, clock: deps.clock, reverifyDays: deps.reverifyDays });
  const handle = (fn: (actor: string, req: Request) => unknown) => async (req: Request, res: Response) => {
    try { res.setHeader('Cache-Control', 'no-store'); res.json(await fn(actorOf(req), req)); } catch (error) { sendError(res, error, 'indexing'); }
  };
  // Indexing state of a course's approved material (administrators and that course's admins).
  app.get('/api/courses/:id/index', handle((actor, req) => service.status(actor, String(req.params.id))));
  // Run it again after a failure (or after the model or transcript was fixed).
  app.post('/api/submissions/:id/reindex', handle((actor, req) => service.retry(actor, String(req.params.id))));
  return service;
}
