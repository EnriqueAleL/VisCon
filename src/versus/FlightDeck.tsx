import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { Profile, RoomView } from '../../shared/types';
import { combatExchange, type CombatExchange } from './combat';
import './cockpit.css';

type Universe = { origin?: number[]; rotation?: number[]; courses: { id: string; name: string; color: number; position?: number[] }[]; nearRotation?: number[]; farRotation?: number[] };
type SceneOptions = { reduced: boolean; paused: boolean; battle: boolean; reviewing: boolean; universe?: Universe };
type CockpitScene = { look: (x: number, y: number) => void; reset: () => void; update: (options: SceneOptions) => void; fire: (event: CombatExchange) => void; dispose: () => void };
declare global {
  interface Window { GalaxyAPI?: { load: () => Promise<{ courses: Universe["courses"] }> }; VisConDuel?: { createCockpit: (canvas: HTMLCanvasElement, options: SceneOptions) => CockpitScene }; VisConAudio?: { playCombat: (event: CombatExchange) => void }; }
}
let library: Promise<void> | undefined;
function script(src: string) {
  return new Promise<void>((resolve, reject) => {
    const element = document.createElement('script');
    element.src = src; element.async = true;
    element.onload = () => resolve();
    element.onerror = () => { element.remove(); reject(new Error('Unable to load flight view')); };
    document.head.append(element);
  });
}
function loadScene() {
  library ??= (async () => {
    if (!('THREE' in window)) await script('/galaxy/vendor/three/three.min.js');
    if (!window.VisConDuel) await script('/galaxy/duel-scene.js');
    if (!window.GalaxyAPI) await script('/galaxy/api.js');
  })().catch(error => { library = undefined; throw error; });
  return library;
}

async function loadUniverse(): Promise<Universe> {
  try {
    const value = JSON.parse(sessionStorage.getItem('viscon-cabin-universe') || 'null');
    const vector = (v: unknown, length: number) => Array.isArray(v) && v.length === length && v.every(n => typeof n === 'number' && Number.isFinite(n));
    if (value && vector(value.origin, 3) && vector(value.rotation, 4) && Array.isArray(value.courses)
      && value.courses.length <= 50 && value.courses.every((c: Universe['courses'][number]) => typeof c.id === 'string' && Number.isFinite(c.color) && vector(c.position, 3))) {
      return { ...value, nearRotation: vector(value.nearRotation, 3) ? value.nearRotation : undefined, farRotation: vector(value.farRotation, 3) ? value.farRotation : undefined };
    }
  } catch { /* The live course catalogue is also a direct-entry fallback. */ }
  try { return { courses: (await window.GalaxyAPI!.load()).courses }; } catch { return { courses: [] }; }
}

export function FlightDeck({ room, me, consoleOpen, onConsole, onReady }: { room: RoomView | null; me: Profile; consoleOpen: boolean; onConsole: () => void; onReady: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<CockpitScene | null>(null);
  const [available, setAvailable] = useState(true);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [pulse, setPulse] = useState('idle');
  const opponent = room?.players.find(player => player.id !== me.id);
  const battle = Boolean(room && ['countdown', 'playing', 'review'].includes(room.state));
  const review = room?.state === 'review';
  const latest = review ? room.completed[room.round] : undefined;
  const exchange = combatExchange(latest, me.id, opponent?.id || '');
  const options = useRef({ reduced, paused, battle, reviewing: review });
  options.current = { reduced, paused, battle, reviewing: review };
  // Starting from the current count avoids replaying historical hits on reconnect/reload.
  const seen = useRef({ room: room?.id, count: room?.completed.length || 0 });

  useEffect(() => { if (ready || !available) onReady(); }, [ready, available, onReady]);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    let disposed = false;
    const element = canvas.current!;
    const lost = (event: Event) => {
      event.preventDefault(); scene.current?.dispose(); scene.current = null; setAvailable(false);
    };
    element.addEventListener('webglcontextlost', lost);
    loadScene().then(loadUniverse).then(universe => {
      if (disposed) return;
      try {
        scene.current = window.VisConDuel!.createCockpit(element, { ...options.current, universe });
        setReady(true);
      } catch { setAvailable(false); }
    }).catch(() => { if (!disposed) setAvailable(false); });
    return () => { disposed = true; element.removeEventListener('webglcontextlost', lost); scene.current?.dispose(); scene.current = null; };
  }, []);
  useEffect(() => {
    scene.current?.update({ reduced, paused, battle, reviewing: review });
    if (reduced || paused) setPulse('idle');
  }, [reduced, paused, battle, review, ready]);
  useEffect(() => {
    const count = room?.completed.length || 0;
    if (!review) setPulse('idle');
    if (seen.current.room !== room?.id) {
      seen.current = { room: room?.id, count };
      setPulse('idle');
      return;
    }
    const isNew = count > seen.current.count;
    seen.current.count = count;
    if (!isNew || !latest || !review || reduced || paused) return;
    scene.current?.fire(exchange);
    window.VisConAudio?.playCombat(exchange);
    setPulse(exchange.kind);
    const timer = setTimeout(() => setPulse('idle'), 1700);
    return () => clearTimeout(timer);
  // Counts and stable room/round identity drive a single burst, not socket broadcasts.
  }, [room?.id, room?.completed.length, room?.round, review, reduced, paused]);

  const status = review ? exchange.message
    : room?.state === 'finished' ? room.outcome?.winnerId === me.id ? 'Duel won · stand down' : room.outcome?.winnerId ? 'Duel complete · stand down' : 'Duel drawn · stand down'
    : room?.state === 'cancelled' ? 'Duel cancelled · weapons offline'
    : room?.state === 'countdown' ? 'Duel starting · acquire target'
    : room?.state === 'playing' ? room.submitted[me.id] ? 'Answer locked · waiting for round result' : 'Target acquired · solve to fire'
    : opponent ? 'Opponent connected · prepare for launch' : 'Flight deck ready · invite a pilot or practise';
  return (
    <section className={`flight-deck ${!available ? 'flight-deck-fallback' : ''}`}
      aria-label="Ship cockpit" aria-busy={available && !ready} data-renderer={!available ? 'fallback' : ready ? 'webgl' : 'loading'} data-combat={review ? exchange.kind : 'idle'} data-pulse={pulse}>
      <div className="cockpit-window">
        <canvas ref={canvas} className="cockpit-scene" role="img" tabIndex={available ? 0 : -1}
          aria-label="Inside the ship, behind the seated pilot. Drag or use arrow keys to look around. Press Home to reset the view."
          onKeyDown={event => {
            const moves: Record<string, [number, number]> = { ArrowLeft: [-.5, 0], ArrowRight: [.5, 0], ArrowUp: [0, .4], ArrowDown: [0, -.4] };
            if (moves[event.key]) { event.preventDefault(); scene.current?.look(...moves[event.key]); }
            if (event.key === 'Home') { event.preventDefault(); scene.current?.reset(); }
          }} />
        {!available && <p className="cockpit-unavailable">3D view unavailable. Your duel and combat results remain active.</p>}
        {available && !ready && <p className="cockpit-unavailable" role="status">Entering the cockpit…</p>}
        <div className="cockpit-impact" aria-hidden="true" />
      </div>
      <div className="cabin-controls">
        <button onClick={onConsole} aria-expanded={consoleOpen} aria-controls="main">
          {consoleOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          {consoleOpen ? 'Explore cockpit' : 'Open console'}
        </button>
        <button onClick={() => scene.current?.reset()} aria-label="Reset cockpit view" disabled={!available}><RotateCcw size={16} /></button>
        <button className="cockpit-motion" onClick={() => setPaused(value => !value)} aria-pressed={paused}
          aria-label={paused ? 'Resume cockpit effects' : 'Pause cockpit effects'} disabled={reduced || !available} title={reduced ? 'Reduced motion enabled' : undefined}>
          {paused || reduced ? <Play size={15} /> : <Pause size={15} />}
        </button>
      </div>
      <p className="cabin-status" role="status">{status}</p>
    </section>
  );
}
