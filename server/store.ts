import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes,randomUUID,createHash } from 'node:crypto';
import type { Profile,HistoryEntry } from '../shared/types';
import { AUTH_SCHEMA_SQL } from '../auth/schema';
const file=process.env.DATABASE_PATH||'.data/arena.sqlite';
if(file!==':memory:') mkdirSync(dirname(file),{recursive:true});
export const db=new DatabaseSync(file);
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, name TEXT NOT NULL, rating INTEGER NOT NULL DEFAULT 1200, createdAt TEXT NOT NULL); CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS history (playerId TEXT NOT NULL, matchId TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(playerId,matchId));');
db.exec(AUTH_SCHEMA_SQL);
const hash=(t:string)=>createHash('sha256').update(t).digest('hex');
export function profile(id:string){return db.prepare('SELECT id,name,rating,createdAt FROM players WHERE id=?').get(id) as unknown as Profile;}
export function session(cookie=''){const token=cookie.match(/(?:^|;\s*)ba_session=([a-f0-9]{64})(?:;|$)/)?.[1]; if(!token)return null; const row=db.prepare('SELECT id,name,rating,createdAt FROM players WHERE token=?').get(hash(token))??db.prepare('SELECT p.id,p.name,p.rating,p.createdAt FROM auth_sessions s JOIN players p ON p.id=s.playerId WHERE s.tokenHash=? AND s.expiresAt>?').get(hash(token),Date.now()); return row as unknown as Profile|null;}
/** Called when an account's ETH mailbox is confirmed: show the username, and retire the old anonymous cookie so only login sessions reach this player. */
export function adoptAccount(id:string,username:string){db.prepare("UPDATE players SET name=? WHERE id=? AND name LIKE 'Student ____'").run(username,id);db.prepare('UPDATE players SET token=? WHERE id=?').run(hash(randomBytes(32).toString('hex')),id);}
export function createPlayer(){const id=randomUUID(),token=randomBytes(32).toString('hex');db.prepare('INSERT INTO players VALUES (?,?,?,?,?)').run(id,hash(token),`Student ${id.slice(0,4)}`,1200,new Date().toISOString());return {profile:profile(id),token};}
export function rename(id:string,name:string){db.prepare('UPDATE players SET name=? WHERE id=?').run(name,id);return profile(id);}
export function history(id:string){return db.prepare('SELECT data FROM history WHERE playerId=? ORDER BY rowid DESC LIMIT 50').all(id).map(row=>JSON.parse(row.data as string) as HistoryEntry);}
export function leaderboard(){return db.prepare('SELECT id,name,rating,createdAt FROM players ORDER BY rating DESC,createdAt ASC LIMIT 20').all() as unknown as Profile[];}
export function saveMatch(id:string,entries:{player:Profile;history:HistoryEntry}[],data:unknown){
  db.exec('BEGIN IMMEDIATE');
  try{
    if(db.prepare('SELECT id FROM matches WHERE id=?').get(id)){db.exec('ROLLBACK');return false;}
    db.prepare('INSERT INTO matches VALUES (?,?)').run(id,JSON.stringify(data));
    for(const e of entries){db.prepare('UPDATE players SET rating=? WHERE id=?').run(e.history.rating,e.player.id);db.prepare('INSERT INTO history VALUES (?,?,?)').run(e.player.id,id,JSON.stringify(e.history));}
    db.exec('COMMIT');return true;
  }catch(error){db.exec('ROLLBACK');throw error;}
}
