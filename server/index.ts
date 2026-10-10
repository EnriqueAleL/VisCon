import express from 'express';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes,randomInt,randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import type { BankQuestion,Settings,Player,RoomView,RoundResult,Outcome,Profile,HistoryEntry } from '../shared/types';
import { subjects,eligible,publicQuestion,correct,answerLabel,demoContent,numericValue,registerCourseQuestions } from './questions';
import { db,profile,session,createPlayer,rename,history,leaderboard,saveMatch,adoptAccount,anonymizePlayer } from './store';
import { mountAuth } from '../auth/routes';
import { mountAdmin, rootAdminsFromEnv } from '../admin/routes';
import type { AdminService } from '../admin/service';
import { mountSubmissions } from '../submissions/routes';
import { mountIndexing } from '../indexing/routes';
import { createPythonRunner, pythonConfigFromEnv } from '../indexing/runner';
import type { IndexingService } from '../indexing/service';
import { createVerifiedGuard } from '../auth/guard';
import { mountStatic } from './static';
import { eloDelta } from './rating';
import { javaAvailable,judge } from './judge';
import { mountLectures } from './lectures';
import { mountMania, maniaIdentity } from './mania';
import { mountSocial } from './social';
import { mountManiaAnswers } from './mania-answers';

const app=express(),http=createServer(app),port=Number(process.env.PORT||3001);
// Node cuts any request after 5 minutes by default; a large video upload on a slow connection needs longer.
http.requestTimeout=30*60_000;
const allowed=new Set((process.env.ALLOWED_ORIGINS||'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3001,http://127.0.0.1:3001').split(','));
if (process.env.APP_PUBLIC_URL) allowed.add(new URL(process.env.APP_PUBLIC_URL).origin);
function allowedOrigin(origin:string|undefined){return !origin||allowed.has(origin);}
const io=new Server(http,{allowRequest:(req,cb)=>cb(null,allowedOrigin(req.headers.origin))});
app.disable('x-powered-by');
app.use((_req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Referrer-Policy','same-origin');if(process.env.COOKIE_SECURE==='true')res.setHeader('Strict-Transport-Security','max-age=15552000');next();});
if(process.env.NODE_ENV==='production'&&process.env.COOKIE_SECURE!=='true')console.warn('COOKIE_SECURE is not true: session cookies are sent without the Secure flag. Set COOKIE_SECURE=true behind HTTPS.');
app.use(express.json({limit:'48kb'}));
app.use('/api',(req,res,next)=>{res.setHeader('Cache-Control','no-store');if(!allowedOrigin(req.headers.origin))return res.status(403).json({error:'This origin is not allowed.'});next();});
const rates=new Map<string,{at:number;count:number}>();
function limit(key:string,max=120){const now=Date.now();let r=rates.get(key);if(!r||now-r.at>60000){r={at:now,count:0};rates.set(key,r);}if(++r.count>max)throw new Error('Too many requests. Wait a moment and try again.');}
function user(req:express.Request,res:express.Response){let p=session(req.headers.cookie);if(!p){const created=createPlayer();p=created.profile;res.cookie('ba_session',created.token,{httpOnly:true,sameSite:'lax',secure:process.env.COOKIE_SECURE==='true',maxAge:365*24*60*60*1000,path:'/'});}return p;}
interface Submission{value:string;correct:boolean;pending:boolean}
interface Room { id:string;matchId:string;hostId:string;state:RoomView['state'];settings:Settings;players:Player[];questions:BankQuestion[];round:number;deadline:number;answers:Record<string,Submission>;completed:RoundResult[];outcome:Outcome|null;error?:string;timer?:ReturnType<typeof setTimeout>;botTimer?:ReturnType<typeof setTimeout>;nextVotes:Set<string>;createdAt:number;rematchId?:string }
const rooms=new Map<string,Room>();
const active=new Map<string,string>();
const connections=new Map<string,Set<string>>();
const disconnects=new Map<string,ReturnType<typeof setTimeout>>();
const countdownMs=process.env.NODE_ENV==='test'?50:3000;
const reviewMs=process.env.NODE_ENV==='test'?100:12000;
function defaultsFor(subject=subjects[0].id):Settings {
  const format=subjects.find(s=>s.id===subject)?.formats[0]||'quiz';
  const settings:Settings={subject,topic:'all',format,difficulty:'mixed',rounds:format==='java'?1:6,seconds:format==='java'?300:75,ranked:false};
  settings.rounds=Math.min(settings.rounds,eligible(settings).length);
  return settings;
}
const defaultSettings=defaultsFor();
function validateSettings(input:any):Settings {
  if(!input||!subjects.some(s=>s.id===input.subject)||!['quiz','numeric','java'].includes(input.format)||!['mixed','foundation','standard','challenge'].includes(input.difficulty)||typeof input.topic!=='string'||typeof input.ranked!=='boolean'||!Number.isInteger(input.rounds)||input.rounds<1||input.rounds>20||!Number.isInteger(input.seconds)||input.seconds<10||input.seconds>900)throw new Error('Choose valid match settings.');
  if(eligible(input).length<input.rounds)throw new Error(`Only ${eligible(input).length} questions match these settings. Reduce the rounds or broaden your selection.`);
  return {subject:input.subject,topic:input.topic,format:input.format,difficulty:input.difficulty,rounds:input.rounds,seconds:input.seconds,ranked:input.ranked};
}
function view(r:Room):RoomView {
  return {id:r.id,hostId:r.hostId,state:r.state,settings:r.settings,players:r.players,round:r.round,deadline:r.deadline,serverTime:Date.now(),question:['playing','review'].includes(r.state)?publicQuestion(r.questions[r.round]):null,submitted:Object.fromEntries(Object.entries(r.answers).map(([id,a])=>[id,!a.pending])),evaluating:Object.fromEntries(Object.entries(r.answers).map(([id,a])=>[id,a.pending])),completed:r.completed,outcome:r.outcome,error:r.error,rematchId:r.rematchId};
}
function broadcast(r:Room){io.to(r.id).emit('room',view(r));}
function clearTimers(r:Room){clearTimeout(r.timer);clearTimeout(r.botTimer);}
function newRoom(p:Profile,settings=defaultSettings){
  const previous=active.get(p.id);if(previous&&rooms.has(previous)&&!['finished','cancelled'].includes(rooms.get(previous)!.state))throw new Error('You already have an active room. Return to it or leave it first.');
  const id=randomBytes(5).toString('hex').toUpperCase();
  const r:Room={id,matchId:randomUUID(),hostId:p.id,state:'lobby',settings:{...settings},players:[{...p,ready:false,online:!!connections.get(p.id)?.size,score:0,bot:false}],questions:[],round:0,deadline:0,answers:{},completed:[],outcome:null,nextVotes:new Set(),createdAt:Date.now()};rooms.set(id,r);active.set(p.id,id);return r;
}
function member(id:string,p:Profile){const r=rooms.get(id);if(!r)throw new Error('Room not found or expired. Ask your friend for a new invitation.');if(!r.players.some(x=>x.id===p.id))throw new Error('Join this room first.');return r;}
function join(r:Room,p:Profile){if(r.players.some(x=>x.id===p.id))return;if(r.state!=='lobby')throw new Error('This match has already started. Ask for a new invitation.');if(r.players.length>=2)throw new Error('This room is full. Only two players can join.');const prior=active.get(p.id);if(prior&&prior!==r.id&&rooms.has(prior)&&!['finished','cancelled'].includes(rooms.get(prior)!.state))throw new Error('Leave your current room before joining another.');r.players.push({...p,ready:false,online:!!connections.get(p.id)?.size,bot:false,score:0});active.set(p.id,r.id);r.players.forEach(x=>x.ready=false);broadcast(r);}
function finish(r:Room,reason='Match complete',forfeitId?:string){
  if(['finished','cancelled'].includes(r.state))return;
  clearTimers(r);r.state='finished';
  const [a,b]=r.players;if(!b){r.state='cancelled';r.error='The other player left the room.';active.delete(a.id);broadcast(r);return;}
  const winnerId=forfeitId?(forfeitId===a.id?b.id:a.id):a.score===b.score?null:a.score>b.score?a.id:b.id;
  const before=Object.fromEntries(r.players.map(p=>[p.id,p.bot?p.rating:profile(p.id).rating]));
  const change=r.settings.ranked&&!r.players.some(p=>p.bot)?eloDelta(before[a.id],before[b.id],winnerId===a.id?1:winnerId===null?0.5:0):0;
  const delta={[a.id]:change,[b.id]:-change};r.outcome={winnerId,reason,before,delta};
  const entries=r.players.filter(p=>!p.bot).map(p=>{const opponent=r.players.find(o=>o.id!==p.id)!;const h:HistoryEntry={id:r.matchId,date:new Date().toISOString(),subject:r.settings.subject,format:r.settings.format,opponent:opponent.name,result:winnerId===null?'draw':winnerId===p.id?'win':'loss',score:p.score,opponentScore:opponent.score,delta:delta[p.id],rating:before[p.id]+delta[p.id],ranked:r.settings.ranked,reason};return {player:p,history:h};});
  saveMatch(r.matchId,entries,{settings:r.settings,outcome:r.outcome,completed:r.completed});
  r.players.forEach(p=>{p.rating=before[p.id]+delta[p.id];if(active.get(p.id)===r.id)active.delete(p.id);});broadcast(r);
}
function cancel(r:Room,message:string){clearTimers(r);r.state='cancelled';r.error=message;r.players.forEach(p=>{if(active.get(p.id)===r.id)active.delete(p.id);});broadcast(r);}
function closeRound(r:Room){
  if(r.state!=='playing')return;if(Object.values(r.answers).some(a=>a.pending)){r.timer=setTimeout(()=>closeRound(r),250);return;}
  clearTimers(r);const q=r.questions[r.round];
  const answers=Object.fromEntries(r.players.map(p=>{const a=r.answers[p.id];const points=a?.correct?1000:0;p.score+=points;return [p.id,{value:a?answerLabel(q,a.value):'No answer',correct:a?.correct??false,points}];}));
  r.completed.push({question:publicQuestion(q),explanation:q.explanation,correctAnswer:answerLabel(q,String(q.answer)),answers});r.state='review';r.nextVotes.clear();r.deadline=Date.now()+reviewMs;r.timer=setTimeout(()=>nextRound(r),reviewMs);broadcast(r);
}
function nextRound(r:Room){if(r.state!=='review')return;clearTimers(r);if(r.round+1>=r.settings.rounds){finish(r);return;}r.round++;startRound(r);}
function startRound(r:Room){
  r.state='playing';r.answers={};r.deadline=Date.now()+r.settings.seconds*1000;r.timer=setTimeout(()=>closeRound(r),r.settings.seconds*1000);broadcast(r);
  const bot=r.players.find(p=>p.bot);if(bot){r.botTimer=setTimeout(()=>{if(r.state!=='playing')return;const q=r.questions[r.round],good=randomInt(100)<65;r.answers[bot.id]={value:good?String(q.answer):q.format==='quiz'?(q.options!.find(o=>o.id!==q.answer)?.id||'wrong'):String(Number(q.answer)+1),correct:good,pending:false};broadcast(r);if(r.players.every(p=>r.answers[p.id]))closeRound(r);},Math.min(r.settings.seconds*700,3500+randomInt(2500)));}
}
function begin(r:Room){if(r.settings.format==='java'&&!javaAvailable)throw new Error('Java execution is not connected yet. Choose Quiz or Numeric to start a match.');const qs=[...eligible(r.settings)];for(let i=qs.length-1;i>0;i--){const j=randomInt(i+1);[qs[i],qs[j]]=[qs[j],qs[i]];}r.questions=qs.slice(0,r.settings.rounds);r.state='countdown';r.deadline=Date.now()+countdownMs;r.timer=setTimeout(()=>startRound(r),countdownMs);broadcast(r);}
function leave(r:Room,p:Profile){
  if(r.state==='lobby'){r.players=r.players.filter(x=>x.id!==p.id);active.delete(p.id);if(!r.players.some(x=>!x.bot)){rooms.delete(r.id);return;}r.hostId=r.players.find(x=>!x.bot)!.id;r.players.forEach(x=>x.ready=x.bot);broadcast(r);}
  else if(!['finished','cancelled'].includes(r.state))finish(r,'Opponent left the match',p.id);
}
/** A revoked, deleted or password-reset account must lose live Socket.IO connections too, not just future requests. */
function dropConnections(playerId:string){
  for(const socket of io.sockets.sockets.values())if(socket.data.playerId===playerId)socket.disconnect(true);
  for(const socket of io.of('/study').sockets.values())if((socket.data.identity as {id?:string}|undefined)?.id===playerId)socket.disconnect(true);
}
const route=(handler:(req:express.Request,res:express.Response,p:Profile)=>unknown)=>async(req:express.Request,res:express.Response)=>{try{const p=user(req,res);limit(p.id);await handler(req,res,p);}catch(e){res.status(400).json({error:e instanceof Error?e.message:'Something went wrong. Try again.'});}};
app.get('/api/health',(_req,res)=>res.json({ok:true}));
// Everything below needs a confirmed ETH student email: the API, lecture media, and both Socket.IO namespaces.
const guard=createVerifiedGuard({db,playerFromCookie:session});
if(!guard.enabled)console.warn('AUTH_REQUIRE_VERIFIED=false: the API is open to unverified visitors. Never use this in production.');
let admin:AdminService|undefined;
const accountsService=mountAuth(app,{db,required:guard.enabled,playerFromCookie:session,createPlayer,secureCookies:process.env.COOKIE_SECURE==='true',clientIpHeader:process.env.AUTH_CLIENT_IP_HEADER?.toLowerCase(),accountOptions:{onVerified:account=>adoptAccount(account.playerId,account.username),onDeleted:(playerId,username)=>{anonymizePlayer(playerId);admin?.forgetUser(username);},onRevoked:dropConnections}});
app.use(['/api','/media'],guard.http);
io.use(guard.socket);
io.of('/study').use(guard.socket);
const rootAdmins=rootAdminsFromEnv();
if(!rootAdmins.size)console.warn('AUTH_ADMINS is empty: nobody can administer courses or other admins. Set AUTH_ADMINS=<eth username>.');
admin=mountAdmin(app,{db,playerFromCookie:session,accounts:accountsService,rootAdmins});
const coursesDir=process.env.COURSES_DIR||'.data/courses';
// Lecture numbers of the original DDCA recordings (they live outside the submission system and must not be replaced by it).
const originalLectures=new Set<number>();
try{for(const key of Object.keys(JSON.parse(readFileSync('qa/data/index.json','utf8')).lectures??{}))originalLectures.add(Number(key));}catch{/* no original recordings on this machine */}
let indexing:IndexingService|undefined;
const submissions=mountSubmissions(app,{db,playerFromCookie:session,admin,uploadsDir:process.env.UPLOADS_DIR||'.data/uploads',
  isNumberReserved:(courseId,number)=>courseId==='computer-architecture'&&originalLectures.has(number),
  onApproved:()=>indexing?.kick(),onRemoved:submission=>indexing?.unpublish(submission)});
submissions.purgeStaleDrafts();
setInterval(()=>submissions.purgeStaleDrafts(),3_600_000).unref();
// Approved material is indexed in the background, one item at a time, with the Python tool in qa/.
indexing=mountIndexing(app,{db,playerFromCookie:session,admin,submissions,coursesDir,
  runner:createPythonRunner(pythonConfigFromEnv(fileURLToPath(new URL('../',import.meta.url)))),
  enabled:process.env.INDEXING_ENABLED!=='false',summaries:process.env.INDEXING_SUMMARIES!=='false',maxAttempts:Number(process.env.INDEXING_MAX_ATTEMPTS)||3,
  maxPaidRuns:process.env.INDEXING_MAX_PAID_RUNS?Math.max(0,Number(process.env.INDEXING_MAX_PAID_RUNS)||0):50});
indexing.start(Math.max(1,Number(process.env.INDEXING_POLL_SECONDS)||5)*1000);
// A revoke done from the command line (another process), an expired session or an expired verification must also end
// connections that are already open, so every open socket is re-checked against the guard on a timer.
const recheckSeconds=Number(process.env.AUTH_SOCKET_RECHECK_SECONDS||30);
if(guard.enabled&&recheckSeconds>0)setInterval(()=>{
  for(const socket of [...io.sockets.sockets.values(),...io.of('/study').sockets.values()])if(guard.accessFor(socket.handshake.headers.cookie)!=='ok')socket.disconnect(true);
},recheckSeconds*1000).unref();

app.get('/api/bootstrap',route((_req,res,p)=>res.json({profile:p,subjects,history:history(p.id),leaderboard:leaderboard(),javaAvailable,activeRoom:active.get(p.id)||null,demoContent})));
app.post('/api/profile',route((req,res,p)=>{const name=typeof req.body.name==='string'?req.body.name.trim():'';if(name.length<2||name.length>24||/[\x00-\x1f<>]/.test(name))throw new Error('Use a name with 2–24 characters.');const updated=rename(p.id,name);for(const r of rooms.values()){const player=r.players.find(x=>x.id===p.id);if(player){player.name=name;broadcast(r);}}res.json(updated);}));
app.post('/api/rooms',route((req,res,p)=>{limit(`create:${p.id}`,15);const settings=validateSettings({...defaultsFor(req.body.settings?.subject),...req.body.settings});const r=newRoom(p,settings);if(req.body.practice){r.settings.ranked=false;r.players.push({id:`bot-${r.id}`,name:'Study partner',rating:1200,createdAt:new Date().toISOString(),bot:true,online:true,ready:true,score:0});}res.json(view(r));}));
app.post('/api/rooms/:id/join',route((req,res,p)=>{const r=rooms.get(String(req.params.id).toUpperCase());if(!r)throw new Error('Room not found or expired. Check the invitation link.');join(r,p);res.json(view(r));}));
app.get('/api/rooms/:id',route((req,res,p)=>res.json(view(member(String(req.params.id).toUpperCase(),p)))));
app.post('/api/rooms/:id/leave',route((req,res,p)=>{const r=member(String(req.params.id),p);leave(r,p);res.json({ok:true});}));
app.post('/api/rooms/:id/rematch',route((req,res,p)=>{const r=member(String(req.params.id),p);if(!['finished','cancelled'].includes(r.state))throw new Error('Finish the match before starting a rematch.');if(r.rematchId){const next=rooms.get(r.rematchId);if(next){join(next,p);return res.json(view(next));}}const next=newRoom(profile(p.id),r.settings);const bot=r.players.find(x=>x.bot);if(bot)next.players.push({...bot,id:`bot-${next.id}`,score:0,ready:true});r.rematchId=next.id;broadcast(r);res.json(view(next));}));
app.get('/api/questions/availability',route((req,res)=>{const settings={...defaultSettings,...req.query} as Settings;res.json({count:eligible(settings).length});}));
app.get('/api/java/preview',route((_req,res)=>{const q=eligible({...defaultSettings,subject:'programming',format:'java'})[0];res.json(q?publicQuestion(q):null);}));
app.post('/api/java/test',route(async(req,res,p)=>{limit(`java:${p.id}`,6);const source=req.body.source;if(typeof source!=='string'||!source.trim()||source.length>20000)throw new Error('Enter a Java program under 20,000 characters.');const q=req.body.roomId?member(String(req.body.roomId),p).questions[member(String(req.body.roomId),p).round]:eligible({...defaultSettings,subject:'programming',format:'java'}).find(q=>q.id===req.body.questionId);if(!q||q.format!=='java')throw new Error('Java question not found.');res.json(await judge(q,source,true));}));

io.use((socket,next)=>{const p=session(socket.handshake.headers.cookie);if(!p)return next(new Error('Open the app to create your player profile.'));socket.data.playerId=p.id;next();});
io.on('connection',socket=>{
  const id=socket.data.playerId as string;const set=connections.get(id)||new Set<string>();set.add(socket.id);connections.set(id,set);clearTimeout(disconnects.get(id));disconnects.delete(id);
  const act=(event:string,fn:(body:any,p:Profile)=>unknown)=>socket.on(event,async(body,reply)=>{try{limit(`socket:${id}`);const result=await fn(body,profile(id));if(typeof reply==='function')reply({ok:true,result});}catch(e){if(typeof reply==='function')reply({ok:false,error:e instanceof Error?e.message:'Action failed. Please retry.'});}});
  act('watch',(body,p)=>{const r=member(String(body.id),p);for(const joined of socket.rooms)if(joined!==socket.id)socket.leave(joined);socket.join(r.id);r.players.find(x=>x.id===p.id)!.online=true;broadcast(r);return view(r);});
  act('settings',(body,p)=>{const r=member(String(body.id),p);if(r.hostId!==p.id||r.state!=='lobby')throw new Error('Only the host can change settings before the match.');const settings=validateSettings(body.settings);if(settings.ranked&&r.players.some(x=>x.bot))throw new Error('Practice matches do not change Elo.');r.settings=settings;r.players.forEach(x=>x.ready=x.bot);broadcast(r);});
  act('ready',(body,p)=>{const r=member(String(body.id),p);if(r.state!=='lobby')throw new Error('This match has already started.');if(r.settings.format==='java'&&!javaAvailable)throw new Error('Connect a Java runner before starting this format.');if(!r.players.every(x=>x.online))throw new Error('Wait for both players to be connected.');r.players.find(x=>x.id===p.id)!.ready=!!body.ready;if(r.players.length===2&&r.players.every(x=>x.ready))begin(r);else broadcast(r);});
  act('answer',async(body,p)=>{
    const r=member(String(body.id),p);if(r.state!=='playing'||Date.now()>=r.deadline)throw new Error('This round has ended.');if(r.answers[p.id])throw new Error('Your answer is already locked.');
    const q=r.questions[r.round],value=typeof body.value==='string'?body.value.trim():'';
    if(!value||value.length>20000)throw new Error('Enter an answer first.');
    if(q.format==='quiz'&&!q.options?.some(o=>o.id===value))throw new Error('Choose one of the available answers.');
    if(q.format==='numeric'&&numericValue(value)===null)throw new Error('Enter a valid number.');
    const answer:Submission={value,correct:false,pending:q.format==='java'};r.answers[p.id]=answer;
    if(q.format==='java'){broadcast(r);try{const result=await judge(q,value);if(r.state!=='playing')return;answer.correct=result.passed===result.total;answer.pending=false;}catch(e){cancel(r,'Java evaluation is unavailable. The match was cancelled and no Elo changed.');throw e;}}
    else answer.correct=correct(q,value);
    broadcast(r);if(r.players.every(x=>r.answers[x.id]&&!r.answers[x.id].pending))closeRound(r);
  });
  act('next',(body,p)=>{const r=member(String(body.id),p);if(r.state!=='review')return;r.nextVotes.add(p.id);if(r.players.filter(x=>!x.bot).every(x=>r.nextVotes.has(x.id)))nextRound(r);});
  socket.on('disconnect',()=>{connections.get(id)?.delete(socket.id);if(connections.get(id)?.size)return;connections.delete(id);for(const r of rooms.values()){const p=r.players.find(x=>x.id===id);if(p){p.online=false;broadcast(r);}}const timer=setTimeout(()=>{const r=rooms.get(active.get(id)||'');if(!r)return;if(r.state==='lobby')leave(r,profile(id));else if(r.players.filter(p=>!p.bot).every(p=>!p.online))cancel(r,'Both players disconnected. No Elo changed.');else finish(r,'Opponent disconnected for over 60 seconds',id);},60000);disconnects.set(id,timer);});
});
setInterval(()=>{for(const [key,value]of rates)if(Date.now()-value.at>120000)rates.delete(key);for(const [key,r]of rooms)if(Date.now()-r.createdAt>4*3600000){if(!['finished','cancelled'].includes(r.state))cancel(r,'This room expired. Create a new challenge.');rooms.delete(key);}},60000).unref();
await mountLectures(app,{db,coursesDir});
const learning = await mountMania(app, io);
registerCourseQuestions(learning.bundle.bank.map(question => ({
  id: `ddca-${question.id}`, subject: 'ddca', topic: learning.bundle.world.cities.find(city => city.id === question.cityId)!.name,
  title: question.source.title, prompt: question.prompt, options: question.options,
  answer: question.answer, explanation: `${question.explanation} · ${question.source.lectureId.toUpperCase()} at ${Math.floor(question.source.start / 60)}:${String(Math.floor(question.source.start % 60)).padStart(2, '0')}`,
  format: 'quiz' as const, difficulty: 'standard' as const, source: `DDCA lecture-grounded practice · ${question.source.lectureId.toUpperCase()} · ${question.source.title}`,
})), { id: 'ddca', name: 'DDCA · Your knowledge world', description: 'Lecture-grounded recall across 24 cities. Challenge a friend on your current concept.' });
app.post('/api/mania/cities/:id/duel', route((req, res, p) => {
  const city = learning.bundle.world.cities.find(item => item.id === req.params.id);
  if (!city) throw new Error('That study city was not found.');
  const identity = maniaIdentity(req, res);
  if (identity.demo) throw new Error('Switch to your real profile to challenge a friend.');
  if (identity.source === 'proxy' && p.name !== identity.name) p = rename(p.id, identity.name.slice(0, 24));
  const settings = validateSettings({ subject: 'ddca', topic: city.name, format: 'quiz', difficulty: 'mixed', rounds: 3, seconds: 60, ranked: false });
  res.json(view(newRoom(p, settings)));
}));
mountSocial(app, io);
await mountManiaAnswers(app);
app.use('/api',(_req,res)=>res.status(404).json({error:'API route not found.'}));
mountStatic(app,guard);
app.use((err:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(Number.isInteger(err.status)&&err.status>=400&&err.status<600?err.status:500).json({error:err.status===404?'File not found.':'The request could not be read.'}));
http.listen(port,process.env.HOST||'0.0.0.0',()=>console.log(`VisCon + Basis Arena ready on http://localhost:${port}`));
