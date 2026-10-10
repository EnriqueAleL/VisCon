/* The lecture city: a lived-in town in daylight.
 *
 * One lecture is one town. Its chapters are the named buildings on the central blocks,
 * laid out in reading order and snaking row by row, so walking the streets from the
 * first block to the last is walking through the lecture. Height is still data: a
 * chapter building is as tall as the chapter is long.
 *
 * Everything else is scenery, seeded from the lecture id so a town looks the same on
 * every visit, and styled by the course theme (themes.js). The town is deliberately
 * uneven -- avenues and quiet side streets, crossings only at some corners, mixed lots,
 * parked cars, people who stop to talk -- and it ends in a forest belt and hills with a
 * tunnel at each end of the main street, so it never runs out into nothing.
 *
 * Live state arrives through setLive(): people gather in front of the chapters others
 * are on, and the sky follows how hard the lecture is (sunny, fair, overcast, storm),
 * with a rain cloud of its own over a chapter that is especially hard.
 *
 * app.js owns the camera, picking and labels; this file builds the world, animates it,
 * and drives the ride between chapter buildings.
 */
window.GalaxyCity = (function () {
  "use strict";

  var BLOCK = 26;                 // one city block, kerb to kerb
  var STREET = 10;                // carriageway between blocks
  var PITCH = BLOCK + STREET;
  var RIM = 2;                    // rings of scenery blocks around the chapter blocks
  var KERB = 0.35;                // sidewalk height
  var WALK = 2.2;                 // pedestrians keep this far in from the kerb
  var LANE = 2.4;                 // drive on the right, this far from the centre line
  var CROWD_MAX = 260;            // figures available for gatherings

  var SHIRTS = [0x2f5d8a, 0xc0392b, 0xf2c14e, 0x2e8b57, 0x6c5b7b, 0xf08a5d, 0x34495e, 0xe5e5e5, 0x8e44ad, 0x16a085];
  var SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xa1665e];
  var CARS = [0xe8e8e8, 0x2b2b2b, 0x9aa5ad, 0x2f5d8a, 0xb03a2e, 0x41704c, 0xd9c27a, 0x6a4c93];
  var LEAVES = [0x4f7d3a, 0x5b8a3c, 0x3f6e35, 0x6c9442, 0x55803f];
  var NEEDLES = [0x2f5a3a, 0x355f3c, 0x284f34, 0x3c6a46];
  // Little nods to getting to ETH: the buses up to Hönggerberg and the campus shuttle
  var ROUTES = [
    { sign: "69  ETH Hönggerberg", body: 0xf4f6f8, band: 0x1f5fae },
    { sign: "80  ETH Hönggerberg", body: 0xf4f6f8, band: 0x1f5fae },
    { sign: "ETH Link  Hönggerberg", body: 0x215caf, band: 0xf4f6f8 }
  ];

  // How the sky looks at each level of difficulty. Colours mix with the theme's own sky.
  var WEATHER = {
    sunny:    { sun: 1.18, hemi: 0.86, sky: 0.0, clouds: 3, cloudShade: 0.0, rain: 0 },
    fair:     { sun: 0.95, hemi: 0.78, sky: 0.0, clouds: 7, cloudShade: 0.0, rain: 0 },
    overcast: { sun: 0.42, hemi: 0.70, sky: 0.55, clouds: 15, cloudShade: 0.35, rain: 0 },
    storm:    { sun: 0.14, hemi: 0.52, sky: 0.9, clouds: 20, cloudShade: 0.7, rain: 1 }
  };
  var STORM_TOP = 0x3e4853, STORM_HORIZON = 0x7f8891;

  /** Difficulty score (1-5, or null while there is too little evidence) to a kind of sky. */
  function weatherFor(score) {
    if (score === null || score === undefined) return "fair";
    if (score < 2.3) return "sunny";
    if (score < 3.3) return "fair";
    if (score < 4) return "overcast";
    return "storm";
  }

  // Deterministic per lecture, so the same city comes back on every visit
  function seeded(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () {
      h = (h + 0x6d2b79f5) | 0;
      var t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rand, list) { return list[Math.floor(rand() * list.length)]; }
  function weighted(rand, weights) {
    var total = 0, key;
    for (key in weights) total += weights[key];
    var roll = rand() * total;
    for (key in weights) { roll -= weights[key]; if (roll <= 0) return key; }
    return key;
  }

  /* One window bay, repeated across a facade. The pattern is what gives a building its
     period: single sash windows, paired windows, arched windows with shutters, the
     balcony bays of a panel block, the ribbon windows of a modernist slab, or a glass
     curtain wall. */
  var PATTERNS = ["single", "pair", "arched", "balcony", "ribbon", "glass"];
  function facadeTexture(THREE, style, pattern) {
    pattern = pattern || (style.modern ? "glass" : "single");
    var c = document.createElement("canvas");
    c.width = c.height = 64;
    var ctx = c.getContext("2d");
    ctx.fillStyle = style.wall;
    ctx.fillRect(0, 0, 64, 64);
    function pane(x, y, w, h) {
      ctx.fillStyle = style.glass;
      ctx.fillRect(x, y, w, h);
      var r = ctx.createLinearGradient(x, y, x + w, y + h);
      r.addColorStop(0, "rgba(255,255,255,.28)");
      r.addColorStop(0.5, "rgba(255,255,255,.04)");
      r.addColorStop(1, "rgba(255,255,255,.12)");
      ctx.fillStyle = r;
      ctx.fillRect(x, y, w, h);
    }
    ctx.fillStyle = style.trim;
    if (pattern === "glass") {
      pane(3, 6, 58, 50);
      ctx.fillStyle = style.trim;
      ctx.fillRect(31, 6, 2, 50);
    } else if (pattern === "pair") {
      ctx.fillRect(8, 12, 21, 40); ctx.fillRect(35, 12, 21, 40);
      pane(10, 14, 17, 36); pane(37, 14, 17, 36);
      ctx.fillStyle = style.trim;
      ctx.fillRect(7, 52, 50, 3);
    } else if (pattern === "arched") {
      // Round-headed window between a pair of shutters
      ctx.fillStyle = style.shutter || style.trim;
      ctx.fillRect(8, 16, 9, 36); ctx.fillRect(47, 16, 9, 36);
      ctx.fillStyle = style.trim;
      ctx.beginPath(); ctx.arc(32, 22, 15, Math.PI, 0); ctx.lineTo(47, 54); ctx.lineTo(17, 54); ctx.closePath(); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(32, 22, 12, Math.PI, 0); ctx.lineTo(44, 51); ctx.lineTo(20, 51); ctx.closePath(); ctx.clip();
      pane(20, 8, 24, 44); ctx.restore();
    } else if (pattern === "balcony") {
      // Panel block bay: a window, then the concrete balcony slab and its railing
      ctx.fillRect(12, 6, 40, 34);
      pane(14, 8, 36, 30);
      ctx.fillStyle = "rgba(0,0,0,.18)";
      ctx.fillRect(0, 40, 64, 4);
      ctx.fillStyle = style.trim;
      ctx.fillRect(0, 44, 64, 14);
      ctx.fillStyle = "rgba(0,0,0,.12)";
      for (var b = 4; b < 64; b += 8) ctx.fillRect(b, 46, 2, 10);
      // Panel joints
      ctx.fillStyle = "rgba(0,0,0,.1)";
      ctx.fillRect(0, 62, 64, 2); ctx.fillRect(62, 0, 2, 64);
    } else if (pattern === "ribbon") {
      ctx.fillRect(0, 18, 64, 28);
      pane(0, 21, 64, 22);
      ctx.fillStyle = style.trim;
      ctx.fillRect(20, 21, 2, 22); ctx.fillRect(42, 21, 2, 22);
    } else {
      ctx.fillRect(15, 11, 34, 42);
      pane(18, 14, 28, 36);
      ctx.fillStyle = style.trim;
      ctx.fillRect(31, 14, 2, 36);
      ctx.fillRect(13, 53, 38, 3);
    }
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // The same colour, nudged: so a street of one style is still a street of houses
  function vary(THREE, hex, rand, amount) {
    return new THREE.Color(hex).offsetHSL((rand() - 0.5) * 0.04 * amount, (rand() - 0.5) * 0.18 * amount, (rand() - 0.5) * 0.16 * amount);
  }
  function css(colour) { return "#" + colour.getHexString(); }

  // Amber LED destination sign, as on the front of a city bus
  function signTexture(THREE, text, colours) {
    var c = document.createElement("canvas");
    c.width = 256; c.height = 32;
    var ctx = c.getContext("2d");
    ctx.fillStyle = (colours && colours.bg) || "#121212";
    ctx.fillRect(0, 0, 256, 32);
    ctx.fillStyle = (colours && colours.fg) || "#ffb733";
    ctx.font = "bold 20px monospace";
    ctx.textBaseline = "middle";
    ctx.textAlign = (colours && colours.centre) ? "center" : "left";
    ctx.fillText(text, (colours && colours.centre) ? 128 : 8, 17);
    return new THREE.CanvasTexture(c);
  }

  // Sky dome whose colours can be re-mixed when the weather turns
  function skyDome(THREE, radius) {
    var geo = new THREE.SphereGeometry(radius, 32, 16);
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    var mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false
    }));
    var top = new THREE.Color(), bottom = new THREE.Color(), mix = new THREE.Color();
    mesh.paint = function (topColour, horizonColour) {
      top.copy(topColour); bottom.copy(horizonColour);
      var pos = geo.attributes.position, col = geo.attributes.color;
      for (var i = 0; i < pos.count; i++) {
        var k = Math.max(0, Math.min(1, pos.getY(i) / radius * 2.2));
        mix.copy(bottom).lerp(top, Math.pow(k, 0.7));
        col.setXYZ(i, mix.r, mix.g, mix.b);
      }
      col.needsUpdate = true;
    };
    return mesh;
  }

  // A square-based hip roof, base 1x1 sitting on y = 0
  function hipRoofGeometry(THREE) {
    var geo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
    geo.rotateY(Math.PI / 4);
    geo.translate(0, 0.5, 0);
    return geo;
  }

  // A list of {x, y, z, sx, sy, sz, ry, color} becomes one instanced mesh
  function instanced(THREE, geometry, material, list, shadows) {
    if (!list.length) return null;
    var mesh = new THREE.InstancedMesh(geometry, material, list.length);
    var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    var up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    list.forEach(function (it, i) {
      p.set(it.x, it.y, it.z);
      q.setFromAxisAngle(up, it.ry || 0);
      s.set(it.sx === undefined ? 1 : it.sx, it.sy === undefined ? 1 : it.sy, it.sz === undefined ? 1 : it.sz);
      m4.compose(p, q, s);
      mesh.setMatrixAt(i, m4);
      if (it.color !== undefined) mesh.setColorAt(i, col.set(it.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = !!(shadows && shadows.cast);
    mesh.receiveShadow = !!(shadows && shadows.receive);
    return mesh;
  }

  // A small figure on its own (for the rides): body and head
  function figure(THREE, shirt) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 1.5, 7), new THREE.MeshLambertMaterial({ color: shirt }));
    body.position.y = 0.75;
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), new THREE.MeshLambertMaterial({ color: 0xe0ac69 }));
    head.position.y = 1.85;
    g.add(body, head);
    return g;
  }

  function wheel(THREE, radius, x, z) {
    var w = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.18, 6, 14), new THREE.MeshLambertMaterial({ color: 0x1d1d1d }));
    w.rotation.y = Math.PI / 2;
    w.position.set(x, radius, z);
    return w;
  }

  // The vehicles that carry you from one chapter building to the next, one per theme
  function rideVehicle(THREE, kind, accent) {
    var g = new THREE.Group();
    var paint = function (c) { return new THREE.MeshLambertMaterial({ color: c }); };
    var glass = paint(0x2d3b46);
    function box(w, h, d, mat, x, y, z) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x || 0, y, z || 0);
      m.castShadow = true;
      g.add(m);
      return m;
    }
    if (kind === "tram") {
      // A blue-and-white Zurich tram, two sections and a pantograph
      box(2.5, 2.9, 12, paint(0xf4f6f8), 0, 1.9);
      box(2.54, 0.8, 12.04, paint(0x1f5fae), 0, 0.9);
      box(2.56, 1, 11, glass, 0, 2.4);
      box(1.6, 0.12, 1.6, paint(0x333333), 0, 3.5, -1);
      box(0.08, 1.1, 0.08, paint(0x333333), 0, 4.1, -1).rotation.x = 0.5;
      var sign = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.34), new THREE.MeshBasicMaterial({ map: signTexture(THREE, "11  Bahnhofplatz") }));
      sign.position.set(0, 3.15, 6.03);
      g.add(sign);
    } else if (kind === "pod") {
      var shell = new THREE.Mesh(new THREE.SphereGeometry(1.6, 18, 12), paint(0xf2f4f6));
      shell.scale.set(1, 0.85, 1.7);
      shell.position.y = 1.5;
      shell.castShadow = true;
      g.add(shell);
      var visor = new THREE.Mesh(new THREE.SphereGeometry(1.62, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2.6), glass);
      visor.scale.set(1, 0.85, 1.7);
      visor.position.y = 1.55;
      g.add(visor);
      box(3.3, 0.18, 0.4, new THREE.MeshBasicMaterial({ color: accent }), 0, 0.85, 2.3);
    } else if (kind === "velo") {
      g.add(wheel(THREE, 0.7, 0, 1), wheel(THREE, 0.7, 0, -1));
      box(0.12, 0.12, 2.1, paint(accent), 0, 1.1);
      box(0.12, 0.9, 0.12, paint(accent), 0, 1.4, -0.3);
      var rider = figure(THREE, 0x2f5d8a);
      rider.position.set(0, 1.2, -0.3);
      g.add(rider);
    } else if (kind === "vespa") {
      g.add(wheel(THREE, 0.5, 0, 1.1), wheel(THREE, 0.5, 0, -1.1));
      box(0.9, 0.7, 2.4, paint(0x8fd3c1), 0, 0.9);
      box(0.8, 1.2, 0.3, paint(0x8fd3c1), 0, 1.4, 1.1);
      var scooterist = figure(THREE, 0xf08a5d);
      scooterist.position.set(0, 1.1, -0.4);
      g.add(scooterist);
    } else if (kind === "sled") {
      box(1.8, 0.4, 3.4, paint(0x8b5a2b), 0, 0.6);
      box(0.12, 0.12, 3.8, paint(0x444444), 0.8, 0.25);
      box(0.12, 0.12, 3.8, paint(0x444444), -0.8, 0.25);
      var driver = figure(THREE, 0xc0392b);
      driver.position.set(0, 0.8, -0.6);
      g.add(driver);
      // A reindeer in front, with antlers
      var fur = paint(0x7a5232);
      box(1, 1.1, 2.4, fur, 0, 1.9, 3.6);
      [[-0.35, 2.6], [0.35, 2.6], [-0.35, 4.6], [0.35, 4.6]].forEach(function (leg) { box(0.22, 1.4, 0.22, fur, leg[0], 0.7, leg[1]); });
      box(0.6, 0.7, 0.9, fur, 0, 2.9, 5);
      box(0.08, 0.9, 0.08, paint(0xd9c7a3), -0.25, 3.6, 4.9).rotation.z = 0.4;
      box(0.08, 0.9, 0.08, paint(0xd9c7a3), 0.25, 3.6, 4.9).rotation.z = -0.4;
      box(0.18, 0.18, 0.18, paint(0xd62828), 0, 2.85, 5.5);   // a red nose, obviously
    } else {
      // Taxi
      box(2.1, 1, 4.4, paint(0xf2c12e), 0, 0.85);
      box(1.85, 0.85, 2.3, glass, 0, 1.75, -0.2);
      var roofSign = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 0.4),
        [paint(0xffffff), paint(0xffffff), paint(0xffffff), paint(0xffffff),
          new THREE.MeshBasicMaterial({ map: signTexture(THREE, "TAXI", { bg: "#fff4c2", fg: "#222", centre: true }) }), paint(0xffffff)]);
      roofSign.position.y = 2.4;
      g.add(roofSign);
    }
    return g;
  }

  function build(o) {
    var THREE = window.THREE;
    var root = o.root, course = o.course, lecture = o.lecture;
    var theme = o.theme.city;
    var rand = seeded(String(lecture.id || lecture.title || "city"));
    var hue = new THREE.Color(course.color);
    var segs = lecture.segs;
    function add(mesh) { if (mesh) root.add(mesh); return mesh; }
    function roofColour() {
      var c = new THREE.Color(pick(rand, theme.roofColours));
      return theme.snow ? c.lerp(new THREE.Color(0xf4f7f8), 0.55) : c;
    }
    function pitched() { return theme.roof === "pitched" || (theme.roof === "mixed" && rand() < 0.5); }

    var n = Math.max(1, segs.length);

    // Chapter blocks in the middle, scenery blocks around them
    var cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    var rows = Math.max(1, Math.ceil(n / cols));
    var gc = cols + RIM * 2, gr = rows + RIM * 2;
    var W = gc * PITCH, D = gr * PITCH;
    var extent = Math.max(W, D);
    function centreX(i) { return (i - (gc - 1) / 2) * PITCH; }
    function centreZ(j) { return (j - (gr - 1) / 2) * PITCH; }
    function lineX(k) { return (k - gc / 2) * PITCH; }    // street centre lines between blocks
    function lineZ(k) { return (k - gr / 2) * PITCH; }

    // Reading order snakes along the rows, so consecutive chapters share a street
    var chapterAt = {}, chapterBlock = [];
    segs.forEach(function (_s, k) {
      var row = Math.floor(k / cols);
      var col = row % 2 === 0 ? k % cols : cols - 1 - (k % cols);
      chapterAt[(col + RIM) + ":" + (row + RIM)] = k;
      chapterBlock[k] = { i: col + RIM, j: row + RIM };
    });

    // The main street runs through the middle of town and leaves by a tunnel at each end
    var mainZ = Math.round(gr / 2);
    var avenueX = [], avenueZ = [];
    for (var a1 = 0; a1 <= gc; a1++) avenueX[a1] = a1 === Math.round(gc / 2) || rand() < 0.25;
    for (var a2 = 0; a2 <= gr; a2++) avenueZ[a2] = a2 === mainZ || rand() < 0.25;

    /* ---------- sky, light, ground ---------- */
    var maxView = Math.max(165, n * 9);
    var themeTop = new THREE.Color(theme.skyTop), themeHorizon = new THREE.Color(theme.horizon);
    var stormTop = new THREE.Color(STORM_TOP), stormHorizon = new THREE.Color(STORM_HORIZON);
    o.scene.background = themeHorizon.clone();
    o.scene.fog = new THREE.Fog(theme.horizon, maxView * 0.85, maxView + extent * 1.5);
    var dome = add(skyDome(THREE, 1800));
    dome.paint(themeTop, themeHorizon);

    var hemi = add(new THREE.HemisphereLight(0xe4f0ff, 0x6b7350, 0.78));
    var sun = new THREE.DirectionalLight(theme.sun, 0.95);
    sun.position.set(-0.55 * extent, extent * 1.1, 0.4 * extent);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    var sc = sun.shadow.camera;
    sc.left = sc.bottom = -extent * 0.75;
    sc.right = sc.top = extent * 0.75;
    sc.near = 1; sc.far = extent * 3;
    sun.shadow.bias = -0.0006;
    root.add(sun);
    root.add(sun.target);
    if (o.renderer) {
      o.renderer.shadowMap.enabled = true;
      o.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    var grass = new THREE.Mesh(
      new THREE.CircleGeometry(extent * 4, 64),
      new THREE.MeshLambertMaterial({ color: theme.ground })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    root.add(grass);

    var asphaltMat = new THREE.MeshLambertMaterial({ color: theme.street });
    var asphalt = new THREE.Mesh(new THREE.PlaneGeometry(W + STREET, D + STREET), asphaltMat);
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.position.y = 0.02;
    asphalt.receiveShadow = true;
    root.add(asphalt);

    /* ---------- streets: markings only where a real town has them ---------- */
    var dashes = [], zebras = [], parked = [];
    var k2, z, x, s;
    for (k2 = 0; k2 <= gc; k2++) {
      if (!avenueX[k2]) continue;
      x = lineX(k2);
      for (z = -D / 2; z < D / 2; z += 6) dashes.push({ x: x, y: 0.05, z: z + 1.5, sx: 0.25, sz: 3 });
    }
    for (k2 = 0; k2 <= gr; k2++) {
      if (!avenueZ[k2]) continue;
      z = lineZ(k2);
      for (x = -W / 2; x < W / 2; x += 6) dashes.push({ x: x + 1.5, y: 0.05, z: z, sx: 3, sz: 0.25 });
    }
    // Crossings at about a third of the corners, and only on one or two sides there
    for (var ix = 1; ix < gc; ix++) {
      for (var iz = 1; iz < gr; iz++) {
        if (rand() > 0.34) continue;
        var cx0 = lineX(ix), cz0 = lineZ(iz);
        var sides = [0, 1, 2, 3].sort(function () { return rand() - 0.5; }).slice(0, 1 + Math.floor(rand() * 2));
        sides.forEach(function (side) {
          for (var t = -3; t <= 3; t += 1.5) {
            if (side === 0) zebras.push({ x: cx0 + t, y: 0.06, z: cz0 + STREET / 2 + 1.2, sx: 0.8, sz: 2.2 });
            if (side === 1) zebras.push({ x: cx0 + t, y: 0.06, z: cz0 - STREET / 2 - 1.2, sx: 0.8, sz: 2.2 });
            if (side === 2) zebras.push({ x: cx0 + STREET / 2 + 1.2, y: 0.06, z: cz0 + t, sx: 2.2, sz: 0.8 });
            if (side === 3) zebras.push({ x: cx0 - STREET / 2 - 1.2, y: 0.06, z: cz0 + t, sx: 2.2, sz: 0.8 });
          }
        });
      }
    }
    // Parked cars along the kerbs of side streets
    for (k2 = 1; k2 < gc; k2++) {
      if (avenueX[k2]) continue;
      for (z = -D / 2 + 8; z < D / 2 - 8; z += 7 + rand() * 9) {
        if (rand() < 0.45) continue;
        var kerbSide = rand() < 0.5 ? -1 : 1;
        parked.push({ x: lineX(k2) + kerbSide * (STREET / 2 - 1.3), z: z, heading: rand() < 0.5 ? 0 : Math.PI, color: pick(rand, CARS) });
      }
    }
    for (k2 = 1; k2 < gr; k2++) {
      if (avenueZ[k2]) continue;
      for (x = -W / 2 + 8; x < W / 2 - 8; x += 7 + rand() * 9) {
        if (rand() < 0.45) continue;
        var side2 = rand() < 0.5 ? -1 : 1;
        parked.push({ x: x, z: lineZ(k2) + side2 * (STREET / 2 - 1.3), heading: rand() < 0.5 ? Math.PI / 2 : -Math.PI / 2, color: pick(rand, CARS) });
      }
    }
    var flat = new THREE.BoxGeometry(1, 0.02, 1);
    add(instanced(THREE, flat, new THREE.MeshLambertMaterial({ color: theme.lane }), dashes));
    add(instanced(THREE, flat, new THREE.MeshLambertMaterial({ color: 0xf2f2ee }), zebras));

    /* ---------- blocks ---------- */
    var slabs = [], lawns = [], trees = [], lamps = [], basins = [], benches = [], balconies = [];
    var lowB = [], midB = [], tallB = [], hips = [], tanks = [], chimneys = [];
    var walkways = [];                 // block centres people circle
    var idleSpots = [];                // where people stand and talk
    var houses = [];
    // The easter egg sits on the scenery block just west of the lecture, halfway down
    var landmarkKey = (RIM - 1) + ":" + (RIM + Math.floor((rows - 1) / 2));
    var polybahn = null;

    function treeAt(tx, tz, size, base) {
      var kind = weighted(rand, theme.trees);
      // Varied heights, so the canopy has levels rather than one flat layer
      var sz = (size || 1) * (0.7 + rand() * 0.75);
      return { x: tx, z: tz, y: base === undefined ? 0 : base, kind: kind, size: sz, color: pick(rand, kind === "pine" ? NEEDLES : LEAVES) };
    }

    for (var i = 0; i < gc; i++) {
      for (var j = 0; j < gr; j++) {
        var bx = centreX(i), bz = centreZ(j);
        slabs.push({ x: bx, y: KERB / 2, z: bz, sx: BLOCK, sy: KERB, sz: BLOCK });

        // Lamps on some corners, not all of them
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) {
          if (rand() < 0.45) lamps.push({ x: bx + c[0] * (BLOCK / 2 - 0.7), y: KERB + 2.6, z: bz + c[1] * (BLOCK / 2 - 0.7) });
        });

        var ring = Math.min(i, j, gc - 1 - i, gr - 1 - j);   // 0 = outermost
        var key = i + ":" + j;
        if (key === landmarkKey) {
          ethLandmark(bx, bz);
          walkways.push({ x: bx, z: bz, weight: 3 });
        } else if (key in chapterAt) {
          houses[chapterAt[key]] = chapterBuilding(bx, bz, chapterAt[key]);
          walkways.push({ x: bx, z: bz, weight: 3 });
          // Street trees in loose clusters, not a fence
          var clusters = 1 + Math.floor(rand() * 3);
          for (var cl = 0; cl < clusters; cl++) {
            var edge = Math.floor(rand() * 4), alongEdge = (rand() - 0.5) * (BLOCK - 6);
            for (var tt = 0; tt < 1 + Math.floor(rand() * 3); tt++) {
              var off = alongEdge + (tt - 1) * (2.5 + rand() * 1.5);
              var tx = edge === 0 ? bx + off : edge === 1 ? bx + BLOCK / 2 - 0.9 : edge === 2 ? bx + off : bx - BLOCK / 2 + 0.9;
              var tz = edge === 0 ? bz + BLOCK / 2 - 0.9 : edge === 1 ? bz + off : edge === 2 ? bz - BLOCK / 2 + 0.9 : bz + off;
              trees.push(treeAt(tx, tz, 0.7, KERB));
            }
          }
          idleSpots.push({ x: bx + (rand() - 0.5) * 14, z: bz + BLOCK / 2 - WALK - 0.4 });
        } else {
          var roll = rand();
          if (roll < theme.parks * (ring === 0 ? 1.3 : 1)) {
            park(bx, bz);
            walkways.push({ x: bx, z: bz, weight: 2 });
          } else if (roll < theme.parks + 0.07) {
            square(bx, bz);
            walkways.push({ x: bx, z: bz, weight: 2 });
          } else {
            streetBlock(bx, bz, ring);
            walkways.push({ x: bx, z: bz, weight: ring === 0 ? 1 : 2 });
          }
        }
      }
    }

    function park(bx, bz) {
      lawns.push({ x: bx, y: KERB + 0.03, z: bz, sx: BLOCK - 3, sy: 0.06, sz: BLOCK - 3 });
      var count = 6 + Math.floor(rand() * 7);
      for (var t = 0; t < count; t++) {
        var px = bx + (rand() - 0.5) * (BLOCK - 7), pz = bz + (rand() - 0.5) * (BLOCK - 7);
        if (Math.abs(px - bx) < 3.5 && Math.abs(pz - bz) < 3.5) continue;   // keep the middle open
        trees.push(treeAt(px, pz, 1.2, KERB));
      }
      if (rand() < 0.6) basins.push({ x: bx, y: KERB + 0.4, z: bz });
      idleSpots.push({ x: bx + 5, z: bz + 5 });
    }

    // A small paved square: a kiosk, benches, a tree or two
    function square(bx, bz) {
      var kiosk = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 3), new THREE.MeshLambertMaterial({ color: pick(rand, theme.walls) }));
      kiosk.position.set(bx + (rand() - 0.5) * 8, KERB + 1.3, bz + (rand() - 0.5) * 8);
      kiosk.castShadow = true;
      root.add(kiosk);
      var awn = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.2, 1.4), new THREE.MeshLambertMaterial({ color: hue }));
      awn.position.set(kiosk.position.x, KERB + 2.4, kiosk.position.z + 2);
      root.add(awn);
      for (var b = 0; b < 4; b++) {
        benches.push({ x: bx - 6 + b * 4, y: KERB + 0.35, z: bz + 7, sx: 2.6, sy: 0.25, sz: 0.8 });
      }
      trees.push(treeAt(bx - 8, bz - 7, 1.1, KERB));
      if (rand() < 0.6) trees.push(treeAt(bx + 8, bz - 6, 1, KERB));
      idleSpots.push({ x: bx, z: bz + 4 }, { x: bx - 4, z: bz - 2 });
    }

    // Ordinary buildings: one big lot, halves, quarters or a row of narrow houses
    function streetBlock(bx, bz, ring) {
      var inner = BLOCK - 6;
      var pattern = rand();
      var lots = [];
      if (pattern < 0.18) lots.push({ x: 0, z: 0, w: inner, d: inner, big: true });
      else if (pattern < 0.42) {
        var alongX = rand() < 0.5;
        for (var h2 = 0; h2 < 2; h2++) lots.push(alongX
          ? { x: (h2 - 0.5) * inner / 2, z: 0, w: inner / 2, d: inner }
          : { x: 0, z: (h2 - 0.5) * inner / 2, w: inner, d: inner / 2 });
      } else if (pattern < 0.62) {
        // Row houses along the street, gardens behind
        var count = 3 + Math.floor(rand() * 2), width = inner / count;
        for (var r2 = 0; r2 < count; r2++) lots.push({ x: -inner / 2 + width * (r2 + 0.5), z: inner / 4, w: width, d: inner / 2, row: true });
        trees.push(treeAt(bx + (rand() - 0.5) * 12, bz - inner / 4, 0.9, KERB));
      } else {
        for (var q2 = 0; q2 < 4; q2++) lots.push({ x: (q2 % 2 - 0.5) * inner / 2, z: (Math.floor(q2 / 2) - 0.5) * inner / 2, w: inner / 2, d: inner / 2 });
      }
      lots.forEach(function (lot) {
        if (!lot.big && !lot.row && rand() < 0.12) {          // the odd gap: a yard with a tree
          trees.push(treeAt(bx + lot.x, bz + lot.z, 1, KERB));
          return;
        }
        var w = lot.w - 0.6 - rand() * (lot.row ? 0.3 : 1.6), d = lot.d - 0.6 - rand() * 1.6;
        var lx = bx + lot.x + (rand() - 0.5) * 0.8, lz = bz + lot.z + (rand() - 0.5) * 0.8;
        var roll = rand(), list, h;
        // Kept below most chapter buildings, so the lecture is the skyline
        if (lot.row) { list = lowB; h = 5 + rand() * 4; }
        else if (ring >= 1 && roll < 0.12) { list = tallB; h = 20 + rand() * 8; }
        else if (roll < (ring >= 1 ? 0.6 : 0.35)) { list = midB; h = 10 + rand() * 5; }
        else { list = lowB; h = 5 + rand() * 3; }
        h *= theme.heights;
        var colour = vary(THREE, pick(rand, theme.walls), rand, 1.2).getHex();
        list.push({ x: lx, y: KERB + h / 2, z: lz, sx: w, sy: h, sz: d, color: colour });
        // Some big lots become an L: a lower wing on one side
        if (lot.big && rand() < 0.6) {
          var wingH = h * (0.45 + rand() * 0.2);
          lowB.push({ x: lx + w * 0.25, y: KERB + wingH / 2, z: lz + d * 0.5 + 2.4, sx: w * 0.5, sy: wingH, sz: 4.8, color: colour });
        }
        if (list !== tallB && pitched()) {
          hips.push({ x: lx, y: KERB + h, z: lz, sx: w + 0.4, sy: Math.min(w, d) * 0.42, sz: d + 0.4, color: roofColour() });
          if (theme.chimneys && rand() < 0.5) {
            chimneys.push({ x: lx + w * 0.22, y: KERB + h + 1.2, z: lz - d * 0.15, sx: 0.8, sy: 2.4, sz: 0.8 });
          }
        } else if (h > 10 && rand() < theme.tanks) {
          tanks.push({ x: lx + (rand() - 0.5) * w * 0.4, y: KERB + h, z: lz + (rand() - 0.5) * d * 0.4 });
        }
      });
    }

    /* A nod to ETH Zentrum: a domed main building on its terrace, and the little red
       Polybahn running up to it. Not a model of the real thing, just recognisable. */
    function ethLandmark(bx, bz) {
      var stone = new THREE.MeshLambertMaterial({ color: 0xd9cfbd });
      var terraceD = BLOCK - 10;
      var terraceZ = bz - BLOCK / 2 + 1 + terraceD / 2;
      var terrace = new THREE.Mesh(new THREE.BoxGeometry(BLOCK - 2, 3, terraceD), stone);
      terrace.position.set(bx, KERB + 1.5, terraceZ);
      terrace.castShadow = terrace.receiveShadow = true;
      root.add(terrace);
      var deck = KERB + 3;

      var facade = facadeTexture(THREE, { wall: "#d8cdb6", trim: "#efe8da", glass: "#4b5a66" });
      facade.repeat.set(7, 3);
      var wall = new THREE.MeshLambertMaterial({ map: facade });
      var roof = new THREE.MeshLambertMaterial({ color: 0x8c8780 });
      var hall = new THREE.Mesh(new THREE.BoxGeometry(BLOCK - 6, 10, 8), [wall, wall, roof, roof, wall, wall]);
      hall.position.set(bx, deck + 5, terraceZ - 2.5);
      hall.castShadow = hall.receiveShadow = true;
      root.add(hall);

      // Portico: columns and an entablature carrying the name
      var front = terraceZ - 2.5 + 4;
      for (var c = -3; c <= 3; c += 2) {
        var column = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 7, 10), stone);
        column.position.set(bx + c, deck + 3.5, front + 1.4);
        column.castShadow = true;
        root.add(column);
      }
      var nameMat = new THREE.MeshLambertMaterial({ map: signTexture(THREE, "ETH ZÜRICH", { bg: "#e6dcc8", fg: "#5b5246", centre: true }) });
      var beam = new THREE.Mesh(new THREE.BoxGeometry(8.4, 1.4, 1.6), [stone, stone, stone, stone, nameMat, stone]);
      beam.position.set(bx, deck + 7.6, front + 1.4);
      beam.castShadow = true;
      root.add(beam);

      // Drum and dome over the middle of the hall
      var drum = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 2.4, 24), stone);
      drum.position.set(bx, deck + 11.2, terraceZ - 2.5);
      var dome2 = new THREE.Mesh(new THREE.SphereGeometry(3.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: 0x8e9c98 }));
      dome2.position.set(bx, deck + 12.4, terraceZ - 2.5);
      var lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.4, 10), stone);
      lantern.position.set(bx, deck + 16.4, terraceZ - 2.5);
      [drum, dome2, lantern].forEach(function (m) { m.castShadow = true; root.add(m); });

      // Polybahn: rails from the sidewalk up to the terrace, and a red car shuttling on them
      var railX = bx + BLOCK / 2 - 2.5;
      var low = new THREE.Vector3(railX, KERB, bz + BLOCK / 2 - 0.8);
      var high = new THREE.Vector3(railX, deck, terraceZ + terraceD / 2 - 0.5);
      var run = low.distanceTo(high);
      var slope = Math.atan2(high.y - low.y, low.z - high.z);
      var railMat = new THREE.MeshLambertMaterial({ color: 0x4a4f55 });
      [-0.7, 0.7].forEach(function (dx) {
        var rail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, run + 2), railMat);
        rail.position.set(railX + dx, (low.y + high.y) / 2 + 0.1, (low.z + high.z) / 2);
        rail.rotation.x = slope;
        root.add(rail);
      });
      var car = new THREE.Group();
      var shell = new THREE.Mesh(new THREE.BoxGeometry(2, 1.9, 3.2), new THREE.MeshLambertMaterial({ color: 0xc8202b }));
      shell.position.y = 1.15;
      var glazing = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.7, 2.6), new THREE.MeshLambertMaterial({ color: 0x2d3b46 }));
      glazing.position.y = 1.5;
      [shell, glazing].forEach(function (m) { m.castShadow = true; car.add(m); });
      car.rotation.x = slope;
      root.add(car);
      polybahn = { car: car, low: low, high: high, phase: rand() * 10 };

      [[-1, -1], [1, -1]].forEach(function (p) {
        trees.push({ x: bx + p[0] * (BLOCK / 2 - 3), z: terraceZ + p[1] * (terraceD / 2 - 2), y: deck, kind: "round", size: 0.8, color: LEAVES[1] });
      });
      idleSpots.push({ x: bx - 4, z: bz + BLOCK / 2 - 3 });
    }

    /* ---------- chapter buildings ---------- */
    function chapterBuilding(bx, bz, k) {
      var seg = segs[k];
      var h = 7 + ((seg.b - seg.a) / 60) * 1.5;           // height is the chapter's length
      // Each building its own shade of its style, and its own window pattern
      var pattern0 = pick(rand, theme.styles);
      var pattern = weighted(rand, theme.facades || { single: 3, pair: 2, balcony: 1 });
      if (pattern0.modern && rand() < 0.7) pattern = rand() < 0.5 ? "glass" : "ribbon";
      var wallColour = vary(THREE, pattern0.wall, rand, 1);
      var style = {
        wall: css(wallColour), trim: pattern0.trim, glass: pattern0.glass,
        shutter: pick(rand, ["#4f6b4a", "#8a3b2e", "#2f4f6f", "#6b5a3a", "#3f6c6a"])
      };
      var glassy = pattern === "glass";
      var tex = facadeTexture(THREE, style, pattern);
      var hasHip = !glassy && pattern !== "ribbon" && pitched();

      // The shape: a tower, a long slab block, an L with a lower wing, or two volumes side by side
      var form = weighted(rand, { tower: 3, slab: 2, wing: 2, twin: 2 });
      var footW, footD, side = rand() < 0.5 ? -1 : 1;
      if (form === "slab") { footW = 15 + rand() * 2.5; footD = 8.5 + rand() * 1.5; }
      else if (form === "twin") { footW = 7.5 + rand(); footD = 10 + rand() * 2; }
      else { footW = 10.5 + rand() * 2.5; footD = 10.5 + rand() * 2.5; }
      var shiftX = form === "wing" ? -side * 2 : form === "twin" ? -side * 3.6 : (rand() - 0.5) * 3;

      var grp = new THREE.Group();
      grp.position.set(bx + shiftX, KERB, bz - 1 - rand() * 3);
      root.add(grp);
      var mats = [];

      function shell(width, depth, height, bottom, x, z) {
        var t = tex.clone();
        t.needsUpdate = true;
        t.repeat.set(Math.max(1, Math.round(width / 3.2)), Math.max(1, Math.round(height / 3.4)));
        var sideMat = new THREE.MeshStandardMaterial({
          map: t, roughness: 0.85, metalness: glassy ? 0.2 : 0.02, emissive: hue, emissiveIntensity: 0
        });
        var roof = new THREE.MeshStandardMaterial({
          color: wallColour.clone().lerp(new THREE.Color(0x56534f), 0.75), roughness: 0.95, emissive: hue, emissiveIntensity: 0
        });
        mats.push(sideMat, roof);
        var mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), [sideMat, sideMat, roof, roof, sideMat, sideMat]);
        mesh.position.set(x || 0, bottom + height / 2, z || 0);
        mesh.castShadow = mesh.receiveShadow = true;
        grp.add(mesh);
        // Cornice: trim-coloured edge, roof-coloured top so the roof does not read as a white lid
        var trimMat = new THREE.MeshLambertMaterial({ color: style.trim });
        var lip = new THREE.Mesh(
          new THREE.BoxGeometry(width + 0.5, 0.45, depth + 0.5),
          [trimMat, trimMat, roof, trimMat, trimMat, trimMat]
        );
        lip.position.set(x || 0, bottom + height, z || 0);
        lip.castShadow = true;
        grp.add(lip);
        // Real balconies on a panel block's front, one per floor
        if (pattern === "balcony" && !x) {
          for (var fy = bottom + 2.4; fy < bottom + height - 1; fy += 3.4) {
            balconies.push({ x: grp.position.x + (x || 0), y: KERB + fy, z: grp.position.z + (z || 0) + depth / 2 + 0.45, sx: width * 0.84, sy: 0.22, sz: 0.9 });
          }
        }
      }

      // Shopfront ground floor with a fascia and awning in the course colour
      var base = new THREE.Mesh(
        new THREE.BoxGeometry(footW - 0.3, 3.6, footD - 0.3),
        new THREE.MeshStandardMaterial({ color: 0x33414c, roughness: 0.35, metalness: 0.15 })
      );
      base.position.y = 1.8;
      base.receiveShadow = true;
      grp.add(base);
      var fascia = new THREE.Mesh(
        new THREE.BoxGeometry(footW + 0.2, 0.8, footD + 0.2),
        new THREE.MeshLambertMaterial({ color: hue })
      );
      fascia.position.y = 3.9;
      grp.add(fascia);
      var awning = new THREE.Mesh(
        new THREE.BoxGeometry(footW * (0.5 + rand() * 0.3), 0.18, 2.2),
        new THREE.MeshLambertMaterial({ color: hue })
      );
      awning.position.set((rand() - 0.5) * 2, 3.1, footD / 2 + 1);
      awning.rotation.x = 0.28;
      awning.castShadow = true;
      grp.add(awning);
      var door = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 2.8),
        new THREE.MeshLambertMaterial({ color: 0x1d252c })
      );
      door.position.set(0, 1.4, footD / 2 - 0.1);
      grp.add(door);

      // The shaft, with one setback once the chapter is long enough to need it
      var rest = Math.max(2, h - 4.3);
      var topW = footW, topD = footD;
      if (h > 30) {
        shell(footW, footD, rest * 0.72, 4.3);
        topW = footW * 0.74; topD = footD * 0.74;
        shell(topW, topD, rest * 0.28, 4.3 + rest * 0.72);
      } else {
        shell(footW, footD, rest, 4.3);
      }
      var top = 4.3 + rest;
      var topSize = Math.min(topW, topD);
      // The second volume: a lower wing to one side, or a shorter twin next door
      var reach = footW;
      if (form === "wing" || form === "twin") {
        var w2 = form === "wing" ? 6 + rand() * 2 : 6.5 + rand() * 1.5;
        var d2 = form === "wing" ? footD * (0.6 + rand() * 0.2) : footD * (0.8 + rand() * 0.2);
        var h2 = Math.max(3, rest * (0.4 + rand() * 0.3));
        var x2 = side * (footW / 2 + w2 / 2 - 0.2);
        var z2 = form === "wing" ? -(footD - d2) / 2 : (rand() - 0.5) * 2;
        var base2 = new THREE.Mesh(new THREE.BoxGeometry(w2 - 0.3, 3.6, d2 - 0.3), new THREE.MeshStandardMaterial({ color: 0x3a4650, roughness: 0.5 }));
        base2.position.set(x2, 1.8, z2);
        grp.add(base2);
        shell(w2, d2, h2, 4.3, x2, z2);
        reach = footW + w2 * 2;
      }

      if (hasHip) {
        // Tiled hip roof, with a chimney where the theme has them
        var hip = new THREE.Mesh(hipRoofGeometry(THREE),
          new THREE.MeshPhongMaterial({ color: roofColour(), flatShading: true, shininess: 0 }));
        hip.scale.set(topW + 0.9, topSize * 0.42, topD + 0.9);
        hip.position.y = top + 0.2;
        hip.castShadow = true;
        grp.add(hip);
        if (theme.chimneys) {
          var stack = new THREE.Mesh(new THREE.BoxGeometry(1, 3.2, 1), new THREE.MeshLambertMaterial({ color: 0x8b5a46 }));
          stack.position.set(topW * 0.22, top + 1.8, -topD * 0.12);
          stack.castShadow = true;
          grp.add(stack);
        }
        top += topSize * 0.42;
      } else {
        // Flat roof: a water tower or a little roof garden, plant boxes on all
        if (rand() < theme.tanks + 0.15) {
          var tank = waterTower();
          tank.position.set((rand() - 0.5) * topW * 0.4, top + 0.2, (rand() - 0.5) * topD * 0.4);
          grp.add(tank);
        } else if (rand() < 0.4) {
          var garden = new THREE.Mesh(new THREE.BoxGeometry(topW * 0.5, 0.4, topD * 0.4), new THREE.MeshLambertMaterial({ color: 0x6c9a4a }));
          garden.position.set(topW * 0.15, top + 0.4, -topD * 0.15);
          grp.add(garden);
        }
        var plant = new THREE.Mesh(
          new THREE.BoxGeometry(topW * 0.3, 1, topD * 0.22),
          new THREE.MeshLambertMaterial({ color: 0x9a9a96 })
        );
        plant.position.set(-topW * 0.2, top + 0.7, topD * 0.2);
        plant.castShadow = true;
        grp.add(plant);
      }

      // A course-coloured banner down the front, so each building is clearly part of this course
      var bannerTop = 4.3 + rest;
      var bannerH = Math.min(9, rest * 0.45);
      var banner = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, bannerH),
        new THREE.MeshLambertMaterial({ color: hue, side: THREE.DoubleSide })
      );
      banner.position.set((rand() < 0.5 ? 1 : -1) * (footW / 2 - 1.6), bannerTop - bannerH / 2 - 1.2, footD / 2 + 0.35);
      grp.add(banner);

      // Pin that hovers over the building while it is hovered or selected
      var marker = new THREE.Mesh(
        new THREE.ConeGeometry(1.3, 3, 16),
        new THREE.MeshBasicMaterial({ color: hue })
      );
      marker.rotation.x = Math.PI;
      marker.position.y = top + 4.5;
      marker.visible = false;
      grp.add(marker);

      var hit = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(reach, footD) + 1, top + 3, Math.max(reach, footD) + 1),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hit.position.y = (top + 3) / 2;
      grp.add(hit);

      return {
        grp: grp, hit: hit, seg: seg, height: top + 2.7, base: 0,
        mats: mats, marker: marker, markerY: top + 4.5, top: top, online: 0, score: null,
        // The door, and the street in front of it, for crowds and rides
        door: new THREE.Vector3(grp.position.x, KERB, grp.position.z + footD / 2),
        block: chapterBlock[k]
      };
    }

    function waterTower() {
      var g = new THREE.Group();
      var wood = new THREE.MeshLambertMaterial({ color: 0x7a5236 });
      var legs = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 1.6, 6, 1, true), new THREE.MeshLambertMaterial({ color: 0x3b3b3b }));
      legs.position.y = 0.8;
      var tank = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.4, 14), wood);
      tank.position.y = 2.8;
      var cap = new THREE.Mesh(new THREE.ConeGeometry(1.55, 1.1, 14), wood);
      cap.position.y = 4.55;
      [legs, tank, cap].forEach(function (m) { m.castShadow = true; g.add(m); });
      return g;
    }

    /* ---------- the edge of town: forest, hills, mountains and two tunnels ---------- */
    var portals = [];
    var portalX = W / 2 + STREET / 2 + 30;
    (function edge() {
      var hillColour = new THREE.Color(theme.ground).multiplyScalar(0.82);
      var hills = [], peaks = [], caps = [];
      var hx = W / 2 + 48, hz = D / 2 + 48;
      var perimeter = 4 * (hx + hz);
      for (var d2 = 0; d2 < perimeter; d2 += 16 + rand() * 8) {
        var px, pz, t = d2;
        if (t < 2 * hx) { px = -hx + t; pz = -hz; }
        else if ((t -= 2 * hx) < 2 * hz) { px = hx; pz = -hz + t; }
        else if ((t -= 2 * hz) < 2 * hx) { px = hx - t; pz = hz; }
        else { t -= 2 * hx; px = -hx; pz = hz - t; }
        var r = 18 + rand() * 16;
        // Leave the main road clear on its way out to the tunnels
        if (Math.abs(pz - lineZ(mainZ)) < 34 && Math.abs(px) > W / 2) continue;
        hills.push({
          x: px + (rand() - 0.5) * 12, y: -r * 0.3, z: pz + (rand() - 0.5) * 12,
          sx: r, sy: r * (theme.horizon3d === "dunes" ? 0.35 : 0.55 + rand() * 0.35), sz: r,
          ry: rand() * 6, color: hillColour.clone().offsetHSL(0, 0, (rand() - 0.5) * 0.08).getHex()
        });
      }
      // The two portals sit in hills of their own, so the road visibly goes into the hillside
      [-1, 1].forEach(function (side) {
        // Far enough back that the hillside meets the portal just behind its frame
        hills.push({ x: side * (portalX + 30), y: -6, z: lineZ(mainZ), sx: 30, sy: 22, sz: 34, ry: 0, color: hillColour.getHex() });
      });
      add(instanced(THREE, new THREE.IcosahedronGeometry(1, 1),
        new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true, shininess: 0 }), hills, { receive: true }));

      // Forest belt between the last street and the hills, with a gap for the main road
      for (var f = 0; f < 160 + extent * 0.4; f++) {
        var ang = rand() * Math.PI * 2;
        var rx = W / 2 + STREET / 2 + 4 + rand() * 30, rz = D / 2 + STREET / 2 + 4 + rand() * 30;
        var fx = Math.cos(ang) * rx * 1.15, fz = Math.sin(ang) * rz * 1.15;
        if (Math.abs(fx) < W / 2 + STREET / 2 + 2 && Math.abs(fz) < D / 2 + STREET / 2 + 2) continue;
        if (Math.abs(fz - lineZ(mainZ)) < STREET && Math.abs(fx) > W / 2) continue;
        trees.push(treeAt(fx, fz, 1.2 + rand() * 0.5, 0));
      }

      // Far away, a horizon that suits the theme: Alps, soft hills or dunes
      var far = extent * 1.15 + 140;
      for (var m = 0; m < 26; m++) {
        var a = (m / 26) * Math.PI * 2 + rand() * 0.2;
        var dist = far + rand() * 120;
        var tall = theme.horizon3d === "alps" ? 90 + rand() * 120 : theme.horizon3d === "dunes" ? 18 + rand() * 20 : 40 + rand() * 50;
        var wide = theme.horizon3d === "alps" ? 70 + rand() * 50 : 110 + rand() * 60;
        peaks.push({ x: Math.cos(a) * dist, y: 0, z: Math.sin(a) * dist, sx: wide, sy: tall, sz: wide, ry: rand() * 6,
          color: theme.horizon3d === "dunes" ? 0xd9c08a : 0x8796a6 });
        if (theme.horizon3d === "alps") caps.push({ x: Math.cos(a) * dist, y: tall * 0.62, z: Math.sin(a) * dist, sx: wide * 0.38, sy: tall * 0.38, sz: wide * 0.38, ry: 0 });
      }
      var peakGeo = theme.horizon3d === "alps" ? new THREE.ConeGeometry(1, 1, 6) : new THREE.IcosahedronGeometry(1, 1);
      if (theme.horizon3d === "alps") peakGeo.translate(0, 0.5, 0);
      add(instanced(THREE, peakGeo, new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true, shininess: 0 }), peaks));
      var capGeo = new THREE.ConeGeometry(1, 1, 6);
      capGeo.translate(0, 0.5, 0);
      add(instanced(THREE, capGeo, new THREE.MeshPhongMaterial({ color: 0xf5f8fa, flatShading: true, shininess: 0 }), caps));

      // Main road out to the portals, and the portals themselves
      [-1, 1].forEach(function (side) {
        var road = new THREE.Mesh(new THREE.PlaneGeometry(portalX - W / 2 + 6, STREET), asphaltMat);
        road.rotation.x = -Math.PI / 2;
        road.position.set(side * (W / 2 + (portalX - W / 2 + 6) / 2), 0.02, lineZ(mainZ));
        road.receiveShadow = true;
        root.add(road);

        var g = new THREE.Group();
        g.position.set(side * portalX, 0, lineZ(mainZ));
        g.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;     // opening faces the town
        var stone = new THREE.MeshLambertMaterial({ color: 0x9a948a });
        var dark = new THREE.MeshBasicMaterial({ color: 0x050607 });
        var pillarL = new THREE.Mesh(new THREE.BoxGeometry(2, 9, 3), stone);
        pillarL.position.set(-STREET / 2 - 1, 4.5, 0);
        var pillarR = pillarL.clone();
        pillarR.position.x = STREET / 2 + 1;
        var lintel = new THREE.Mesh(new THREE.BoxGeometry(STREET + 4, 2.4, 3), stone);
        lintel.position.y = 8.6;
        var mouth = new THREE.Mesh(new THREE.BoxGeometry(STREET, 7.4, 22), dark);
        mouth.position.set(0, 3.7, -10.6);
        [pillarL, pillarR, lintel].forEach(function (p) { p.castShadow = true; g.add(p); });
        g.add(mouth);
        var hit = new THREE.Mesh(new THREE.BoxGeometry(STREET + 6, 11, 6), new THREE.MeshBasicMaterial({ visible: false }));
        hit.position.y = 5.5;
        g.add(hit);
        root.add(g);
        portals.push({ side: side, grp: g, hit: hit, labelY: 12 });
      });
    })();

    /* ---------- instanced scenery ---------- */
    var shadow = { cast: true, receive: true };
    add(instanced(THREE, new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: theme.sidewalk }), slabs, { receive: true }));
    add(instanced(THREE, new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: theme.lawn }), lawns, { receive: true }));
    add(instanced(THREE, new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0x7a5a3c }), benches, { cast: true }));

    // Scenery facades share a few neutral textures, tinted per building by instance colour;
    // each size of building comes in two window patterns, split at random
    function sceneryMesh(list, repX, repY, pattern) {
      var t = facadeTexture(THREE, { wall: "#f4f1ea", trim: "#ffffff", glass: "#62717c", shutter: "#8c8c8c" }, pattern);
      t.repeat.set(repX, repY);
      var side = new THREE.MeshLambertMaterial({ map: t });
      var roof = new THREE.MeshLambertMaterial({ color: 0x8a857e });
      return instanced(THREE, new THREE.BoxGeometry(1, 1, 1), [side, side, roof, roof, side, side], list, shadow);
    }
    [[lowB, 2, 2, ["single", "pair"]], [midB, 3, 4, ["pair", "balcony"]], [tallB, 3, 7, ["balcony", "ribbon"]]].forEach(function (kind) {
      var split = [[], []];
      kind[0].forEach(function (b) { split[rand() < 0.5 ? 0 : 1].push(b); });
      add(sceneryMesh(split[0], kind[1], kind[2], kind[3][0]));
      add(sceneryMesh(split[1], kind[1], kind[2], kind[3][1]));
    });
    add(instanced(THREE, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xc4bfb5 }), balconies, shadow));
    add(instanced(THREE, hipRoofGeometry(THREE),
      new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true, shininess: 0 }), hips, shadow));
    add(instanced(THREE, new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0x8b5a46 }), chimneys, { cast: true }));

    tanks.forEach(function (p) {
      var t = waterTower();
      t.position.set(p.x, p.y, p.z);
      root.add(t);
    });

    // Trees: one trunk mesh for all, one crown mesh per kind
    var TRUNK = { round: 2.4, poplar: 2.2, pine: 1.4, palm: 7.5 };
    var trunks = trees.map(function (t) {
      var thick = t.kind === "palm" ? 0.7 : 1;
      return { x: t.x, y: t.y, z: t.z, sx: thick * t.size, sy: TRUNK[t.kind] / 2.4 * t.size, sz: thick * t.size };
    });
    function crowns(kind, lift, squash) {
      return trees.filter(function (t) { return t.kind === kind; }).map(function (t) {
        var s2 = t.size * (0.9 + rand() * 0.25);
        return {
          x: t.x, y: t.y + (TRUNK[kind] + lift) * t.size, z: t.z,
          sx: s2 * squash[0], sy: s2 * squash[1], sz: s2 * squash[2], ry: rand() * 6,
          color: theme.snow && kind === "pine" && rand() < 0.4 ? 0x7f9a88 : t.color
        };
      });
    }
    var trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 2.4, 6);
    trunkGeo.translate(0, 1.2, 0);
    var leafMat = new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true, shininess: 0 });
    add(instanced(THREE, trunkGeo, new THREE.MeshLambertMaterial({ color: 0x6b4a32 }), trunks, shadow));
    add(instanced(THREE, new THREE.IcosahedronGeometry(1.9, 1), leafMat, crowns("round", 1.3, [1, 1.1, 1]), shadow));
    add(instanced(THREE, new THREE.IcosahedronGeometry(1.9, 1), leafMat, crowns("poplar", 2.6, [0.62, 1.9, 0.62]), shadow));
    var pineGeo = new THREE.ConeGeometry(1.9, 5.6, 7);
    pineGeo.translate(0, 2.8, 0);
    add(instanced(THREE, pineGeo, leafMat, crowns("pine", -0.2, [1, 1, 1]), shadow));
    var frondGeo = new THREE.ConeGeometry(2.8, 1.2, 7);
    frondGeo.rotateX(Math.PI);
    add(instanced(THREE, frondGeo, leafMat, crowns("palm", 0.2, [1, 1, 1]), shadow));

    // Street lamps
    add(instanced(THREE, new THREE.CylinderGeometry(0.1, 0.14, 5.2, 6),
      new THREE.MeshLambertMaterial({ color: 0x2f3438 }), lamps, { cast: true }));
    add(instanced(THREE, new THREE.BoxGeometry(0.7, 0.3, 0.7),
      new THREE.MeshLambertMaterial({ color: 0xf6e7b8 }),
      lamps.map(function (l) { return { x: l.x, y: l.y + 2.7, z: l.z }; })));

    // Park fountains
    add(instanced(THREE, new THREE.CylinderGeometry(3, 3.3, 0.8, 24),
      new THREE.MeshLambertMaterial({ color: 0xbdb6aa }), basins, { receive: true }));
    add(instanced(THREE, new THREE.CircleGeometry(2.7, 24).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: theme.snow ? 0xd8e6ee : 0x7fb7d6 }),
      basins.map(function (b) { return { x: b.x, y: b.y + 0.42, z: b.z }; })));

    /* ---------- people: walkers, people talking, and crowds ---------- */
    var walkers = [], idlers = [];
    var totalWeight = walkways.reduce(function (sum, w) { return sum + w.weight; }, 0);
    var peopleCount = Math.min(360, 60 + n * 7);
    walkways.forEach(function (w) {
      var here = Math.round(peopleCount * w.weight / totalWeight);
      for (var p = 0; p < here; p++) {
        walkers.push({
          cx: w.x, cz: w.z, half: BLOCK / 2 - WALK,
          s: rand() * 4 * (BLOCK - WALK * 2),
          speed: (0.7 + rand() * 1.3) * (rand() < 0.5 ? 1 : -1),
          lane: (rand() - 0.5) * 1.2,
          phase: rand() * 6,
          // Now and then someone stops, looks around, and walks on
          pauseEvery: 8 + rand() * 20, pauseFor: 1 + rand() * 3
        });
      }
    });
    idleSpots.forEach(function (spot) {
      var size = 2 + Math.floor(rand() * 3);
      for (var p = 0; p < size; p++) {
        var a = (p / size) * Math.PI * 2 + rand() * 0.4;
        var px = spot.x + Math.cos(a) * 0.95, pz = spot.z + Math.sin(a) * 0.95;
        idlers.push({ x: px, z: pz, heading: Math.atan2(spot.x - px, spot.z - pz), phase: rand() * 6 });
      }
    });
    var crowd = [];   // filled by setLive
    var figureCount = walkers.length + idlers.length + CROWD_MAX;
    var shirts = [], skins = [];
    for (var fi = 0; fi < figureCount; fi++) { shirts.push(pick(rand, SHIRTS)); skins.push(pick(rand, SKIN)); }
    // A touch larger than life, so people still read as people from the default view
    var bodyGeo = new THREE.CylinderGeometry(0.46, 0.4, 1.7, 7);
    bodyGeo.translate(0, 0.85, 0);
    var headGeo = new THREE.SphereGeometry(0.38, 8, 6);
    headGeo.translate(0, 2.1, 0);
    var bodies = add(instanced(THREE, bodyGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }),
      shirts.map(function (c) { return { x: 0, y: -50, z: 0, color: c }; }), { cast: true }));
    var heads = add(instanced(THREE, headGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }),
      skins.map(function (c) { return { x: 0, y: -50, z: 0, color: c }; })));
    bodies.frustumCulled = heads.frustumCulled = false;

    /* ---------- traffic: loops around blocks, and through traffic via the tunnels ---------- */
    // A loop is a rectangle of street lines; the car keeps right and may pause at corners
    function loopPath(i1, j1, i2, j2, clockwise) {
      var corners = [[lineX(i1), lineZ(j1)], [lineX(i2), lineZ(j1)], [lineX(i2), lineZ(j2)], [lineX(i1), lineZ(j2)]];
      if (!clockwise) corners.reverse();
      var pts = corners.map(function (c, idx) {
        var prev = corners[(idx + 3) % 4], next = corners[(idx + 1) % 4];
        var inD = norm(c[0] - prev[0], c[1] - prev[1]), outD = norm(next[0] - c[0], next[1] - c[1]);
        // Right of travel is (-dz, dx); a corner shifts by both neighbours' right vectors
        return [c[0] + (-inD[1] - outD[1]) * LANE, c[1] + (inD[0] + outD[0]) * LANE];
      });
      var lens = [], total = 0;
      for (var p = 0; p < 4; p++) {
        var b = pts[(p + 1) % 4];
        var len = Math.hypot(b[0] - pts[p][0], b[1] - pts[p][1]);
        lens.push(len); total += len;
      }
      return { pts: pts, lens: lens, total: total };
    }
    function norm(dx, dz) { var l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; }
    function along(path, s) {
      for (var p = 0; p < 4; p++) {
        if (s <= path.lens[p] || p === 3) {
          var a = path.pts[p], b = path.pts[(p + 1) % 4], u = Math.min(1, s / path.lens[p]);
          return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, heading: Math.atan2(b[0] - a[0], b[1] - a[1]), leg: p };
        }
        s -= path.lens[p];
      }
    }
    function randomLoop() {
      var i1 = Math.floor(rand() * gc), j1 = Math.floor(rand() * gr);
      var i2 = Math.min(gc, i1 + 1 + Math.floor(rand() * 3)), j2 = Math.min(gr, j1 + 1 + Math.floor(rand() * 3));
      return loopPath(i1, j1, i2, j2, rand() < 0.5);
    }
    var cars = [], buses = [];
    var carCount = Math.round((gc + gr) * 1.1);
    for (var c1 = 0; c1 < carCount; c1++) {
      var path = randomLoop();
      cars.push({ path: path, s: rand() * path.total, speed: 9 + rand() * 5, color: pick(rand, CARS) });
    }
    // Through traffic on the main street, in and out of the tunnels
    var through = [];
    for (var t1 = 0; t1 < 4; t1++) {
      through.push({ dir: t1 % 2 ? 1 : -1, x: (rand() * 2 - 1) * portalX, speed: 11 + rand() * 5, color: pick(rand, CARS) });
    }
    // The ETH buses circle the lecture itself; the shuttle takes a wider loop
    for (var b1 = 0; b1 < 3; b1++) {
      var busPath = b1 < 2 ? loopPath(RIM, RIM, RIM + cols, RIM + rows, b1 === 0) : loopPath(RIM - 1, RIM - 1, RIM + cols + 1, RIM + rows + 1, true);
      buses.push({ path: busPath, s: (b1 / 3) * busPath.total, speed: 7 + rand() * 1.5 });
    }

    var carGeo = new THREE.BoxGeometry(2.1, 1.0, 4.4);
    carGeo.translate(0, 0.85, 0);
    var cabinGeo = new THREE.BoxGeometry(1.85, 0.85, 2.3);
    cabinGeo.translate(0, 1.75, -0.2);
    var glassMat = new THREE.MeshLambertMaterial({ color: 0x2d3b46 });
    var movingCount = cars.length + through.length;
    var carColours = cars.map(function (v) { return v.color; }).concat(through.map(function (v) { return v.color; }));
    var carBodies = add(instanced(THREE, carGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }),
      carColours.map(function (c) { return { x: 0, y: -50, z: 0, color: c }; }), { cast: true }));
    var carCabins = add(instanced(THREE, cabinGeo, glassMat, carColours.map(function () { return { x: 0, y: -50, z: 0 }; })));
    carBodies.frustumCulled = carCabins.frustumCulled = false;
    add(instanced(THREE, carGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }),
      parked.map(function (p) { return { x: p.x, y: 0, z: p.z, ry: p.heading, color: p.color }; }), shadow));
    add(instanced(THREE, cabinGeo, glassMat, parked.map(function (p) { return { x: p.x, y: 0, z: p.z, ry: p.heading }; })));

    // Buses are few, so each is its own group and can carry a readable destination sign
    var busBodyGeo = new THREE.BoxGeometry(2.6, 2.9, 10);
    busBodyGeo.translate(0, 1.85, 0);
    var busBandGeo = new THREE.BoxGeometry(2.64, 0.75, 10.04);
    busBandGeo.translate(0, 0.8, 0);
    var busWinGeo = new THREE.BoxGeometry(2.66, 0.9, 9.2);
    busWinGeo.translate(0, 2.35, 0.1);
    buses.forEach(function (v, idx) {
      var route = ROUTES[idx % ROUTES.length];
      var sign = new THREE.MeshBasicMaterial({ map: signTexture(THREE, route.sign) });
      var g = new THREE.Group();
      var body = new THREE.Mesh(busBodyGeo, new THREE.MeshLambertMaterial({ color: route.body }));
      body.castShadow = true;
      g.add(body, new THREE.Mesh(busBandGeo, new THREE.MeshLambertMaterial({ color: route.band })), new THREE.Mesh(busWinGeo, glassMat));
      var front = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.32), sign);
      front.position.set(0, 3.0, 5.02);
      var right = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.42), sign);
      right.position.set(1.34, 3.0, 2.2);
      right.rotation.y = Math.PI / 2;
      var left = right.clone();
      left.position.x = -1.34;
      left.rotation.y = -Math.PI / 2;
      g.add(front, right, left);
      root.add(g);
      v.group = g;
    });

    /* ---------- clouds, rain and the weather ---------- */
    var CLOUD_MAX = 20;
    var puffs = [], clouds = [];
    for (var c = 0; c < CLOUD_MAX; c++) {
      var cloud = { x: (rand() - 0.5) * extent * 1.6, y: 105 + rand() * 50, z: (rand() - 0.5) * extent * 1.6, first: puffs.length, count: 0, show: 0 };
      var parts = 4 + Math.floor(rand() * 4);
      for (var q = 0; q < parts; q++) {
        var r2 = 6 + rand() * 7;
        puffs.push({ dx: (q - parts / 2) * 7 + rand() * 4, dy: rand() * 4, dz: (rand() - 0.5) * 8, r: r2 });
        cloud.count++;
      }
      clouds.push(cloud);
    }
    var cloudMat = new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35, flatShading: true, shininess: 0 });
    var cloudMesh = add(instanced(THREE, new THREE.IcosahedronGeometry(1, 1), cloudMat, puffs.map(function () { return { x: 0, y: 0, z: 0 }; })));
    cloudMesh.frustumCulled = false;

    // Rain (or snow in a snowy theme) over the whole town, faded in only in a storm
    var DROPS = 1400;
    var snowy = !!theme.snow;
    var dropPos = new Float32Array(DROPS * 6);
    var drops = [];
    for (var dr = 0; dr < DROPS; dr++) drops.push({ x: (rand() - 0.5) * W * 1.2, y: rand() * 120, z: (rand() - 0.5) * D * 1.2, v: snowy ? 6 + rand() * 4 : 70 + rand() * 30 });
    var rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(dropPos, 3));
    var rainMat = new THREE.LineBasicMaterial({ color: snowy ? 0xffffff : 0xaec3d6, transparent: true, opacity: 0 });
    var rain = new THREE.LineSegments(rainGeo, rainMat);
    rain.frustumCulled = false;
    rain.visible = false;
    root.add(rain);

    // Weather is eased towards its target, so a change in the data reads as the sky turning
    var weather = { kind: "fair", target: WEATHER.fair, sun: 0.95, hemi: 0.78, sky: 0, clouds: 7, cloudShade: 0, rain: 0 };
    var skyTopNow = new THREE.Color(), horizonNow = new THREE.Color(), cloudWhite = new THREE.Color(0xffffff), cloudGrey = new THREE.Color(0x5a6168);
    var flash = 0;
    function stepWeather(t, dt) {
      var tg = weather.target, k = Math.min(1, dt * 1.5);
      weather.sun += (tg.sun - weather.sun) * k;
      weather.hemi += (tg.hemi - weather.hemi) * k;
      weather.sky += (tg.sky - weather.sky) * k;
      weather.clouds += (tg.clouds - weather.clouds) * k;
      weather.cloudShade += (tg.cloudShade - weather.cloudShade) * k;
      weather.rain += (tg.rain - weather.rain) * k;
      // Lightning: rare, short, only in a storm
      if (weather.kind === "storm" && !o.reduced && Math.random() < dt * 0.12) flash = 1;
      flash = Math.max(0, flash - dt * 5);
      sun.intensity = weather.sun;
      hemi.intensity = weather.hemi + flash * 1.6;
      skyTopNow.copy(themeTop).lerp(stormTop, weather.sky);
      horizonNow.copy(themeHorizon).lerp(stormHorizon, weather.sky);
      dome.paint(skyTopNow, horizonNow);
      o.scene.fog.color.copy(horizonNow);
      o.scene.background.copy(horizonNow);
      cloudMat.color.copy(cloudWhite).lerp(cloudGrey, weather.cloudShade);
      cloudMat.emissive.copy(cloudMat.color);
      cloudMat.emissiveIntensity = 0.35 * (1 - weather.cloudShade * 0.7);
      rain.visible = weather.rain > 0.02;
      rainMat.opacity = weather.rain * (snowy ? 0.9 : 0.55);
    }

    // A storm cloud of its own over a chapter that is especially hard
    var localClouds = [];
    function localCloud(h) {
      var g = new THREE.Group();
      var mat = new THREE.MeshPhongMaterial({ color: 0x4f565d, emissive: 0x2a2f34, emissiveIntensity: 0.4, flatShading: true, shininess: 0 });
      for (var p = 0; p < 5; p++) {
        var puff = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6 + Math.random() * 1.6, 1), mat);
        puff.position.set((p - 2) * 2.6, Math.random() * 1.2, (Math.random() - 0.5) * 3);
        g.add(puff);
      }
      var count = 60, pos = new Float32Array(count * 6), list = [];
      for (var d3 = 0; d3 < count; d3++) list.push({ x: (Math.random() - 0.5) * 12, y: Math.random() * 14, z: (Math.random() - 0.5) * 6 });
      var geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      var lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: snowy ? 0xffffff : 0x9fb6c9, transparent: true, opacity: 0.7 }));
      lines.frustumCulled = false;
      g.add(lines);
      g.position.set(h.grp.position.x, h.top + KERB + 12, h.grp.position.z);
      root.add(g);
      return { group: g, drops: list, pos: pos, geo: geo, house: h };
    }

    /* ---------- live state: who is here, and how hard it is ---------- */
    function setLive(live) {
      live = live || {};
      var chapters = live.chapters || {};
      var kind = weatherFor(live.lectureScore);
      if (kind !== weather.kind) { weather.kind = kind; weather.target = WEATHER[kind]; }

      crowd.length = 0;
      houses.forEach(function (h) {
        var info = chapters[h.seg.id] || {};
        h.online = info.online || 0;
        h.score = info.score === undefined ? null : info.score;
        // A gathering grows with the number of students on this chapter
        var size = h.online ? Math.min(40, 4 + h.online * 4) : 0;
        for (var p = 0; p < size && crowd.length < CROWD_MAX; p++) {
          var row = Math.floor(p / 8), slot = p % 8;
          var a = (slot / 7 - 0.5) * Math.PI * (0.7 + row * 0.15);
          var r = 3 + row * 1.5;
          var px = h.door.x + Math.sin(a) * r + (Math.random() - 0.5) * 0.5;
          var pz = h.door.z + 1.5 + Math.cos(a) * r + (Math.random() - 0.5) * 0.5;
          crowd.push({ x: px, z: pz, heading: Math.atan2(h.door.x - px, h.door.z - pz), phase: Math.random() * 6 });
        }
        var hard = h.score !== null && h.score >= 3.8;
        var existing = localClouds.filter(function (c) { return c.house === h; })[0];
        if (hard && !existing) localClouds.push(localCloud(h));
        if (!hard && existing) {
          root.remove(existing.group);
          existing.group.traverse(function (obj) { if (obj.geometry) obj.geometry.dispose(); if (obj.material) obj.material.dispose(); });
          localClouds.splice(localClouds.indexOf(existing), 1);
        }
      });
    }

    /* ---------- the ride from one chapter building to the next ---------- */
    var ride = null;
    function startRide(fromK, toK, onArrive) {
      var a = houses[fromK], b = houses[toK];
      if (ride || !a || !b) return false;
      // Out of the door onto the street in front, along the streets, and up to the next door
      var zA = lineZ(a.block.j + 1), zB = lineZ(b.block.j + 1);
      var laneA = zA - LANE, laneB = zB - LANE;
      var pts = [[a.door.x, a.door.z + 2], [a.door.x, laneA]];
      if (a.block.j === b.block.j) pts.push([b.door.x, laneA]);
      else {
        var side = b.block.i >= a.block.i ? 1 : -1;
        var cross = lineX(a.block.i + (side > 0 ? 1 : 0));
        pts.push([cross, laneA], [cross, laneB], [b.door.x, laneB]);
      }
      pts.push([b.door.x, b.door.z + 2]);
      var lens = [], total = 0;
      for (var p = 0; p < pts.length - 1; p++) {
        var len = Math.hypot(pts[p + 1][0] - pts[p][0], pts[p + 1][1] - pts[p][1]);
        lens.push(len); total += len;
      }
      var vehicle = rideVehicle(THREE, theme.ride ? theme.ride.kind : "taxi", hue);
      root.add(vehicle);
      // Quick on purpose: two seconds of real time whatever the distance or frame rate
      ride = { pts: pts, lens: lens, total: total, s: 0, t0: performance.now(), ms: o.reduced ? 1 : 2000, vehicle: vehicle, done: onArrive, heading: 0 };
      placeRide();
      return true;
    }
    function placeRide() {
      var s2 = ride.s;
      for (var p = 0; p < ride.lens.length; p++) {
        if (s2 <= ride.lens[p] || p === ride.lens.length - 1) {
          var a = ride.pts[p], b = ride.pts[p + 1], u = ride.lens[p] ? Math.min(1, s2 / ride.lens[p]) : 1;
          ride.vehicle.position.set(a[0] + (b[0] - a[0]) * u, 0.05, a[1] + (b[1] - a[1]) * u);
          if (ride.lens[p] > 0.01) ride.heading = Math.atan2(b[0] - a[0], b[1] - a[1]);
          ride.vehicle.rotation.y = ride.heading;
          return;
        }
        s2 -= ride.lens[p];
      }
    }
    function stepRide() {
      if (!ride) return;
      // Pull away, cruise, and ease in at the door
      var u = Math.min(1, (performance.now() - ride.t0) / ride.ms);
      ride.s = ride.total * (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
      placeRide();
      if (u >= 1) {
        var finished = ride;
        ride = null;
        root.remove(finished.vehicle);
        finished.vehicle.traverse(function (obj) { if (obj.geometry) obj.geometry.dispose(); if (obj.material) [].concat(obj.material).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); }); });
        if (finished.done) finished.done();
      }
    }

    /* ---------- animation ---------- */
    var m4 = new THREE.Matrix4(), quat = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(1, 1, 1);
    var up = new THREE.Vector3(0, 1, 0);
    function place(mesh, index, px, py, pz, heading, sx, sy, sz) {
      pos.set(px, py, pz);
      quat.setFromAxisAngle(up, heading);
      scl.set(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz);
      m4.compose(pos, quat, scl);
      mesh.setMatrixAt(index, m4);
    }

    function stepPeople(t, dt) {
      var idx = 0;
      walkers.forEach(function (w) {
        var side = w.half * 2, loop = side * 4;
        var stopped = ((t + w.phase * 3) % w.pauseEvery) < w.pauseFor;
        if (!stopped) w.s = ((w.s + w.speed * dt) % loop + loop) % loop;
        var edge = Math.floor(w.s / side), u = w.s - edge * side - w.half;
        var off = w.half + w.lane, px, pz, heading;
        if (edge === 0) { px = w.cx + u; pz = w.cz + off; heading = Math.PI / 2; }
        else if (edge === 1) { px = w.cx + off; pz = w.cz - u; heading = Math.PI; }
        else if (edge === 2) { px = w.cx - u; pz = w.cz - off; heading = -Math.PI / 2; }
        else { px = w.cx - off; pz = w.cz + u; heading = 0; }
        if (w.speed < 0) heading += Math.PI;
        var bob = stopped ? 0 : Math.abs(Math.sin(t * 7 + w.phase)) * 0.08;
        place(bodies, idx, px, KERB + bob, pz, heading);
        place(heads, idx, px, KERB + bob, pz, heading);
        idx++;
      });
      idlers.concat(crowd).forEach(function (p) {
        var sway = Math.sin(t * 1.3 + p.phase) * 0.15;
        place(bodies, idx, p.x, KERB, p.z, p.heading + sway);
        place(heads, idx, p.x, KERB, p.z, p.heading + sway);
        idx++;
      });
      for (; idx < figureCount; idx++) {
        place(bodies, idx, 0, -50, 0, 0, 0.001, 0.001, 0.001);
        place(heads, idx, 0, -50, 0, 0, 0.001, 0.001, 0.001);
      }
      bodies.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
    }

    /* Keeping distance. Every vehicle looks a short way ahead along its heading; if
       anything is in its lane there -- a car it is catching up with, or one crossing the
       junction in front -- it waits. Two that block each other settle it by number, and
       anyone stuck for a few seconds edges on, so the town can never lock up. */
    var fleet = cars.concat(buses, through);
    fleet.forEach(function (v, id) {
      v.id = id;
      v.gap = v.group ? 11 : 7.5;
      v.blockedBy = null;
      v.waited = 0;
      if (v.path) { var at0 = along(v.path, v.s); v.px = at0.x; v.pz = at0.z; v.heading = at0.heading; }
      else { v.px = v.x; v.pz = lineZ(mainZ) + v.dir * LANE; v.heading = v.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    });

    function blocker(v, x, z, heading) {
      var fx = Math.sin(heading), fz = Math.cos(heading);
      for (var k = 0; k < fleet.length; k++) {
        var w = fleet[k];
        if (w === v) continue;
        var dx = w.px - x, dz = w.pz - z;
        var ahead = dx * fx + dz * fz;
        if (ahead <= 0 || ahead > v.gap) continue;
        if (Math.abs(dx * fz - dz * fx) < 2.4) return w;
      }
      return null;
    }

    // Moves one vehicle to its next spot unless something is in the way; true if it moved
    function advance(v, x, z, heading, dt) {
      var w = blocker(v, x, z, heading);
      var yields = w && !(w.blockedBy === v && v.id < w.id) && v.waited < 3.5;
      if (yields) { v.blockedBy = w; v.waited += dt; return false; }
      v.blockedBy = null;
      v.waited = 0;
      v.px = x; v.pz = z; v.heading = heading;
      return true;
    }

    function stepTraffic(dt) {
      fleet.forEach(function (v) {
        if (v.path) {
          var s = (v.s + v.speed * dt) % v.path.total;
          var at = along(v.path, s);
          if (advance(v, at.x, at.z, at.heading, dt)) v.s = s;
        } else {
          var x = v.x + v.dir * v.speed * dt;
          // Out of sight inside one tunnel, back out of the other
          if (x > portalX + 14) x = -portalX - 14;
          if (x < -portalX - 14) x = portalX + 14;
          if (advance(v, x, lineZ(mainZ) + v.dir * LANE, v.heading, dt)) v.x = x;
        }
      });
      cars.forEach(function (v, idx) {
        place(carBodies, idx, v.px, 0, v.pz, v.heading);
        place(carCabins, idx, v.px, 0, v.pz, v.heading);
      });
      through.forEach(function (v, k) {
        place(carBodies, cars.length + k, v.px, 0, v.pz, v.heading);
        place(carCabins, cars.length + k, v.px, 0, v.pz, v.heading);
      });
      carBodies.instanceMatrix.needsUpdate = true;
      carCabins.instanceMatrix.needsUpdate = true;
      buses.forEach(function (v) {
        v.group.position.set(v.px, 0, v.pz);
        v.group.rotation.y = v.heading;
      });
    }

    function stepPolybahn(t) {
      if (!polybahn) return;
      // Up, pause at the top, down, pause at the bottom
      var u = Math.min(1, Math.max(0, 0.5 - 0.62 * Math.cos(t * 0.3 + polybahn.phase)));
      polybahn.car.position.lerpVectors(polybahn.low, polybahn.high, u);
    }

    function stepClouds(t) {
      var drift = t * 1.6;
      var shown = Math.round(weather.clouds);
      clouds.forEach(function (cl, ci) {
        var cxx = ((cl.x + drift + extent * 1.6) % (extent * 3.2)) - extent * 1.6;
        cl.show += ((ci < shown ? 1 : 0) - cl.show) * 0.05;
        for (var p = 0; p < cl.count; p++) {
          var pf = puffs[cl.first + p], r3 = pf.r * cl.show;
          place(cloudMesh, cl.first + p, cxx + pf.dx, cl.y + pf.dy - weather.cloudShade * 25, cl.z + pf.dz, 0, r3 || 0.001, (r3 || 0.001) * 0.7, r3 || 0.001);
        }
      });
      cloudMesh.instanceMatrix.needsUpdate = true;
    }

    function stepRain(dt) {
      if (rain.visible) {
        drops.forEach(function (d4, i3) {
          d4.y -= d4.v * dt;
          if (snowy) d4.x += Math.sin(d4.y * 0.2 + i3) * dt * 2;
          if (d4.y < 0) d4.y += 120;
          var len = snowy ? 0.25 : 1.6;
          dropPos.set([d4.x, d4.y, d4.z, d4.x + (snowy ? 0.2 : 0.3), d4.y + len, d4.z], i3 * 6);
        });
        rainGeo.attributes.position.needsUpdate = true;
      }
      localClouds.forEach(function (lc) {
        lc.drops.forEach(function (d5, i4) {
          d5.y -= (snowy ? 6 : 40) * dt;
          if (d5.y < -lc.group.position.y + KERB + 0.5) d5.y = 0;
          lc.pos.set([d5.x, d5.y, d5.z, d5.x, d5.y + (snowy ? 0.2 : 1.2), d5.z], i4 * 6);
        });
        lc.geo.attributes.position.needsUpdate = true;
      });
    }

    // Place everything once, so a reduced-motion city is still populated
    stepPeople(0, 0);
    stepTraffic(0);
    stepPolybahn(0);
    stepClouds(0);
    stepWeather(0, 1);

    function animate(t, dt, isHot) {
      houses.forEach(function (h, k) {
        var hot = isHot(k);
        h.mats.forEach(function (m) { m.emissiveIntensity += ((hot ? 0.28 : 0) - m.emissiveIntensity) * 0.15; });
        h.marker.visible = hot;
        if (hot) {
          h.marker.position.y = h.markerY + Math.sin(t * 3) * 0.6;
          h.marker.rotation.y = t * 1.5;
        }
      });
      stepRide();
      stepWeather(t, dt);
      if (o.reduced) { stepPeople(t, 0); return; }
      stepPeople(t, dt);
      stepTraffic(dt);
      stepPolybahn(t);
      stepClouds(t);
      stepRain(dt);
    }

    return {
      houses: houses, animate: animate, portals: portals, setLive: setLive,
      ride: startRide,
      rideState: function () { return ride ? { position: ride.vehicle.position, heading: ride.heading } : null; },
      weather: function () { return weather.kind; },
      // Where every moving vehicle is, for checks that traffic keeps its distance
      traffic: function () { return fleet.map(function (v) { return { x: v.px, z: v.pz, heading: v.heading, waited: v.waited, bus: !!v.group }; }); },
      // How far the camera may roam: the street grid plus one street of margin
      halfX: W / 2 + STREET, halfZ: D / 2 + STREET
    };
  }

  return { build: build, weatherFor: weatherFor };
})();
