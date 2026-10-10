/* Shared, procedural spacecraft for the galaxy and the live Versus cockpit.
   Uses the locally vendored Three.js. No network assets or game state live here. */
(function () {
  "use strict";
  function createShip(T, accent) {
    var ship = new T.Group();
    var armor = new T.MeshStandardMaterial({ color: 0x33435e, metalness: .72, roughness: .4 });
    var edge = new T.MeshStandardMaterial({ color: 0x8b9cb5, metalness: .7, roughness: .36 });
    var dark = new T.MeshStandardMaterial({ color: 0x111b2e, metalness: .5, roughness: .55 });
    var trim = new T.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: .65, metalness: .35, roughness: .3 });
    var glass = new T.MeshStandardMaterial({ color: 0x8bb6d6, emissive: 0x274a6b, emissiveIntensity: .8, metalness: .25, roughness: .12, transparent:true, opacity:.22, depthWrite:false });
    function box(w, h, d, x, y, z, mat) {
      var m = new T.Mesh(new T.BoxGeometry(w, h, d), mat || armor);
      m.position.set(x, y, z); ship.add(m); return m;
    }
    function wing(side) {
      var s = new T.Shape();
      s.moveTo(.65, -3.1); s.lineTo(2.25, -2.1); s.lineTo(6.4, 2.3);
      s.lineTo(6.1, 3.9); s.lineTo(2.3, 2.65); s.lineTo(.65, 3.6); s.closePath();
      var g = new T.ExtrudeGeometry(s, { depth: .25, bevelEnabled: true, bevelSize: .1, bevelThickness: .08, bevelSegments: 1, steps: 1 });
      g.rotateX(Math.PI / 2);
      var m = new T.Mesh(g, armor); m.scale.x = side; m.position.y = -.12; ship.add(m);
      box(.11, .07, 3.2, side * 3.3, .06, 1.1, trim).rotation.y = side * -.65;
      box(.42, .4, 3.6, side * 5.3, -.06, 2.15, dark);
      box(.17, .17, 1.9, side * 5.3, -.02, -.45, edge);
    }
    wing(1); wing(-1);
    var nose = new T.Mesh(new T.ConeGeometry(1.2, 5.6, 4), armor);
    nose.rotation.x = -Math.PI / 2; nose.rotation.z = Math.PI / 4;
    nose.scale.y = 1.2; nose.position.z = -2.8; nose.scale.z = .6; ship.add(nose);
    box(1.8, .8, 5.1, 0, 0, 1.55);
    var canopy = new T.Mesh(new T.SphereGeometry(1, 12, 8), glass);
    canopy.scale.set(.77, .63, 1.65); canopy.position.set(0, .52, -1.05); ship.add(canopy);
    box(.08, .07, 2.5, 0, 1.08, -1.05, edge);
    var engines = [];
    [-1, 1].forEach(function (side) {
      box(.82, .8, 3.8, side * 1.8, -.08, 2.2, dark);
      var ring = new T.Mesh(new T.CylinderGeometry(.49, .49, .6, 12), edge);
      ring.rotation.x = Math.PI / 2; ring.position.set(side * 1.8, -.08, 4.2); ship.add(ring);
      var flame = new T.Mesh(new T.ConeGeometry(.33, 2.5, 12), new T.MeshBasicMaterial({color: accent, transparent: true, opacity: .8}));
      flame.rotation.x = Math.PI / 2; flame.position.set(side * 1.8, -.08, 5.7); ship.add(flame); engines.push(flame);
      var fin = box(.13, 1.6, 1.7, side * .82, 1, 2.6, armor); fin.rotation.z = -side * .22;
      box(.08, .35, 1.15, side * .84, 1.7, 2.6, trim);
    });
    ship.userData.engines = engines;
    ship.userData.canopy = canopy;
    return ship;
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

  function planetMaterial(T, color) {
    return new T.ShaderMaterial({vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG,
      uniforms: {uColor: {value: new T.Color(color)}, uTime: {value: 0}}});
  }
  function starfield(T, count, spread, size, opacity, texture) {
    var seed = count * 37;
    function random() { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; }
    var pos = new Float32Array(count * 3), col = new Float32Array(count * 3), tint = new T.Color();
    for (var i=0; i<count; i++) {
      var r=spread*(.55+random()*.45), th=random()*Math.PI*2, ph=Math.acos(2*random()-1);
      pos[i*3]=r*Math.sin(ph)*Math.cos(th);pos[i*3+1]=r*Math.cos(ph)*.65;pos[i*3+2]=r*Math.sin(ph)*Math.sin(th);
      tint.setHSL(.55+random()*.12,.3+random()*.4,.72+random()*.28);col.set([tint.r,tint.g,tint.b],i*3);
    }
    var geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(pos,3));geo.setAttribute('color',new T.BufferAttribute(col,3));
    return new T.Points(geo,new T.PointsMaterial({size:size,map:texture||null,vertexColors:true,transparent:true,opacity:opacity,depthWrite:false,blending:T.AdditiveBlending}));
  }

  function cabinPose(T, width) {
    var portrait=width<780;
    return {eye:new T.Vector3(portrait?.85:1.55,portrait?3.15:2.95,portrait?6.1:5.6),
      aim:new T.Vector3(portrait?-.55:1.6,1.7,-6), fov:portrait?64:53};
  }
  function createCabin(T, worldScale) {
    var frame = new T.Group();
    var armor=new T.MeshStandardMaterial({color:0x26374a,metalness:.45,roughness:.68});
    var edge=new T.MeshStandardMaterial({color:0x82929f,metalness:.65,roughness:.4});
    var rubber=new T.MeshStandardMaterial({color:0x0c1420,roughness:.9});
    var suit=new T.MeshStandardMaterial({color:0xa5ada9,roughness:.72,metalness:.12});
    var suitDark=new T.MeshStandardMaterial({color:0x394956,roughness:.8});
    var trim=new T.MeshStandardMaterial({color:0x829ed1,emissive:0x6d93ce,emissiveIntensity:.7,roughness:.45});
    var screen=new T.MeshBasicMaterial({color:0x718faa});
    function box(w,h,d,x,y,z,mat,parent) {
      var mesh=new T.Mesh(new T.BoxGeometry(w,h,d),mat||armor);mesh.position.set(x,y,z);(parent||frame).add(mesh);return mesh;
    }
    function ball(x,y,z,sx,sy,sz,mat,parent) {
      var mesh=new T.Mesh(new T.SphereGeometry(1,24,16),mat);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);(parent||frame).add(mesh);return mesh;
    }
    function beam(a,b,width,mat,parent) {
      var start=new T.Vector3().fromArray(a),end=new T.Vector3().fromArray(b);
      var mesh=new T.Mesh(new T.CylinderGeometry(width,width,start.distanceTo(end),10),mat||armor);
      mesh.position.copy(start).add(end).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),end.sub(start).normalize());(parent||frame).add(mesh);return mesh;
    }
    // Hull, floor, instrument wings, and two structural canopy arches.
    box(8,.2,11,0,-.1,0,rubber);
    [-1,1].forEach(function(s){
      box(.3,1.15,9,s*3.9,.45,-.2,armor);
      box(1.15,.25,5.4,s*3,.8,-1.3,armor).rotation.z=s*.1;
      box(.06,.04,5.8,s*3.52,.95,-1.3,trim);
      beam([s*3.9,.9,-3.8],[s*2.75,3.95,-4.7],.14);
      beam([s*2.75,3.95,-4.7],[0,4.55,-4.8],.14);
      beam([s*3.9,.9,2.4],[s*2.75,3.95,2.4],.18);
      beam([s*2.75,3.95,2.4],[0,4.55,2.4],.18);
      beam([s*2.75,3.95,2.4],[s*2.75,3.95,-4.7],.1,edge);
      beam([s*3.85,1.0,-3.8],[s*3.85,1.0,2.4],.06,edge);
      box(.8,.45,2,s*3.25,-.1,-6,armor);
      beam([s*3.25,.03,-6],[s*3.25,.03,-9],.085,edge);
      // Small tactile console switches, laid along actual angled control surfaces.
      for(var i=0;i<6;i++)box(.1,.04,.22,s*(2.7+(i%2)*.27),.96,-2.2+Math.floor(i/2)*.42,i===0?trim:edge);
    });
    box(7.8,.38,1.3,0,1,-3.3,armor).rotation.x=.18;
    box(7.6,.035,.04,0,1.19,-3.8,trim);
    [-1.7,0,1.7].forEach(function(x,i){
      var panel=box(1.35,.055,.65,x,1.26,-3.1,rubber);panel.rotation.x=.28;
      // Sparse authored flight instruments; no fake question text inside WebGL.
      for(var n=0;n<3;n++)box(.72-n*.16,.018,.025,x-.12,1.305+n*.045,-3.29+n*.16,screen);
    });
    // Pilot and chair form one seated assembly, visible over the shoulder.
    var pilot=new T.Group();pilot.name='seated-pilot';pilot.position.set(-.82,0,.65);frame.add(pilot);
    box(.18,.6,.18,0,.3,.25,edge,pilot);
    box(1.2,.25,1.12,0,.64,.07,rubber,pilot);
    var back=box(.97,1.1,.18,0,1.2,.55,armor,pilot);back.rotation.x=-.12;
    box(.72,.22,.18,0,1.82,.61,rubber,pilot);
    [-1,1].forEach(function(s){
      beam([s*.54,.74,.3],[s*.61,1.14,.02],.055,edge,pilot);
      box(.2,.12,.9,s*.6,1.13,-.18,rubber,pilot);
    });
    var upper=new T.Group();pilot.add(upper);
    ball(0,1.48,.06,.49,.61,.3,suit,upper);
    ball(0,.87,-.09,.43,.24,.35,suitDark,upper);
    // Collar, helmet shell, visor and rear communications pack.
    var collar=new T.Mesh(new T.CylinderGeometry(.25,.28,.14,24),rubber);collar.position.set(0,2.02,.03);upper.add(collar);
    var head=new T.Group();head.position.set(0,2.08,0);upper.add(head);
    ball(0,.24,.025,.365,.39,.35,suit,head);
    var visorMat=new T.MeshStandardMaterial({color:0x142d42,emissive:0x071524,emissiveIntensity:.55,metalness:.85,roughness:.19});
    ball(0,.26,-.075,.37,.235,.32,visorMat,head);
    box(.3,.13,.06,0,.22,.363,suitDark,head);
    box(.2,.028,.012,0,.22,.397,trim,head);
    [-1,1].forEach(function(s){
      ball(s*.365,.22,.015,.06,.13,.13,suitDark,head);
      ball(s*.46,1.8,0,.22,.23,.22,suit,upper);
      beam([s*.45,1.76,-.02],[s*.62,1.3,-.31],.145,suit,upper);
      ball(s*.62,1.3,-.31,.15,.15,.15,suitDark,upper);
      beam([s*.62,1.3,-.31],[s*.59,1.26,-.9],.12,suit,upper);
      ball(s*.59,1.26,-.91,.13,.105,.16,suitDark,upper);
      beam([s*.59,1.0,-.97],[s*.59,1.29,-.94],.055,rubber,upper);
      beam([s*.24,.86,-.17],[s*.29,.74,-.85],.19,suit,pilot);
      ball(s*.29,.74,-.85,.19,.2,.19,suitDark,pilot);
      beam([s*.29,.69,-.88],[s*.29,.24,-1.1],.145,suit,pilot);
      ball(s*.29,.15,-1.2,.19,.15,.33,rubber,pilot);
      // Harness visible at shoulders, not a floating avatar badge.
      beam([s*.28,1.98,.28],[s*.31,1.14,.37],.038,rubber,upper);
    });
    frame.userData.pilotReaction={upper:upper,head:head,visor:visorMat};
    var lamp=new T.PointLight(0x8cacde,.55,12*(worldScale||1));lamp.position.set(0,3,-2);frame.add(lamp);
    var ambient=new T.AmbientLight(0x94a7d7,.65);frame.add(ambient);
    var lightTarget=new T.Object3D();frame.add(lightTarget);
    var key=new T.DirectionalLight(0xe2ebff,1.25);key.position.set(-8,12,9);key.target=lightTarget;frame.add(key);
    var rim=new T.DirectionalLight(0x668ddc,.7);rim.position.set(8,3,-30);rim.target=lightTarget;frame.add(rim);
    return frame;
  }

  function createCockpit(canvas, options) {
    var T = window.THREE;
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x070a12);
    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(53, 1, .06, 10000);
    camera.position.set(0, 1.2, 10); camera.lookAt(0, .6, -24);
    var enemy = createShip(T, 0xdf9a70); enemy.rotation.y = Math.PI + .2; enemy.position.set(-2, 3.8, -38); scene.add(enemy);
    // The cabin is modeled at human scale. Its exterior position and heading come
    // from the boarded galaxy ship; course bodies retain their world coordinates.
    var universe = new T.Group(); scene.add(universe);
    var saved = options.universe || {};
    var origin = new T.Vector3().fromArray(saved.origin || [-118,66,14]);
    var heading = saved.rotation ? new T.Quaternion().fromArray(saved.rotation)
      : new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(origin,new T.Vector3(),new T.Vector3(0,1,0)));
    var inverse = heading.clone().invert();
    universe.quaternion.copy(inverse); universe.scale.setScalar(1 / .45);
    universe.position.copy(origin).negate().applyQuaternion(inverse).add(new T.Vector3(0,-.875,2.625)).multiplyScalar(1 / .45);
    function glowTexture(inner, outer) {
      var c=document.createElement('canvas');c.width=c.height=64;var ctx=c.getContext('2d');
      var g=ctx.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,inner);g.addColorStop(.42,outer);g.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=g;ctx.fillRect(0,0,64,64);return new T.CanvasTexture(c);
    }
    var glow=glowTexture('rgba(255,255,255,.95)','rgba(255,255,255,.22)'), starTexture=glowTexture('rgba(255,255,255,1)','rgba(255,255,255,.35)');
    var starNear=starfield(T,1400,420,2.4,.95,starTexture), starFar=starfield(T,2600,1500,5,.55,starTexture);
    if(saved.nearRotation)starNear.rotation.fromArray(saved.nearRotation);
    if(saved.farRotation)starFar.rotation.fromArray(saved.farRotation);
    universe.add(starNear,starFar);
    (saved.courses || []).forEach(function(c,i) {
      var position=c.position || [(56+i*42)*Math.cos(i*2.3),i%2?-6:4,-(56+i*42)*Math.sin(i*2.3)];
      var planet=new T.Mesh(new T.SphereGeometry(9,64,48),planetMaterial(T,c.color));
      planet.position.fromArray(position);planet.rotation.y=c.spin||0;planet.material.uniforms.uTime.value=c.time||0; universe.add(planet);
      var atmo=new T.Mesh(new T.SphereGeometry(9*1.16,48,32),new T.ShaderMaterial({vertexShader:PLANET_VERT,fragmentShader:ATMO_FRAG,uniforms:{uColor:{value:new T.Color(c.color)}},side:T.BackSide,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));atmo.position.copy(planet.position);universe.add(atmo);
      var halo=new T.Sprite(new T.SpriteMaterial({map:glow,color:c.color,transparent:true,opacity:.42,depthWrite:false,blending:T.AdditiveBlending}));
      halo.position.copy(planet.position);halo.scale.set(63,63,1);universe.add(halo);
      var orbit=new T.Mesh(new T.RingGeometry(55.92+i*42,56.08+i*42,120),new T.MeshBasicMaterial({color:c.color,transparent:true,opacity:.18,side:T.DoubleSide,depthWrite:false}));
      orbit.rotation.x=-Math.PI/2;universe.add(orbit);
      if(i<4){var nebula=new T.Sprite(new T.SpriteMaterial({map:glow,color:c.color,transparent:true,opacity:.08,depthWrite:false,blending:T.AdditiveBlending}));nebula.position.set(-260+i*190,40-i*60,-330-i*60);nebula.scale.set(560+i*40,560+i*40,1);universe.add(nebula);}
    });
    canvas.dataset.universe = saved.courses && saved.courses.length ? 'course-galaxy' : 'stars';
    canvas.dataset.perspective = 'behind-pilot';
    canvas.dataset.origin = origin.toArray().join(',');

    var frame=createCabin(T);scene.add(frame);
    var pilotReaction=frame.userData.pilotReaction;
    var cockpitFire=new T.Group();cockpitFire.position.set(2.85,1.35,-3.4);frame.add(cockpitFire);
    var flameMaterials=[];
    [0,1,2,3].forEach(function(i){
      var material=new T.MeshBasicMaterial({color:i%2?0xffd27b:0xff6737,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending});
      var flame=new T.Mesh(new T.ConeGeometry(.18+i*.055,.72+i*.19,7),material);
      flame.position.set((i-1.5)*.22,.38+i*.1,(i%2)*.14);cockpitFire.add(flame);flameMaterials.push(material);
    });
    var smoke=new T.Sprite(new T.SpriteMaterial({map:glow,color:0x747b88,transparent:true,opacity:0,depthWrite:false}));
    smoke.position.set(0,1.45,-.15);smoke.scale.set(1.8,2.5,1);cockpitFire.add(smoke);
    var fireLight=new T.PointLight(0xff6840,0,9);fireLight.position.set(2.8,1.8,-3.2);frame.add(fireLight);
    var cabinSparksGeo=new T.BufferGeometry(),cabinSparksPos=new Float32Array(36*3);
    for(var sparkIndex=0;sparkIndex<36;sparkIndex++){
      cabinSparksPos[sparkIndex*3]=(sparkIndex%9-4)*.16;
      cabinSparksPos[sparkIndex*3+1]=(sparkIndex*17%31)*.045;
      cabinSparksPos[sparkIndex*3+2]=(sparkIndex%5-2)*.13;
    }
    cabinSparksGeo.setAttribute('position',new T.BufferAttribute(cabinSparksPos,3));
    var cabinSparks=new T.Points(cabinSparksGeo,new T.PointsMaterial({color:0xffc68f,size:.07,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending}));
    cabinSparks.position.set(2.8,1.45,-3.3);frame.add(cabinSparks);
    // Render the same exterior around the cabin, so the last boarding frame and
    // the first cockpit frame have identical hull/roof/wing geometry.
    var ownHull=createShip(T,0x8daaff);ownHull.scale.setScalar(1/.18);ownHull.position.set(0,-.35/.18,1.05/.18);ownHull.userData.canopy.visible=false;scene.add(ownHull);
    var seed=73731;
    function random(){seed=seed*16807%2147483647;return(seed-1)/2147483646;}

    var bolts = [];
    for (var j=0; j<6; j++) {
      var bolt = new T.Mesh(new T.CylinderGeometry(.045,.045,4,6), new T.MeshBasicMaterial({color: j<3 ? 0xb5ccff : 0xf5b690}));
      bolt.rotation.x = Math.PI / 2; bolt.visible = false; scene.add(bolt); bolts.push(bolt);
    }
    var shield = new T.Mesh(new T.SphereGeometry(7.5,24,16), new T.MeshBasicMaterial({color: 0xa6baff, wireframe: true, transparent: true, opacity: 0}));
    shield.position.copy(enemy.position); shield.scale.set(1,.65,.65); scene.add(shield);
    var sparksGeo = new T.BufferGeometry(); var particles = new Float32Array(70*3);
    for (var k=0; k<70; k++) { particles[k*3]=(random()-.5)*9; particles[k*3+1]=(random()-.5)*5; particles[k*3+2]=(random()-.5)*5; }
    sparksGeo.setAttribute("position", new T.BufferAttribute(particles,3));
    var sparks = new T.Points(sparksGeo,new T.PointsMaterial({color:0xffcda0,size:.18,transparent:true,opacity:0}));
    sparks.position.copy(enemy.position); scene.add(sparks);
    var reduced = !!options.reduced, paused = false, disposed = false, raf = 0, burst = null, impactAt = 0, battle = false, active = true;
    var startAt = performance.now(), lastAt = 0, lookX=0, lookY=0, drag=null, enemyArrival=0;
    var eye=new T.Vector3(), aim=new T.Vector3();
    function resize() {
      var w = canvas.clientWidth || 800, h = canvas.clientHeight || 320;
      renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix();
      var pose=cabinPose(T,w);camera.fov=pose.fov;camera.updateProjectionMatrix();
      eye.copy(pose.eye);aim.copy(pose.aim);
      enemy.scale.setScalar(1.15);
      render(performance.now());
    }
    function render(now) {
      if (disposed) return;
      var t = (now-startAt)/1000;
      var motion = !reduced && !paused;
      enemy.visible=battle;
      var arrival=enemyArrival && motion ? Math.min(1,(now-enemyArrival)/1600) : 1;
      var approach=1-Math.pow(1-arrival,3);
      enemy.position.set(-2+(1-approach)*55,3.8+(1-approach)*12,-38-(1-approach)*65);
      canvas.dataset.enemy = !battle ? 'absent' : arrival<1 ? 'approaching' : 'engaged';
      if(arrival>=1)enemyArrival=0;
      shield.position.copy(enemy.position);sparks.position.copy(enemy.position);
      enemy.rotation.z = motion && !battle ? Math.sin(t*.3)*.035 : 0;
      enemy.rotation.y = Math.PI + .45;
      enemy.rotation.x = .3;
      camera.position.copy(eye);
      shield.material.opacity = 0; sparks.material.opacity = 0;
      bolts.forEach(function(b){b.visible=false;});
      var damage=motion && impactAt ? (now-impactAt)/1000 : -1;
      var burning=damage>=0 && damage<3;
      var heat=burning?Math.min(1,damage*5)*Math.max(0,1-damage/3):0;
      var panic=burning?Math.min(1,Math.max(0,(damage-.08)*3))*Math.min(1,Math.max(0,(2.8-damage)*1.2)):0;
      cockpitFire.visible=burning;
      flameMaterials.forEach(function(mat,i){mat.opacity=heat*(.58+.22*Math.sin(t*19+i*2));});
      smoke.material.opacity=heat*.23;
      smoke.position.y=1.45+Math.max(0,damage)*.26;
      smoke.scale.set(1.8+Math.max(0,damage)*.32,2.5+Math.max(0,damage)*.5,1);
      fireLight.intensity=heat*(2.1+.6*Math.sin(t*25));
      cabinSparks.material.opacity=heat*(.3+.5*Math.abs(Math.sin(t*29)));
      pilotReaction.upper.rotation.y=-.22*panic;
      pilotReaction.upper.rotation.z=.09*panic;
      pilotReaction.head.rotation.y=-2.32*panic;
      pilotReaction.head.rotation.z=-.18*panic;
      pilotReaction.visor.emissive.setRGB(.03+.45*panic,.08,.14*(1-panic));
      canvas.dataset.pilot=panic>.1?'alarmed':'steady';
      canvas.dataset.impact=burning?'burning':'idle';
      if (burst && motion) {
        var elapsed = (now-burst.at)/1000;
        for(var n=0;n<3;n++) {
          var phase=(elapsed-n*.2)/.58;
          if (phase>=0 && phase<=1) {
            if(burst.outgoing) { var out=bolts[n]; out.visible=true; out.position.set((n%2 ? -1 : 1)*3.25*(1-phase)-2*phase,.03+phase*3.77,-9-phase*29); }
            if(burst.incoming) { var inc=bolts[n+3]; inc.visible=true; inc.position.set(-2*(1-phase)+(n%2 ? -1 : 1)*3*phase,3.8*(1-phase),-38+phase*42); }
          }
        }
        var pulse=Math.max(0,Math.sin((elapsed-.48)*Math.PI*2));
        if(elapsed>.48 && elapsed<1.18) {
          if(burst.outgoing) { shield.material.opacity=pulse*.33; sparks.material.opacity=pulse; sparks.scale.setScalar(.5+elapsed); enemy.rotation.z+=Math.sin(elapsed*24)*.07*pulse; }
          if(burst.incoming) { camera.position.x+=Math.sin(elapsed*38)*.095*pulse; camera.position.y+=Math.cos(elapsed*29)*.08*pulse; }
        }
        if(elapsed>1.5) burst=null;
      }
      camera.lookAt(aim.x+lookX,aim.y+lookY,aim.z);
      renderer.render(scene,camera);
    }
    function loop(now) {
      raf = 0;
      if (disposed || document.hidden || !active) return;
      if(now-lastAt>32) {render(now); lastAt=now;}
      if(!reduced && !paused && (burst || enemyArrival || (impactAt && now<impactAt+3000))) raf=requestAnimationFrame(loop);
    }
    function resume() { if(!raf && !disposed) raf=requestAnimationFrame(loop); }
    var observer = new ResizeObserver(resize); observer.observe(canvas);
    var visibility = new IntersectionObserver(function(entries){ active=entries[0].isIntersecting; if(active) resume(); else if(raf){cancelAnimationFrame(raf);raf=0;} }); visibility.observe(canvas);
    function onVisibility(){ if(!document.hidden) resume(); else if(raf){cancelAnimationFrame(raf);raf=0;} }
    document.addEventListener("visibilitychange",onVisibility);
    function look(dx,dy){lookX=Math.max(-4,Math.min(4,lookX+dx));lookY=Math.max(-1.8,Math.min(2.4,lookY+dy));canvas.dataset.look=lookX+','+lookY;render(performance.now());}
    function down(e){if(e.button!==0)return;drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);}
    function move(e){if(!drag)return;look((drag.x-e.clientX)*.014,(e.clientY-drag.y)*.012);drag={x:e.clientX,y:e.clientY};}
    function up(){drag=null;}
    canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
    resize(); resume();
    return {
      look: look,
      reset: function(){lookX=lookY=0;look(0,0);},
      update: function(state) { reduced=state.reduced;paused=state.paused;if(state.battle&&!battle)enemyArrival=performance.now();battle=state.battle;if(!state.reviewing)burst=null;render(performance.now());resume(); },
      fire: function(event) { var now=performance.now();burst={at:now,outgoing:event.outgoing,incoming:event.incoming};if(event.incoming)impactAt=now+350;render(now);resume(); },
      dispose: function() {
        disposed=true;canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);cancelAnimationFrame(raf);observer.disconnect();visibility.disconnect();document.removeEventListener("visibilitychange",onVisibility);
        var geos=new Set(), mats=new Set(); scene.traverse(function(o){if(o.geometry)geos.add(o.geometry);if(o.material) {if(Array.isArray(o.material))o.material.forEach(function(m){mats.add(m);});else mats.add(o.material);}});
        geos.forEach(function(g){g.dispose();});mats.forEach(function(m){m.dispose();});glow.dispose();starTexture.dispose();renderer.dispose();
      }
    };
  }
  window.VisConDuel = {createShip:createShip,createCockpit:createCockpit,planetMaterial:planetMaterial,starfield:starfield,createCabin:createCabin,cabinPose:cabinPose};
})();
