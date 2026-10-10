import type { RoundResult } from '../../shared/types';

export interface CombatExchange {
  outgoing: boolean;
  incoming: boolean;
  kind: 'outgoing' | 'incoming' | 'exchange' | 'idle';
  message: string;
}

/** Resolve only public, completed rounds. Never infer correctness from submission. */
export function combatExchange(result: RoundResult | undefined, me: string, opponent: string): CombatExchange {
  const mine = result?.answers[me], theirs = result?.answers[opponent];
  if (!mine || !theirs) return { outgoing: false, incoming: false, kind: 'idle', message: 'Weapons on standby' };
  const outgoing = mine.correct || !theirs.correct;
  const incoming = theirs.correct || !mine.correct;
  const kind = outgoing && incoming ? 'exchange' : outgoing ? 'outgoing' : 'incoming';
  const message = mine.correct && theirs.correct ? 'Both correct · fire exchanged'
    : mine.correct ? 'Correct answer · direct hit'
    : theirs.correct ? 'Opponent correct · incoming hit'
    : 'Both missed · return fire exchanged';
  return { outgoing, incoming, kind, message };
}

export function combatTotals(rounds: RoundResult[], me: string, opponent: string) {
  return rounds.reduce((total, round) => {
    const event = combatExchange(round, me, opponent);
    return { dealt: total.dealt + Number(event.outgoing), taken: total.taken + Number(event.incoming) };
  }, { dealt: 0, taken: 0 });
}
