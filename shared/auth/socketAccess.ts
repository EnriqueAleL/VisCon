import type { Socket } from 'socket.io-client';

/** Dispatched on window when something suggests access may have ended; AuthGate re-checks the account. */
export const AUTH_CHECK_EVENT = 'auth:check';
const ACCESS_CODES = new Set(['login_required', 'verification_required', 'account_disabled']);
const requestCheck = () => window.dispatchEvent(new Event(AUTH_CHECK_EVENT));

/**
 * The server drops open sockets whose session, verification or account has ended, and refuses new ones with an access code.
 * Either way the app would just look offline; this tells AuthGate to show the right screen instead.
 */
export function watchSocketAccess(socket: Socket) {
  socket.on('disconnect', reason => { if (reason === 'io server disconnect') requestCheck(); });
  socket.on('connect_error', (error: Error & { data?: { code?: string } }) => { if (ACCESS_CODES.has(error.data?.code ?? '')) requestCheck(); });
}
