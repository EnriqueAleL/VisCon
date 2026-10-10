/* Shared, procedural spacecraft for the galaxy and the live Versus cockpit.
   Uses the locally vendored Three.js. No network assets or game state live here. */
(function () {
  "use strict";
  function surfaceTexture(T, kind) {
    var c=document.createElement('canvas');c.width=c.height=512;
    var ctx=c.getContext('2d'),seed=917;
    function rand(){seed=seed*16807%2147483647;return(seed-1)/2147483646;}
    ctx.fillStyle=kind==='hull'?'#aca99e':'#625f57';ctx.fillRect(0,0,512,512);
    for(var i=0;i<6000;i++){var v=rand()>.5?255:0;ctx.fillStyle='rgba('+v+','+v+','+v+','+(rand()*.065)+')';ctx.fillRect(rand()*512,rand()*512,1+rand()*3,1);}
    for(var y=0;y<512;y+=128)for(var x=0;x<512;x+=128){
      ctx.fillStyle='rgba(0,0,0,.24)';ctx.fillRect(x,y,128,2);ctx.fillRect(x,y,2,128);
      ctx.fillStyle='rgba(255,255,240,.2)';ctx.fillRect(x+2,y+2,124,1);
      for(var j=0;j<4;j++){ctx.fillStyle='#35332f';ctx.beginPath();ctx.arc(x+9+(j%2)*109,y+9+Math.floor(j/2)*109,2,0,Math.PI*2);ctx.fill();}
    }
    for(var n=0;n<130;n++){ctx.strokeStyle='rgba(20,18,15,'+(.04+rand()*.13)+')';ctx.lineWidth=.5+rand();var px=rand()*512,py=rand()*512;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+rand()*27,py+rand()*5);ctx.stroke();}
    var tex=new T.CanvasTexture(c);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.anisotropy=4;return tex;
  }
  function beveledBox(T,w,h,d,material) {
    var r=Math.min(w,h,d)*.16,shape=new T.Shape();
    shape.moveTo(-w/2+r,-h/2);shape.lineTo(w/2-r,-h/2);shape.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);
    shape.lineTo(w/2,h/2-r);shape.quadraticCurveTo(w/2,h/2,w/2-r,h/2);shape.lineTo(-w/2+r,h/2);shape.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);shape.lineTo(-w/2,-h/2+r);shape.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);
    var geo=new T.ExtrudeGeometry(shape,{depth:d-r*2,bevelEnabled:true,bevelSize:r*.5,bevelThickness:r,bevelSegments:2,steps:1,curveSegments:3});geo.translate(0,0,-d/2+r);
    return new T.Mesh(geo,material);
  }
  function createShip(T, accent) {
    var ship=new T.Group(),texture=surfaceTexture(T,'hull');
    var armor=new T.MeshStandardMaterial({color:0xb9b5a8,map:texture,bumpMap:texture,bumpScale:.035,metalness:.48,roughness:.72});
    var dark=new T.MeshStandardMaterial({color:0x292b2c,metalness:.62,roughness:.66});
    var edge=new T.MeshStandardMaterial({color:0x77786f,metalness:.6,roughness:.54});
    function box(w,h,d,x,y,z,mat){var m=beveledBox(T,w,h,d,mat||armor);m.position.set(x,y,z);ship.add(m);return m;}
    var points=[[0,-.52],[3.9,-.52],[5.5,-.25],[5.9,0],[5.6,.35],[3.8,.73],[0,.73]].map(function(p){return new T.Vector2(p[0],p[1]);});
    var hull=new T.Mesh(new T.LatheGeometry(points,64),armor);hull.scale.z=.86;ship.add(hull);
    [-1,1].forEach(function(side){
      box(1.55,.67,5.7,side*1.7,.03,-4.45);box(.22,.08,4.6,side*1.7,.41,-4.5,edge);
      box(.74,.17,1.65,side*1.7,.47,-3.6,dark);
      for(var i=0;i<7;i++)box(.73,.045,.06,side*1.7,.565,-4.22+i*.19,edge);
      for(var k=0;k<3;k++){var vent=new T.Mesh(new T.CylinderGeometry(.47,.47,.1,24),dark);vent.position.set(side*(1.15+k*.92),.66,2.1);ship.add(vent);var grate=new T.Mesh(new T.TorusGeometry(.38,.035,6,24),edge);grate.rotation.x=Math.PI/2;grate.position.copy(vent.position);grate.position.y+=.075;ship.add(grate);}
    });
    box(2.1,.3,1.9,0,.81,.25,edge);
    var turret=new T.Mesh(new T.CylinderGeometry(.62,.76,.23,24),dark);turret.position.set(0,1.05,.25);ship.add(turret);
    box(.12,.12,1.5,-.18,1.23,-.52,dark);box(.12,.12,1.5,.18,1.23,-.52,dark);
    // Offset cockpit tube, radial hull plating, dish and blue aft engine bank.
    box(2.5,.7,1.25,4.5,.15,-1.55).rotation.y=-.55;
    var canopy=new T.Group();ship.add(canopy);
    var glass=new T.MeshStandardMaterial({color:0x15232a,metalness:.6,roughness:.14});
    var cockpit=new T.Mesh(new T.CylinderGeometry(.65,.83,2.65,12),armor);cockpit.rotation.x=Math.PI/2;cockpit.position.set(5.6,.26,-2.95);canopy.add(cockpit);
    var front=new T.Mesh(new T.CylinderGeometry(.61,.61,.15,12),glass);front.rotation.x=Math.PI/2;front.position.set(5.6,.26,-4.31);canopy.add(front);
    for(var j=0;j<5;j++){var strip=box(.06,.08,1.15,5.6+(j-2)*.23,.82,-3.52,edge);canopy.add(strip);}
    var dish=new T.Mesh(new T.SphereGeometry(.75,24,12,0,Math.PI*2,0,.8),edge);dish.position.set(-2.1,1.25,.5);dish.rotation.z=-.28;ship.add(dish);
    for(var n=0;n<18;n++){var angle=n*Math.PI*2/18;box(.045,.035,2.3,Math.cos(angle)*4.25,.47,Math.sin(angle)*3.65,edge).rotation.y=-angle+Math.PI/2;}
    var engines=[];
    for(var e=0;e<11;e++){var x=(e-5)*.6,z=Math.sqrt(Math.max(0,25-x*x))*.86;var m=box(.54,.19,.09,x,.02,z,new T.MeshBasicMaterial({color:accent}));engines.push(m);}
    ship.userData.engines=engines;ship.userData.canopy=canopy;ship.userData.surfaceTexture=texture;
    return ship;
  }

  function createTraffic(T) {
    var fleet=new T.Group();fleet.name='deep-space-fleet';
    // Distant traffic has its own fixed sunlight shading and adds no scene lights.
    function fleetMaterial(color){
      var material=new T.MeshBasicMaterial({color:color});
      material.onBeforeCompile=function(shader){
        shader.vertexShader='varying vec3 vFleetNormal;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFleetNormal=normalize(mat3(modelMatrix)*normal);');
        shader.fragmentShader='varying vec3 vFleetNormal;\n'+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=.32+.68*max(dot(normalize(vFleetNormal),normalize(vec3(-.25,.75,.6))),0.);');
      };
      return material;
    }
    var metal=fleetMaterial(0x687582),dark=fleetMaterial(0x1b232d);
    var engine=new T.MeshBasicMaterial({color:0x72b3e9});
    function box(parent,w,h,d,x,y,z,mat){var m=new T.Mesh(new T.BoxGeometry(w,h,d),mat||metal);m.position.set(x,y,z);parent.add(m);return m;}
    function fighter(imperial){
      var ship=new T.Group();
      if(imperial){
        var pod=new T.Mesh(new T.SphereGeometry(1.1,16,12),metal);ship.add(pod);
        var window=new T.Mesh(new T.CircleGeometry(.62,8),dark);window.position.z=-1.08;window.rotation.y=Math.PI;ship.add(window);
        box(ship,5,.23,.23,0,0,0);
        [-1,1].forEach(function(side){var panel=new T.Mesh(new T.CylinderGeometry(2.8,2.8,.13,6),dark);panel.rotation.z=Math.PI/2;panel.position.x=side*2.5;ship.add(panel);
          var ribs=new T.LineSegments(new T.EdgesGeometry(panel.geometry),new T.LineBasicMaterial({color:0x87909a}));ribs.rotation.copy(panel.rotation);ribs.position.copy(panel.position);ship.add(ribs);
        });
      } else {
        box(ship,.7,.65,4.5,0,0,0);box(ship,.5,.35,1.7,0,.38,-.6,dark);
        [-1,1].forEach(function(side){[-1,1].forEach(function(height){var wing=box(ship,3,.09,1.3,side*1.65,height*.62,.65);wing.rotation.z=side*height*.26;box(ship,.12,.12,3.3,side*3,height*1.0,-.1,dark);box(ship,.38,.38,.15,side*1.1,height*.36,1.78,engine);});});
      }
      box(ship,.45,.35,.06,0,0,1.13,engine);return ship;
    }
    var imperial=fighter(true),rebel=fighter(false),squads=[];
    var centers=[[-165,105,-180],[185,-35,-210],[10,180,-300],[-260,-110,-320],[260,130,-430],[-40,-130,-460]];
    centers.forEach(function(center,i){var members=[];
      for(var j=0;j<3;j++){var ship=(j===0?rebel:imperial).clone();ship.scale.setScalar(i<2?1.9:2.4);fleet.add(ship);members.push(ship);}
      var geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(new Float32Array(6),3));
      var laser=new T.Line(geo,new T.LineBasicMaterial({color:0x7dc695,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending}));laser.frustumCulled=false;fleet.add(laser);
      squads.push({center:center,members:members,laser:laser,phase:i*1.7,radius:50+i*9,speed:.21-i*.013});
    });
    var next=new T.Vector3(),rotation=new T.Matrix4(),up=new T.Vector3(0,1,0),lastSound=-9;
    function route(squad,time,target){var a=time*squad.speed+squad.phase,c=squad.center;target.set(c[0]+Math.cos(a)*squad.radius,c[1]+Math.sin(a*2)*18,c[2]+Math.sin(a)*squad.radius*.6);return target;}
    fleet.userData.update=function(time,audible){
      squads.forEach(function(squad,i){
        squad.members.forEach(function(ship,j){var lag=j*.78;route(squad,time-lag,ship.position);route(squad,time-lag+.1,next);ship.quaternion.setFromRotationMatrix(rotation.lookAt(ship.position,next,up));ship.rotateZ(Math.sin((time-lag)*squad.speed+squad.phase)*-.24);});
        var pulse=(time+i*.61)%3.8,fire=pulse<.32; squad.laser.material.opacity=fire?Math.sin(pulse/.32*Math.PI)*.8:0;
        if(fire){var positions=squad.laser.geometry.attributes.position;var chase=squad.members[1].position,lead=squad.members[0].position;var progress=pulse/.32;
          for(var endpoint=0;endpoint<2;endpoint++){next.copy(chase).lerp(lead,Math.min(1,progress+endpoint*.23));positions.setXYZ(endpoint,next.x,next.y,next.z);}positions.needsUpdate=true;
          if(audible&&time-lastSound>8&&window.VisConAudio&&window.VisConAudio.playSpaceEvent){lastSound=time;window.VisConAudio.playSpaceEvent();}
        }
      });
    };
    fleet.userData.fighterCount=18;fleet.userData.update(0,false);
    return fleet;
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
    var frame=new T.Group(),texture=surfaceTexture(T,'cabin');
    var armor=new T.MeshStandardMaterial({color:0x646763,map:texture,bumpMap:texture,bumpScale:.025,metalness:.4,roughness:.78});
    var edge=new T.MeshStandardMaterial({color:0x777c7d,metalness:.7,roughness:.46});
    var rubber=new T.MeshStandardMaterial({color:0x141515,roughness:.92});
    var black=new T.MeshStandardMaterial({color:0x090b0d,metalness:.42,roughness:.2});
    var fabric=new T.MeshStandardMaterial({color:0x101113,roughness:.98,side:T.DoubleSide});
    var red=new T.MeshBasicMaterial({color:0xde4d30}),green=new T.MeshBasicMaterial({color:0x8db89b}),amber=new T.MeshBasicMaterial({color:0xd9a965});
    function box(w,h,d,x,y,z,mat,parent){var m=beveledBox(T,w,h,d,mat||armor);m.position.set(x,y,z);(parent||frame).add(m);return m;}
    function ball(x,y,z,sx,sy,sz,mat,parent){var m=new T.Mesh(new T.SphereGeometry(1,32,24),mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);(parent||frame).add(m);return m;}
    function beam(a,b,r,mat,parent){var start=new T.Vector3().fromArray(a),end=new T.Vector3().fromArray(b),m=new T.Mesh(new T.CylinderGeometry(r,r,start.distanceTo(end),12),mat||armor);m.position.copy(start).add(end).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),end.sub(start).normalize());(parent||frame).add(m);return m;}
    box(8,.22,8,0,-.1,-1.4,rubber);
    // Polygonal pressure shell, front windscreen mullions and tubular rear rings.
    var outline=[[-3.9,.4],[-3.85,1.4],[-2.95,3.5],[-1.7,4.45],[1.7,4.45],[2.95,3.5],[3.85,1.4],[3.9,.4]];
    [2.6,.5,-2.5,-4.5].forEach(function(z,ring){for(var i=0;i<outline.length-1;i++){var a=outline[i],b=outline[i+1];beam([a[0],a[1],z],[b[0],b[1],z],ring===3?.16:.11,armor);}});
    for(var i=1;i<outline.length-1;i++){var p=outline[i];beam([p[0],p[1],2.6],[p[0],p[1],-4.5],.09,edge);}
    // Solid upper pressure shell and padded rear facets; the forward panes stay clear.
    for(var facet=1;facet<6;facet++){
      var a=outline[facet],b=outline[facet+1],g=new T.BufferGeometry();
      g.setAttribute('position',new T.Float32BufferAttribute([a[0],a[1],2.6,b[0],b[1],2.6,b[0],b[1],-2.5,a[0],a[1],-2.5],3));
      g.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,1,2,0,2],2));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();
      var shellMaterial=armor.clone();shellMaterial.side=T.DoubleSide;frame.add(new T.Mesh(g,shellMaterial));
    }
    for(var rail=-1;rail<=1;rail++)box(.08,.03,9,rail*1.15,.035,.3,edge);
    for(var grate=0;grate<30;grate++)box(2.1,.018,.045,0,.045,-2.5+grate*.2,rubber);

    [-1,1].forEach(function(side){
      box(.27,1.4,7.1,side*3.8,.6,-.95,armor);
      var console=box(1.05,.24,5,side*3,.97,-.7,armor);console.rotation.z=side*.12;
      // Dense practical instrument banks, switches, recessed plates and wiring.
      for(var bank=0;bank<5;bank++){
        box(.78,.045,.66,side*3,1.12,-2.6+bank*.83,rubber);
        for(var j=0;j<8;j++){var xx=side*(2.74+(j%4)*.17),zz=-2.85+bank*.83+Math.floor(j/4)*.28;
          box(.09,.027,.07,xx,1.155,zz,j%5===0?red:j%3===0?green:amber);
          beam([xx,1.17,zz+.12],[xx,1.25,zz+.1],.022,edge);
        }
      }
      for(var cable=0;cable<3;cable++){
        var curve=new T.CatmullRomCurve3([new T.Vector3(side*3.55,1.4+cable*.13,2),new T.Vector3(side*3.6,1.65+cable*.13,0),new T.Vector3(side*3.45,2.5+cable*.12,-2.5)]);
        frame.add(new T.Mesh(new T.TubeGeometry(curve,24,.025,6,false),rubber));
      }
      beam([side*1.45,1.22,-3.85],[side*1.35,4.35,-4.6],.115,armor);
      box(.86,.12,4.9,side*2.25,3.82,-.7,rubber).rotation.z=side*.4;
      for(var n=0;n<28;n++)box(.055,.05,.09,side*(2.12+(n%4)*.11),3.75,-2.8+Math.floor(n/4)*.54,n%7===0?red:n%3===0?amber:edge);
    });
    var dash=box(7.5,.42,1.45,0,1,-3.4,armor);dash.rotation.x=.2;
    [-2.45,-.85,.85,2.45].forEach(function(x){
      var panel=new T.Group();panel.position.set(x,1.28,-3.2);panel.rotation.x=-Math.PI*.36;frame.add(panel);
      box(1.05,.64,.08,0,0,0,rubber,panel);
      var display=new T.Mesh(new T.PlaneGeometry(.85,.46),new T.MeshBasicMaterial({map:instrumentTexture(T)}));display.position.z=.05;panel.add(display);
      for(var k=0;k<4;k++)box(.09,.04,.02,-.32+k*.21,-.36,.055,k===0?red:amber,panel);
    });
    // Vader's seated black armor, cloth cape, flared helmet and sculpted mask.
    var pilot=new T.Group();pilot.name='darth-vader-pilot';pilot.position.set(-.82,0,.65);frame.add(pilot);
    box(1.2,.28,1.2,0,.62,.1,rubber,pilot);box(1.04,1.15,.28,0,1.21,.62,rubber,pilot);
    var upper=new T.Group();pilot.add(upper);
    ball(0,1.45,.05,.46,.59,.29,black,upper);
    var capeGeo=new T.PlaneGeometry(1.16,1.5,16,16),cp=capeGeo.attributes.position;
    for(var i=0;i<cp.count;i++){var yy=cp.getY(i);cp.setZ(i,.05*Math.cos(cp.getX(i)*29)*(1-(yy+.75)/1.5));}capeGeo.computeVertexNormals();
    var cape=new T.Mesh(capeGeo,fabric);cape.position.set(0,1.12,.4);upper.add(cape);
    box(.5,.46,.08,0,1.42,-.27,rubber,upper);
    for(var q=0;q<3;q++)box(.075,.055,.015,-.14+q*.14,1.5,-.32,q===0?red:q===1?green:edge,upper);
    for(var q=0;q<3;q++)box(.08,.11,.02,-.13+q*.13,1.31,-.32,edge,upper);
    box(.75,.12,.08,0,.98,-.26,rubber,upper);
    var head=new T.Group();head.position.set(0,2.03,0);upper.add(head);
    var helmetProfile=[[.37,-.09],[.44,.02],[.42,.15],[.34,.31],[.32,.48],[.25,.63],[.12,.7],[0,.72]].map(function(p){return new T.Vector2(p[0],p[1]);});
    var helmet=new T.Mesh(new T.LatheGeometry(helmetProfile,48),black);helmet.scale.z=.91;head.add(helmet);
    // Brow, recessed slanted lenses, cheek ridges, triangular respirator grille.
    box(.59,.075,.08,0,.38,-.305,black,head);
    var lensMat=new T.MeshStandardMaterial({color:0x0c0505,metalness:.8,roughness:.12,emissive:0x000000});
    [-1,1].forEach(function(side){var lens=ball(side*.145,.31,-.313,.12,.082,.034,lensMat,head);lens.rotation.z=side*.2;
      beam([side*.27,.28,-.28],[side*.14,.02,-.39],.045,black,head);
      ball(side*.235,-.015,-.32,.065,.065,.06,edge,head);
    });
    var maskShape=new T.Shape();maskShape.moveTo(0,.28);maskShape.lineTo(-.16,-.07);maskShape.lineTo(.16,-.07);maskShape.closePath();
    var mask=new T.Mesh(new T.ExtrudeGeometry(maskShape,{depth:.035,bevelEnabled:true,bevelSize:.025,bevelThickness:.02,bevelSegments:2}),rubber);mask.position.z=-.37;head.add(mask);
    for(var g=0;g<7;g++){var xx=(g-3)*.032;beam([xx,-.035,-.425],[xx,.12-Math.abs(xx)*.9,-.425],.009,edge,head);}
    box(.055,.23,.045,0,.27,-.36,black,head);
    [-1,1].forEach(function(side){
      ball(side*.46,1.83,.04,.24,.2,.29,black,upper);
      beam([side*.47,1.7,0],[side*.62,1.32,-.3],.145,fabric,upper);ball(side*.62,1.32,-.3,.16,.15,.15,black,upper);
      beam([side*.62,1.32,-.3],[side*.58,1.28,-.88],.12,black,upper);ball(side*.58,1.27,-.9,.13,.1,.17,black,upper);
      beam([side*.24,.85,-.15],[side*.29,.73,-.84],.19,fabric,pilot);beam([side*.29,.7,-.85],[side*.29,.25,-1.05],.14,black,pilot);ball(side*.29,.15,-1.2,.19,.15,.34,black,pilot);
    });

    // Rear pressure hatch: two motor-driven leaves retract into side pockets.
    var hatch=new T.Group();hatch.name='rear-pressure-hatch';hatch.position.set(1.1,0,8.4);frame.add(hatch);
    // A continuous eight-sided transition joins the hatch to the cockpit ring.
    // Every facet shares its edge vertices with the next, including floor/roof.
    var rearProfile=[[-.78,0],[-.78,1.4],[-.78,3.5],[-.78,4.45],[2.98,4.45],[2.98,3.5],[2.98,1.4],[2.98,0]];
    var frontProfile=outline.map(function(v,i){return [v[0],i===0||i===7?0:v[1]];});
    for(var segment=0;segment<8;segment++){
      var next=(segment+1)%8,a=rearProfile[segment],b=rearProfile[next],c=frontProfile[next],d=frontProfile[segment],g=new T.BufferGeometry();
      g.setAttribute('position',new T.Float32BufferAttribute([a[0],a[1],8.4,b[0],b[1],8.4,c[0],c[1],2.6,d[0],d[1],2.6],3));
      g.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,1,2,0,2],2));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();
      var transitionMat=(segment===7?rubber:armor).clone();transitionMat.side=T.DoubleSide;var facet=new T.Mesh(g,transitionMat);facet.name='sealed-corridor-facet';frame.add(facet);
      beam([a[0],a[1],8.4],[d[0],d[1],2.6],.045,edge);
    }
    [-1,1].forEach(function(side){
      box(1.38,4.45,.5,side*2.04,2.22,0,armor,hatch);
      box(.1,4.1,.12,side*1.35,2.12,.32,edge,hatch);
      box(1.05,3.8,.04,side*2.04,2.22,.29,rubber,hatch);
    });
    box(5.5,.28,.5,0,4.3,0,armor,hatch);box(5.5,.12,.55,0,.08,0,edge,hatch);
    var hatchLeaves=[];
    [-1,1].forEach(function(side){var leaf=new T.Group();leaf.position.set(side*.68,2.12,0);hatch.add(leaf);
      box(1.34,3.95,.16,0,0,0,armor,leaf);box(1.08,3.3,.045,0,0,.11,rubber,leaf);
      box(.045,3.45,.045,-side*.54,0,.15,edge,leaf);
      for(var strip=0;strip<4;strip++)box(.7,.03,.045,0,-1.2+strip*.8,.145,edge,leaf);
      hatchLeaves.push({group:leaf,side:side});
    });
    var hatchLamp=new T.MeshBasicMaterial({color:0xd1a363});
    box(.12,.3,.08,1.69,2.28,.24,hatchLamp,hatch);box(.12,.3,.08,-1.69,2.28,.24,hatchLamp,hatch);
    frame.userData.setHatch=function(amount){amount=Math.max(0,Math.min(1,amount));hatchLeaves.forEach(function(leaf){leaf.group.position.x=leaf.side*(.68+amount*1.48);});hatchLamp.color.setHex(amount>.92?0x8fbc9b:0xd1a363);frame.userData.hatchOpen=amount;};
    frame.userData.setHatch(0);frame.userData.corridorSealed=true;
    frame.userData.pilotReaction={upper:upper,head:head,visor:lensMat};
    frame.userData.surfaceTexture=texture;
    var lamp=new T.PointLight(0xffd7a5,.75,14*(worldScale||1));lamp.position.set(0,3.3,1);frame.add(lamp);
    var ambient=new T.AmbientLight(0x94a0ad,.55);frame.add(ambient);
    var target=new T.Object3D();frame.add(target);
    var key=new T.DirectionalLight(0xc3d4ea,1.05);key.position.set(-5,5,-9);key.target=target;frame.add(key);
    var rim=new T.DirectionalLight(0xe9cba7,.7);rim.position.set(5,4,5);rim.target=target;frame.add(rim);
    return frame;
  }
  function instrumentTexture(T){
    var c=document.createElement('canvas');c.width=256;c.height=128;var x=c.getContext('2d');x.fillStyle='#070e0c';x.fillRect(0,0,256,128);
    x.strokeStyle='#9dbea0';x.lineWidth=2;x.beginPath();x.arc(69,65,42,0,Math.PI*2);x.moveTo(27,65);x.lineTo(111,65);x.moveTo(69,23);x.lineTo(69,107);x.stroke();
    x.strokeStyle='#b89564';for(var i=0;i<6;i++){x.beginPath();x.moveTo(136,25+i*15);x.lineTo(150+(i*19%70),25+i*15);x.stroke();}
    return new T.CanvasTexture(c);
  }

  function createCockpit(canvas, options) {
    var T = window.THREE;
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x070a12);
    // Match the galaxy renderer so entering the cabin does not brighten the frame.
    renderer.outputEncoding=T.LinearEncoding;renderer.toneMapping=T.NoToneMapping;
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
    var cabinOffset=new T.Vector3().fromArray(saved.cabinOffset || [5.6,.15,-3.6]);
    universe.position.copy(origin).negate().applyQuaternion(inverse).add(cabinOffset.multiplyScalar(-2.5)).multiplyScalar(1 / .45);
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
    var spaceTraffic=createTraffic(T);universe.add(spaceTraffic);
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
    canvas.dataset.pilotCharacter='darth-vader';canvas.dataset.cabinStyle='falcon-freighter';canvas.dataset.corridor='sealed';canvas.dataset.fighters='18';
    canvas.dataset.origin = origin.toArray().join(',');

    var frame=createCabin(T);frame.userData.setHatch(1);scene.add(frame);
    var pilotReaction=frame.userData.pilotReaction;
    var cockpitFire=new T.Group();cockpitFire.position.set(2.85,1.16,-2.8);frame.add(cockpitFire);
    var flameMaterials=[];
    var flameFragment=[
      'uniform float uTime;uniform float uHeat;varying vec2 vUv;',
      'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
      'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}',
      'void main(){float y=vUv.y;float n=noise(vec2(vUv.x*6.,y*8.-uTime*4.))+0.5*noise(vec2(vUv.x*13.,y*17.-uTime*7.));',
      'float center=.5+.085*sin(y*10.-uTime*5.)*y;float width=(1.-y)*.4;float edge=abs(vUv.x-center);float density=(width-edge)*7.+(n-.7)*.65;',
      'float a=smoothstep(0.,.38,density)*smoothstep(1.,.68,y)*smoothstep(0.,.05,y)*uHeat;',
      'vec3 col=mix(vec3(1.,.12,.015),vec3(1.,.65,.12),smoothstep(.12,.7,density));col=mix(col,vec3(1.,.92,.64),smoothstep(.7,1.7,density)*(1.-y));gl_FragColor=vec4(col*1.5,a*.85);}'
    ].join('\n');
    for(var f=0;f<7;f++){
      var mat=new T.ShaderMaterial({uniforms:{uTime:{value:f*2.1},uHeat:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:flameFragment,transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending});
      var flame=new T.Mesh(new T.PlaneGeometry(.6+(f%3)*.14,1.15+(f%3)*.29),mat);flame.position.set((f%4-1.5)*.18,.5+(f%3)*.08,(f%2)*.18);flame.rotation.y=f*1.17;cockpitFire.add(flame);flameMaterials.push(mat);
    }
    // Soft soot puffs use normal alpha blending, so they occlude rather than glow.
    var sootCanvas=document.createElement('canvas');sootCanvas.width=sootCanvas.height=128;var sootCtx=sootCanvas.getContext('2d');
    var sootGradient=sootCtx.createRadialGradient(64,64,5,64,64,62);sootGradient.addColorStop(0,'rgba(100,95,87,.7)');sootGradient.addColorStop(.5,'rgba(80,77,72,.4)');sootGradient.addColorStop(1,'rgba(65,62,57,0)');sootCtx.fillStyle=sootGradient;sootCtx.fillRect(0,0,128,128);
    var sootTexture=new T.CanvasTexture(sootCanvas),smokePuffs=[];
    for(var sm=0;sm<8;sm++){var puff=new T.Sprite(new T.SpriteMaterial({map:sootTexture,transparent:true,opacity:0,depthWrite:false}));cockpitFire.add(puff);smokePuffs.push(puff);}
    var fireLight=new T.PointLight(0xff6840,0,9);fireLight.position.set(2.8,1.8,-2.8);frame.add(fireLight);
    var cabinSparksGeo=new T.BufferGeometry(),cabinSparksPos=new Float32Array(36*3);
    for(var sparkIndex=0;sparkIndex<36;sparkIndex++){
      cabinSparksPos[sparkIndex*3]=(sparkIndex%9-4)*.16;
      cabinSparksPos[sparkIndex*3+1]=(sparkIndex*17%31)*.045;
      cabinSparksPos[sparkIndex*3+2]=(sparkIndex%5-2)*.13;
    }
    cabinSparksGeo.setAttribute('position',new T.BufferAttribute(cabinSparksPos,3));
    var cabinSparks=new T.Points(cabinSparksGeo,new T.PointsMaterial({color:0xffc68f,size:.07,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending}));
    cabinSparks.position.set(2.8,1.18,-2.8);frame.add(cabinSparks);
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
    var trafficElapsed=Number.isFinite(saved.trafficTime)?saved.trafficTime:0,trafficLast=startAt;
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
      trafficElapsed+=motion?Math.min(.05,Math.max(0,now-trafficLast)/1000):0;trafficLast=now;
      if(motion)spaceTraffic.userData.update(trafficElapsed,!battle);
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
      flameMaterials.forEach(function(mat,i){mat.uniforms.uHeat.value=heat;mat.uniforms.uTime.value=t+i*2.1;});
      smokePuffs.forEach(function(puff,i){var age=(Math.max(0,damage)*.7+i*.13)%1;puff.position.set(Math.sin(i*3+age)*.2,age*2.8+.45,-.15+Math.cos(i)*.2);puff.scale.setScalar(.48+age*1.5);puff.material.rotation=Math.sin(i)*age;puff.material.opacity=heat*.45*Math.sin(age*Math.PI);});
      fireLight.intensity=heat*(3.7+.6*Math.sin(t*25)+.3*Math.sin(t*37));
      cabinSparks.material.opacity=heat*.85;
      for(var si=0;si<36;si++){var age=(Math.max(0,damage)+si*.037)%1.1;var angle=si*2.399;cabinSparksPos[si*3]=Math.cos(angle)*age*(.45+(si%5)*.14);cabinSparksPos[si*3+1]=age*(1.4+si%4*.35)-age*age*2.4;cabinSparksPos[si*3+2]=Math.sin(angle)*age*.75;}cabinSparksGeo.attributes.position.needsUpdate=true;
      pilotReaction.upper.rotation.y=-.22*panic;
      pilotReaction.upper.rotation.z=.09*panic;
      pilotReaction.head.rotation.y=-2.32*panic;
      pilotReaction.head.rotation.z=-.18*panic;
      pilotReaction.visor.emissive.setRGB(.035*heat,.008*heat,.002*heat);
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
      if(!reduced && !paused) raf=requestAnimationFrame(loop);
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
        geos.forEach(function(g){g.dispose();});mats.forEach(function(m){m.dispose();});var textures=new Set([glow,starTexture,sootTexture]);mats.forEach(function(m){if(m.map)textures.add(m.map);if(m.bumpMap)textures.add(m.bumpMap);});textures.forEach(function(tex){tex.dispose();});renderer.dispose();
      }
    };
  }
  window.VisConDuel = {createShip:createShip,createTraffic:createTraffic,createCockpit:createCockpit,planetMaterial:planetMaterial,starfield:starfield,createCabin:createCabin,cabinPose:cabinPose};
})();
