import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, Globe2, MapPin, RotateCcw, SkipForward } from 'lucide-react';
import type { Map, StyleSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './GlobeArrival.css';

type View = 'loading' | 'earth' | 'flight' | 'zurich' | 'unavailable';
const ZURICH: [number, number] = [8.5441, 47.3736];
const ETH: [number, number] = [8.5476, 47.3763];
const ORBIT = { center: [10, 24] as [number, number], zoom: 1.85, pitch: 0, bearing: 0 };
const DESTINATION = { center: ZURICH, zoom: 14.6, pitch: 0, bearing: 0 };

// The 2016 global mosaic is CC BY 4.0; SWISSIMAGE supplies the city detail.
// Source and licence links are recorded in public/globe/README.md.
function satelliteStyle(): StyleSpecification {
  return {
    version: 8,
    projection: { type: 'globe' },
    sources: {
      earth: {
        type: 'raster', tileSize: 256, maxzoom: 13,
        tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg'],
        attribution: '<a href="https://cloudless.eox.at">EOxCloudless</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)',
      },
      zurich: {
        type: 'raster', tileSize: 256, minzoom: 7, maxzoom: 19,
        bounds: [5.96, 45.82, 10.49, 47.81],
        tiles: ['https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg'],
        attribution: '<a href="https://www.swisstopo.admin.ch/en/swissimage">© Data: swisstopo</a>',
      },
    },
    layers: [
      { id: 'earth', type: 'raster', source: 'earth', paint: { 'raster-fade-duration': 250 } },
      { id: 'zurich', type: 'raster', source: 'zurich', minzoom: 7,
        paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0, 9, 1], 'raster-fade-duration': 300 } },
    ],
    sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.8, 3, 0.5, 6, 0] },
  };
}

export function GlobeArrival() {
  const container = useRef<HTMLDivElement>(null);
  const controls = useRef<{ replay: () => void; skip: () => void } | null>(null);
  const [view, setView] = useState<View>('loading');
  const [attempt, setAttempt] = useState(0);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let disposed = false;
    let failed = false;
    let hasRendered = false;
    let map: Map | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let resize: ResizeObserver | undefined;
    let cancelFlight = () => {};
    setView('loading');
    setRendered(false);

    const fail = () => {
      if (disposed) return;
      failed = true;
      cancelFlight();
      clearTimeout(deadline);
      setView('unavailable');
    };
    // A failed tile service or WebGL context must leave the rest of the app usable.
    deadline = setTimeout(fail, 15000);

    import('maplibre-gl').then(({ Map, Marker, AttributionControl, setWorkerUrl }) => {
      if (disposed || failed || !container.current) return;
      setWorkerUrl(workerUrl);
      map = new Map({
        container: container.current,
        style: satelliteStyle(),
        ...ORBIT,
        interactive: false,
        attributionControl: false,
        canvasContextAttributes: { antialias: true },
      });
      map.addControl(new AttributionControl({ compact: false }), 'bottom-right');
      map.getCanvas().setAttribute('aria-label', 'Satellite globe, zooming into an overhead view of Zürich');
      map.getCanvas().setAttribute('tabindex', '-1');

      const pin = document.createElement('div');
      pin.className = 'arrival-campus-pin';
      pin.innerHTML = '<span class="arrival-pin-dot"></span><span class="arrival-pin-label"><strong>ETH Zürich</strong><small>Zentrum campus</small></span>';
      const marker = document.createElement('div');
      marker.setAttribute('aria-hidden', 'true');
      marker.appendChild(pin);
      new Marker({ element: marker, anchor: 'center' }).setLngLat(ETH).addTo(map);
      const activeMap = map;
      const compact = () => activeMap.getContainer().clientWidth <= 700;
      const orbit = () => ({ ...ORBIT, zoom: compact() ? 0.8 : ORBIT.zoom });
      const padding = () => !compact()
        ? { left: 280, right: 24, top: 0, bottom: 0 }
        : { left: 0, right: 0, top: 0, bottom: 260 };
      activeMap.jumpTo({ ...orbit(), padding: padding() });

      let arrived = false;
      let moveEnd: (() => void) | undefined;
      cancelFlight = () => {
        clearTimeout(timer);
        if (moveEnd) activeMap.off('moveend', moveEnd);
        moveEnd = undefined;
        activeMap.stop();
      };
      const arrive = () => {
        if (disposed) return;
        arrived = true;
        setView('zurich');
      };
      const skip = () => {
        cancelFlight();
        activeMap.jumpTo({ ...DESTINATION, padding: padding() });
        arrive();
      };
      const replay = () => {
        cancelFlight();
        arrived = false;
        if (reducedMotion.matches) { skip(); return; }
        setView('earth');
        activeMap.jumpTo({ ...orbit(), padding: padding() });
        timer = setTimeout(() => {
          if (disposed) return;
          setView('flight');
          moveEnd = () => {
            if (disposed) return;
            activeMap.off('moveend', moveEnd!);
            moveEnd = arrive;
            activeMap.once('moveend', moveEnd);
            activeMap.easeTo({ ...DESTINATION, padding: padding(), duration: 6400,
              easing: t => t * t * (3 - 2 * t) });
          };
          activeMap.once('moveend', moveEnd);
          activeMap.easeTo({ center: ZURICH, zoom: compact() ? 2 : 2.6, duration: 2200, easing: t => t * t * (3 - 2 * t) });
        }, 1400);
      };
      controls.current = { replay, skip };
      activeMap.on('move', () => {
        pin.classList.toggle('is-visible', activeMap.getZoom() >= 12);
      });
      activeMap.on('webglcontextlost', fail);
      activeMap.on('error', () => {
        // Initial globe failures are fatal; individual later tiles can recover.
        if (!hasRendered) fail();
      });
      activeMap.once('idle', () => {
        if (disposed || failed) return;
        clearTimeout(deadline);
        hasRendered = true;
        setRendered(true);
        replay();
      });
      const motionChange = () => { if (reducedMotion.matches) skip(); };
      reducedMotion.addEventListener('change', motionChange);
      resize = new ResizeObserver(() => {
        activeMap.resize();
        if (arrived) activeMap.jumpTo({ ...DESTINATION, padding: padding() });
      });
      resize.observe(container.current);
      // Remove the preference listener alongside the map, including StrictMode remounts.
      activeMap.once('remove', () => reducedMotion.removeEventListener('change', motionChange));
    }).catch(fail);

    return () => {
      disposed = true;
      cancelFlight();
      clearTimeout(timer);
      clearTimeout(deadline);
      resize?.disconnect();
      controls.current = null;
      map?.remove();
    };
  }, [attempt]);

  const unavailable = view === 'unavailable';
  const flying = view === 'earth' || view === 'flight';
  return <section className="globe-arrival" data-view={view} aria-label="Welcome to Zürich">
    <div className="arrival-stars" aria-hidden="true" />
    <div className={`arrival-placeholder ${rendered && !unavailable ? 'is-hidden' : ''}`} aria-hidden="true"><div /></div>
    <div ref={container} className={`arrival-map ${unavailable ? 'is-hidden' : ''}`} />
    <div className="arrival-shade" aria-hidden="true" />
    <div className="arrival-topline"><span><Globe2 size={15} /> A world of learning</span>
      {flying && <button onClick={() => controls.current?.skip()}>Skip intro <SkipForward size={14} /></button>}
      {view === 'zurich' && <button onClick={() => controls.current?.replay()}>Replay journey <RotateCcw size={14} /></button>}
      {unavailable && <button onClick={() => setAttempt(value => value + 1)}>Try again <RotateCcw size={14} /></button>}
    </div>
    <div className="arrival-copy"><span className="arrival-eyebrow">VISCON · ETH ZÜRICH</span><h2>Your world.<br />Your campus.</h2><p>From a new question<br />to a new understanding.</p><div className="arrival-actions"><a className="arrival-primary" href="/learn">Open learning chat <ArrowUpRight size={17} /></a><a className="arrival-secondary" href="/arena#arena-start">Enter Arena <ArrowDown size={16} /></a></div></div>
    <div className="arrival-location" role="status"><span className="arrival-location-dot" /><span>{view === 'loading' ? 'Preparing your journey…' : unavailable ? 'Satellite view unavailable' : view === 'earth' ? 'Earth' : view === 'flight' ? 'Approaching Zürich' : 'Zürich, Switzerland'}<small>{view === 'zurich' ? '47.3763° N · 8.5476° E' : unavailable ? 'You can still open the chat or Arena.' : 'EARTH → EUROPE → ZÜRICH'}</small></span>{view === 'zurich' && <MapPin size={16} />}</div>
    {(!rendered || unavailable) && <div className="arrival-fallback-credit"><a href="https://cloudless.eox.at">EOxCloudless</a> by EOX IT Services GmbH · Copernicus Sentinel data 2016</div>}
  </section>;
}
