/* The lecture city: a lived-in street grid in daylight.
 *
 * One lecture is one city. Its chapters are the named buildings on the central
 * blocks, laid out in reading order and snaking row by row, so walking the streets
 * from the first block to the last is walking through the lecture. Height is still
 * data: a chapter building is as tall as the chapter is long.
 *
 * Everything else -- the outer blocks, parks, trees, people and traffic -- is
 * scenery. Its look comes from the course theme (themes.js): an old town with tiled
 * roofs, a glass-and-steel new town, a brick campus, a harbour, a riviera, a snowy
 * fjord town. It is seeded from the lecture id, so a city looks the same every visit.
 * All the repeated things are instanced, one draw call per kind.
 *
 * app.js owns the camera, picking and labels; this file only builds the world and
 * animates it. build() returns the chapter buildings in the shape app.js expects,
 * plus the extent the camera may roam over.
 */
window.GalaxyCity = (function () {
  "use strict";

  var BLOCK = 26;                 // one city block, kerb to kerb
  var STREET = 10;                // carriageway between blocks
  var PITCH = BLOCK + STREET;
  var RIM = 2;                    // rings of scenery blocks around the chapter blocks
  var KERB = 0.35;                // sidewalk height
  var WALK = 2.2;                 // pedestrians keep this far in from the kerb

  var SHIRTS = [0x2f5d8a, 0xc0392b, 0xf2c14e, 0x2e8b57, 0x6c5b7b, 0xf08a5d, 0x34495e, 0xe5e5e5, 0x8e44ad, 0x16a085];
  var SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xa1665e];
  // Little nods to getting to ETH: the buses up to Hönggerberg and the campus shuttle
  var ROUTES = [
    { sign: "69  ETH Hönggerberg", body: 0xf4f6f8, band: 0x1f5fae },
    { sign: "80  ETH Hönggerberg", body: 0xf4f6f8, band: 0x1f5fae },
    { sign: "ETH Link  Hönggerberg", body: 0x215caf, band: 0xf4f6f8 }
  ];
  var CARS = [0xe8e8e8, 0x2b2b2b, 0x9aa5ad, 0x2f5d8a, 0xb03a2e, 0x41704c, 0xd9c27a];
  var LEAVES = [0x4f7d3a, 0x5b8a3c, 0x3f6e35, 0x6c9442, 0x55803f];
  var NEEDLES = [0x2f5a3a, 0x355f3c, 0x284f34, 0x3c6a46];

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

  // One window bay -- wall, frame, glass and sill -- repeated across a facade
  function facadeTexture(THREE, style) {
    var c = document.createElement("canvas");
    c.width = c.height = 64;
    var ctx = c.getContext("2d");
    ctx.fillStyle = style.wall;
    ctx.fillRect(0, 0, 64, 64);
    if (style.modern) {
      ctx.fillStyle = style.glass;
      ctx.fillRect(3, 6, 58, 50);
      var g = ctx.createLinearGradient(0, 6, 0, 56);
      g.addColorStop(0, "rgba(255,255,255,.35)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(3, 6, 58, 50);
      ctx.fillStyle = style.trim;
      ctx.fillRect(31, 6, 2, 50);
    } else {
      ctx.fillStyle = style.trim;
      ctx.fillRect(15, 11, 34, 42);
      ctx.fillStyle = style.glass;
      ctx.fillRect(18, 14, 28, 36);
      var r = ctx.createLinearGradient(18, 14, 46, 50);
      r.addColorStop(0, "rgba(255,255,255,.28)");
      r.addColorStop(0.5, "rgba(255,255,255,.04)");
      r.addColorStop(1, "rgba(255,255,255,.12)");
      ctx.fillStyle = r;
      ctx.fillRect(18, 14, 28, 36);
      ctx.fillStyle = style.trim;
      ctx.fillRect(31, 14, 2, 36);
      ctx.fillRect(13, 53, 38, 3);
    }
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // Sky dome: zenith blue fading to the hazy horizon the fog blends into
  function skyDome(THREE, radius, topHex, horizonHex) {
    var geo = new THREE.SphereGeometry(radius, 32, 16);
    var top = new THREE.Color(topHex), bottom = new THREE.Color(horizonHex), mix = new THREE.Color();
    var pos = geo.attributes.position, colours = new Float32Array(pos.count * 3);
    for (var i = 0; i < pos.count; i++) {
      var k = Math.max(0, Math.min(1, pos.getY(i) / radius * 2.2));
      mix.copy(bottom).lerp(top, Math.pow(k, 0.7));
      colours[i * 3] = mix.r; colours[i * 3 + 1] = mix.g; colours[i * 3 + 2] = mix.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false
    }));
  }

  // Amber LED destination sign, as on the front of a city bus
  function signTexture(THREE, text) {
    var c = document.createElement("canvas");
    c.width = 256; c.height = 32;
    var ctx = c.getContext("2d");
    ctx.fillStyle = "#121212";
    ctx.fillRect(0, 0, 256, 32);
    ctx.fillStyle = "#ffb733";
    ctx.font = "bold 20px monospace";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 8, 17);
    return new THREE.CanvasTexture(c);
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
      s.set(it.sx || 1, it.sy || 1, it.sz || 1);
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

    // Reading order snakes along the rows, so consecutive chapters share a street
    var chapterAt = {};
    segs.forEach(function (_s, k) {
      var row = Math.floor(k / cols);
      var col = row % 2 === 0 ? k % cols : cols - 1 - (k % cols);
      chapterAt[(col + RIM) + ":" + (row + RIM)] = k;
    });

    /* ---------- sky, light, ground ---------- */
    var maxView = Math.max(165, n * 9);
    o.scene.background = new THREE.Color(theme.horizon);
    o.scene.fog = new THREE.Fog(theme.horizon, maxView * 0.85, maxView + extent * 1.5);
    root.add(skyDome(THREE, 1800, theme.skyTop, theme.horizon));

    root.add(new THREE.HemisphereLight(0xe4f0ff, 0x6b7350, 0.78));
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

    var asphalt = new THREE.Mesh(
      new THREE.PlaneGeometry(W + STREET, D + STREET),
      new THREE.MeshLambertMaterial({ color: theme.street })
    );
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.position.y = 0.02;
    asphalt.receiveShadow = true;
    root.add(asphalt);

    /* ---------- streets: lane dashes and zebra crossings ---------- */
    var dashes = [], zebras = [];
    var k2, z, x, s;
    for (k2 = 0; k2 <= gc; k2++) {
      x = (k2 - gc / 2) * PITCH;
      for (z = -D / 2; z < D / 2; z += 6) dashes.push({ x: x, y: 0.05, z: z + 1.5, sx: 0.25, sz: 3 });
    }
    for (k2 = 0; k2 <= gr; k2++) {
      z = (k2 - gr / 2) * PITCH;
      for (x = -W / 2; x < W / 2; x += 6) dashes.push({ x: x + 1.5, y: 0.05, z: z, sx: 3, sz: 0.25 });
    }
    // Crossings on each side of every inner intersection
    for (var ix = 1; ix < gc; ix++) {
      for (var iz = 1; iz < gr; iz++) {
        var cx0 = (ix - gc / 2) * PITCH, cz0 = (iz - gr / 2) * PITCH;
        for (s = -3; s <= 3; s += 1.5) {
          zebras.push({ x: cx0 + s, y: 0.06, z: cz0 + STREET / 2 + 1.2, sx: 0.8, sz: 2.2 });
          zebras.push({ x: cx0 + s, y: 0.06, z: cz0 - STREET / 2 - 1.2, sx: 0.8, sz: 2.2 });
          zebras.push({ x: cx0 + STREET / 2 + 1.2, y: 0.06, z: cz0 + s, sx: 2.2, sz: 0.8 });
          zebras.push({ x: cx0 - STREET / 2 - 1.2, y: 0.06, z: cz0 + s, sx: 2.2, sz: 0.8 });
        }
      }
    }
    var flat = new THREE.BoxGeometry(1, 0.02, 1);
    add(instanced(THREE, flat, new THREE.MeshLambertMaterial({ color: theme.lane }), dashes));
    add(instanced(THREE, flat, new THREE.MeshLambertMaterial({ color: 0xf2f2ee }), zebras));

    /* ---------- blocks ---------- */
    var slabs = [], lawns = [], trees = [], lamps = [], basins = [];
    var lowB = [], midB = [], tallB = [], hips = [], tanks = [], chimneys = [];
    var walkways = [];                 // block centres people circle
    var houses = [];
    // The easter egg sits on the scenery block just west of the lecture, halfway down
    var landmarkKey = (RIM - 1) + ":" + (RIM + Math.floor((rows - 1) / 2));
    var polybahn = null;

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
      var nameCanvas = document.createElement("canvas");
      nameCanvas.width = 256; nameCanvas.height = 32;
      var nctx = nameCanvas.getContext("2d");
      nctx.fillStyle = "#e6dcc8"; nctx.fillRect(0, 0, 256, 32);
      nctx.fillStyle = "#5b5246"; nctx.font = "bold 18px serif"; nctx.textAlign = "center"; nctx.textBaseline = "middle";
      nctx.fillText("ETH ZÜRICH", 128, 17);
      var nameMat = new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(nameCanvas) });
      var beam = new THREE.Mesh(new THREE.BoxGeometry(8.4, 1.4, 1.6), [stone, stone, stone, stone, nameMat, stone]);
      beam.position.set(bx, deck + 7.6, front + 1.4);
      beam.castShadow = true;
      root.add(beam);

      // Drum and dome over the middle of the hall
      var drum = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 2.4, 24), stone);
      drum.position.set(bx, deck + 11.2, terraceZ - 2.5);
      var dome = new THREE.Mesh(new THREE.SphereGeometry(3.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: 0x8e9c98 }));
      dome.position.set(bx, deck + 12.4, terraceZ - 2.5);
      var lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.4, 10), stone);
      lantern.position.set(bx, deck + 16.4, terraceZ - 2.5);
      [drum, dome, lantern].forEach(function (m) { m.castShadow = true; root.add(m); });

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

      // A few trees on the terrace
      [[-1, -1], [1, -1]].forEach(function (p) {
        trees.push({ x: bx + p[0] * (BLOCK / 2 - 3), z: terraceZ + p[1] * (terraceD / 2 - 2), kind: "round", size: 0.8, color: LEAVES[1], y: deck - KERB });
      });
    }

    function treeAt(tx, tz, size) {
      var kind = weighted(rand, theme.trees);
      // Varied heights, so the canopy has levels rather than one flat layer
      var sz = (size || 1) * (0.7 + rand() * 0.75);
      return { x: tx, z: tz, kind: kind, size: sz, color: pick(rand, kind === "pine" ? NEEDLES : LEAVES) };
    }

    for (var i = 0; i < gc; i++) {
      for (var j = 0; j < gr; j++) {
        var bx = centreX(i), bz = centreZ(j);
        slabs.push({ x: bx, y: KERB / 2, z: bz, sx: BLOCK, sy: KERB, sz: BLOCK });

        // A lamp on every corner
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) {
          lamps.push({ x: bx + c[0] * (BLOCK / 2 - 0.7), y: KERB + 2.6, z: bz + c[1] * (BLOCK / 2 - 0.7) });
        });

        var ring = Math.min(i, j, gc - 1 - i, gr - 1 - j);   // 0 = outermost
        var key = i + ":" + j;
        if (key === landmarkKey) {
          ethLandmark(bx, bz);
          walkways.push({ x: bx, z: bz, weight: 3 });
        } else if (key in chapterAt) {
          houses[chapterAt[key]] = chapterBuilding(bx, bz, chapterAt[key]);
          walkways.push({ x: bx, z: bz, weight: 3 });
          // Street trees along the sidewalk
          for (s = -BLOCK / 2 + 3; s <= BLOCK / 2 - 3; s += 10) {
            trees.push(treeAt(bx + s, bz + BLOCK / 2 - 0.9, 0.7));
            trees.push(treeAt(bx + s, bz - BLOCK / 2 + 0.9, 0.7));
            trees.push(treeAt(bx + BLOCK / 2 - 0.9, bz + s, 0.7));
            trees.push(treeAt(bx - BLOCK / 2 + 0.9, bz + s, 0.7));
          }
        } else if (rand() < theme.parks * (ring === 0 ? 1.3 : 1)) {
          park(bx, bz);
          walkways.push({ x: bx, z: bz, weight: 2 });
        } else {
          streetBlock(bx, bz, ring);
          walkways.push({ x: bx, z: bz, weight: ring === 0 ? 1 : 2 });
        }
      }
    }

    function park(bx, bz) {
      lawns.push({ x: bx, y: KERB + 0.03, z: bz, sx: BLOCK - 3, sy: 0.06, sz: BLOCK - 3 });
      var count = 6 + Math.floor(rand() * 7);
      for (var t = 0; t < count; t++) {
        var px = bx + (rand() - 0.5) * (BLOCK - 7), pz = bz + (rand() - 0.5) * (BLOCK - 7);
        if (Math.abs(px - bx) < 3.5 && Math.abs(pz - bz) < 3.5) continue;   // keep the middle open
        trees.push(treeAt(px, pz, 1.2));
      }
      if (rand() < 0.6) basins.push({ x: bx, y: KERB + 0.4, z: bz });
    }

    // Two to four ordinary buildings per scenery block, lower towards the edge of town
    function streetBlock(bx, bz, ring) {
      var inner = BLOCK - 6;
      var split = rand() < 0.25 ? 1 : 2;
      var cell = inner / split;
      for (var a = 0; a < split; a++) {
        for (var b = 0; b < split; b++) {
          var lx = bx - inner / 2 + cell * (a + 0.5), lz = bz - inner / 2 + cell * (b + 0.5);
          var w = cell - 0.8 - rand() * 1.4, d = cell - 0.8 - rand() * 1.4;
          var roll = rand();
          var list, h;
          // Kept below most chapter buildings, so the lecture is the skyline
          if (ring >= 1 && roll < 0.12) { list = tallB; h = 20 + rand() * 8; }
          else if (roll < (ring >= 1 ? 0.6 : 0.35)) { list = midB; h = 10 + rand() * 5; }
          else { list = lowB; h = 5 + rand() * 3; }
          h *= theme.heights;
          list.push({ x: lx, y: KERB + h / 2, z: lz, sx: w, sy: h, sz: d, color: pick(rand, theme.walls) });
          if (list !== tallB && pitched()) {
            hips.push({ x: lx, y: KERB + h, z: lz, sx: w + 0.4, sy: Math.min(w, d) * 0.42, sz: d + 0.4, color: roofColour() });
            if (theme.chimneys && rand() < 0.5) {
              chimneys.push({ x: lx + w * 0.22, y: KERB + h + 1.2, z: lz - d * 0.15, sx: 0.8, sy: 2.4, sz: 0.8 });
            }
          } else if (h > 10 && rand() < theme.tanks) {
            tanks.push({ x: lx + (rand() - 0.5) * w * 0.4, y: KERB + h, z: lz + (rand() - 0.5) * d * 0.4 });
          }
        }
      }
    }

    /* ---------- chapter buildings ---------- */
    function chapterBuilding(bx, bz, k) {
      var seg = segs[k];
      var h = 7 + ((seg.b - seg.a) / 60) * 1.5;           // height is the chapter's length
      var style = pick(rand, theme.styles);
      var tex = facadeTexture(THREE, style);
      var wallColour = new THREE.Color(style.wall);
      var foot = 13;
      var hasHip = !style.modern && pitched();

      var grp = new THREE.Group();
      grp.position.set(bx, KERB, bz - 1.5);                 // set back for a forecourt
      root.add(grp);
      var mats = [];

      function shell(width, height, bottom) {
        var t = tex.clone();
        t.needsUpdate = true;
        t.repeat.set(Math.max(1, Math.round(width / 3.2)), Math.max(1, Math.round(height / 3.4)));
        var side = new THREE.MeshStandardMaterial({
          map: t, roughness: 0.85, metalness: style.modern ? 0.2 : 0.02, emissive: hue, emissiveIntensity: 0
        });
        var roof = new THREE.MeshStandardMaterial({
          color: wallColour.clone().lerp(new THREE.Color(0x56534f), 0.75), roughness: 0.95, emissive: hue, emissiveIntensity: 0
        });
        mats.push(side, roof);
        var mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, width), [side, side, roof, roof, side, side]);
        mesh.position.y = bottom + height / 2;
        mesh.castShadow = mesh.receiveShadow = true;
        grp.add(mesh);
        // Cornice: trim-coloured edge, roof-coloured top so the roof does not read as a white lid
        var trimMat = new THREE.MeshLambertMaterial({ color: style.trim });
        var lip = new THREE.Mesh(
          new THREE.BoxGeometry(width + 0.5, 0.45, width + 0.5),
          [trimMat, trimMat, roof, trimMat, trimMat, trimMat]
        );
        lip.position.y = bottom + height;
        lip.castShadow = true;
        grp.add(lip);
      }

      // Shopfront ground floor with a fascia and awning in the course colour
      var base = new THREE.Mesh(
        new THREE.BoxGeometry(foot - 0.3, 3.6, foot - 0.3),
        new THREE.MeshStandardMaterial({ color: 0x33414c, roughness: 0.35, metalness: 0.15 })
      );
      base.position.y = 1.8;
      base.receiveShadow = true;
      grp.add(base);
      var fascia = new THREE.Mesh(
        new THREE.BoxGeometry(foot + 0.2, 0.8, foot + 0.2),
        new THREE.MeshLambertMaterial({ color: hue })
      );
      fascia.position.y = 3.9;
      grp.add(fascia);
      var awning = new THREE.Mesh(
        new THREE.BoxGeometry(foot * 0.7, 0.18, 2.2),
        new THREE.MeshLambertMaterial({ color: hue })
      );
      awning.position.set(0, 3.1, foot / 2 + 1);
      awning.rotation.x = 0.28;
      awning.castShadow = true;
      grp.add(awning);
      var door = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 2.8),
        new THREE.MeshLambertMaterial({ color: 0x1d252c })
      );
      door.position.set(0, 1.4, foot / 2 - 0.1);
      grp.add(door);

      // The shaft, with one setback once the chapter is long enough to need it
      var rest = Math.max(2, h - 4.3);
      if (h > 30) {
        shell(foot, rest * 0.72, 4.3);
        shell(foot * 0.74, rest * 0.28, 4.3 + rest * 0.72);
      } else {
        shell(foot, rest, 4.3);
      }
      var top = 4.3 + rest;
      var topWidth = h > 30 ? foot * 0.74 : foot;

      if (hasHip) {
        // Tiled hip roof, with a chimney where the theme has them
        var hip = new THREE.Mesh(hipRoofGeometry(THREE),
          new THREE.MeshLambertMaterial({ color: roofColour(), flatShading: true }));
        hip.scale.set(topWidth + 0.9, topWidth * 0.42, topWidth + 0.9);
        hip.position.y = top + 0.2;
        hip.castShadow = true;
        grp.add(hip);
        if (theme.chimneys) {
          var stack = new THREE.Mesh(new THREE.BoxGeometry(1, 3.2, 1), new THREE.MeshLambertMaterial({ color: 0x8b5a46 }));
          stack.position.set(topWidth * 0.22, top + 1.8, -topWidth * 0.12);
          stack.castShadow = true;
          grp.add(stack);
        }
        top += topWidth * 0.42;
      } else {
        // Flat roof: a water tower on some, plant boxes on all
        if (rand() < theme.tanks + 0.15) {
          var tank = waterTower();
          tank.position.set((rand() - 0.5) * topWidth * 0.4, top + 0.2, (rand() - 0.5) * topWidth * 0.4);
          grp.add(tank);
        }
        var plant = new THREE.Mesh(
          new THREE.BoxGeometry(topWidth * 0.3, 1, topWidth * 0.22),
          new THREE.MeshLambertMaterial({ color: 0x9a9a96 })
        );
        plant.position.set(-topWidth * 0.2, top + 0.7, topWidth * 0.2);
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
      banner.position.set(foot / 2 - 1.6, bannerTop - bannerH / 2 - 1.2, foot / 2 + 0.35);
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
        new THREE.BoxGeometry(foot + 1, top + 3, foot + 1),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hit.position.y = (top + 3) / 2;
      grp.add(hit);

      return {
        grp: grp, hit: hit, seg: seg, height: top + 2.7, base: 0,
        mats: mats, marker: marker, markerY: top + 4.5,
        // Where a crowd would stand: the forecourt in front of the entrance
        forecourt: new THREE.Vector3(bx, KERB, bz - 1.5 + foot / 2 + 4)
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

    /* ---------- instanced scenery ---------- */
    var shadow = { cast: true, receive: true };
    add(instanced(THREE, new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: theme.sidewalk }), slabs, { receive: true }));
    add(instanced(THREE, new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: theme.lawn }), lawns, { receive: true }));

    // Scenery facades share three neutral textures, tinted per building by instance colour
    function sceneryMesh(list, repX, repY) {
      var t = facadeTexture(THREE, { wall: "#f4f1ea", trim: "#ffffff", glass: "#62717c" });
      t.repeat.set(repX, repY);
      var side = new THREE.MeshLambertMaterial({ map: t });
      var roof = new THREE.MeshLambertMaterial({ color: 0x8a857e });
      return instanced(THREE, new THREE.BoxGeometry(1, 1, 1), [side, side, roof, roof, side, side], list, shadow);
    }
    add(sceneryMesh(lowB, 2, 2));
    add(sceneryMesh(midB, 3, 4));
    add(sceneryMesh(tallB, 3, 7));
    add(instanced(THREE, hipRoofGeometry(THREE),
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), hips, shadow));
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
      return { x: t.x, y: KERB + (t.y || 0), z: t.z, sx: thick * t.size, sy: TRUNK[t.kind] / 2.4 * t.size, sz: thick * t.size };
    });
    function crowns(kind, lift, squash) {
      return trees.filter(function (t) { return t.kind === kind; }).map(function (t) {
        var s2 = t.size * (0.9 + rand() * 0.25);
        return {
          x: t.x, y: KERB + (t.y || 0) + (TRUNK[kind] + lift) * t.size, z: t.z,
          sx: s2 * squash[0], sy: s2 * squash[1], sz: s2 * squash[2], ry: rand() * 6, color: t.color
        };
      });
    }
    var trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 2.4, 6);
    trunkGeo.translate(0, 1.2, 0);
    var leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
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

    /* ---------- people ---------- */
    var walkers = [];
    var totalWeight = walkways.reduce(function (sum, w) { return sum + w.weight; }, 0);
    var peopleCount = Math.min(420, 70 + n * 9);
    walkways.forEach(function (w) {
      var here = Math.round(peopleCount * w.weight / totalWeight);
      for (var p = 0; p < here; p++) {
        walkers.push({
          cx: w.x, cz: w.z, half: BLOCK / 2 - WALK,
          s: rand() * 4 * (BLOCK - WALK * 2),
          speed: (1.1 + rand() * 0.9) * (rand() < 0.5 ? 1 : -1),
          lane: (rand() - 0.5) * 1.2,
          phase: rand() * 6
        });
      }
    });
    // A touch larger than life, so people still read as people from the default view
    var bodyGeo = new THREE.CylinderGeometry(0.46, 0.4, 1.7, 7);
    bodyGeo.translate(0, 0.85, 0);
    var headGeo = new THREE.SphereGeometry(0.38, 8, 6);
    headGeo.translate(0, 2.1, 0);
    var bodies = instanced(THREE, bodyGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }),
      walkers.map(function () { return { x: 0, y: 0, z: 0, color: pick(rand, SHIRTS) }; }), { cast: true });
    var heads = instanced(THREE, headGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }),
      walkers.map(function () { return { x: 0, y: 0, z: 0, color: pick(rand, SKIN) }; }));
    if (bodies) { root.add(bodies); root.add(heads); }

    /* ---------- traffic ---------- */
    var vehicles = [];
    var spanZ = D / 2 + STREET, spanX = W / 2 + STREET;
    function addVehicle(kind) {
      var alongZ = rand() < 0.5;
      var line = alongZ ? Math.floor(rand() * (gc + 1)) : Math.floor(rand() * (gr + 1));
      var dir = rand() < 0.5 ? 1 : -1;
      var span = alongZ ? spanZ : spanX;
      vehicles.push({
        kind: kind, alongZ: alongZ, dir: dir,
        line: alongZ ? (line - gc / 2) * PITCH : (line - gr / 2) * PITCH,
        pos: (rand() * 2 - 1) * span, span: span,
        speed: kind === "bus" ? 8 + rand() * 2 : 12 + rand() * 7,
        color: kind === "bus" ? null : pick(rand, CARS)
      });
    }
    var streets = gc + gr + 2;
    var b2;
    for (b2 = 0; b2 < Math.max(3, Math.round(streets * 0.4)); b2++) addVehicle("bus");
    for (b2 = 0; b2 < Math.round(streets * 1.8); b2++) addVehicle("car");
    var buses = vehicles.filter(function (v) { return v.kind === "bus"; });
    var cars = vehicles.filter(function (v) { return v.kind === "car"; });

    var carGeo = new THREE.BoxGeometry(2.1, 1.0, 4.4);
    carGeo.translate(0, 0.85, 0);
    var cabinGeo = new THREE.BoxGeometry(1.85, 0.85, 2.3);
    cabinGeo.translate(0, 1.75, -0.2);
    var glassMat = new THREE.MeshLambertMaterial({ color: 0x2d3b46 });

    function vehicleMesh(geo, list, coloured) {
      return instanced(THREE, geo, coloured ? new THREE.MeshLambertMaterial({ color: 0xffffff }) : glassMat,
        list.map(function (v) { return { x: 0, y: 0, z: 0, color: coloured ? v.color : undefined }; }), { cast: coloured });
    }
    var carBodies = vehicleMesh(carGeo, cars, true), carCabins = vehicleMesh(cabinGeo, cars, false);
    [carBodies, carCabins].forEach(add);

    // Buses are few, so each is its own group and can carry a readable destination sign
    var busBodyGeo = new THREE.BoxGeometry(2.6, 2.9, 10);
    busBodyGeo.translate(0, 1.85, 0);
    var busBandGeo = new THREE.BoxGeometry(2.64, 0.75, 10.04);
    busBandGeo.translate(0, 0.8, 0);
    var busWinGeo = new THREE.BoxGeometry(2.66, 0.9, 9.2);
    busWinGeo.translate(0, 2.35, 0.1);
    var routeLooks = ROUTES.map(function (r) {
      var sign = new THREE.MeshBasicMaterial({ map: signTexture(THREE, r.sign) });
      return { body: new THREE.MeshLambertMaterial({ color: r.body }), band: new THREE.MeshLambertMaterial({ color: r.band }), sign: sign };
    });
    buses.forEach(function (v, idx) {
      var look = routeLooks[idx % routeLooks.length];
      var g = new THREE.Group();
      var body = new THREE.Mesh(busBodyGeo, look.body);
      body.castShadow = true;
      g.add(body, new THREE.Mesh(busBandGeo, look.band), new THREE.Mesh(busWinGeo, glassMat));
      var front = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.32), look.sign);
      front.position.set(0, 3.0, 5.02);
      var right = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.42), look.sign);
      right.position.set(1.34, 3.0, 2.2);
      right.rotation.y = Math.PI / 2;
      var left = right.clone();
      left.position.x = -1.34;
      left.rotation.y = -Math.PI / 2;
      g.add(front, right, left);
      root.add(g);
      v.group = g;
    });

    /* ---------- clouds ---------- */
    var puffs = [], clouds = [];
    var cloudCount = 5 + Math.floor(rand() * 4);
    for (var c = 0; c < cloudCount; c++) {
      var cloud = { x: (rand() - 0.5) * extent * 1.6, y: 110 + rand() * 50, z: (rand() - 0.5) * extent * 1.6, first: puffs.length, count: 0 };
      var parts = 4 + Math.floor(rand() * 4);
      for (var q = 0; q < parts; q++) {
        var r2 = 6 + rand() * 7;
        puffs.push({ dx: (q - parts / 2) * 7 + rand() * 4, dy: rand() * 4, dz: (rand() - 0.5) * 8, r: r2 });
        cloud.count++;
      }
      clouds.push(cloud);
    }
    var cloudMesh = add(instanced(THREE, new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35, flatShading: true }),
      puffs.map(function () { return { x: 0, y: 0, z: 0 }; })));

    /* ---------- animation ---------- */
    var m4 = new THREE.Matrix4(), quat = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(1, 1, 1);
    var up = new THREE.Vector3(0, 1, 0);

    function place(mesh, index, px, py, pz, heading, sx, sy, sz) {
      pos.set(px, py, pz);
      quat.setFromAxisAngle(up, heading);
      scl.set(sx || 1, sy || 1, sz || 1);
      m4.compose(pos, quat, scl);
      mesh.setMatrixAt(index, m4);
    }

    function stepWalkers(t, dt) {
      walkers.forEach(function (w, idx) {
        var side = w.half * 2, loop = side * 4;
        w.s = ((w.s + w.speed * dt) % loop + loop) % loop;
        var edge = Math.floor(w.s / side), u = w.s - edge * side - w.half;
        var off = w.half + w.lane, px, pz, heading;
        if (edge === 0) { px = w.cx + u; pz = w.cz + off; heading = Math.PI / 2; }
        else if (edge === 1) { px = w.cx + off; pz = w.cz - u; heading = Math.PI; }
        else if (edge === 2) { px = w.cx - u; pz = w.cz - off; heading = -Math.PI / 2; }
        else { px = w.cx - off; pz = w.cz + u; heading = 0; }
        if (w.speed < 0) heading += Math.PI;
        var bob = Math.abs(Math.sin(t * 7 + w.phase)) * 0.08;
        place(bodies, idx, px, KERB + bob, pz, heading);
        place(heads, idx, px, KERB + bob, pz, heading);
      });
      bodies.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
    }

    // Advances every vehicle on its street and hands back where it is and which way it faces
    function drive(list, dt, each) {
      list.forEach(function (v, idx) {
        v.pos += v.speed * v.dir * dt;
        if (v.pos > v.span) v.pos -= v.span * 2;
        if (v.pos < -v.span) v.pos += v.span * 2;
        var lane = 2.4 * v.dir;
        var px = v.alongZ ? v.line - lane : v.pos;
        var pz = v.alongZ ? v.pos : v.line + lane;
        var heading = v.alongZ ? (v.dir > 0 ? 0 : Math.PI) : (v.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        each(v, idx, px, pz, heading);
      });
    }
    function stepCars(dt) {
      if (!carBodies) return;
      drive(cars, dt, function (v, idx, px, pz, heading) {
        place(carBodies, idx, px, 0, pz, heading);
        place(carCabins, idx, px, 0, pz, heading);
      });
      carBodies.instanceMatrix.needsUpdate = true;
      carCabins.instanceMatrix.needsUpdate = true;
    }
    function stepBuses(dt) {
      drive(buses, dt, function (v, idx, px, pz, heading) {
        v.group.position.set(px, 0, pz);
        v.group.rotation.y = heading;
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
      clouds.forEach(function (cl) {
        var cxx = ((cl.x + drift + extent * 1.6) % (extent * 3.2)) - extent * 1.6;
        for (var p = 0; p < cl.count; p++) {
          var pf = puffs[cl.first + p];
          place(cloudMesh, cl.first + p, cxx + pf.dx, cl.y + pf.dy, cl.z + pf.dz, 0, pf.r, pf.r * 0.7, pf.r);
        }
      });
      cloudMesh.instanceMatrix.needsUpdate = true;
    }

    // Place everything once, so a reduced-motion city is still populated
    if (bodies) stepWalkers(0, 0);
    stepBuses(0);
    stepCars(0);
    stepPolybahn(0);
    if (cloudMesh) stepClouds(0);

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
      if (o.reduced) return;
      if (bodies) stepWalkers(t, dt);
      stepBuses(dt);
      stepCars(dt);
      stepPolybahn(t);
      if (cloudMesh) stepClouds(t);
    }

    // How far the camera may roam: the street grid plus one street of margin
    return { houses: houses, animate: animate, halfX: W / 2 + STREET, halfZ: D / 2 + STREET };
  }

  return { build: build };
})();
