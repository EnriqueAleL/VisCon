/* Lernraum Galaxie
 *
 * Three levels of one zoom: galaxy (courses) -> planet (lectures) -> city (chapters).
 * Galaxy and planet are the same scene, so moving between them is a true camera
 * dolly. A planet surface and a city street are ~4 orders of magnitude apart, far
 * enough that one scene would lose float precision, so landing swaps scenes behind
 * a warp. That cut is deliberate and reads as the landing itself.
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
          change: function () { writeStored(PROGRAMME_KEY, null); history.replaceState(null, "", location.pathname); location.reload(); }
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

  /* ============================================================
     GALAXY
     ============================================================ */
  function starfield(count, spread, size, opacity) {
    var pos = new Float32Array(count * 3);
    var col = new Float32Array(count * 3);
    var tint = new THREE.Color();
    for (var i = 0; i < count; i++) {
      var r = spread * (0.55 + Math.random() * 0.45);
      var th = Math.random() * Math.PI * 2;
      var ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph) * 0.65;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      tint.setHSL(0.55 + Math.random() * 0.12, 0.3 + Math.random() * 0.4, 0.72 + Math.random() * 0.28);
      col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({
      size: size, map: STAR_TEX, vertexColors: true, transparent: true,
      opacity: opacity, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    }));
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
    "  float lam = max(dot(n, normalize(vec3(0.55, 0.78, 0.45))), 0.0);",
    "  vec3 col = surf * (0.18 + 1.00 * lam);",
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

      node.visible = false;
      cities.push({ node: node, hit: hit, spark: spark, lecture: lec });
    });

    planets.push({
      course: course, pivot: pivot, body: body, globe: globe,
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

  var warpEl = document.getElementById("warp");
  function warp(cssColor, ms) {
    if (REDUCED) return;
    warpEl.style.background = "radial-gradient(circle at 50% 50%, " + cssColor + " 0%, transparent 62%)";
    var t0 = performance.now();
    (function pulse(now) {
      var t = Math.min(1, ((now || performance.now()) - t0) / ms);
      var bell = Math.sin(t * Math.PI);
      warpEl.style.opacity = (bell * 0.72).toFixed(3);
      camera.fov = 52 + bell * 38;
      camera.updateProjectionMatrix();
      if (t < 1) requestAnimationFrame(pulse);
      else { warpEl.style.opacity = 0; camera.fov = 52; camera.updateProjectionMatrix(); }
    })();
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
    el.trail.replaceChildren();

    var brand = document.createElement("div");
    brand.className = "brand";
    brand.textContent = "VisCon";
    var dot = document.createElement("span");
    dot.textContent = ".";
    brand.append(dot);
    el.trail.append(brand);

    // The programme (department, degree, year) the planets were picked from; clicking it chooses another
    el.trail.append(crumb(context.label, context.change, false));
    el.trail.append(sepNode());

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

    el.trail.append(crumb("Galaxie", state.level === "galaxy" ? null : toGalaxy, state.level === "galaxy"));

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
          put(c.node, "VL " + c.lecture.ep, mins(c.lecture.dur), p.course.css,
            hovered && hovered.kind === "city" && hovered.index === j, 1.25);
        });
      }
    } else {
      var css = DATA[state.course].css;
      houses.forEach(function (h, k) {
        put(h.grp, String(k + 1).padStart(2, "0"), mmss(h.seg.a), css,
          (hovered && hovered.kind === "house" && hovered.index === k) || state.segment === k,
          h.height + 3.5);
      });
    }
    for (var i = n; i < tagPool.length; i++) tagPool[i].classList.remove("on");
  }

  /* ============================================================
     NAVIGATION
     ============================================================ */
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
    var wasCity = activeScene === ground;
    state.level = "planet"; state.course = i; state.lecture = null; state.segment = null;
    accent(p.course.css);
    activeScene = sky;
    document.body.classList.remove("daylight");
    p.cities.forEach(function (c) { c.node.visible = true; });

    var land = new THREE.Vector3();
    p.body.getWorldPosition(land);

    if (wasCity) {
      warp(p.course.css, 900);
      anchor.copy(land); orbitDist = 160; orbitPitch = 0.55;
      flyTo(land, 26, orbitYaw, 0.24, 1700);
    } else {
      flyTo(land, 26, orbitYaw, 0.24, 1800);
    }
    renderTrail(); renderPanel(); syncURL();
  }

  function settleInCity(courseIndex, lectureIndex, instant, done) {
    state.level = "city";
    state.course = courseIndex;
    state.lecture = lectureIndex;
    state.segment = null;
    buildCity(courseIndex, lectureIndex);
    activeScene = ground;
    document.body.classList.add("daylight");   // the city is in daylight; the HUD follows
    var framing = Math.max(95, DATA[courseIndex].lectures[lectureIndex].segs.length * 5.6);
    anchor.set(0, 7, 0);
    orbitDist = instant ? framing : framing * 2.5;
    orbitPitch = instant ? 0.56 : 0.95;
    orbitYaw = 0.6;
    renderTrail(); renderPanel(); syncURL();
    if (instant) {
      locked = false;
      if (done) done();
    } else {
      flyTo(new THREE.Vector3(0, 7, 0), framing, 0.6, 0.56, 1500, function () {
        locked = false;
        if (done) done();
      });
    }
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

    // Dive at the marker, warp, then rise into the city.
    flyTo(land, 6.5, orbitYaw, 0.1, 1100, function () {
      warp(p.course.css, 950);
      setTimeout(function () { settleInCity(courseIndex, lectureIndex, false, done); }, 260);
    });
  }

  function selectHouse(k, play) {
    state.segment = k;
    var h = houses[k];
    if (h) {
      var to = h.grp.position.clone();
      to.y = h.height * 0.55;
      flyTo(to, 30, Math.atan2(h.grp.position.x, h.grp.position.z) + 0.9, 0.22, 1100);
    }
    renderPanel(); syncURL();
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
    if (REDUCED) { settleInCity(courseIndex, lectureIndex, true, done); return; }
    locked = true;
    warp(DATA[courseIndex].css, 950);
    setTimeout(function () { settleInCity(courseIndex, lectureIndex, false, done); }, 260);
  }

  function syncHop() {
    hopEl.hidden = state.level !== "city";
    if (hopEl.hidden) return;
    var lectures = DATA[state.course].lectures;
    var before = lectures[state.lecture - 1], after = lectures[state.lecture + 1];
    hopPrev.hidden = !before;
    hopNext.hidden = !after;
    if (before) hopPrev.textContent = "‹ VL " + before.ep + " · " + before.title;
    if (after) hopNext.textContent = "VL " + after.ep + " · " + after.title + " ›";
  }
  hopPrev.addEventListener("click", function () { hopToCity(state.course, state.lecture - 1); });
  hopNext.addEventListener("click", function () { hopToCity(state.course, state.lecture + 1); });

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
    }
    return null;
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
    if (hit.kind === "planet") toPlanet(hit.index);
    else if (hit.kind === "city") toCity(hit.course, hit.index);
    else if (hit.kind === "house") selectHouse(hit.index, true);
  });

  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
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
      var to = state.lecture + (k === "]" ? 1 : -1);
      if (to >= 0 && to < DATA[state.course].lectures.length) hopToCity(state.course, to);
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
    if (document.getElementById("document-workspace").open || e.key !== "Escape") return;
    if (!playerEl.hidden) closePlayer();
    else back();
  });

  window.addEventListener("popstate", function () {
    applyRoute(location.hash, true);
  });

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
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

  function frame() {
    requestAnimationFrame(frame);
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
    });

    // Keep following a planet while it continues along its orbit
    if (state.level === "planet" && !tween) {
      planets[state.course].body.getWorldPosition(worldTmp);
      anchor.lerp(worldTmp, 0.2);
    }

    applyCamera();
    syncTags();
    renderer.render(activeScene, camera);
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
