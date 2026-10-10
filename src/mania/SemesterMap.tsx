import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Compass, Orbit, RotateCcw } from 'lucide-react';

export interface MapCity {
  id: string; name: string; strength: number; state: string; chapters: number;
  landmark?: string | null; population?: number; storm?: boolean;
}
interface Props {
  cities: MapCity[]; roads: { from: string; to: string }[]; selected?: string;
  onSelect: (id: string) => void; galaxy: boolean; onGalaxy: (galaxy: boolean) => void;
  daysLeft: number | null; readiness: number;
}

// Orthographic projection keeps every city on the visible hemisphere. A real
// spherical grid and deterministic points require no external map services.
function project(index: number, count: number, rotation: number) {
  const row = Math.floor(index / 5), col = index % 5;
  const latitude = (row - (Math.ceil(count / 5) - 1) / 2) * 0.37;
  const longitude = (col - 2) * 0.43 + Math.sin(row * 2.7) * 0.10 + rotation;
  const z = Math.cos(latitude) * Math.cos(longitude);
  return { x: 410 + 252 * Math.cos(latitude) * Math.sin(longitude), y: 286 - 252 * Math.sin(latitude), z };
}

function Buildings({ lit }: { lit: boolean }) {
  return <g className={lit ? 'map-buildings lit' : 'map-buildings'}>
    {[[-13, 0, 10], [-3, -4, 18], [8, 1, 12], [0, 7, 8]].map(([x, y, h], i) => <g key={i}>
      <path d={`M${x},${y} l7,4 l0,${-h} l-7,-4 Z`} fill={lit ? '#8bbaaa' : '#405952'} />
      <path d={`M${x + 7},${y + 4} l6,-4 l0,${-h} l-6,4 Z`} fill={lit ? '#427965' : '#253e36'} />
      <path d={`M${x},${y - h} l6,-4 l7,4 l-6,4 Z`} fill={lit ? '#b5e3b3' : '#557068'} />
      {lit && <path d={`M${x + 2},${y - h + 5} v3 m3,-1 v3`} stroke="#deff9f" strokeWidth="1.3" />}
    </g>)}
  </g>;
}

export default function SemesterMap({ cities, roads, selected, onSelect, galaxy, onGalaxy, daysLeft, readiness }: Props) {
  const [rotation, setRotation] = useState(0);
  const points = Object.fromEntries(cities.map((city, i) => [city.id, project(i, cities.length, rotation)]));
  const [camera, setCamera] = useState([0, 0, 820, 610]);
  const cameraRef = useRef(camera);
  const selectedIndex = cities.findIndex(city => city.id === selected);
  useEffect(() => {
    const point = selectedIndex >= 0 ? project(selectedIndex, cities.length, rotation) : null;
    const target = point && !galaxy ? [Math.max(-95, Math.min(145, point.x - 350)), Math.max(-25, Math.min(110, point.y - 260)), 720, 536] : [0, 0, 820, 610];
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { cameraRef.current = target; setCamera(target); return; }
    const start = performance.now(), origin = [...cameraRef.current];
    let frame = 0;
    const animate = (now: number) => {
      const time = Math.min(1, (now - start) / 900), eased = 1 - Math.pow(1 - time, 3);
      const next = origin.map((value, i) => value + (target[i] - value) * eased);
      cameraRef.current = next; setCamera(next);
      if (time < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [selectedIndex, cities.length, rotation, galaxy]);
  return <section className={`semester-map ${galaxy ? 'galaxy' : 'planet'}`} aria-label="Interactive semester map">
    <div className="map-topline"><span><Orbit size={15} /> {galaxy ? 'BASISJAHR · SEMESTER GALAXY' : 'DDCA · KNOWLEDGE PLANET'}</span>
      <button className="map-text-button" onClick={() => onGalaxy(!galaxy)}>{galaxy ? <>Enter planet <ArrowRight size={14} /></> : <><ArrowLeft size={14} /> Semester galaxy</>}</button>
    </div>
    {galaxy ? <div className="galaxy-scene">
      <div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orbit-ring ring-three" />
      <div className="exam-sun"><div className="sun-core" /><strong>Basisprüfung</strong><span>{daysLeft === null ? 'Set your exam date below' : `${daysLeft} days to your exam`}</span></div>
      <button className="subject-planet ddca-planet" onClick={() => onGalaxy(false)}><span className="mini-planet" /><strong>DDCA</strong><span>{cities.length} cities · {readiness}% lit</span><span className="enter-planet">Explore your world <ArrowRight size={13} /></span></button>
      <div className="subject-planet algorithms-planet"><span className="mini-planet purple" /><strong>Algorithms</strong><span>Coming soon</span></div>
      <div className="subject-planet analysis-planet"><span className="mini-planet blue" /><strong>Analysis</strong><span>Coming soon</span></div>
      <div className="subject-planet programming-planet"><span className="mini-planet orange" /><strong>Programming</strong><span>Coming soon</span></div>
      <span className="galaxy-caption">A semester of knowledge. One city at a time.</span>
    </div> : <>
      <svg className="knowledge-globe" viewBox={camera.join(' ')} role="img" aria-label="DDCA cities on a spherical knowledge map">
        <defs>
          <radialGradient id="planet-surface" cx="33%" cy="27%" r="78%"><stop offset="0" stopColor="#244039" /><stop offset=".45" stopColor="#162d29" /><stop offset=".8" stopColor="#0b1e1c" /><stop offset="1" stopColor="#06100f" /></radialGradient>
          <radialGradient id="planet-halo"><stop offset=".76" stopColor="#76c6a5" stopOpacity="0" /><stop offset=".89" stopColor="#76c6a5" stopOpacity=".10" /><stop offset="1" stopColor="#76c6a5" stopOpacity="0" /></radialGradient>
          <filter id="city-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="7" /></filter>
          <clipPath id="planet-clip"><circle cx="410" cy="286" r="252" /></clipPath>
        </defs>
        <ellipse cx="410" cy="555" rx="192" ry="16" fill="#000" opacity=".28" />
        <circle cx="410" cy="286" r="291" fill="url(#planet-halo)" />
        <circle cx="410" cy="286" r="252" fill="url(#planet-surface)" stroke="#6fbaa6" strokeOpacity=".32" />
        <g clipPath="url(#planet-clip)" className="globe-grid">
          {[56, 123, 197].map(r => <ellipse key={r} cx="410" cy="286" rx={r} ry="252" />)}
          {[-175, -112, -38, 38, 112, 175].map(y => <ellipse key={y} cx="410" cy={286 + y} rx={Math.sqrt(252 ** 2 - y ** 2)} ry={Math.abs(y) * .10 + 9} />)}
          <path d="M158 286 H662" />
          {Array.from({ length: 180 }, (_, i) => { const x = 172 + (i * 137.508) % 476, y = 52 + (i * 97.7) % 475; return <circle key={i} cx={x} cy={y} r={i % 9 === 0 ? 1.3 : .6} fill="#68a087" opacity=".3" />; })}
        </g>
        <g className="map-roads">{roads.map((road, i) => { const a = points[road.from], b = points[road.to]; if (!a || !b || a.z < .15 || b.z < .15) return null;
          const thriving = cities.find(c => c.id === road.from)?.state === 'thriving' && cities.find(c => c.id === road.to)?.state === 'thriving';
          return <path key={i} d={`M${a.x} ${a.y} Q${(a.x + b.x) / 2 + 12} ${(a.y + b.y) / 2 - 12} ${b.x} ${b.y}`} className={thriving ? 'thriving' : ''} />;
        })}</g>
        {cities.map(city => { const p = points[city.id]; if (p.z < .15) return null; const lit = city.strength >= .5, focused = city.id === selected;
          return <g key={city.id} transform={`translate(${p.x} ${p.y})`} className={`globe-city ${city.state} ${focused ? 'selected' : ''}`} role="button" tabIndex={0} aria-label={`Explore ${city.name}`} onClick={() => onSelect(city.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(city.id); } }}>
            <circle r="29" fill="transparent" />
            {lit && <ellipse cy="4" rx="25" ry="12" fill="#c4ed89" opacity={city.strength * .5} filter="url(#city-glow)" />}
            <ellipse cy="7" rx="21" ry="10" fill={focused ? '#b9e98233' : '#7faf9520'} stroke={focused ? '#d4ef9b' : '#709a8066'} />
            <Buildings lit={lit} />
            {city.storm && <text y="-27" textAnchor="middle" className="storm-symbol">☁</text>}
            <text y="29" textAnchor="middle" className="city-map-name">{city.name.replace(/ City$/, '').split(' ').map((word, i) => <tspan key={i} x="0" dy={i === 0 ? 0 : 10}>{word}</tspan>)}</text>
            {city.population ? <text y="54" textAnchor="middle" className="city-map-presence">{city.population} studying</text> : null}
          </g>;
        })}
      </svg>
      <div className="map-tools"><button aria-label="Rotate globe left" onClick={() => setRotation(r => Math.max(-.4, r - .1))}><ArrowLeft size={15} /></button><Compass size={19} /><button aria-label="Rotate globe right" onClick={() => setRotation(r => Math.min(.4, r + .1))}><ArrowRight size={15} /></button><button aria-label="Reset globe rotation" onClick={() => setRotation(0)}><RotateCcw size={14} /></button></div>
    </>}
    <div className="map-legend"><span><i className="legend-dot dark" /> Unexplored</span><span><i className="legend-dot dimming" /> Dimming</span><span><i className="legend-dot lit" /> Remembered</span><span><i className="legend-dot thriving" /> Thriving</span></div>
  </section>;
}
