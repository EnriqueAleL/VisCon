import { AuthError } from './errors';

// ETH usernames are short lowercase alphanumerics (e.g. "riordache"). Aliases such as
// firstname.lastname@student.ethz.ch are deliberately not accepted, so one student maps to one id.
const USERNAME = /^[a-z][a-z0-9]{1,15}$/;
const ACCEPTED_DOMAINS = new Set(['ethz.ch', 'student.ethz.ch']);

export interface EthIdentity { username: string }

/** Accepts `riordache`, `riordache@ethz.ch` or `riordache@student.ethz.ch`. */
export function parseEthIdentifier(input: unknown): EthIdentity {
  const invalid = () => new AuthError('invalid_identifier', 'Enter your ETH username or your @ethz.ch / @student.ethz.ch address.');
  if (typeof input !== 'string' || input.length > 120) throw invalid();
  const value = input.trim().toLowerCase();
  const parts = value.split('@');
  if (parts.length > 2) throw invalid();
  const [username, domain] = parts;
  if (parts.length === 2 && !ACCEPTED_DOMAINS.has(domain)) throw invalid();
  if (!USERNAME.test(username)) throw invalid();
  return { username };
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local[0]}${'*'.repeat(Math.max(1, local.length - 2))}${local.length > 1 ? local.at(-1) : ''}@${domain}`;
}
