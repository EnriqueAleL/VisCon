import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eloDelta } from '../server/rating';
import { bank,correct,publicQuestion,numericValue,validateBank } from '../server/questions';

test('Elo rewards an upset more, preserves a balanced draw, and transfers points',()=>{
  assert.equal(eloDelta(1200,1200,1),16);
  assert.equal(eloDelta(1200,1200,0),-16);
  assert.equal(eloDelta(1200,1200,.5),0);
  assert.ok(eloDelta(1000,1500,1)>eloDelta(1500,1000,1));
  assert.equal(eloDelta(1248,1272,1),-eloDelta(1272,1248,0));
});
test('numeric grading rejects coercion and accepts localized decimals with explicit tolerance',()=>{
  for(const value of ['', ' ', '0x10','Infinity','NaN','1/2','2 + 2']) assert.equal(numericValue(value),null);
  assert.equal(numericValue('1,25'),1.25);assert.equal(numericValue('-2e2'),-200);
  const q={...bank.find(q=>q.format==='numeric')!,answer:1.25,tolerance:.01};
  assert.equal(correct(q,'1,25'),true);assert.equal(correct(q,'1.255'),true);assert.equal(correct(q,'1.3'),false);
});
test('live questions never include solutions, hidden tests, or numeric tolerances',()=>{
  for(const q of bank){const exposed=publicQuestion(q) as any;for(const key of ['answer','explanation','tests','tolerance'])assert.equal(key in exposed,false);}
});
test('import validation rejects duplicate IDs and inconsistent choices',()=>{
  assert.throws(()=>validateBank([bank[0],bank[0]]));
  assert.throws(()=>validateBank([{...bank[0],answer:'does-not-exist'}]));
  assert.throws(()=>validateBank([{...bank.find(q=>q.format==='numeric'),tolerance:-1}]));
});
test('recording a finished match twice cannot update Elo twice',async()=>{
  process.env.DATABASE_PATH=':memory:';
  const store=await import('../server/store');
  const a=store.createPlayer().profile,b=store.createPlayer().profile;
  const entry=(p:typeof a,delta:number)=>({player:p,history:{id:'once',date:new Date().toISOString(),subject:'discrete',format:'quiz' as const,opponent:'Opponent',result:delta>0?'win' as const:'loss' as const,score:delta>0?1000:0,opponentScore:delta>0?0:1000,delta,rating:1200+delta,ranked:true,reason:'Match complete'}});
  assert.equal(store.saveMatch('once',[entry(a,16),entry(b,-16)],{}),true);
  assert.equal(store.saveMatch('once',[entry(a,32),entry(b,-32)],{}),false);
  assert.equal(store.profile(a.id).rating,1216);assert.equal(store.profile(b.id).rating,1184);
  assert.equal(store.history(a.id).length,1);
});
