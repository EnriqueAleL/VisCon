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

  // A grid of lit and dark windows, used as an emissive map. Far cheaper than
  // modelling floors, and it is what makes a box read as an inhabited tower.
  function windowTexture(litChance, cssColour) {
    var c = document.createElement("canvas");
    c.width = 64; c.height = 128;
    var ctx = c.getContext("2d");
    ctx.fillStyle = "#05080f";
    ctx.fillRect(0, 0, 64, 128);
    var cols = 6, rows = 15, pad = 3;
    var w = (64 - pad * (cols + 1)) / cols;
    var h = (128 - pad * (rows + 1)) / rows;
    for (var r = 0; r < rows; r++) {
      for (var q = 0; q < cols; q++) {
        if (Math.random() > litChance) continue;
        ctx.globalAlpha = 0.35 + Math.random() * 0.65;
        ctx.fillStyle = Math.random() < 0.22 ? "#ffffff" : cssColour;
        ctx.fillRect(pad + q * (w + pad), pad + r * (h + pad), w, h * (Math.random() < 0.15 ? 0.5 : 1));
      }
    }
    ctx.globalAlpha = 1;
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

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

  var WINDOW_POOL = null;
  function windowSkin(courseCss, variant, repeatX, repeatY) {
    if (!WINDOW_POOL) {
      WINDOW_POOL = [
        windowTexture(0.52, courseCss), windowTexture(0.4, courseCss),
        windowTexture(0.3, courseCss), windowTexture(0.2, courseCss)
      ];
    }
    var tex = WINDOW_POOL[variant % WINDOW_POOL.length].clone();
    tex.needsUpdate = true;
    tex.repeat.set(repeatX, repeatY);
    return tex;
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
    "  float band = fbm(vec3(vP.x * 0.8, vP.y * 2.6 + uTime * 0.015, vP.z * 0.8));",
    "  float fine = fbm(vP * 4.5);",
    "  vec3 base = uColor * (0.30 + 0.62 * band + 0.22 * fine);",
    "  float lam = max(dot(n, normalize(vec3(0.55, 0.78, 0.45))), 0.0);",
    "  vec3 col = base * (0.20 + 1.00 * lam);",
    "  col += uColor * fres * 1.05;",
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

    var mat = new THREE.ShaderMaterial({
      vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG,
      uniforms: { uColor: { value: new THREE.Color(course.color) }, uTime: { value: 0 } }
    });
    var globe = new THREE.Mesh(new THREE.SphereGeometry(PLANET_R, 64, 48), mat);
    body.add(globe);

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
        new THREE.MeshStandardMaterial({
          color: 0x14203a, roughness: 0.85, metalness: 0.2,
          emissive: new THREE.Color(course.color), emissiveIntensity: 0.9
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
      halo: halo, ring: ring, mat: mat, cities: cities, index: i
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

  function buildCity(courseIndex, lectureIndex) {
    clearCity();
    var course = DATA[courseIndex];
    var lecture = course.lectures[lectureIndex];
    var hue = new THREE.Color(course.color);
    // Towers are 8 wide, so the ring has to grow with the number of chapters
    var ringRadius = lecture.segs.length <= 1 ? 0 : Math.max(17, lecture.segs.length * 1.95);
    var plazaRadius = ringRadius + 95;
    var groundRadius = plazaRadius * 2.4;

    cityRoot.add(new THREE.AmbientLight(0x6b7993, 0.9));
    var key = new THREE.DirectionalLight(0xcdd9ec, 0.5);
    key.position.set(24, 40, 18);
    cityRoot.add(key);
    var fill = new THREE.PointLight(course.color, 2.6, 240);
    fill.position.set(0, 16, 0);
    cityRoot.add(fill);

    var floor = new THREE.Mesh(
      new THREE.CircleGeometry(groundRadius, 96),
      new THREE.MeshStandardMaterial({ color: 0x070c16, roughness: 1, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    cityRoot.add(floor);

    var grid = new THREE.GridHelper(plazaRadius * 2, 38, course.color, 0x152134);
    grid.material.transparent = true;
    grid.material.opacity = 0.12;
    grid.position.y = 0.02;
    cityRoot.add(grid);

    // Streets: a ring road through the chapter houses and a spoke out to each one,
    // so the layout of the city is the structure of the lecture.
    if (ringRadius > 0) {
      var ringRoad = new THREE.Mesh(
        new THREE.RingGeometry(ringRadius - 1.4, ringRadius + 1.4, 128),
        new THREE.MeshBasicMaterial({
          color: hue, transparent: true, opacity: 0.3, side: THREE.DoubleSide
        })
      );
      ringRoad.rotation.x = -Math.PI / 2;
      ringRoad.position.y = 0.05;
      cityRoot.add(ringRoad);

      lecture.segs.forEach(function (_seg, i) {
        var a = (i / lecture.segs.length) * Math.PI * 2 - Math.PI / 2;
        var spoke = new THREE.Mesh(
          new THREE.PlaneGeometry(ringRadius, 1.6),
          new THREE.MeshBasicMaterial({ color: hue, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
        );
        spoke.rotation.x = -Math.PI / 2;
        spoke.rotation.z = -a;
        spoke.position.set(Math.cos(a) * ringRadius / 2, 0.04, Math.sin(a) * ringRadius / 2);
        cityRoot.add(spoke);
      });
    }

    // Central plaza
    var plaza = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(6, ringRadius * 0.22), 48),
      new THREE.MeshBasicMaterial({ color: hue, transparent: true, opacity: 0.17 })
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.06;
    cityRoot.add(plaza);

    // The surrounding skyline. Scenery, not data -- but it carries the same window
    // texture at a fraction of the brightness, so the horizon reads as a real city
    // rather than a field of blocks. One instanced mesh keeps it to a single draw call.
    var sceneryCount = 420;
    var sceneryTex = windowSkin(course.css, 3, 2, 4);
    var scenery = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x0e1829, roughness: 0.92, metalness: 0.12,
        emissive: hue, emissiveIntensity: 0.95, emissiveMap: sceneryTex, map: sceneryTex
      }),
      sceneryCount
    );
    var m4 = new THREE.Matrix4();
    var quat = new THREE.Quaternion();
    var pos = new THREE.Vector3();
    var scl = new THREE.Vector3();
    for (var i = 0; i < sceneryCount; i++) {
      var ang = Math.random() * Math.PI * 2;
      // Density falls off outwards, so the city thins towards the horizon
      var t01 = Math.pow(Math.random(), 0.65);
      var rad = ringRadius + 24 + t01 * (plazaRadius - ringRadius - 26);
      // Taller towers downtown, low sprawl further out; a few landmarks anywhere
      var tall = Math.random() < 0.06;
      var bh = (tall ? 26 + Math.random() * 22 : 3 + (1 - t01) * 20 * Math.random() + 2);
      var bw = 2.6 + Math.random() * 4.4;
      pos.set(Math.cos(ang) * rad, bh / 2, Math.sin(ang) * rad);
      quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
      scl.set(bw, bh, bw * (0.7 + Math.random() * 0.6));
      m4.compose(pos, quat, scl);
      scenery.setMatrixAt(i, m4);
    }
    scenery.instanceMatrix.needsUpdate = true;
    cityRoot.add(scenery);

    // Chapter houses. Height is the chapter's real running time, and the tower is
    // built in parts -- plinth, setback shaft, parapet, rooftop plant, mast -- so a
    // short chapter and a long one read as different buildings, not scaled boxes.
    var n = lecture.segs.length;
    lecture.segs.forEach(function (seg, i) {
      var h = 7 + ((seg.b - seg.a) / 60) * 1.5;
      var ang = (i / n) * Math.PI * 2 - Math.PI / 2;

      var grp = new THREE.Group();
      grp.position.set(Math.cos(ang) * ringRadius, 0, Math.sin(ang) * ringRadius);
      grp.rotation.y = -ang - Math.PI / 2;   // entrance faces the plaza
      cityRoot.add(grp);

      var shaftMat = new THREE.MeshStandardMaterial({
        color: 0x16233a, roughness: 0.62, metalness: 0.22,
        emissive: hue, emissiveIntensity: 0.34
      });

      // Plinth
      var plinth = new THREE.Mesh(
        new THREE.BoxGeometry(9.4, 1.1, 9.4),
        new THREE.MeshStandardMaterial({ color: 0x080e1c, roughness: 0.95, metalness: 0.05 })
      );
      plinth.position.y = 0.55;
      grp.add(plinth);

      // Shaft in setbacks: taller chapters step inwards as they rise
      var sections = h > 24 ? 3 : h > 14 ? 2 : 1;
      var remaining = h - 1.1;
      var bottom = 1.1;
      var width = 8;
      for (var sIdx = 0; sIdx < sections; sIdx++) {
        var share = sections === 1 ? 1 : (sIdx === 0 ? 0.56 : sIdx === 1 ? 0.3 : 0.14);
        var segH = remaining * share;
        var tex = windowSkin(course.css, i + sIdx,
          Math.max(1, Math.round(width / 3)), Math.max(1, Math.round(segH / 3)));
        var mat = sIdx === 0 ? shaftMat : shaftMat.clone();
        mat.emissiveMap = tex;
        mat.map = tex;
        var part = new THREE.Mesh(new THREE.BoxGeometry(width, segH, width), mat);
        part.position.y = bottom + segH / 2;
        grp.add(part);

        // Parapet lip at the top of each setback
        var lip = new THREE.Mesh(
          new THREE.BoxGeometry(width + 0.22, 0.16, width + 0.22),
          new THREE.MeshStandardMaterial({
            color: 0x070d1a, roughness: 0.95, metalness: 0.05,
            emissive: hue, emissiveIntensity: 0.3
          })
        );
        lip.position.y = bottom + segH;
        grp.add(lip);

        bottom += segH;
        width *= 0.72;
      }

      // Rooftop plant: a couple of service blocks so the top is not a flat lid
      for (var u = 0; u < 2; u++) {
        var box = new THREE.Mesh(
          new THREE.BoxGeometry(width * 0.4, 0.5 + Math.random() * 0.8, width * 0.4),
          new THREE.MeshStandardMaterial({ color: 0x0d1526, roughness: 0.9, metalness: 0.1 })
        );
        box.position.set((u - 0.5) * width * 0.5, bottom + 0.4, (Math.random() - 0.5) * width * 0.4);
        grp.add(box);
      }

      // Mast with a lamp that blinks in the frame loop
      var mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.11, 2.6, 6),
        new THREE.MeshStandardMaterial({ color: 0x27384f, roughness: 0.6, metalness: 0.5 })
      );
      mast.position.y = bottom + 1.3;
      grp.add(mast);

      var lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd9a8 })
      );
      lamp.position.y = bottom + 2.7;
      grp.add(lamp);

      // Lit entrance, so the ground floor reads as a way in
      var door = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 1.5),
        new THREE.MeshBasicMaterial({ color: hue, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
      );
      door.position.set(0, 0.78, 4.73);
      grp.add(door);

      var beacon = new THREE.Sprite(new THREE.SpriteMaterial({
        map: GLOW_TEX, color: course.color, transparent: true, opacity: 0.7,
        depthWrite: false, blending: THREE.AdditiveBlending
      }));
      beacon.scale.set(16, 16, 1);
      beacon.position.y = bottom + 2.7;
      grp.add(beacon);

      // One generous invisible target rather than raycasting each part
      var hit = new THREE.Mesh(
        new THREE.BoxGeometry(9.6, h + 3, 9.6),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hit.position.y = (h + 3) / 2;
      grp.add(hit);

      houses.push({
        grp: grp, hit: hit, shaftMat: shaftMat, beacon: beacon, lamp: lamp,
        seg: seg, height: bottom + 2.7, base: 0
      });
    });
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
    b.addEventListener("mouseenter", function () { setHover(hoverKey); });
    b.addEventListener("mouseleave", function () { setHover(null); });
    b.addEventListener("focus", function () { setHover(hoverKey); });
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
    document.getElementById("player-eyebrow").textContent =
      "Vorlesung " + lecture.ep + " · ab " + mmss(seg.a);
    document.getElementById("player-title").textContent = seg.t;
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

  canvas.addEventListener("pointerdown", function (e) {
    dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", function (e) {
    if (dragging) {
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      orbitYaw -= dx * 0.005;
      orbitPitch = Math.max(-0.35, Math.min(1.35, orbitPitch + dy * 0.004));
      tween = null;
    } else {
      setHover(pick(e));
    }
  });

  canvas.addEventListener("pointerup", function (e) {
    dragging = false;
    if (moved > 7 || locked) return;
    var hit = pick(e);
    if (!hit) return;
    if (hit.kind === "planet") toPlanet(hit.index);
    else if (hit.kind === "city") toCity(hit.course, hit.index);
    else if (hit.kind === "house") selectHouse(hit.index, true);
  });

  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    var min = activeScene === ground ? 20 : (state.level === "planet" ? 13 : 70);
    var cityMax = Math.max(165, houses.length * 9);
    var max = activeScene === ground ? cityMax : (state.level === "planet" ? 90 : GALAXY_DIST * 2.4);
    orbitDist = Math.max(min, Math.min(max, orbitDist * (1 + Math.sign(e.deltaY) * 0.09)));
    tween = null;
  }, { passive: false });

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
        p.globe.rotation.y += dt * (0.045 - i * 0.008);
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

      houses.forEach(function (h, k) {
        var hot = (hovered && hovered.kind === "house" && hovered.index === k) || state.segment === k;
        h.grp.position.y += ((hot ? 1.6 : 0) - h.grp.position.y) * 0.12;
        h.shaftMat.emissiveIntensity += ((hot ? 0.95 : 0.34) - h.shaftMat.emissiveIntensity) * 0.12;
        var bs = (hot ? 24 : 16) * (1 + Math.sin(t * 2.4 + k) * 0.05);
        h.beacon.scale.set(bs, bs, 1);
        // Aircraft warning lamps, each on its own offbeat
        h.lamp.material.color.setScalar(0.55 + 0.45 * Math.abs(Math.sin(t * 1.7 + k * 1.3)));
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
