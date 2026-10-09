export type Format = 'quiz' | 'numeric' | 'java';
export type Difficulty = 'mixed' | 'foundation' | 'standard' | 'challenge';
export interface Settings { subject: string; topic: string; format: Format; difficulty: Difficulty; rounds: number; seconds: number; ranked: boolean }
export interface Profile { id: string; name: string; rating: number; createdAt: string }
export interface Subject { id: string; name: string; description: string; topics: string[]; formats: Format[]; count: number }
export interface Question { id: string; subject: string; topic: string; title: string; prompt: string; formula?: string; format: Format; difficulty: Exclude<Difficulty,'mixed'>; options?: {id:string;text:string}[]; unit?: string; starter?: string; examples?: {input:string;output:string}[]; source: string }
export interface BankQuestion extends Question { answer: string | number; tolerance?: number; explanation: string; tests?: {input:string;output:string}[] }
export interface Player extends Profile { ready: boolean; online: boolean; bot: boolean; score: number }
export interface RoundResult { question: Question; explanation: string; correctAnswer: string; answers: Record<string,{value:string;correct:boolean;points:number}> }
export interface Outcome { winnerId: string | null; reason: string; before: Record<string,number>; delta: Record<string,number> }
export interface RoomView { id: string; hostId: string; state: 'lobby'|'countdown'|'playing'|'review'|'finished'|'cancelled'; settings: Settings; players: Player[]; round: number; deadline: number; serverTime: number; question: Question | null; submitted: Record<string,boolean>; evaluating: Record<string,boolean>; completed: RoundResult[]; outcome: Outcome | null; error?: string; rematchId?: string }
export interface HistoryEntry { id:string; date:string; subject:string; format:Format; opponent:string; result:'win'|'loss'|'draw'; score:number; opponentScore:number; delta:number; rating:number; ranked:boolean; reason:string }
export interface Bootstrap { profile: Profile; subjects: Subject[]; history: HistoryEntry[]; leaderboard: Profile[]; javaAvailable: boolean; activeRoom: string | null; demoContent: boolean }
