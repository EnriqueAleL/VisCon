/* Shared music and procedural cockpit effects. Audio always starts from a user gesture. */
(function () {
  "use strict";
  if (window.VisConAudio) return;

  var MUSIC_KEY = "viscon.music-enabled.v1";
  var EFFECTS_KEY = "viscon.effects-enabled.v1";
  var music = new Audio("/galaxy/media/also-sprach-zarathustra-kevin-macleod.mp3");
  music.loop = true;
  music.preload = "none";
  music.volume = 0.28;
  var wanted = sessionStorage.getItem(MUSIC_KEY) === "on";
  var effects = localStorage.getItem(EFFECTS_KEY) !== "off";
  var context = null;
  var noiseBuffer = null;
  var dock = document.createElement("div");
  dock.className = "viscon-audio-dock";
  dock.setAttribute("role", "group");
  dock.setAttribute("aria-label", "Audio controls");

  function button(className, label, action) {
    var item = document.createElement("button");
    item.type = "button";
    item.className = className;
    item.addEventListener("click", action);
    item.textContent = label;
    dock.append(item);
    return item;
  }
  var musicButton = button("music-toggle", "Music", function () {
    if (wanted && music.paused) { startMusic(); return; }
    wanted = !wanted;
    sessionStorage.setItem(MUSIC_KEY, wanted ? "on" : "off");
    if (wanted) startMusic(); else { music.pause(); render(); }
  });
  var effectsButton = button("effects-toggle", "Effects", function () {
    effects = !effects;
    localStorage.setItem(EFFECTS_KEY, effects ? "on" : "off");
    if (effects) arm();
    render();
  });
  var credit = document.createElement("details");
  credit.className = "music-credit";
  credit.innerHTML = '<summary>Music credit</summary><p>“Also sprach Zarathustra” by Richard Strauss. Recording by <a href="https://commons.wikimedia.org/wiki/File:Richard_Strauss_-_Also_Sprach_Zarathustra.ogg" target="_blank" rel="noopener noreferrer">Kevin MacLeod</a>, <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer">CC BY 3.0</a>.</p>';
  dock.append(credit);
  document.body.append(dock);
  if (location.pathname === "/learn") {
    var placeInLectureHeader = function () {
      var slot = document.getElementById("audio-controls-slot");
      if (!slot) return false;
      slot.append(dock);
      return true;
    };
    if (!placeInLectureHeader()) {
      var observer = new MutationObserver(function () {
        if (placeInLectureHeader()) observer.disconnect();
      });
      observer.observe(document.getElementById("root"), { childList: true, subtree: true });
    }
  }

  function render() {
    musicButton.textContent = music.paused ? "Play music" : "Pause music";
    musicButton.setAttribute("aria-pressed", String(!music.paused));
    musicButton.title = wanted && music.paused ? "Press to resume the soundtrack" : "Also sprach Zarathustra — Kevin MacLeod";
    effectsButton.textContent = effects ? "Effects on" : "Effects off";
    effectsButton.setAttribute("aria-pressed", String(effects));
  }
  function startMusic() {
    if (!wanted || document.hidden) return;
    music.play().then(render).catch(render);
  }
  music.addEventListener("play", render);
  music.addEventListener("pause", render);
  music.addEventListener("error", function () {
    wanted = false;
    sessionStorage.setItem(MUSIC_KEY, "off");
    musicButton.textContent = "Music unavailable";
    musicButton.disabled = true;
  });

  function arm() {
    if (!effects) return null;
    try {
      context = context || new (window.AudioContext || window.webkitAudioContext)();
      if (context.state === "suspended") context.resume().catch(function () {});
    } catch (_) { return null; }
    return context;
  }
  function envelope(gain, start, peak, end) {
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + .025);
    gain.gain.exponentialRampToValueAtTime(.0001, end);
  }
  function tone(ctx, at, type, high, low, duration, volume) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(high, at);
    osc.frequency.exponentialRampToValueAtTime(low, at + duration);
    envelope(gain, at, volume, at + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + duration + .02);
  }
  function noise(ctx, at, duration, volume, cutoff) {
    if (!noiseBuffer) {
      noiseBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate), ctx.sampleRate);
      var samples = noiseBuffer.getChannelData(0);
      for (var i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    var source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    var filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoff, at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(150, cutoff / 5), at + duration);
    var gain = ctx.createGain();
    envelope(gain, at, volume, at + duration);
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(at);
    source.stop(at + duration + .02);
  }
  function playCombat(event) {
    if (!effects || document.hidden || !event || (!event.outgoing && !event.incoming)) return;
    var ctx = arm();
    if (!ctx || ctx.state !== "running") return;
    var at = ctx.currentTime + .015;
    if (event.outgoing) {
      tone(ctx, at, "sawtooth", 1250, 170, .23, .055);
      tone(ctx, at + .16, "sawtooth", 1050, 145, .21, .04);
      tone(ctx, at + .52, "triangle", 360, 90, .38, .07);
    }
    if (event.incoming) {
      tone(ctx, at + .35, "sine", 105, 36, .9, .24);
      noise(ctx, at + .35, .82, .15, 1700);
      tone(ctx, at + .82, "square", 740, 320, .16, .025);
      tone(ctx, at + 1.14, "square", 620, 260, .14, .018);
    }
  }

  document.addEventListener("pointerdown", function () { arm(); if (wanted && music.paused) startMusic(); }, { capture: true });
  document.addEventListener("keydown", function () { arm(); if (wanted && music.paused) startMusic(); }, { capture: true });
  document.addEventListener("visibilitychange", function () { if (document.hidden) music.pause(); else startMusic(); });
  window.VisConAudio = { playCombat: playCombat, music: music, effectsEnabled: function () { return effects; } };
  render();
  if (wanted) startMusic();
})();
