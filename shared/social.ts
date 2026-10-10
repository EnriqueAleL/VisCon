import type { CacheConfig } from './cache';
import type { LearningIdentity } from './world';

export type PuzzleId = 'pipeline-reorder' | 'cache-conflict';
export interface PuzzleCatalogItem {
  id: PuzzleId; title: string; description: string; cityId: string;
  kind: 'pipeline' | 'cache'; timeLimit: number; maxScore: number;
  instructions?: { id: string; text: string }[]; allowedAddresses?: number[];
  accessCount?: number; optimumCycles?: number;
}
export interface PuzzleSession {
  sessionId: string; puzzleId: PuzzleId; startedAt: string; expiresAt: string;
  timeLimit: number; serverTime: number;
}
export interface PuzzleLeaderboardEntry {
  rank: number; userId: string; name: string; puzzleId: PuzzleId; cityId: string;
  score: number; normalizedScore: number; cycles: number | null; stalls: number | null;
  misses: number | null; hits: number | null; elapsedMs: number; achievedAt: string;
}
export interface CityMayor {
  cityId: string; puzzleId: PuzzleId; userId: string; name: string; score: number;
  cycles: number | null; misses: number | null;
}
export interface PuzzleSubmissionResponse {
  score: { valid: true; score: number; cycles?: number; stalls?: number; misses?: number; hits?: number; optimal?: boolean; message?: string };
  personalBest: PuzzleLeaderboardEntry; leaderboard: PuzzleLeaderboardEntry[];
  weekLeaderboard: PuzzleLeaderboardEntry[]; mayor: CityMayor | null;
}
export type SharedVisualizerState =
  | { kind: 'pipeline'; step: number; preset: string; forwarding: boolean; source?: string }
  | { kind: 'cache'; step: number; preset: string; design: 'direct' | 'twoWay' | 'fully'; addresses?: number[]; config?: CacheConfig }
  | { kind: 'virtual-memory'; step: number; preset: 'page-walk'; virtualAddress?: number };
export interface StudyTableMember { userId: string; name: string; joinedAt: string; online: boolean }
export interface StudyTable {
  id: string; cityId: string; topic: string; place: string; time: string;
  hostId: string; hostName: string; createdAt: string; updatedAt: string;
  members: StudyTableMember[]; state: SharedVisualizerState; version: number;
}
export interface CityPresence { cityId: string; count: number }
export interface CityWeather {
  cityId: string; students: number; totalAnswers: number; incorrectAnswers: number;
  wrongRate: number; storm: boolean;
}
export interface SocialSnapshot {
  identity: LearningIdentity; presence: CityPresence[]; weather: CityWeather[];
  tables: StudyTable[]; mayors: CityMayor[]; serverTime: number;
}
export interface GlobalLeaderboardEntry {
  rank: number; userId: string; name: string; normalizedScore: number; puzzlesSolved: number;
  achievedAt: string; scores: PuzzleLeaderboardEntry[];
}
export type StudyAck<T = unknown> = { ok: true; data: T } | { ok: false; error: string };
