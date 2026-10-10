/* Lernraum Galaxie
 *
 * Three levels of one zoom: galaxy (courses) -> planet (lectures) -> city (chapters).
 * Galaxy and planet are the same scene, so moving between them is a true camera
 * dolly. A planet surface and a city street are ~4 orders of magnitude apart, far
 * enough that one scene would lose float precision, so landing swaps scenes behind
 * a veil that belongs to the trip: the cloud deck on the way down or up, a tunnel
 * between towns (transitions.js).
 */
(function () {
  "use strict";

  var loadingEl = document.getElementById("loading");
  var loadingText = document.getElementById("loading-text");

  function fail(message) {
    loadingEl.classList.remove("gone");
    loadingEl.classList.add("failed");
    loadingText.textContent = message;
  }

  function hasWebGL() {
    try {
      var c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch (e) {
      return false;
    }
  }

  if (!window.THREE) {
    fail("Die 3D-Bibliothek wurde nicht geladen. Lade die Seite neu.");
    return;
  }
  if (!hasWebGL()) {
    fail("Dieser Browser kann kein WebGL darstellen. Die Vorlesungen sind im normalen Lernraum erreichbar.");
    return;
  }

  loadingText.textContent = "Lernraum wird geladen";
  /* The Liste view (/learn) keeps its selection under this key, so both views open on the same course. */
  var SELECTION_KEY = "viscon.selected-course.v1";
  var PROGRAMME_KEY = "viscon.galaxy-programme.v1";
  function readStored(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function writeStored(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* private mode: the choice just isn't remembered */ }
  }
  function programmeOf(course) {
    return { department: course.department, degree: course.degree, studyYear: course.studyYear };
  }
  function inProgramme(course, p) {
    return !!p && course.department === p.department && course.degree === p.degree && course.studyYear === p.studyYear;
  }
  function programmeLabel(p, departments) {
    if (p.department === "other") return "Weitere Fächer";
    return p.department + " · " + (p.degree === "msc" ? "MSc" : "BSc") + " · " + p.studyYear + ". Jahr";
  }

  window.GalaxyAPI.load().then(function (loaded) {
    var all = loaded.courses, departments = loaded.departments;
    var hashCourse = String(location.hash || "").replace(/^#\/?/, "").split("/")[0];
    var linked = all.filter(function (c) { return c.id === hashCourse; })[0];
    var remembered = [readStored(PROGRAMME_KEY), readStored(SELECTION_KEY)].filter(function (p) {
      return p && all.some(function (c) { return inProgramme(c, p); });
    })[0];
    var programme = linked ? programmeOf(linked) : remembered ? { department: remembered.department, degree: remembered.degree, studyYear: remembered.studyYear } : null;

    function begin(chosen) {
      writeStored(PROGRAMME_KEY, chosen);
      try {
        start(all.filter(function (c) { return inProgramme(c, chosen); }), {
          programme: chosen,
          label: programmeLabel(chosen, departments),
          change: function () {
            writeStored(PROGRAMME_KEY, null);
            writeStored(SELECTION_KEY, null);
            history.replaceState(null, "", location.pathname);
            location.reload();
          }
        });
      } catch (err) {
        fail("Die Galaxie konnte nicht aufgebaut werden: " + err.message);
        throw err;
      }
    }

    var options = [];
    all.forEach(function (c) {
      if (!options.some(function (p) { return inProgramme(c, p); })) options.push(programmeOf(c));
    });
    if (programme) begin(programme);
    else if (options.length === 1) begin(options[0]);
    else chooseProgramme(all, departments, options, begin);
  }).catch(function (err) {
    fail(err.message || "Der Lernraum ist gerade nicht erreichbar.");
  });

  /* Step 1: department, step 2: degree and study year. The planets (the actual courses) are step 3. */
  function chooseProgramme(all, departments, options, done) {
    var gate = document.getElementById("gate");
    var title = document.getElementById("gate-title");
    var crumbs = document.getElementById("gate-crumbs");
    var list = document.getElementById("gate-list");
    var department = null;

    function deptName(id) {
      if (id === "other") return "Weitere Fächer";
      var found = departments.filter(function (d) { return d.id === id; })[0];
      return found ? id + " · " + found.name : id;
    }
    function choice(label, count, onClick) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "gate-option";
      var name = document.createElement("span");
      name.textContent = label;
      var n = document.createElement("span");
      n.className = "gate-count";
      n.textContent = count + (count === 1 ? " Kurs" : " Kurse");
      b.append(name, n);
      b.addEventListener("click", onClick);
      return b;
    }
    function coursesIn(p) { return all.filter(function (c) { return inProgramme(c, p); }).length; }

    function showDepartments() {
      department = null;
      title.textContent = "Departement wählen";
      crumbs.replaceChildren();
      list.replaceChildren();
      var ids = [];
      options.forEach(function (p) { if (ids.indexOf(p.department) < 0) ids.push(p.department); });
      var order = departments.map(function (d) { return d.id; });
      ids.sort(function (a, b) {
        var ia = a === "other" ? 999 : order.indexOf(a), ib = b === "other" ? 999 : order.indexOf(b);
        return ia - ib || (a < b ? -1 : 1);
      });
      ids.forEach(function (id) {
        var count = all.filter(function (c) { return c.department === id; }).length;
        list.append(choice(deptName(id), count, function () { showYears(id); }));
      });
      focusFirst();
    }
    function showYears(id) {
      var mine = options.filter(function (p) { return p.department === id; });
      if (mine.length === 1) return done(mine[0]);   // nothing left to choose
      department = id;
      title.textContent = "Studienjahr wählen";
      crumbs.replaceChildren();
      var back = document.createElement("button");
      back.type = "button";
      back.className = "crumb";
      back.textContent = id === "other" ? "Weitere Fächer" : id;
      back.addEventListener("click", showDepartments);
      crumbs.append(back);
      list.replaceChildren();
      mine.sort(function (a, b) { return (a.degree === b.degree ? 0 : a.degree === "bsc" ? -1 : 1) || a.studyYear - b.studyYear; });
      mine.forEach(function (p) {
        list.append(choice((p.degree === "msc" ? "Master" : "Bachelor") + " · " + p.studyYear + ". Jahr", coursesIn(p), function () { done(p); }));
      });
      focusFirst();
    }
    function focusFirst() { var b = list.querySelector("button"); if (b) b.focus({ preventScroll: true }); }

    loadingEl.classList.add("gone");
    gate.hidden = false;
    showDepartments();
  }

  function start(DATA, context) {

  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // One look per course, shared by its planet and its cities (themes.js)
  var THEMES = window.GalaxyThemes.assign(DATA);

  var mmss = function (s) { return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0"); };
  var mins = function (s) { return Math.round(s / 60) + " min"; };

  /* ============================================================
     RENDERER
     ============================================================ */
  var canvas = document.getElementById("scene");
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
  renderer.setClearColor(0x070a12, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  var camera = new THREE.PerspectiveCamera(52, 1, 0.1, 4000);
  var target = new THREE.Vector3(0, 0, 0);
  var sky = new THREE.Scene();      // galaxy and planets
  var ground = new THREE.Scene();   // one landed city
  var activeScene = sky;

  function discTexture(inner, outer) {
    var c = document.createElement("canvas");
    c.width = c.height = 128;
    var ctx = c.getContext("2d");
    var g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, inner);
    g.addColorStop(0.42, outer);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  var STAR_TEX = discTexture("rgba(255,255,255,1)", "rgba(255,255,255,.35)");
  var GLOW_TEX = discTexture("rgba(255,255,255,.95)", "rgba(255,255,255,.22)");

  // Weather badges over planet cities, drawn once: a sun, a cloud, a storm cloud
  function badgeTexture(kind) {
    var c = document.createElement("canvas");
    c.width = c.height = 64;
    var ctx = c.getContext("2d");
    function cloud(fill) {
      ctx.fillStyle = fill;
      [[22, 36, 12], [34, 30, 14], [46, 37, 11], [33, 41, 12]].forEach(function (b) {
        ctx.beginPath(); ctx.arc(b[0], b[1], b[2], 0, Math.PI * 2); ctx.fill();
      });
    }
    if (kind === "sunny") {
      ctx.strokeStyle = "#ffd25a"; ctx.lineWidth = 4;
      for (var r = 0; r < 8; r++) {
        var a = r * Math.PI / 4;
        ctx.beginPath(); ctx.moveTo(32 + Math.cos(a) * 17, 32 + Math.sin(a) * 17); ctx.lineTo(32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26); ctx.stroke();
      }
      ctx.fillStyle = "#ffc93c"; ctx.beginPath(); ctx.arc(32, 32, 13, 0, Math.PI * 2); ctx.fill();
    } else if (kind === "overcast") {
      cloud("#c9d0d6");
    } else {
      cloud("#59626b");
      ctx.fillStyle = "#ffd25a";
      ctx.beginPath(); ctx.moveTo(34, 44); ctx.lineTo(27, 58); ctx.lineTo(33, 56); ctx.lineTo(30, 64); ctx.lineTo(40, 50); ctx.lineTo(34, 52); ctx.closePath(); ctx.fill();
    }
    return new THREE.CanvasTexture(c);
  }
  var BADGES = { sunny: badgeTexture("sunny"), overcast: badgeTexture("overcast"), storm: badgeTexture("storm") };
  var WEATHER_GLYPH = { sunny: "☀ ", overcast: "☁ ", storm: "⛈ " };
  function setWeatherBadge(city, kind) {
    city.weather = kind;
    city.badge.visible = !!BADGES[kind];
    if (BADGES[kind] && city.badge.material.map !== BADGES[kind]) {
      city.badge.material.map = BADGES[kind];
      city.badge.material.needsUpdate = true;
    }
  }

  /* ============================================================
     GALAXY
     ============================================================ */
  function starfield(count, spread, size, opacity) {
    return window.VisConDuel.starfield(THREE, count, spread, size, opacity, STAR_TEX);
  }

  var starNear = starfield(1400, 420, 2.4, 0.95);
  var starFar = starfield(2600, 1500, 5.0, 0.55);
  sky.add(starNear, starFar);

  // One nebula per course, so the galaxy's ambient colour is this semester's palette
  DATA.slice(0, 4).forEach(function (course, i) {
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: GLOW_TEX, color: course.color, transparent: true, opacity: 0.1,
      depthWrite: false, blending: THREE.AdditiveBlending
    }));
    sp.position.set(-260 + i * 190, 40 - i * 60, -330 - i * 60);
    sp.scale.set(560 + i * 40, 560 + i * 40, 1);
    sky.add(sp);
  });

  var duelShip = window.VisConDuel.createShip(THREE, 0x8daaff);
  var shipOrbitX = -122 + Math.random() * 8;
  var shipHome = new THREE.Vector3(shipOrbitX * Math.min(1, Math.pow(innerWidth / 800, 2)), 66, 14);
  duelShip.position.copy(shipHome); duelShip.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(shipHome, new THREE.Vector3(), new THREE.Vector3(0, 1, 0))); duelShip.scale.setScalar(2.5);
  sky.add(duelShip);
  var shipHit = new THREE.Mesh(new THREE.SphereGeometry(7.5, 12, 8), new THREE.MeshBasicMaterial({visible: false}));
  duelShip.add(shipHit);
  var shipLight = new THREE.PointLight(0xdde8ff, 2.5, 130);
  shipLight.position.set(-105, 100, 60); sky.add(shipLight);
  var shipButton = document.getElementById("board-versus");
  var boardingStatus = document.getElementById("boarding-status");
  var boarding = false, beforeBoarding = null, boardingFlight = null, shipCabin = null, boardingArrived = false;

  // A distant, self-contained skirmish gives the course system some life. It is
  // scenery only: the selectable Versus ship and live match state stay separate.
  var ambience = new THREE.Group();
  sky.add(ambience);
  var patrols = [0x8daaff, 0xe2b48d].map(function (color) {
    var ship = window.VisConDuel.createShip(THREE, color);
    ship.scale.setScalar(1.55);
    ambience.add(ship);
    return ship;
  });
  var patrolCentre = new THREE.Vector3(innerWidth < 600 ? 28 : 110, -10, -110);
  var patrolLight = new THREE.PointLight(0xdce7ff, 4.5, 140);
  patrolLight.position.set(0, 24, 45);
  ambience.add(patrolLight);
  var patrolAim = new THREE.Matrix4();
  var patrolUp = new THREE.Vector3(0, 1, 0);
  var laserColors = [0xaec5ff, 0xffc696];
  var laserTmp = new THREE.Vector3();
  var laserEnd = new THREE.Vector3();
  var lasers = patrols.map(function (_, i) {
    var positions = new Float32Array(6);
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    var line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
      color: laserColors[i], transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending
    }));
    line.frustumCulled = false;
    ambience.add(line);
    var spark = new THREE.Sprite(new THREE.SpriteMaterial({
      map: GLOW_TEX, color: laserColors[i], transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending
    }));
    spark.scale.set(7, 7, 1);
    ambience.add(spark);
    return { line: line, positions: positions, spark: spark };
  });
  var travellers = [];
  var travellerPositions = new Float32Array(12 * 6);
  for (var travellerIndex = 0; travellerIndex < 12; travellerIndex++) {
    travellers.push({
      phase: (travellerIndex * 0.61803398875) % 1,
      speed: 0.018 + (travellerIndex % 4) * 0.006,
      y: -35 + ((travellerIndex * 79) % 190),
      z: -220 - (travellerIndex % 4) * 55
    });
  }
  var travellerGeometry = new THREE.BufferGeometry();
  travellerGeometry.setAttribute("position", new THREE.BufferAttribute(travellerPositions, 3));
  var travellerLines = new THREE.LineSegments(travellerGeometry, new THREE.LineBasicMaterial({
    color: 0xa8c8ef, transparent: true, opacity: 0.58,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  travellerLines.frustumCulled = false;
  ambience.add(travellerLines);

  function moveAmbience(t) {
    patrolLight.position.set(patrolCentre.x, patrolCentre.y + 28, patrolCentre.z + 45);
    patrols[0].position.set(patrolCentre.x - 22 + Math.sin(t * .42) * 12,
      patrolCentre.y + Math.sin(t * .78) * 8, patrolCentre.z + Math.cos(t * .42) * 10);
    patrols[1].position.set(patrolCentre.x + 22 + Math.cos(t * .48) * 12,
      patrolCentre.y + Math.cos(t * .69) * 9, patrolCentre.z - Math.sin(t * .48) * 11);
    patrols.forEach(function (ship, i) {
      ship.quaternion.setFromRotationMatrix(patrolAim.lookAt(ship.position, patrols[1 - i].position, patrolUp));
      ship.rotateZ(Math.sin(t * 1.1 + i * 2) * .16);
      ship.userData.engines.forEach(function (engine, j) {
        engine.scale.y = .72 + Math.sin(t * 9 + i * 3 + j) * .15;
      });
    });
    lasers.forEach(function (shot, i) {
      var phase = ((t * .75 + i * .52) % 1 + 1) % 1;
      shot.line.material.opacity = phase < .22 ? Math.sin(phase / .22 * Math.PI) * .9 : 0;
      shot.spark.material.opacity = shot.line.material.opacity * .8;
      if (phase >= .22) return;
      laserTmp.copy(patrols[i].position).lerp(patrols[1 - i].position, phase / .22 * .82);
      laserEnd.copy(patrols[i].position).lerp(patrols[1 - i].position, Math.min(1, phase / .22 * .82 + .14));
      shot.spark.position.copy(laserEnd);
      shot.positions.set([laserTmp.x, laserTmp.y, laserTmp.z, laserEnd.x, laserEnd.y, laserEnd.z]);
      shot.line.geometry.attributes.position.needsUpdate = true;
    });
    travellers.forEach(function (star, i) {
      var progress = (star.phase + t * star.speed) % 1;
      var x = -350 + progress * 700;
      var y = star.y + Math.sin(progress * Math.PI * 2 + i) * 9;
      var at = i * 6;
      travellerPositions[at] = x - 9;
      travellerPositions[at + 1] = y - 2;
      travellerPositions[at + 2] = star.z;
      travellerPositions[at + 3] = x;
      travellerPositions[at + 4] = y;
      travellerPositions[at + 5] = star.z;
    });
    travellerGeometry.attributes.position.needsUpdate = true;
  }

  var PLANET_VERT = [
    "varying vec3 vN; varying vec3 vP; varying vec3 vV;",
    "void main() {",
    "  vN = normalize(normalMatrix * normal);",
    "  vP = position;",
    "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
    "  vV = -mv.xyz;",
    "  gl_Position = projectionMatrix * mv;",
    "}"
  ].join("\n");

  var PLANET_FRAG = [
    "uniform vec3 uColor; uniform float uTime;",
    // Theme surface: oceans below the sea level, land rising to highlands, polar ice, dune bands
    "uniform vec3 uOcean; uniform vec3 uLand; uniform vec3 uHigh;",
    "uniform float uSea; uniform float uIce; uniform float uBands;",
    "varying vec3 vN; varying vec3 vP; varying vec3 vV;",
    "float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }",
    "float noise(vec3 p){",
    "  vec3 i = floor(p), f = fract(p);",
    "  f = f * f * (3.0 - 2.0 * f);",
    "  return mix(",
    "    mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),",
    "    mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y),",
    "    f.z);",
    "}",
    "float fbm(vec3 p){",
    "  float v = 0.0, a = 0.5;",
    "  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; }",
    "  return v;",
    "}",
    "void main() {",
    "  vec3 n = normalize(vN), v = normalize(vV);",
    "  float fres = pow(1.0 - max(dot(n, v), 0.0), 2.6);",
    "  vec3 p = normalize(vP);",
    "  float h = fbm(p * 2.2 + vec3(3.1)) * 0.75 + fbm(p * 6.0) * 0.25;",
    "  h = mix(h, h * 0.55 + 0.45 * (0.5 + 0.5 * sin(p.y * 18.0 + fbm(p * 3.0) * 6.0)), uBands);",
    // Soft coast and ice edges: hard cut-offs on value noise show its grid as blocks
    "  vec3 water = mix(uOcean * 0.55, uOcean, smoothstep(uSea - 0.25, uSea, h));",
    "  vec3 land = mix(uLand, uHigh, smoothstep(uSea + 0.05, uSea + 0.32, h));",
    "  vec3 surf = mix(water, land, smoothstep(uSea - 0.02, uSea + 0.02, h));",
    "  float lat = abs(p.y) + (fbm(p * 4.0 + vec3(7.3)) - 0.5) * 0.22;",
    "  surf = mix(surf, vec3(0.93, 0.96, 0.98), step(0.001, uIce) * smoothstep(0.9 - uIce, 1.1 - uIce, lat));",
    "  float wisps = smoothstep(0.58, 0.78, fbm(p * 3.4 + vec3(uTime * 0.02, 0.0, uTime * 0.01)));",
    "  surf = mix(surf, vec3(1.0), wisps * 0.5);",
    "  vec3 L = normalize(vec3(0.55, 0.78, 0.45));",
    "  float lam = max(dot(n, L), 0.0);",
    "  vec3 col = surf * (0.16 + 1.04 * smoothstep(0.0, 0.6, lam));",
    // Sunlight glinting on the oceans only, and a thin bright rim where the air is thick
    "  float wet = 1.0 - smoothstep(uSea - 0.02, uSea + 0.02, h);",
    "  col += vec3(1.0, 0.97, 0.9) * pow(max(dot(reflect(-L, n), v), 0.0), 40.0) * wet * 0.6 * (1.0 - wisps);",
    "  col += uColor * fres * 0.85;",
    "  col += vec3(0.04, 0.05, 0.08) * fres;",
    "  gl_FragColor = vec4(col, 1.0);",
    "}"
  ].join("\n");

  var ATMO_FRAG = [
    "uniform vec3 uColor;",
    "varying vec3 vN; varying vec3 vP; varying vec3 vV;",
    "void main() {",
    "  float fres = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 3.2);",
    "  gl_FragColor = vec4(uColor, fres * 0.85);",
    "}"
  ].join("\n");

  var PLANET_R = 9;
  var planets = [];
  // Look down on the system from far enough out that the outermost orbit still fits
  var OUTER_ORBIT = 56 + (DATA.length - 1) * 42;
  var GALAXY_DIST = OUTER_ORBIT * 1.9 + 95;
  var GALAXY_PITCH = 0.82;

  DATA.forEach(function (course, i) {
    var pivot = new THREE.Group();
    var body = new THREE.Group();
    var orbit = 56 + i * 42;
    body.position.set(orbit, i % 2 === 1 ? -6 : 4, 0);
    pivot.rotation.y = i * 2.3;
    pivot.add(body);
    sky.add(pivot);

    var look = THEMES[i].planet;
    var mat = new THREE.ShaderMaterial({
      vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(course.color) }, uTime: { value: 0 },
        uOcean: { value: new THREE.Color(look.ocean) }, uLand: { value: new THREE.Color(look.land) },
        uHigh: { value: new THREE.Color(look.high) },
        uSea: { value: look.sea }, uIce: { value: look.ice }, uBands: { value: look.bands }
      }
    });
    var globe = new THREE.Mesh(new THREE.SphereGeometry(PLANET_R, 64, 48), mat);
    body.add(globe);

    // Some worlds wear a ring; it sits on the body, so it tilts but does not spin with the globe
    var belt = null;
    if (look.ring) {
      belt = new THREE.Mesh(
        new THREE.RingGeometry(PLANET_R * 1.45, PLANET_R * 2.1, 96),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(look.high).lerp(new THREE.Color(look.land), 0.4),
          transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false
        })
      );
      belt.rotation.set(-Math.PI / 2 + 0.38, 0, 0.2);
      body.add(belt);
    }

    var atmo = new THREE.Mesh(
      new THREE.SphereGeometry(PLANET_R * 1.16, 48, 32),
      new THREE.ShaderMaterial({
        vertexShader: PLANET_VERT, fragmentShader: ATMO_FRAG,
        uniforms: { uColor: { value: new THREE.Color(course.color) } },
        side: THREE.BackSide, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    body.add(atmo);

    var halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: GLOW_TEX, color: course.color, transparent: true, opacity: 0.42,
      depthWrite: false, blending: THREE.AdditiveBlending
    }));
    halo.scale.set(PLANET_R * 7, PLANET_R * 7, 1);
    body.add(halo);

    var pts = [];
    for (var a = 0; a <= 128; a++) {
      var t = (a / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(t) * orbit, 0, Math.sin(t) * orbit));
    }
    var ring = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: course.color, transparent: true, opacity: 0.16 })
    );
    sky.add(ring);

    var cities = [];
    course.lectures.forEach(function (lec, j) {
      // Fibonacci sphere: holds up whether a course has 2 lectures or 24
      var count = course.lectures.length;
      var y = count === 1 ? 0.2 : 0.85 - (j / (count - 1)) * 1.7;
      var band = Math.sqrt(Math.max(0, 1 - y * y));
      var theta = j * 2.399963229728653 + i * 0.7;
      var dir = new THREE.Vector3(
        Math.cos(theta) * band, y, Math.sin(theta) * band
      ).normalize();

      var node = new THREE.Group();
      node.position.copy(dir).multiplyScalar(PLANET_R);
      node.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      globe.add(node);

      // A city seen from orbit: a cluster of towers on a lit footprint, not a pin.
      var footprint = new THREE.Mesh(
        new THREE.CircleGeometry(1.15, 32),
        new THREE.MeshBasicMaterial({
          color: course.color, transparent: true, opacity: 0.28,
          blending: THREE.AdditiveBlending, depthWrite: false
        })
      );
      footprint.rotation.x = -Math.PI / 2;
      footprint.position.y = 0.012;
      node.add(footprint);

      // Micro-towers, denser at the centre, in one instanced draw call per city
      var blockCount = 44;
      var blocks = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        // Building colours from the course theme, lit only faintly in the course colour
        new THREE.MeshStandardMaterial({
          color: THEMES[i].city.walls[j % THEMES[i].city.walls.length], roughness: 0.85, metalness: 0.1,
          emissive: new THREE.Color(course.color), emissiveIntensity: 0.25
        }),
        blockCount
      );
      var bm = new THREE.Matrix4(), bq = new THREE.Quaternion();
      var bp = new THREE.Vector3(), bs2 = new THREE.Vector3();
      for (var bi = 0; bi < blockCount; bi++) {
        var ba = Math.random() * Math.PI * 2;
        var br = Math.pow(Math.random(), 0.7) * 0.95;
        var bht = 0.07 + (1 - br) * 0.42 * Math.random() + 0.05;
        bp.set(Math.cos(ba) * br, bht / 2, Math.sin(ba) * br);
        bq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
        bs2.set(0.09 + Math.random() * 0.1, bht, 0.09 + Math.random() * 0.1);
        bm.compose(bp, bq, bs2);
        blocks.setMatrixAt(bi, bm);
      }
      blocks.instanceMatrix.needsUpdate = true;
      node.add(blocks);

      // A single landmark spire marks the city at a distance
      var spire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.05, 0.42, 6),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(course.color).lerp(new THREE.Color(0xffffff), 0.55)
        })
      );
      spire.position.y = 0.22;
      node.add(spire);

      var beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.14, 0.75, 8, 1, true),
        new THREE.MeshBasicMaterial({
          color: course.color, transparent: true, opacity: 0.3,
          depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
        })
      );
      beam.position.y = 0.52;
      node.add(beam);

      var spark = new THREE.Sprite(new THREE.SpriteMaterial({
        map: GLOW_TEX, color: course.color, transparent: true, opacity: 0.85,
        depthWrite: false, blending: THREE.AdditiveBlending
      }));
      spark.scale.set(2.2, 2.2, 1);
      spark.position.y = 0.25;
      node.add(spark);

      var hit = new THREE.Mesh(
        new THREE.SphereGeometry(1.5, 12, 10),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hit.position.y = 0.4;
      node.add(hit);

      // Weather over the city (sun, cloud, storm) and a pulse when students are in it
      var badge = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      badge.scale.set(1.1, 1.1, 1);
      badge.position.y = 1.35;
      badge.visible = false;
      node.add(badge);
      var pulse = new THREE.Mesh(
        new THREE.RingGeometry(1.25, 1.5, 40),
        new THREE.MeshBasicMaterial({ color: course.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      pulse.rotation.x = -Math.PI / 2;
      pulse.position.y = 0.02;
      node.add(pulse);

      node.visible = false;
      cities.push({ node: node, hit: hit, spark: spark, lecture: lec, badge: badge, pulse: pulse, online: 0, weather: "fair", dir: dir });
    });

    // Routes between consecutive lectures, so the course reads as a journey across the planet
    var routes = new THREE.Group();
    routes.visible = false;
    globe.add(routes);
    for (var rj = 1; rj < cities.length; rj++) {
      var from = cities[rj - 1].dir, to = cities[rj].dir, pts2 = [];
      for (var sIdx = 0; sIdx <= 24; sIdx++) {
        var u = sIdx / 24;
        var v = new THREE.Vector3().copy(from).lerp(to, u).normalize();
        pts2.push(v.multiplyScalar(PLANET_R * (1.012 + Math.sin(u * Math.PI) * 0.035)));
      }
      var routeLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2),
        new THREE.LineDashedMaterial({ color: course.color, transparent: true, opacity: 0.4, dashSize: 0.35, gapSize: 0.22, depthWrite: false }));
      routeLine.computeLineDistances();
      routeLine.userData.ends = [rj - 1, rj];
      routes.add(routeLine);
    }

    planets.push({
      course: course, pivot: pivot, body: body, globe: globe, routes: routes,
      halo: halo, ring: ring, belt: belt, mat: mat, cities: cities, index: i
    });
  });

  /* ============================================================
     CITY
     ============================================================ */
  ground.fog = new THREE.FogExp2(0x070a12, 0.0032);
  var cityRoot = new THREE.Group();
  ground.add(cityRoot);
  var houses = [];

  function clearCity() {
    while (cityRoot.children.length) {
      var c = cityRoot.children.pop();
      c.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        [].concat(o.material || []).forEach(function (m) {
          // Each tower clones its window skin, so the clones have to go too
          if (m.map) m.map.dispose();
          if (m.emissiveMap && m.emissiveMap !== m.map) m.emissiveMap.dispose();
          m.dispose();
        });
      });
    }
    houses.length = 0;
  }

  // The city itself -- street grid, chapter buildings, people and traffic -- lives
  // in city.js; this keeps the hand-off to the camera, picking and labels.
  var cityView = null;
  function buildCity(courseIndex, lectureIndex) {
    clearCity();
    cityView = window.GalaxyCity.build({
      root: cityRoot, scene: ground, renderer: renderer, reduced: REDUCED, theme: THEMES[courseIndex],
      course: DATA[courseIndex], lecture: DATA[courseIndex].lectures[lectureIndex]
    });
    cityView.houses.forEach(function (h) { houses.push(h); });
    pushCityLive();
  }

  /* ============================================================
     CAMERA
     ============================================================ */
  var orbitYaw = 0, orbitPitch = 0.30, orbitDist = 232;
  var anchor = new THREE.Vector3(0, 0, 0);
  var dragging = false, lastX = 0, lastY = 0, moved = 0;
  var tween = null, locked = false;

  var easeInOut = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

  function flyTo(toAnchor, toDist, toYaw, toPitch, ms, done) {
    var fa = anchor.clone(), fd = orbitDist, fy = orbitYaw, fp = orbitPitch;
    var dy = toYaw - fy;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    tween = {
      t0: performance.now(), ms: REDUCED ? 1 : ms, done: done,
      step: function (now) {
        var t = Math.min(1, (now - this.t0) / this.ms);
        var e = easeInOut(t);
        anchor.lerpVectors(fa, toAnchor, e);
        orbitDist = fd + (toDist - fd) * e;
        orbitYaw = fy + dy * e;
        orbitPitch = fp + (toPitch - fp) * e;
        if (t >= 1) { tween = null; if (this.done) this.done(); }
      }
    };
  }

  function applyCamera() {
    var cp = Math.cos(orbitPitch), sp = Math.sin(orbitPitch);
    camera.position.set(
      anchor.x + orbitDist * cp * Math.sin(orbitYaw),
      anchor.y + orbitDist * sp,
      anchor.z + orbitDist * cp * Math.cos(orbitYaw)
    );
    target.copy(anchor);
    camera.lookAt(target);
  }

  // The sky colour of a course's towns, for the clouds you fall through on the way down
  function skyTint(courseIndex) {
    return "#" + THEMES[courseIndex].city.horizon.toString(16).padStart(6, "0");
  }
  // Lift a veil only once the new scene has really been drawn, never over a stale
  // frame: shaders are compiled up front and the reveal waits two frames
  function afterFirstFrame(fn) {
    applyCamera();
    try { renderer.compile(activeScene, camera); } catch (e) { /* compiling early is only a head start */ }
    requestAnimationFrame(function () { requestAnimationFrame(fn); });
  }
  // If anything goes wrong mid-trip, never leave the screen covered or the controls locked
  function recoverFromTrip(error) {
    console.error(error);
    locked = false;
    window.GalaxyVeil.open({ ms: 300 });
  }
  // flyTo as a promise, so a camera move and a veil can be waited on together
  function fly(toAnchor, toDist, toYaw, toPitch, ms) {
    return new Promise(function (resolve) { flyTo(toAnchor, toDist, toYaw, toPitch, ms, resolve); });
  }

  /* ============================================================
     STATE, ROUTING, HUD
     ============================================================ */
  var state = { level: "galaxy", course: null, lecture: null, segment: null };
  var hovered = null;
  var routing = false;   // true while applying an inbound URL, so we don't re-push it

  var el = {
    trail: document.getElementById("trail"),
    eyebrow: document.getElementById("eyebrow"),
    title: document.getElementById("title"),
    sub: document.getElementById("sub"),
    list: document.getElementById("list"),
    meta: document.getElementById("meta"),
    tags: document.getElementById("tags")
  };
  var changeProgramme = document.createElement("button");
  changeProgramme.id = "change-programme";
  changeProgramme.className = "change-programme";
  changeProgramme.type = "button";
  changeProgramme.textContent = "Studiengang wechseln";
  changeProgramme.addEventListener("click", context.change);
  document.getElementById("panel").append(changeProgramme);

  function accent(css) { document.documentElement.style.setProperty("--accent", css); }

  function routeOf(s) {
    if (s.course === null) return "/";
    var p = "/" + DATA[s.course].id;
    if (s.level === "city" && s.lecture !== null) {
      p += "/vl-" + DATA[s.course].lectures[s.lecture].ep;
      if (s.segment !== null) p += "/kapitel-" + (s.segment + 1);
    }
    return p;
  }

  function syncURL(replace) {
    reportHereSoon();
    if (routing) return;
    var h = "#" + routeOf(state);
    if (location.hash === h) return;
    if (replace) history.replaceState(null, "", h);
    else history.pushState(null, "", h);
  }

  function parseRoute(hash) {
    var parts = String(hash || "").replace(/^#\/?/, "").split("/").filter(Boolean);
    var ci = -1;
    for (var i = 0; i < DATA.length; i++) if (DATA[i].id === parts[0]) ci = i;
    if (ci < 0) return { level: "galaxy", course: null, lecture: null, segment: null };

    var m = /^vl-(\d+)$/.exec(parts[1] || "");
    if (!m) return { level: "planet", course: ci, lecture: null, segment: null };

    var li = -1, lex = DATA[ci].lectures;
    for (var j = 0; j < lex.length; j++) if (lex[j].ep === Number(m[1])) li = j;
    if (li < 0) return { level: "planet", course: ci, lecture: null, segment: null };

    var k = /^kapitel-(\d+)$/.exec(parts[2] || "");
    var si = null;
    if (k) {
      var want = Number(k[1]);
      if (want >= 1 && want <= lex[li].segs.length) si = want - 1;
    }
    return { level: "city", course: ci, lecture: li, segment: si };
  }

  function applyRoute(hash, instant) {
    var r = parseRoute(hash);
    routing = true;
    if (r.level === "galaxy") toGalaxy();
    else if (r.level === "planet") toPlanet(r.course);
    else {
      toCity(r.course, r.lecture, instant, function () {
        if (r.segment !== null) { routing = true; selectHouse(r.segment); routing = false; }
      });
    }
    routing = false;
  }

  function crumb(label, onClick, current) {
    var b = document.createElement("button");
    b.className = "crumb";
    b.textContent = label;
    if (current) b.setAttribute("aria-current", "true");
    if (onClick) b.addEventListener("click", onClick);
    else b.disabled = true;
    return b;
  }

  function renderTrail() {
    var versusLink = document.getElementById("versus-link");
    if (versusLink) {
      var versusParams = new URLSearchParams({ returnTo: "/#" + routeOf(state) });
      if (state.course !== null) versusParams.set("course", DATA[state.course].id);
      versusLink.href = "/arena?" + versusParams.toString();
    }
    el.trail.replaceChildren();

    var brand = document.createElement("div");
    brand.className = "brand";
    brand.textContent = "VisCon";
    var dot = document.createElement("span");
    dot.textContent = ".";
    brand.append(dot);
    el.trail.append(brand);

    // The selected programme is the course galaxy. From a planet or city,
    // this breadcrumb returns to its planets without reloading the page.
    var programmeCrumb = crumb(context.label, state.level === "galaxy" ? context.change : toGalaxy, state.level === "galaxy");
    programmeCrumb.title = state.level === "galaxy" ? "Studiengang wechseln" : "Zur Galaxie";
    el.trail.append(programmeCrumb);

    function sep() { return sepNode(); }
    function sepNode() {
      var s = document.createElement("span");
      s.className = "sep";
      s.textContent = "▸";
      return s;
    }

    // Opening a course here also selects it in the Liste view, so switching views lands on the same course
    if (state.course !== null) {
      var shown = DATA[state.course];
      writeStored(SELECTION_KEY, { courseId: shown.id, department: shown.department, degree: shown.degree, studyYear: shown.studyYear });
    }

    if (state.course !== null) {
      el.trail.append(sep(), crumb(
        DATA[state.course].short,
        state.level === "planet" ? null : function () { toPlanet(state.course); },
        state.level === "planet"
      ));
    }
    if (state.lecture !== null) {
      el.trail.append(sep(), crumb("VL " + DATA[state.course].lectures[state.lecture].ep, null, true));
    }
  }

  function renderPanel() {
    syncHop();
    changeProgramme.hidden = state.level !== "galaxy";
    el.list.replaceChildren();
    document.getElementById("panel").classList.toggle("has-course", state.course !== null);
    window.dispatchEvent(new CustomEvent("viscon:course-documents", { detail: { courseId: state.course === null ? null : DATA[state.course].id } }));

    if (state.level === "galaxy") {
      el.eyebrow.textContent = context.label + " · ETH Zürich";
      el.title.textContent = "Lernraum";
      el.sub.textContent = DATA.length + " Kurse umkreisen dich. Wähle einen Planeten, um seine Vorlesungen zu sehen.";
      DATA.forEach(function (c, i) {
        el.list.append(row(
          String(i + 1).padStart(2, "0"), c.name, c.lectures.length + " VL", false,
          function () { toPlanet(i); },
          { kind: "planet", index: i }
        ));
      });
      var total = DATA.reduce(function (n, c) {
        return n + c.lectures.reduce(function (m, l) { return m + l.segs.length; }, 0);
      }, 0);
      var cityCount = DATA.reduce(function (n, c) { return n + c.lectures.length; }, 0);
      el.meta.innerHTML = "";
      metaItem(DATA.length, "Planeten");
      metaItem(cityCount, "Städte");
      metaItem(total, "Kapitel");
      return;
    }

    var course = DATA[state.course];

    if (state.level === "planet") {
      el.eyebrow.textContent = "Kurs · Planet";
      el.title.textContent = course.name;
      el.sub.textContent = course.lecturer + " · jede Stadt ist eine Vorlesung.";
      course.lectures.forEach(function (lec, j) {
        el.list.append(row(
          String(lec.ep).padStart(2, "0"), lec.title, mins(lec.dur), false,
          function () { toCity(state.course, j); },
          { kind: "city", course: state.course, index: j }
        ));
      });
      var segs = course.lectures.reduce(function (m, l) { return m + l.segs.length; }, 0);
      el.meta.innerHTML = "";
      metaItem(course.lectures.length, "Vorlesungen");
      metaItem(segs, "Kapitel");
      return;
    }

    var lec = course.lectures[state.lecture];
    el.eyebrow.textContent = "Vorlesung " + lec.ep + " · Stadt";
    el.title.textContent = lec.title;
    el.sub.textContent = "Jedes Haus ist ein Kapitel. Die Höhe entspricht seiner Länge.";
    lec.segs.forEach(function (seg, k) {
      el.list.append(row(
        String(k + 1).padStart(2, "0"), seg.t, mmss(seg.a), state.segment === k,
        function () { selectHouse(k, true); },
        { kind: "house", index: k }
      ));
    });

    el.meta.innerHTML = "";
    if (state.segment !== null) {
      var s = lec.segs[state.segment];
      metaItem(state.segment + 1, "Kapitel", true);
      metaPair(mmss(s.a), "–" + mmss(s.b));
      metaItem(Math.round((s.b - s.a) / 60), "min");
    } else {
      metaItem(lec.segs.length, "Kapitel");
      metaPair(mins(lec.dur), " gesamt");
    }
  }

  function row(idx, text, tail, hot, onClick, hoverKey) {
    var b = document.createElement("button");
    b.className = "row" + (hot ? " hot" : "");

    var i = document.createElement("span");
    i.className = "idx";
    i.textContent = idx;

    var t = document.createElement("span");
    t.className = "txt";
    t.textContent = text;

    var a = document.createElement("span");
    a.className = "tail";
    a.textContent = tail;

    b.append(i, t, a);
    b.addEventListener("click", onClick);
    // Marked as coming from the list, so the planet can turn that city towards you
    var fromList = Object.assign({ fromList: true }, hoverKey);
    b.addEventListener("mouseenter", function () { setHover(fromList); });
    b.addEventListener("mouseleave", function () { setHover(null); });
    b.addEventListener("focus", function () { setHover(fromList); });
    b.addEventListener("blur", function () { setHover(null); });
    return b;
  }

  function metaItem(value, label, prefix) {
    var s = document.createElement("span");
    var b = document.createElement("b");
    b.textContent = value;
    if (prefix) s.append(label + " ", b);
    else s.append(b, " " + label);
    el.meta.append(s);
  }

  function metaPair(strong, rest) {
    var s = document.createElement("span");
    var b = document.createElement("b");
    b.textContent = strong;
    s.append(b, rest);
    el.meta.append(s);
  }

  /* ---------- labels projected from the scene ---------- */
  var tagPool = [];
  function tagFor(i) {
    if (!tagPool[i]) {
      var d = document.createElement("div");
      d.className = "tag";
      el.tags.append(d);
      tagPool[i] = d;
    }
    return tagPool[i];
  }

  var tmpVec = new THREE.Vector3();
  function syncTags() {
    var n = 0;
    function put(obj, label, note, cssColor, hot, offsetY) {
      var d = tagFor(n++);
      obj.getWorldPosition(tmpVec);
      tmpVec.y += offsetY || 0;
      var depth = tmpVec.distanceTo(camera.position);
      tmpVec.project(camera);
      var on = tmpVec.z < 1 && depth > 1;
      d.classList.toggle("on", on);
      d.classList.toggle("hot", !!hot);
      if (!on) return;
      d.style.left = ((tmpVec.x * 0.5 + 0.5) * window.innerWidth) + "px";
      d.style.top = ((-tmpVec.y * 0.5 + 0.5) * window.innerHeight) + "px";
      d.style.color = hot ? "#fff" : cssColor;
      d.replaceChildren(document.createTextNode(label));
      if (note) {
        var s = document.createElement("span");
        s.className = "n";
        s.textContent = note;
        d.append(s);
      }
    }

    if (activeScene === sky) {
      if (state.level === "galaxy") {
        planets.forEach(function (p, i) {
          put(p.body, p.course.short, p.course.lectures.length + " VL", p.course.css,
            hovered && hovered.kind === "planet" && hovered.index === i, PLANET_R * 1.9);
        });
      } else if (state.level === "planet") {
        var p = planets[state.course];
        var centre = new THREE.Vector3();
        p.body.getWorldPosition(centre);
        var toCam = camera.position.clone().sub(centre).normalize();
        var cityPos = new THREE.Vector3();
        p.cities.forEach(function (c, j) {
          c.node.getWorldPosition(cityPos);
          // Only label cities on the side of the globe facing us
          if (cityPos.sub(centre).normalize().dot(toCam) < 0.25) return;
          put(c.node, (WEATHER_GLYPH[c.weather] || "") + "VL " + c.lecture.ep,
            mins(c.lecture.dur) + (c.online ? " · " + c.online + " online" : ""), p.course.css,
            hovered && hovered.kind === "city" && hovered.index === j, 1.25);
        });
      }
    } else {
      var css = DATA[state.course].css;
      houses.forEach(function (h, k) {
        put(h.grp, String(k + 1).padStart(2, "0"), mmss(h.seg.a) + (h.online ? " · " + h.online + " hier" : ""), css,
          (hovered && hovered.kind === "house" && hovered.index === k) || state.segment === k,
          h.height + 3.5);
      });
      // Tunnel signs, only where a neighbouring lecture lies beyond
      if (cityView && !riding) cityView.portals.forEach(function (q) {
        var to = portalTarget(q.side);
        if (!to) return;
        put(q.grp, q.side < 0 ? "‹ VL " + to.ep : "VL " + to.ep + " ›", "Tunnel", css,
          hovered && hovered.kind === "portal" && hovered.side === q.side, q.labelY);
      });
    }
    for (var i = n; i < tagPool.length; i++) tagPool[i].classList.remove("on");
  }

  /* ============================================================
     NAVIGATION
     ============================================================ */
  function boardVersus() {
    if (boarding || locked) return;
    beforeBoarding = { anchor: anchor.clone(), distance: orbitDist, yaw: orbitYaw, pitch: orbitPitch };
    boarding = true; dragging = false; locked = true; tween = null;
    document.body.classList.add("boarding"); boardingStatus.hidden = false; shipButton.hidden = true;
    activeScene = sky;
    if (!shipCabin) {
      shipCabin = window.VisConDuel.createCabin(THREE,.45);
      shipCabin.scale.setScalar(.18); shipCabin.position.set(0,.35,-1.05);duelShip.add(shipCabin);
    }
    shipCabin.visible = true;shipLight.visible = false;
    // Lift the canopy to expose the rear hatch. The same physical cabin and
    // astronaut are visible before navigation; the camera never crosses the nose.
    duelShip.userData.canopy.visible = false;
    sky.updateMatrixWorld(true);
    var pose = window.VisConDuel.cabinPose(THREE, innerWidth);
    var eye = shipCabin.localToWorld(pose.eye.clone());
    var aim = shipCabin.localToWorld(pose.aim.clone());
    var rear = shipCabin.localToWorld(new THREE.Vector3(pose.eye.x,pose.eye.y,95));
    var up = new THREE.Vector3(0,1,0).applyQuaternion(duelShip.quaternion);
    var rearQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(rear,aim,up));
    boardingFlight={at:performance.now(),from:camera.position.clone(),rotation:camera.quaternion.clone(),rear:rear,eye:eye,aim:aim,up:up,rearQ:rearQ,fov:pose.fov};
    camera.near=.02;camera.updateProjectionMatrix();
    // Warm the next document while the current scene carries the entire move.
    var preload=document.createElement('link');preload.rel='prefetch';preload.href='/arena';document.head.append(preload);
  }
  function stepBoarding(now) {
    if (!boardingFlight) return;
    var flight=boardingFlight, t=REDUCED?1:Math.min(1,(now-flight.at)/3600);
    if(t<.5){
      var align=easeInOut(t*2);
      camera.position.lerpVectors(flight.from,flight.rear,align);
      camera.quaternion.slerpQuaternions(flight.rotation,flight.rearQ,align);
      canvas.dataset.boardingPhase='align-rear';
    } else {
      var enter=easeInOut((t-.5)*2);
      camera.position.lerpVectors(flight.rear,flight.eye,enter);
      camera.up.copy(flight.up);camera.lookAt(flight.aim);
      camera.fov=52+(flight.fov-52)*enter;camera.updateProjectionMatrix();
      canvas.dataset.boardingPhase=enter>.96?'seated':'enter-rear';
      // DOM chrome clears before the camera reaches the seated pilot.
      boardingStatus.style.opacity=String(1-Math.min(1,enter*1.8));
    }
    if(t===1 && (REDUCED || now-flight.at>4050))boardingArrived=true;
  }
  function finishBoarding() {
    boardingArrived=false;boardingFlight=null;
    sky.updateMatrixWorld(true);
    try {
      sessionStorage.setItem('viscon-cabin-universe', JSON.stringify({
        origin:duelShip.position.toArray(),rotation:duelShip.quaternion.toArray(),
        courses:planets.map(function(p){return {id:p.course.id,name:p.course.short,color:p.course.color,position:p.body.getWorldPosition(new THREE.Vector3()).toArray(),spin:p.globe.rotation.y,time:p.mat.uniforms.uTime.value};}),
        nearRotation:starNear.rotation.toArray().slice(0,3),farRotation:starFar.rotation.toArray().slice(0,3)
      }));
      // Hold this exact rendered frame across the document load, then reveal the
      // already-ready matching camera. It is a transient frame, not a shipped asset.
      sessionStorage.setItem('viscon-boarding-frame',JSON.stringify({at:Date.now(),image:canvas.toDataURL('image/jpeg',.88)}));
    } catch (_) { /* Storage restrictions must never block boarding. */ }
    var destination=new URL(document.getElementById('versus-link').href);destination.searchParams.set('entry','ship');
    location.assign(destination.pathname+destination.search);
  }
  function cancelBoarding() {
    if (!boarding) return;
    boarding = false; locked = false; tween = null; boardingFlight=null;boardingArrived=false;
    camera.up.set(0,1,0);camera.near=.1;camera.fov=52;camera.updateProjectionMatrix();
    if(shipCabin)shipCabin.visible=false;shipLight.visible=true;duelShip.userData.canopy.visible=true;
    boardingStatus.style.opacity='';delete canvas.dataset.boardingPhase;
    document.body.classList.remove("boarding"); boardingStatus.hidden = true;
    activeScene = state.level === "city" ? ground : sky;
    if (beforeBoarding) flyTo(beforeBoarding.anchor, beforeBoarding.distance, beforeBoarding.yaw, beforeBoarding.pitch, 700);
    shipButton.hidden = state.level !== "galaxy";
    shipButton.focus({preventScroll: true});
  }
  shipButton.addEventListener("click", boardVersus);
  document.getElementById("cancel-boarding").addEventListener("click", cancelBoarding);
  document.getElementById("versus-link").addEventListener("click", function(e) {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    // Planet/chapter navigation keeps its exact route context; scene entry is in galaxy view.
    if (state.level === "galaxy") {e.preventDefault(); boardVersus();}
  });
  window.addEventListener("pageshow", function(e){ if(e.persisted) cancelBoarding(); });

  function setHover(h) {
    hovered = h;
    document.body.style.cursor = h ? "pointer" : "default";
  }

  function toGalaxy() {
    if (locked) return;
    state.level = "galaxy"; state.course = null; state.lecture = null; state.segment = null;
    accent("#526cb7");
    activeScene = sky;
    document.body.classList.remove("daylight");
    planets.forEach(function (p) { p.cities.forEach(function (c) { c.node.visible = false; }); });
    flyTo(new THREE.Vector3(0, 0, 0), GALAXY_DIST, orbitYaw, GALAXY_PITCH, 1500);
    renderTrail(); renderPanel(); syncURL();
  }

  function toPlanet(i) {
    if (locked) return;
    var p = planets[i];

    if (activeScene === ground && !REDUCED) {
      // Take-off: climb straight up out of the town into the cloud deck, and come out
      // of it in orbit, close over the planet, drifting back to see it whole
      locked = true;
      var climb = anchor.clone();
      climb.y += 40;
      Promise.all([
        fly(climb, orbitDist * 2.4, orbitYaw, 1.32, 1000),
        window.GalaxyVeil.wait(250).then(function () { return window.GalaxyVeil.close("clouds", { tint: skyTint(i), ms: 750 }); })
      ]).then(function () {
        locked = false;
        enterPlanet(i, true);
        afterFirstFrame(function () { window.GalaxyVeil.open({ ms: 1300 }); });
      }).catch(recoverFromTrip);
      return;
    }
    enterPlanet(i, false);
  }

  function enterPlanet(i, fromCity) {
    var p = planets[i];
    state.level = "planet"; state.course = i; state.lecture = null; state.segment = null;
    accent(p.course.css);
    activeScene = sky;
    document.body.classList.remove("daylight");
    p.cities.forEach(function (c) { c.node.visible = true; });

    var land = new THREE.Vector3();
    p.body.getWorldPosition(land);

    if (fromCity) {
      anchor.copy(land); orbitDist = 12; orbitPitch = 0.5;
      flyTo(land, 26, orbitYaw, 0.24, 2000);
    } else {
      flyTo(land, 26, orbitYaw, 0.24, 1800);
    }
    renderTrail(); renderPanel(); syncURL();
  }

  /* Arriving in a town. How the camera arrives depends on how you travelled:
       true      straight there (a link, reduced motion)
       "clouds"  from orbit: high above the town, dropping down through the clouds
       -1 / 1    by road: out of the tunnel on that side of town, then up to see it */
  function settleInCity(courseIndex, lectureIndex, arrival, done) {
    state.level = "city";
    state.course = courseIndex;
    state.lecture = lectureIndex;
    state.segment = null;
    buildCity(courseIndex, lectureIndex);
    activeScene = ground;
    document.body.classList.add("daylight");   // the city is in daylight; the HUD follows
    var framing = Math.max(95, DATA[courseIndex].lectures[lectureIndex].segs.length * 5.6);
    var centre = new THREE.Vector3(0, 7, 0);
    function arrived() { locked = false; if (done) done(); }
    renderTrail(); renderPanel(); syncURL();

    if (arrival === true) {
      anchor.copy(centre); orbitDist = framing; orbitPitch = 0.56; orbitYaw = 0.6;
      arrived();
      return;
    }
    var portal = (arrival === -1 || arrival === 1) && cityView.portals.filter(function (q) { return q.side === arrival; })[0];
    if (portal) {
      // In the mouth of the tunnel, looking down the main street into town
      portal.grp.getWorldPosition(anchor);
      anchor.y = 4;
      anchor.x -= arrival * 6;
      orbitDist = 10; orbitPitch = 0.04; orbitYaw = arrival * Math.PI / 2;
      var street = anchor.clone();
      street.x -= arrival * 55;
      afterFirstFrame(function () {
        window.GalaxyVeil.open({ ms: 900 });
        fly(street, 22, orbitYaw, 0.12, 1300).then(function () {
          return fly(centre, framing, 0.6, 0.56, 1700);
        }).then(arrived);
      });
      return;
    }
    // From the clouds: start high and straight overhead, and settle onto the town
    anchor.copy(centre); orbitDist = framing * 3.6; orbitPitch = 1.38; orbitYaw = 0.6 - 0.8;
    afterFirstFrame(function () {
      window.GalaxyVeil.open({ ms: 1400 });
      fly(centre, framing, 0.6, 0.56, 2300).then(arrived);
    });
  }

  function toCity(courseIndex, lectureIndex, instant, done) {
    if (locked) return;
    var p = planets[courseIndex];
    p.cities.forEach(function (c) { c.node.visible = true; });
    accent(p.course.css);

    if (instant || REDUCED) {
      settleInCity(courseIndex, lectureIndex, true, done);
      return;
    }

    locked = true;
    var land = new THREE.Vector3();
    p.cities[lectureIndex].node.getWorldPosition(land);

    // Atmospheric entry: dive at the city, the clouds close in around you halfway down,
    // and the town appears below once they part
    Promise.all([
      fly(land, 6.5, orbitYaw, 0.1, 1100),
      window.GalaxyVeil.wait(450).then(function () {
        return window.GalaxyVeil.close("clouds", { tint: skyTint(courseIndex), ms: 700 });
      })
    ]).then(function () { settleInCity(courseIndex, lectureIndex, "clouds", done); }).catch(recoverFromTrip);
  }

  function selectHouse(k, play) {
    state.segment = k;
    var h = houses[k];
    if (h) {
      var to = h.grp.position.clone();
      to.y = h.height * 0.55;
      flyTo(to, 30, Math.atan2(h.grp.position.x, h.grp.position.z) + 0.9, 0.22, 1100);
    }
    renderTrail(); renderPanel(); syncURL();
    if (play && h && state.course !== null && state.lecture !== null) {
      openPlayer(DATA[state.course].lectures[state.lecture], h.seg);
    }
  }

  /* ============================================================
     PLAYER — the chapter actually opens its moment in the recording
     ============================================================ */
  var playerEl = document.getElementById("player");
  var videoEl = document.getElementById("player-video");
  var playerNote = document.getElementById("player-note");
  var playerToken = 0;

  function closePlayer() {
    playerEl.hidden = true;
    videoEl.pause();
    videoEl.removeAttribute("src");
    videoEl.load();
  }

  async function openPlayer(lecture, seg) {
    var token = ++playerToken;
    playerEl.hidden = false;
    followTime = false;
    showChapter(lecture, seg);
    playerNote.textContent = "Vorlesung wird geladen …";
    videoEl.removeAttribute("src");

    try {
      var detail = await window.GalaxyAPI.lectureDetail(lecture.id);
      if (token !== playerToken) return;
      if (!detail.mediaUrl) {
        playerNote.textContent = "Für diese Vorlesung ist keine Videodatei hinterlegt.";
        return;
      }
      playerNote.textContent = seg.summary || lecture.title;
      videoEl.src = detail.mediaUrl;
      // Seek only once the duration is known, or the position is discarded
      videoEl.addEventListener("loadedmetadata", function once() {
        videoEl.removeEventListener("loadedmetadata", once);
        videoEl.currentTime = Math.max(0, seg.a);
        var playing = videoEl.play();
        if (playing && playing.catch) playing.catch(function () { /* autoplay blocked; controls still work */ });
      });
    } catch (error) {
      if (token !== playerToken) return;
      playerNote.textContent = error.message;
    }
  }

  document.getElementById("player-close").addEventListener("click", closePlayer);
  playerEl.addEventListener("pointerdown", function (e) { if (e.target === playerEl) closePlayer(); });

  /* ============================================================
     MOVING ON — chapter to chapter in the player, lecture to lecture in the city
     ============================================================ */
  var prevBtn = document.getElementById("player-prev");
  var nextBtn = document.getElementById("player-next");
  var hopEl = document.getElementById("hop");
  var hopPrev = document.getElementById("hop-prev");
  var hopNext = document.getElementById("hop-next");
  var followTime = false;   // only track playback once the first seek has landed

  function showChapter(lecture, seg) {
    document.getElementById("player-eyebrow").textContent =
      "Vorlesung " + lecture.ep + " · ab " + mmss(seg.a);
    document.getElementById("player-title").textContent = seg.t;
    if (seg.summary) playerNote.textContent = seg.summary;
    syncPlayerNav();
    rateNote.textContent = "";
    syncRating();
  }

  // One step back or forward from the current chapter: the neighbouring chapter in
  // this recording, or across into the previous or next lecture
  function neighbour(delta) {
    if (state.course === null || state.lecture === null || state.segment === null) return null;
    var lectures = DATA[state.course].lectures;
    var k = state.segment + delta;
    if (k >= 0 && k < lectures[state.lecture].segs.length) return { lecture: state.lecture, segment: k };
    var li = state.lecture + delta;
    if (li < 0 || li >= lectures.length || !lectures[li].segs.length) return null;
    return { lecture: li, segment: delta > 0 ? 0 : lectures[li].segs.length - 1 };
  }

  function labelStep(btn, target, delta) {
    btn.disabled = !target;
    btn.title = "";
    if (!target) { btn.textContent = delta < 0 ? "‹ Anfang des Kurses" : "Ende des Kurses ›"; return; }
    var lec = DATA[state.course].lectures[target.lecture];
    var text = target.lecture === state.lecture
      ? "Kapitel " + String(target.segment + 1).padStart(2, "0")
      : "Vorlesung " + lec.ep;
    btn.textContent = delta < 0 ? "‹ " + text : text + " ›";
    btn.title = lec.segs[target.segment].t;
  }

  function syncPlayerNav() {
    labelStep(prevBtn, neighbour(-1), -1);
    labelStep(nextBtn, neighbour(1), 1);
  }

  function stepChapter(delta) {
    var target = neighbour(delta);
    if (!target || locked) return;
    var lecture = DATA[state.course].lectures[state.lecture];
    if (target.lecture === state.lecture) {
      // Same recording: seek in place instead of reloading the video
      selectHouse(target.segment, false);
      showChapter(lecture, lecture.segs[target.segment]);
      videoEl.currentTime = lecture.segs[target.segment].a;
      return;
    }
    closePlayer();
    hopToCity(state.course, target.lecture, function () { selectHouse(target.segment, true); });
  }
  prevBtn.addEventListener("click", function () { stepChapter(-1); });
  nextBtn.addEventListener("click", function () { stepChapter(1); });

  // The recording plays on past the chapter it was opened at; keep title, list and URL in step
  videoEl.addEventListener("seeked", function () { followTime = true; });
  videoEl.addEventListener("timeupdate", function () {
    if (!followTime || playerEl.hidden || state.level !== "city" || state.segment === null) return;
    var lecture = DATA[state.course].lectures[state.lecture], now = videoEl.currentTime, segs = lecture.segs;
    if (now >= segs[state.segment].a && now < segs[state.segment].b) return;
    for (var k = 0; k < segs.length; k++) {
      if (now >= segs[k].a && now < segs[k].b) {
        state.segment = k;
        renderPanel(); syncURL(true);
        showChapter(lecture, segs[k]);
        return;
      }
    }
  });

  // Straight from one lecture city to another on the same planet, without flying out
  function hopToCity(courseIndex, lectureIndex, done) {
    if (locked) return;
    if (activeScene !== ground) { toCity(courseIndex, lectureIndex, false, done); return; }
    var side = lectureIndex - state.lecture;
    if (courseIndex === state.course && (side === 1 || side === -1)) { tunnelTo(side, done); return; }
    settleInCity(courseIndex, lectureIndex, true, done);
  }

  // Leaving by road: the camera drives down the main street into that side's tunnel
  // and comes out of the facing tunnel of the next town
  function tunnelTo(side, done) {
    if (locked || state.level !== "city") return;
    var to = state.lecture + side;
    if (to < 0 || to >= DATA[state.course].lectures.length) return;
    var portal = cityView && cityView.portals.filter(function (q) { return q.side === side; })[0];
    closePlayer();
    if (!portal || REDUCED) { settleInCity(state.course, to, true, done); return; }
    locked = true;
    var course = state.course;
    var mouth = new THREE.Vector3();
    portal.grp.getWorldPosition(mouth);
    mouth.y = 4;
    var yaw = -side * Math.PI / 2;          // behind us is the town, ahead the tunnel
    var inside = mouth.clone();
    inside.x += side * 30;
    fly(mouth, 18, yaw, 0.08, 1100)
      .then(function () {
        return Promise.all([fly(inside, 6, yaw, 0.02, 650), window.GalaxyVeil.close("tunnel", { ms: 600 })]);
      })
      .then(function () { return window.GalaxyVeil.wait(650); })     // the lamps rush past in the dark
      .then(function () { settleInCity(course, to, -side, done); })
      .catch(recoverFromTrip);
  }

  var hopRide = document.getElementById("hop-ride");
  var rideToast = document.getElementById("ride-toast");
  var riding = false;

  function nextChapterIndex() {
    if (state.level !== "city") return null;
    var next = state.segment === null ? 0 : state.segment + 1;
    return next < DATA[state.course].lectures[state.lecture].segs.length ? next : null;
  }

  function syncHop() {
    hopEl.hidden = state.level !== "city";
    if (hopEl.hidden) return;
    var lectures = DATA[state.course].lectures;
    var before = lectures[state.lecture - 1], after = lectures[state.lecture + 1];
    hopPrev.hidden = !before;
    hopNext.hidden = !after;
    if (before) hopPrev.textContent = "‹ Tunnel · VL " + before.ep;
    if (after) hopNext.textContent = "Tunnel · VL " + after.ep + " ›";
    if (before) hopPrev.title = before.title;
    if (after) hopNext.title = after.title;
    var next = nextChapterIndex();
    var rideKind = THEMES[state.course].city.ride || { label: "Taxi" };
    hopRide.hidden = next === null;
    if (next !== null) {
      hopRide.textContent = rideKind.label + " → Kapitel " + String(next + 1).padStart(2, "0");
      hopRide.title = lectures[state.lecture].segs[next].t;
    }
  }
  hopPrev.addEventListener("click", function () { tunnelTo(-1); });
  hopNext.addEventListener("click", function () { tunnelTo(1); });

  // The ride to the next chapter building: a short themed trip through the streets,
  // with the camera tagging along behind, ending at the door with the chapter playing
  function rideToNext() {
    var next = nextChapterIndex();
    if (next === null || locked || !cityView) return;
    closePlayer();
    if (state.segment === null || REDUCED) { selectHouse(next, true); return; }
    var target = DATA[state.course].lectures[state.lecture].segs[next];
    var ride = THEMES[state.course].city.ride || { caption: "Taxi zum nächsten Termin" };
    var started = cityView.ride(state.segment, next, function () {
      riding = false;
      locked = false;
      rideToast.hidden = true;
      selectHouse(next, true);
    });
    if (!started) return;
    riding = true;
    locked = true;
    tween = null;
    rideToast.textContent = ride.caption + " · Kapitel " + String(next + 1).padStart(2, "0") + " · " + target.t;
    rideToast.hidden = false;
  }
  hopRide.addEventListener("click", rideToNext);

  /* ============================================================
     LIVE — who is where, and how hard each chapter is (crowds and weather)
     ============================================================ */
  var live = null;
  var liveTimer = null;

  function whereAmI() {
    if (state.level !== "city" || state.course === null || state.lecture === null) return { lectureId: null, chapterId: null };
    var lecture = DATA[state.course].lectures[state.lecture];
    return { lectureId: lecture.id, chapterId: state.segment === null ? null : lecture.segs[state.segment].id };
  }

  function reportHere() {
    var at = whereAmI();
    window.GalaxyAPI.here(at.lectureId, at.chapterId).then(applyLive).catch(function () { /* live extras are optional */ });
  }
  function reportHereSoon() {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(reportHere, 350);
  }
  setInterval(function () { if (!document.hidden) reportHere(); }, 15000);

  function lectureScore(lecture) {
    var d = live && live.difficulty.lectures[lecture.id];
    return d ? d.score : null;
  }

  function pushCityLive() {
    if (!live || !cityView || state.level !== "city") return;
    var lecture = DATA[state.course].lectures[state.lecture];
    var chapters = {};
    lecture.segs.forEach(function (seg) {
      var d = live.difficulty.chapters[seg.id];
      chapters[seg.id] = { online: live.online.chapters[seg.id] || 0, score: d ? d.score : null };
    });
    cityView.setLive({ chapters: chapters, lectureScore: lectureScore(lecture) });
  }

  function applyLive(snapshot) {
    if (!snapshot || !snapshot.online) return;
    live = snapshot;
    pushCityLive();
    planets.forEach(function (p) {
      p.cities.forEach(function (c) {
        c.online = live.online.lectures[c.lecture.id] || 0;
        setWeatherBadge(c, window.GalaxyCity.weatherFor(lectureScore(c.lecture)));
      });
    });
    syncRating();
  }

  // Rating a chapter, right under its video
  var rateBox = document.getElementById("player-rate");
  var rateNote = document.getElementById("player-rate-note");
  function syncRating() {
    var at = whereAmI();
    var mine = live && at.chapterId ? live.mine[at.chapterId] : null;
    rateBox.querySelectorAll("button").forEach(function (b) {
      b.classList.toggle("chosen", Number(b.dataset.rating) === mine);
      b.setAttribute("aria-pressed", Number(b.dataset.rating) === mine ? "true" : "false");
    });
  }
  rateBox.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-rating]");
    var at = whereAmI();
    if (!b || !at.chapterId) return;
    rateNote.textContent = "…";
    window.GalaxyAPI.rate(at.lectureId, at.chapterId, Number(b.dataset.rating)).then(function (snapshot) {
      applyLive(snapshot);
      rateNote.textContent = "Danke! Das Wetter dieser Stadt folgt euren Einschätzungen.";
    }).catch(function (error) { rateNote.textContent = error.message; });
  });

  /* ============================================================
     ASK — the same lecture Q&A the rest of VisCon uses, flown to
     ============================================================ */
  var askForm = document.getElementById("ask-form");
  var askInput = document.getElementById("ask-input");
  var askStatus = document.getElementById("ask-status");

  function locate(lectureId, start) {
    for (var ci = 0; ci < DATA.length; ci++) {
      var lex = DATA[ci].lectures;
      for (var li = 0; li < lex.length; li++) {
        if (lex[li].id !== lectureId) continue;
        var segs = lex[li].segs, best = 0, bestGap = Infinity;
        for (var k = 0; k < segs.length; k++) {
          if (start >= segs[k].a && start <= segs[k].b) return { ci: ci, li: li, k: k };
          var gap = Math.abs(segs[k].a - start);
          if (gap < bestGap) { bestGap = gap; best = k; }
        }
        return { ci: ci, li: li, k: best };
      }
    }
    return null;
  }

  askForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var question = askInput.value.trim();
    if (!question || locked) return;
    askStatus.textContent = "Suche läuft …";
    askForm.classList.add("busy");
    try {
      var result = await window.GalaxyAPI.ask(question, state.course !== null ? DATA[state.course].id : null);
      var hit = result.playback || (result.sources && result.sources[0]);
      if (!hit || !hit.lectureId) {
        askStatus.textContent = (result.answer && result.answer.notice) || "Dazu wurde keine Stelle gefunden.";
        return;
      }
      var place = locate(hit.lectureId, hit.start || 0);
      if (!place) {
        askStatus.textContent = "Die gefundene Vorlesung ist in dieser Ansicht nicht vorhanden.";
        return;
      }
      var found = DATA[place.ci].lectures[place.li];
      // The backend distinguishes a confident hit from a near miss; say which this is
      askStatus.textContent =
        (result.status === "answered" ? "" : "Nächstliegende Stelle · ") +
        found.title + " · " + mmss(found.segs[place.k].a);
      if (state.level === "city" && state.course === place.ci && state.lecture === place.li) {
        selectHouse(place.k, true);
      } else {
        toCity(place.ci, place.li, false, function () { selectHouse(place.k, true); });
      }
    } catch (error) {
      askStatus.textContent = error.message;
    } finally {
      askForm.classList.remove("busy");
    }
  });

  function back() {
    if (locked) return;
    if (state.level === "city") {
      if (state.segment !== null) {
        state.segment = null;
        flyTo(new THREE.Vector3(0, 7, 0), Math.max(95, houses.length * 5.6), orbitYaw, 0.56, 900);
        renderPanel(); syncURL();
      } else {
        toPlanet(state.course);
      }
    } else if (state.level === "planet") {
      toGalaxy();
    }
  }

  /* ============================================================
     INPUT
     ============================================================ */
  var ray = new THREE.Raycaster();
  var ndc = new THREE.Vector2();

  function pick(ev) {
    var r = canvas.getBoundingClientRect();
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);

    var hits, i;
    if (activeScene === sky) {
      if (state.level === "galaxy") {
        if (ray.intersectObject(shipHit, false).length) return {kind: "ship"};
        hits = ray.intersectObjects(planets.map(function (p) { return p.globe; }), false);
        if (hits.length) {
          for (i = 0; i < planets.length; i++) if (planets[i].globe === hits[0].object) return { kind: "planet", index: i };
        }
      } else if (state.level === "planet") {
        var p = planets[state.course];
        hits = ray.intersectObjects(p.cities.map(function (c) { return c.hit; }), false);
        if (hits.length) {
          for (i = 0; i < p.cities.length; i++) if (p.cities[i].hit === hits[0].object) return { kind: "city", course: state.course, index: i };
        }
      }
    } else {
      hits = ray.intersectObjects(houses.map(function (h) { return h.hit; }), false);
      if (hits.length) {
        for (i = 0; i < houses.length; i++) if (houses[i].hit === hits[0].object) return { kind: "house", index: i };
      }
      // A tunnel counts only if there is a lecture on the other side of it
      var open = cityView ? cityView.portals.filter(function (q) { return portalTarget(q.side) !== null; }) : [];
      hits = ray.intersectObjects(open.map(function (q) { return q.hit; }), false);
      if (hits.length) {
        for (i = 0; i < open.length; i++) if (open[i].hit === hits[0].object) return { kind: "portal", side: open[i].side };
      }
    }
    return null;
  }

  function portalTarget(side) {
    if (state.level !== "city") return null;
    var lecture = DATA[state.course].lectures[state.lecture + side];
    return lecture || null;
  }

  /* In the city the camera can also travel: right-drag or shift-drag pans across the
     streets, WASD / arrow keys walk, Q / E turn, and a double-click goes to that spot.
     The anchor is kept over the street grid so you cannot wander off into the fog. */
  var panning = false;
  var heldKeys = {};

  function roam(forward, right) {
    var fx = -Math.sin(orbitYaw), fz = -Math.cos(orbitYaw);
    anchor.x += fx * forward + Math.cos(orbitYaw) * right;
    anchor.z += fz * forward - Math.sin(orbitYaw) * right;
    if (cityView) {
      anchor.x = Math.max(-cityView.halfX, Math.min(cityView.halfX, anchor.x));
      anchor.z = Math.max(-cityView.halfZ, Math.min(cityView.halfZ, anchor.z));
    }
  }

  canvas.addEventListener("contextmenu", function (e) {
    if (activeScene === ground) e.preventDefault();
  });

  canvas.addEventListener("pointerdown", function (e) {
    if (boarding) return;
    dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
    panning = activeScene === ground && (e.button === 1 || e.button === 2 || e.shiftKey);
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", function (e) {
    if (dragging) {
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (panning && !locked) {
        var perPixel = orbitDist * 0.0018;
        roam(dy * perPixel, -dx * perPixel);
      } else {
        orbitYaw -= dx * 0.005;
        // In the city the camera stays above the street
        var lowest = activeScene === ground ? 0.06 : -0.35;
        orbitPitch = Math.max(lowest, Math.min(1.35, orbitPitch + dy * 0.004));
      }
      tween = null;
    } else {
      setHover(pick(e));
    }
  });

  canvas.addEventListener("pointerup", function (e) {
    dragging = false;
    var wasPan = panning;
    panning = false;
    if (moved > 7 || locked || (wasPan && e.button !== 0)) return;
    var hit = pick(e);
    if (!hit) return;
    if (hit.kind === "ship") boardVersus();
    else if (hit.kind === "planet") toPlanet(hit.index);
    else if (hit.kind === "city") toCity(hit.course, hit.index);
    else if (hit.kind === "house") selectHouse(hit.index, true);
    else if (hit.kind === "portal") tunnelTo(hit.side);
  });

  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    if (boarding) return;
    var min = activeScene === ground ? 12 : (state.level === "planet" ? 13 : 70);
    var cityMax = Math.max(165, houses.length * 9);
    var max = activeScene === ground ? cityMax : (state.level === "planet" ? 90 : GALAXY_DIST * 2.4);
    orbitDist = Math.max(min, Math.min(max, orbitDist * (1 + Math.sign(e.deltaY) * 0.09)));
    tween = null;
  }, { passive: false });

  // Movement keys only count while the city is on screen and nobody is typing
  var ROAM_KEYS = { w: 1, a: 1, s: 1, d: 1, q: 1, e: 1, arrowup: 1, arrowdown: 1, arrowleft: 1, arrowright: 1 };
  function typing(e) { return /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable; }
  window.addEventListener("keydown", function (e) {
    var k = e.key.toLowerCase();
    if (activeScene !== ground || !playerEl.hidden || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (ROAM_KEYS[k]) {
      heldKeys[k] = true;
      e.preventDefault();
    } else if ((k === "[" || k === "]") && !locked) {
      // Previous / next lecture city
      tunnelTo(k === "]" ? 1 : -1);
    }
  });
  window.addEventListener("keyup", function (e) { delete heldKeys[e.key.toLowerCase()]; });
  window.addEventListener("blur", function () { heldKeys = {}; });

  canvas.addEventListener("dblclick", function (e) {
    if (activeScene !== ground || locked || pick(e)) return;
    var r = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    var spot = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), spot) || !cityView) return;
    spot.x = Math.max(-cityView.halfX, Math.min(cityView.halfX, spot.x));
    spot.z = Math.max(-cityView.halfZ, Math.min(cityView.halfZ, spot.z));
    spot.y = anchor.y;
    flyTo(spot, Math.min(orbitDist, 70), orbitYaw, Math.min(orbitPitch, 0.45), 900);
  });

  window.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (boarding) { cancelBoarding(); return; }
    if (document.getElementById("document-workspace").open) return;
    if (!playerEl.hidden) closePlayer();
    else back();
  });

  window.addEventListener("popstate", function () {
    applyRoute(location.hash, true);
  });

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    shipHome.x = shipOrbitX * Math.min(1, Math.pow(w / 800, 2));
    patrolCentre.x = w < 600 ? 28 : 110;
    if (!boarding) duelShip.position.x = shipHome.x;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  /* ============================================================
     FRAME LOOP
     ============================================================ */
  var clock = new THREE.Clock();
  var scaleTmp = new THREE.Vector3();
  var worldTmp = new THREE.Vector3();
  var frameHandle = 0;

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      cancelAnimationFrame(frameHandle);
      frameHandle = 0;
    } else if (!frameHandle) {
      clock.oldTime = performance.now();
      frameHandle = requestAnimationFrame(frame);
    }
  });

  function frame() {
    frameHandle = 0;
    if (document.hidden) return;
    frameHandle = requestAnimationFrame(frame);
    var dt = Math.min(clock.getDelta(), 0.05);
    var t = clock.elapsedTime;
    if (document.getElementById("document-workspace").open) return;

    if (tween) tween.step(performance.now());

    if (!REDUCED) {
      planets.forEach(function (p, i) {
        p.mat.uniforms.uTime.value = t;
        // The planet you are standing over holds still, so its cities stay where you saw them
        if (!(state.level === "planet" && state.course === i)) p.globe.rotation.y += dt * (0.045 - i * 0.008);
        if (!(state.level !== "galaxy" && state.course === i)) {
          p.pivot.rotation.y += dt * (0.016 / (i + 1));
        }
        p.cities.forEach(function (c, j) {
          var lift = 1 + Math.sin(t * 2 + j) * 0.12;
          c.spark.scale.set(2.2 * lift, 2.2 * lift, 1);
        });
      });
      starNear.rotation.y += dt * 0.004;
      starFar.rotation.y -= dt * 0.0016;
    }

    // Pointing at a lecture in the list turns its city to face you
    if (state.level === "planet" && activeScene === sky && hovered && hovered.kind === "city" && hovered.fromList && !tween) {
      var fp = planets[state.course];
      var spot = fp.cities[hovered.index].node.position;
      fp.body.getWorldPosition(worldTmp);
      var facing = Math.atan2(camera.position.x - worldTmp.x, camera.position.z - worldTmp.z);
      var turnBy = facing - Math.atan2(spot.x, spot.z) - fp.pivot.rotation.y - fp.globe.rotation.y;
      fp.globe.rotation.y += Math.atan2(Math.sin(turnBy), Math.cos(turnBy)) * Math.min(1, dt * 4);
    }

    // Riding along: the camera sits just behind and above the vehicle
    var onRide = riding && cityView && cityView.rideState();
    if (onRide) {
      worldTmp.copy(onRide.position);
      worldTmp.y = 3;
      anchor.lerp(worldTmp, Math.min(1, dt * 8));
      orbitDist += (26 - orbitDist) * Math.min(1, dt * 4);
      orbitPitch += (0.32 - orbitPitch) * Math.min(1, dt * 4);
      var behind = onRide.heading + Math.PI - orbitYaw;
      orbitYaw += Math.atan2(Math.sin(behind), Math.cos(behind)) * Math.min(1, dt * 3);
    }

    // Walking the city with the keyboard: speed scales with how far out the camera is
    if (activeScene === ground && !locked) {
      var step = Math.max(14, orbitDist * 0.45) * dt;
      var fwd = (heldKeys.w || heldKeys.arrowup ? 1 : 0) - (heldKeys.s || heldKeys.arrowdown ? 1 : 0);
      var side = (heldKeys.d || heldKeys.arrowright ? 1 : 0) - (heldKeys.a || heldKeys.arrowleft ? 1 : 0);
      var turn = (heldKeys.e ? 1 : 0) - (heldKeys.q ? 1 : 0);
      if (fwd || side || turn) {
        tween = null;
        roam(fwd * step, side * step);
        orbitYaw -= turn * dt * 1.4;
      }
    }

    // Highlights always follow the pointer; people and traffic stay put under reduced motion
    if (cityView && activeScene === ground) {
      cityView.animate(t, dt, function (k) {
        return (hovered && hovered.kind === "house" && hovered.index === k) || state.segment === k;
      });
    }

    planets.forEach(function (p, i) {
      var hot = hovered && hovered.kind === "planet" && hovered.index === i;
      var want = hot ? 1.07 : 1;
      scaleTmp.set(want, want, want);
      p.body.scale.lerp(scaleTmp, 0.1);
      p.halo.material.opacity += ((hot ? 0.62 : 0.42) - p.halo.material.opacity) * 0.1;
      var wantRing = state.level === "galaxy" ? (hot ? 0.4 : 0.16) : 0.05;
      p.ring.material.opacity += (wantRing - p.ring.material.opacity) * 0.08;
      // A planet's own ring fades back once you are down at its cities
      if (p.belt) {
        var wantBelt = state.level === "planet" && state.course === i ? 0.12 : 0.5;
        p.belt.material.opacity += (wantBelt - p.belt.material.opacity) * 0.08;
      }
      // On its planet: the route between lectures, brighter next to the city you point at
      var here = state.level === "planet" && state.course === i;
      p.routes.visible = here;
      if (here) {
        var lit = hovered && hovered.kind === "city" ? hovered.index : -1;
        p.routes.children.forEach(function (line) {
          var near = line.userData.ends[0] === lit || line.userData.ends[1] === lit;
          line.material.opacity += ((near ? 0.95 : 0.35) - line.material.opacity) * 0.15;
        });
        p.cities.forEach(function (c, j) {
          c.pulse.material.opacity = c.online ? 0.35 + 0.35 * Math.sin(t * 3 + j) : 0;
          if (c.online) { var ps = 1 + 0.12 * Math.sin(t * 3 + j); c.pulse.scale.set(ps, ps, ps); }
        });
      }
    });

    // Keep following a planet while it continues along its orbit
    if (state.level === "planet" && !tween && !boarding) {
      planets[state.course].body.getWorldPosition(worldTmp);
      anchor.lerp(worldTmp, 0.2);
    }

    if (!boarding && !REDUCED) {
      duelShip.position.y = shipHome.y + Math.sin(t * .32) * 2;
      duelShip.position.x = shipHome.x + Math.sin(t * .12) * 4;
      duelShip.rotation.z = -.12 + Math.sin(t * .35) * .035;
    }
    ambience.visible = !REDUCED && !boarding && state.level === "galaxy" && activeScene === sky;
    if (ambience.visible) moveAmbience(t);
    if(boarding)stepBoarding(performance.now());else applyCamera();
    var shipPoint = duelShip.position.clone(); shipPoint.y += 13; shipPoint.project(camera);
    var showShip = !boarding && state.level === "galaxy" && shipPoint.z < 1 && Math.abs(shipPoint.x) < .9 && Math.abs(shipPoint.y) < .85;
    shipButton.hidden = !showShip;
    if (showShip) {
      var halfBeacon = shipButton.offsetWidth / 2 + 12;
      var projectedX = (shipPoint.x * .5 + .5) * innerWidth;
      shipButton.style.left = Math.max(halfBeacon, Math.min(innerWidth - halfBeacon, projectedX)) + "px";
      shipButton.style.top = ((-shipPoint.y * .5 + .5) * innerHeight) + "px";
    }
    syncTags();
    renderer.render(activeScene, camera);
    if(boardingArrived)finishBoarding();
  }

  /* ============================================================
     BOOT
     ============================================================ */
  renderTrail();
  renderPanel();
  accent("#526cb7");
  frame();

  var deep = parseRoute(location.hash);
  if (deep.level === "galaxy") {
    // Ease in from further out so the galaxy assembles as you arrive
    anchor.set(0, 0, 0);
    orbitDist = GALAXY_DIST * 2.1;
    orbitPitch = 1.02;
    flyTo(new THREE.Vector3(0, 0, 0), GALAXY_DIST, 0, GALAXY_PITCH, REDUCED ? 1 : 2600);
    syncURL(true);
  } else {
    applyRoute(location.hash, true);
    syncURL(true);
  }

  document.getElementById("gate").hidden = true;
  setTimeout(function () { loadingEl.classList.add("gone"); }, 350);

  }
})();
