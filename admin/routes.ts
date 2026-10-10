import type { Express, Request, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { AccountService } from '../auth/accounts';
import { parseEthIdentifier } from '../auth/identifier';
import type { AuthPlayer } from '../auth/routes';
import { createActorResolver, sendError } from './actor';
import { AdminError } from './errors';
import { createAdminService, type AdminService } from './service';

export interface MountAdminDeps {
  db: DatabaseSync;
  playerFromCookie(cookie?: string): AuthPlayer | null;
  accounts: AccountService;
  rootAdmins: ReadonlySet<string>;
  clock?: () => number;
  reverifyDays?: number;
  maxPendingProposals?: number;
  maxProposalsPerDay?: number;
}

/** AUTH_ADMINS="riordache, abc123": the bootstrap administrators. Only set on the server, never through the app. */
export function rootAdminsFromEnv(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const names = new Set<string>();
  for (const part of (env.AUTH_ADMINS ?? '').split(/[\s,;]+/).filter(Boolean)) {
    try { names.add(parseEthIdentifier(part).username); } catch { console.warn(`admin: ignoring invalid entry in AUTH_ADMINS: ${part.slice(0, 40)}`); }
  }
  return names;
}

export function mountAdmin(app: Express, deps: MountAdminDeps): AdminService {
  const clock = deps.clock ?? Date.now;
  const admin = createAdminService(deps.db, { rootAdmins: deps.rootAdmins, clock, maxPendingProposals: deps.maxPendingProposals, maxProposalsPerDay: deps.maxProposalsPerDay });
  const actorOf = createActorResolver({ db: deps.db, playerFromCookie: deps.playerFromCookie, clock, reverifyDays: deps.reverifyDays });

  const body = (req: Request) => (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const param = (req: Request, name: string) => String(req.params[name] ?? '');

  const handle = (fn: (actor: string, req: Request, res: Response) => unknown) => (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const result = fn(actorOf(req), req, res);
      if (!res.headersSent) res.json(result);
    } catch (error) { sendError(res, error, 'admin'); }
  };
  // ---- any verified student
  app.get('/api/me/roles', handle(actor => admin.rolesOf(actor)));
  app.get('/api/platform/courses', handle(actor => ({ courses: admin.listCourses(actor) })));
  app.get('/api/platform/courses/:id', handle((actor, req) => admin.getCourse(actor, param(req, 'id'))));
  app.post('/api/platform/courses/propose', handle((actor, req, res) => res.status(201).json(admin.proposeCourse(actor, body(req)))));
  app.patch('/api/platform/courses/:id', handle((actor, req) => admin.updateCourse(actor, param(req, 'id'), body(req))));

  // ---- administrators
  app.get('/api/admin/admins', handle(actor => { admin.listAudit(actor, 1); return { admins: admin.listAdmins() }; }));
  app.post('/api/admin/admins', handle((actor, req, res) => res.status(201).json(admin.grantAdmin(actor, body(req).username))));
  app.delete('/api/admin/admins/:username', handle((actor, req) => admin.revokeAdmin(actor, param(req, 'username'))));

  app.post('/api/admin/courses', handle((actor, req, res) => res.status(201).json(admin.createCourse(actor, body(req)))));
  app.post('/api/admin/courses/:id/approve', handle((actor, req) => admin.approveCourse(actor, param(req, 'id'))));
  app.post('/api/admin/courses/:id/archive', handle((actor, req) => admin.archiveCourse(actor, param(req, 'id'))));
  app.post('/api/admin/courses/:id/unarchive', handle((actor, req) => admin.unarchiveCourse(actor, param(req, 'id'))));
  app.delete('/api/admin/courses/:id', handle((actor, req) => { admin.rejectProposal(actor, param(req, 'id')); return { ok: true }; }));
  app.post('/api/admin/courses/:id/admins', handle((actor, req, res) => res.status(201).json(admin.grantCourseAdmin(actor, param(req, 'id'), body(req).username))));
  app.delete('/api/admin/courses/:id/admins/:username', handle((actor, req) => admin.revokeCourseAdmin(actor, param(req, 'id'), param(req, 'username'))));

  app.get('/api/admin/accounts', handle(actor => {
    admin.listAudit(actor, 1);
    return { accounts: deps.accounts.list().map(a => ({ username: a.username, status: a.status, verifiedAt: a.verifiedAt, roles: admin.rolesOf(a.username) })) };
  }));
  /** Blocking and unblocking accounts. Administrators protect themselves: no self-block, and server-set admins stay out of reach. */
  const setBlocked = (revoking: boolean) => handle((actor, req) => {
    const target = parseEthIdentifier(param(req, 'username')).username;
    if (!admin.isAdmin(actor)) throw new AdminError('forbidden', 'Only administrators can do this.');
    if (revoking && target === actor) throw new AdminError('forbidden', 'You cannot block your own account.');
    if (revoking && admin.isRootAdmin(target)) throw new AdminError('forbidden', 'Administrators set on the server cannot be blocked here.');
    const account = revoking ? deps.accounts.revoke(target) : deps.accounts.restore(target);
    admin.audit(actor, revoking ? 'account.revoke' : 'account.restore', target);
    return { username: account.username, status: account.status };
  });
  app.post('/api/admin/accounts/:username/revoke', setBlocked(true));
  app.post('/api/admin/accounts/:username/restore', setBlocked(false));
  app.get('/api/admin/audit', handle((actor, req) => ({ entries: admin.listAudit(actor, Number(req.query.limit) || 100) })));

  return admin;
}
