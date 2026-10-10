import type { Express, Request, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { AuthError } from '../auth/errors';
import { statusOf, type AccountService } from '../auth/accounts';
import { reverifyDaysFromEnv } from '../auth/guard';
import { parseEthIdentifier } from '../auth/identifier';
import { windowLimiter } from '../auth/limiter';
import type { AuthPlayer } from '../auth/routes';
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

const STATUS = { forbidden: 403, not_found: 404, invalid_input: 400, conflict: 409, rate_limited: 429 } as const;
const AUTH_STATUS: Partial<Record<AuthError['code'], number>> = { invalid_identifier: 404, rate_limited: 429 };

export function mountAdmin(app: Express, deps: MountAdminDeps): AdminService {
  const clock = deps.clock ?? Date.now;
  const reverifyDays = deps.reverifyDays ?? reverifyDaysFromEnv();
  const admin = createAdminService(deps.db, { rootAdmins: deps.rootAdmins, clock, maxPendingProposals: deps.maxPendingProposals, maxProposalsPerDay: deps.maxProposalsPerDay });
  const perUser = windowLimiter(120, 60_000, clock);
  const accountOf = deps.db.prepare('SELECT username, verifiedAt, disabledAt FROM accounts WHERE playerId=?');

  /** The acting user: a logged-in player whose account is verified right now. Roles are re-read on every request. */
  function actorOf(req: Request): string {
    const player = deps.playerFromCookie(req.headers.cookie);
    const row = player && accountOf.get(player.id) as { username: string; verifiedAt: number | null; disabledAt: number | null } | undefined;
    if (!row || statusOf(row, Math.floor(clock() / 1000), reverifyDays) !== 'verified') throw new AdminError('forbidden', 'Log in with a verified ETH account.');
    perUser(row.username);
    return row.username;
  }
  const body = (req: Request) => (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const param = (req: Request, name: string) => String(req.params[name] ?? '');

  const handle = (fn: (actor: string, req: Request, res: Response) => unknown) => (req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const result = fn(actorOf(req), req, res);
      if (!res.headersSent) res.json(result);
    } catch (error) {
      if (error instanceof AdminError) {
        if (error.retryAfterSeconds) res.setHeader('Retry-After', String(error.retryAfterSeconds));
        return res.status(STATUS[error.code]).json({ error: error.message, code: error.code });
      }
      if (error instanceof AuthError) {
        if (error.retryAfterSeconds) res.setHeader('Retry-After', String(error.retryAfterSeconds));
        return res.status(AUTH_STATUS[error.code] ?? 400).json({ error: error.message, code: error.code });
      }
      console.error('admin: unexpected error', error instanceof Error ? error.message : error);
      res.status(500).json({ error: 'Something went wrong. Try again.' });
    }
  };

  // ---- any verified student
  app.get('/api/me/roles', handle(actor => admin.rolesOf(actor)));
  app.get('/api/courses', handle(actor => ({ courses: admin.listCourses(actor) })));
  app.get('/api/courses/:id', handle((actor, req) => admin.getCourse(actor, param(req, 'id'))));
  app.post('/api/courses/propose', handle((actor, req, res) => res.status(201).json(admin.proposeCourse(actor, body(req)))));
  app.patch('/api/courses/:id', handle((actor, req) => admin.updateCourse(actor, param(req, 'id'), body(req))));

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
