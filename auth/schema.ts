/** Pure SQL so both the standalone CLI database and the app database (server/store.ts) can create it. */
export const AUTH_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS email_challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, salt TEXT NOT NULL, codeHash TEXT NOT NULL,
  createdAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumedAt INTEGER);
CREATE INDEX IF NOT EXISTS email_challenges_user ON email_challenges (username, createdAt);
CREATE TABLE IF NOT EXISTS verified_students (
  username TEXT PRIMARY KEY, email TEXT NOT NULL, verifiedAt INTEGER NOT NULL, lastVerifiedAt INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS accounts (
  username TEXT PRIMARY KEY, playerId TEXT NOT NULL UNIQUE, passwordHash TEXT NOT NULL,
  createdAt INTEGER NOT NULL, verifiedAt INTEGER);
CREATE TABLE IF NOT EXISTS auth_sessions (
  tokenHash TEXT PRIMARY KEY, playerId TEXT NOT NULL, createdAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS auth_sessions_player ON auth_sessions (playerId);
CREATE TABLE IF NOT EXISTS auth_failures (key TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS auth_failures_key ON auth_failures (key, at);
`;
