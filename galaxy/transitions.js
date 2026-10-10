/* The veils that hide a change of scene, each one part of the journey it covers.
 *
 *  clouds  Landing on a city or climbing back to orbit: banks of cloud roll in from the
 *          edges until they meet, and later part outwards as the camera drops through
 *          them. Tinted with the destination's own sky.
 *  tunnel  City to city by road: the tunnel mouth closes in around the view like an iris,
 *          the lamps of the tunnel ceiling rush past in the dark, and the far end opens
 *          up again onto the next town.
 *
 * close() resolves once the screen is fully covered, so the scene can be swapped
 * underneath; open() reveals it again. Everything is DOM and the Web Animations API,
 * so it costs the 3D scene nothing. With reduced motion the veil simply cuts.
 */
window.GalaxyVeil = (function () {
  "use strict";

  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var el = null, kind = null, parts = [], lampTimer = null;

  function root() {
    if (!el) el = document.getElementById("veil");
    return el;
  }
  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function finished(animation) { return animation.finished.catch(function () {}); }

  /* ---------- clouds: flying through a cloud deck ---------- */
  var tintNow = "#dfe9ef", puffTimer = null;

  // One cumulus: five lobes, bright on top, with a shaded belly in a greyed sky colour
  function mixHex(a, b, k) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), out = 0;
    for (var s = 16; s >= 0; s -= 8) out |= Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k) << s;
    return "#" + out.toString(16).padStart(6, "0");
  }
  function puffBackground(tint) {
    var belly = mixHex(/^#[0-9a-f]{6}$/i.test(tint) ? tint : "#dfe9ef", "#7d8b97", 0.3);
    return [
      "radial-gradient(circle at 30% 42%, #fff 0 15%, rgba(255,255,255,0) 27%)",
      "radial-gradient(circle at 47% 30%, #fff 0 19%, rgba(255,255,255,0) 31%)",
      "radial-gradient(circle at 66% 38%, #fff 0 16%, rgba(255,255,255,0) 28%)",
      "radial-gradient(ellipse 46% 26% at 50% 52%, #f7f9fb 0 60%, rgba(255,255,255,0) 100%)",
      "radial-gradient(ellipse 44% 18% at 50% 64%, " + belly + " 0 55%, rgba(255,255,255,0) 100%)"
    ].join(",");
  }

  function puffElement(sizeVmax) {
    var puff = document.createElement("div");
    puff.className = "veil-puff";
    puff.style.width = puff.style.height = sizeVmax + "vmax";
    puff.style.left = "calc(50% - " + sizeVmax / 2 + "vmax)";
    puff.style.top = "calc(50% - " + sizeVmax / 2 + "vmax)";
    puff.style.background = puffBackground(tintNow);
    root().insertBefore(puff, root().querySelector(".veil-fill"));
    return puff;
  }

  // Flying into the deck: a cloud appears small ahead and swells past the camera
  function rushPuff(ms) {
    var puff = puffElement(34 + Math.random() * 26);
    var a = Math.random() * Math.PI * 2, spread = 4 + Math.random() * 20;
    var x = Math.cos(a) * spread, y = Math.sin(a) * spread * 0.6;
    var anim = puff.animate([
      { transform: "translate(" + x * 0.3 + "vw," + y * 0.3 + "vh) scale(.12)", opacity: 0 },
      { opacity: 1, offset: 0.25 },
      { transform: "translate(" + x * 2.4 + "vw," + y * 2.4 + "vh) scale(2.6)", opacity: 1, offset: 0.85 },
      { transform: "translate(" + x * 3 + "vw," + y * 3 + "vh) scale(3.2)", opacity: 0 }
    ], { duration: ms, easing: "cubic-bezier(.45,0,.8,.5)" });
    anim.onfinish = function () { puff.remove(); };
  }

  function closeClouds(tint, ms) {
    var v = root();
    v.replaceChildren();
    tintNow = tint;
    var fill = document.createElement("div");
    fill.className = "veil-fill";
    fill.style.background = "radial-gradient(circle, #ffffff 25%, " + tint + " 110%)";
    v.append(fill);
    parts = [fill];
    // The deck thickens: clouds come faster until they are all you see
    var started = performance.now();
    (function more() {
      var p = Math.min(1, (performance.now() - started) / ms);
      rushPuff(650 + Math.random() * 250);
      puffTimer = setTimeout(more, 110 - p * 70);
    })();
    var anim = fill.animate([{ opacity: 0 }, { opacity: 0, offset: 0.7 }, { opacity: 1 }], { duration: ms, easing: "ease-in", fill: "forwards" });
    return finished(anim);
  }

  function openClouds(ms) {
    clearTimeout(puffTimer);
    root().querySelectorAll(".veil-puff").forEach(function (p) { p.remove(); });
    var fill = parts[0];
    // Under the deck it splits into banks that slide apart, and the ground shows between them
    var banks = 9;
    for (var i = 0; i < banks; i++) {
      var a = (i / banks) * Math.PI * 2 + Math.random() * 0.3;
      var puff = puffElement(52 + Math.random() * 20);
      var x = Math.cos(a), y = Math.sin(a);
      puff.animate([
        { transform: "translate(" + x * 30 + "vw," + y * 24 + "vh) scale(1.15)", opacity: 1 },
        { transform: "translate(" + x * 95 + "vw," + y * 75 + "vh) scale(2.2)", opacity: 0.85, offset: 0.8 },
        { transform: "translate(" + x * 120 + "vw," + y * 95 + "vh) scale(2.4)", opacity: 0 }
      ], { duration: ms * (0.85 + Math.random() * 0.15), easing: "cubic-bezier(.3,0,.5,1)", fill: "forwards" });
    }
    var anim = fill.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms * 0.2, easing: "ease-out", fill: "forwards" });
    return finished(anim).then(function () { return wait(ms * 0.7); });
  }

  /* ---------- tunnel ---------- */
  function buildTunnel() {
    var v = root();
    v.replaceChildren();
    parts = [];
    var iris = document.createElement("div");
    iris.className = "veil-iris";
    var lamps = document.createElement("div");
    lamps.className = "veil-lamps";
    v.append(iris, lamps);         // lamps light up the dark, so they sit over it
    parts.push(iris, lamps);
  }

  // Ceiling lamps and wall lights come out of the vanishing point and sweep past
  function runLamps() {
    var lamps = parts[1];
    function streak(cls, x, y, scale, ms) {
      var lamp = document.createElement("div");
      lamp.className = cls;
      lamps.append(lamp);
      var anim = lamp.animate([
        { transform: "translate(-50%,-50%) translate(" + x * 0.03 + "vw," + y * 0.03 + "vh) scale(.04)", opacity: 0 },
        { opacity: 1, offset: 0.3 },
        { transform: "translate(-50%,-50%) translate(" + x + "vw," + y + "vh) scale(" + scale + ")", opacity: 0.95 }
      ], { duration: ms, easing: "cubic-bezier(.55,0,1,.45)" });
      anim.onfinish = function () { lamp.remove(); };
    }
    function spawn() {
      [-1, 1].forEach(function (side) {
        streak("veil-lamp", side * 30, -50, 1.7, 480);
        streak("veil-wall", side * 62, 6, 2.2, 480);
      });
      var line = document.createElement("div");
      line.className = "veil-road";
      lamps.append(line);
      var road = line.animate([
        { transform: "translate(-50%,-50%) translateY(1vh) scale(.05)", opacity: 0 },
        { transform: "translate(-50%,-50%) translateY(48vh) scale(1.8)", opacity: 0.8 }
      ], { duration: 520, easing: "cubic-bezier(.55,0,1,.45)" });
      road.onfinish = function () { line.remove(); };
    }
    spawn();
    lampTimer = setInterval(spawn, 170);
  }

  function closeTunnel(ms) {
    buildTunnel();
    var iris = parts[0];
    var anim = iris.animate([
      { width: "260vmax", height: "260vmax" },
      { width: "0vmax", height: "0vmax" }
    ], { duration: ms, easing: "cubic-bezier(.6,0,.9,.5)", fill: "forwards" });
    return finished(anim).then(function () { runLamps(); });
  }

  // The light at the end of the tunnel grows, and the next town opens out of it
  function openTunnel(ms) {
    var iris = parts[0], lamps = parts[1];
    clearInterval(lampTimer);
    var exit = document.createElement("div");
    exit.className = "veil-exit";
    root().append(exit);
    var glow = exit.animate([
      { transform: "translate(-50%,-50%) scale(.05)", opacity: 0 },
      { transform: "translate(-50%,-50%) scale(1)", opacity: 1 }
    ], { duration: ms * 0.4, easing: "ease-in", fill: "forwards" });
    return finished(glow).then(function () {
      lamps.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms * 0.3, fill: "forwards" });
      exit.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms * 0.6, easing: "ease-out", fill: "forwards" });
      return finished(iris.animate([
        { width: "8vmax", height: "8vmax" },
        { width: "260vmax", height: "260vmax" }
      ], { duration: ms * 0.6, easing: "cubic-bezier(.3,.4,.4,1)", fill: "forwards" }));
    });
  }

  /* ---------- public ---------- */
  function close(type, options) {
    options = options || {};
    var v = root();
    kind = type;
    v.className = "veil " + type;
    v.hidden = false;
    if (REDUCED) {
      // A plain cut: the screen is covered at once, no motion
      v.replaceChildren();
      v.style.background = type === "tunnel" ? "#040506" : (options.tint || "#dfe9ef");
      return Promise.resolve();
    }
    v.style.background = "";
    return type === "tunnel" ? closeTunnel(options.ms || 550) : closeClouds(options.tint || "#dfe9ef", options.ms || 700);
  }

  function open(options) {
    options = options || {};
    var v = root();
    var done;
    try {
      // Nothing to reveal (already open, or a plain cut): just make sure it is gone
      done = REDUCED || !parts.length ? Promise.resolve()
        : kind === "tunnel" ? openTunnel(options.ms || 900) : openClouds(options.ms || 1300);
    } catch (error) {
      done = Promise.resolve();
    }
    return done.then(function () {
      clearInterval(lampTimer);
      clearTimeout(puffTimer);
      v.style.background = "";
      v.hidden = true;
      v.replaceChildren();
      parts = [];
      kind = null;
    });
  }

  return { close: close, open: open, wait: wait };
})();
