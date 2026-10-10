/* One look per course, shared by its planet and its cities.
 *
 * A course keeps the same theme wherever it appears: the planet seen from orbit and
 * every lecture city on it come from the same entry, so landing feels like arriving
 * somewhere you already saw from above. The course colour stays the accent (rim
 * light, awnings, banners); the theme supplies everything else.
 *
 * Themes are assigned from a hash of the course id, then nudged so the courses on
 * screen together never share one.
 */
window.GalaxyThemes = (function () {
  "use strict";

  var THEMES = [
    {
      id: "altstadt",
      planet: { ocean: 0x1f4f7a, land: 0x5f7f3e, high: 0x8a7350, ice: 0.1, sea: 0.5, bands: 0, ring: false },
      city: {
        skyTop: 0x6aa6d8, horizon: 0xdce8ee, sun: 0xffeccf, ground: 0x7f9f58,
        street: 0x7d736a, lane: 0xe9e1cf, sidewalk: 0xc7baa6, lawn: 0x86ab5c,
        styles: [
          { wall: "#e8d9b5", trim: "#f6efe1", glass: "#4d5f6b" },
          { wall: "#d7a86e", trim: "#f3e6cf", glass: "#4b5c68" },
          { wall: "#c9cfb7", trim: "#f2f1e8", glass: "#4a5b66" },
          { wall: "#e3b7a0", trim: "#f7ece2", glass: "#4f5f6a" }
        ],
        walls: [0xe8d9b5, 0xd7a86e, 0xc9cfb7, 0xe3b7a0, 0xf0e4c8, 0xbfa58a],
        roof: "pitched", roofColours: [0xa5452f, 0xb4573a, 0x8c3b2a, 0x7a3a2c],
        trees: { round: 5, poplar: 3, pine: 1 }, heights: 0.75, parks: 0.22,
        tanks: 0, chimneys: true
      }
    },
    {
      id: "neustadt",
      planet: { ocean: 0x0f3a66, land: 0x3f7f86, high: 0xb9d4dc, ice: 0.08, sea: 0.62, bands: 0, ring: true },
      city: {
        skyTop: 0x4f95d6, horizon: 0xd3e4ef, sun: 0xfff6e8, ground: 0x7aa46a,
        street: 0x3f444a, lane: 0xf1d36b, sidewalk: 0xd4d6d6, lawn: 0x7fb069,
        styles: [
          { wall: "#9db4c4", trim: "#e6edf2", glass: "#3f5a6e", modern: true },
          { wall: "#b9c3c9", trim: "#f1f4f6", glass: "#365066", modern: true },
          { wall: "#d8d4cc", trim: "#f6f4f0", glass: "#41586a" },
          { wall: "#8fa9a3", trim: "#e3ece9", glass: "#2f4b58", modern: true }
        ],
        walls: [0xb9c3c9, 0xd8d4cc, 0x9db4c4, 0xe2e2de, 0x8fa9a3, 0xc9b9a6],
        roof: "flat", roofColours: [0x8a8f93, 0x6f7a7e],
        trees: { round: 3, pine: 2, poplar: 2 }, heights: 1.25, parks: 0.18,
        tanks: 0.1, chimneys: false
      }
    },
    {
      id: "campus",
      // Autumn forest world, so it never reads as a second Earth next to the old town
      planet: { ocean: 0x264f5c, land: 0xc0702f, high: 0x7d3b1c, ice: 0, sea: 0.38, bands: 0, ring: false },
      city: {
        skyTop: 0x66a9dc, horizon: 0xdfeaea, sun: 0xfff1d6, ground: 0x6f9a4a,
        street: 0x4b4f52, lane: 0xf2f2ee, sidewalk: 0xc9c5bc, lawn: 0x74a84f,
        styles: [
          { wall: "#b4614a", trim: "#e9dccb", glass: "#4f6475" },
          { wall: "#9d4f3c", trim: "#efe3d2", glass: "#4a5f70" },
          { wall: "#c98d6a", trim: "#f1e6d4", glass: "#536a7b" },
          { wall: "#a7a39a", trim: "#e8e4dc", glass: "#4b5f6e" }
        ],
        walls: [0xb4614a, 0x9d4f3c, 0xc4836a, 0xb7b1a6, 0xd6b892],
        roof: "mixed", roofColours: [0x4c5560, 0x5a5f66, 0x6b4a3e],
        trees: { round: 4, pine: 3, poplar: 2 }, heights: 0.85, parks: 0.42,
        tanks: 0.2, chimneys: true
      }
    },
    {
      id: "hafen",
      planet: { ocean: 0x3a2a24, land: 0xa4552f, high: 0xd29a62, ice: 0, sea: 0.36, bands: 0, ring: true },
      city: {
        skyTop: 0x8fb3cc, horizon: 0xe3ddd2, sun: 0xffe2bd, ground: 0x8f9a6a,
        street: 0x55524e, lane: 0xe8c45a, sidewalk: 0xb9b2a6, lawn: 0x8aa462,
        styles: [
          { wall: "#8e4b3a", trim: "#d9c8b2", glass: "#3d4a52" },
          { wall: "#a7a39a", trim: "#d6d2c9", glass: "#3e4c56" },
          { wall: "#7a6a5a", trim: "#d2c4ae", glass: "#3a464e" },
          { wall: "#b06a48", trim: "#e3d3bd", glass: "#404d56" }
        ],
        walls: [0x8e4b3a, 0xa7a39a, 0x7a6a5a, 0x9c9a94, 0xb06a48, 0x6f7479],
        roof: "flat", roofColours: [0x6b6b68, 0x585856],
        trees: { poplar: 3, round: 2 }, heights: 0.9, parks: 0.12,
        tanks: 0.55, chimneys: true
      }
    },
    {
      id: "riviera",
      planet: { ocean: 0x1b6f8f, land: 0xd8b878, high: 0xb98a52, ice: 0, sea: 0.3, bands: 0.6, ring: false },
      city: {
        skyTop: 0x3f9ae0, horizon: 0xe9f1f2, sun: 0xfff3dc, ground: 0xd8c48f,
        street: 0x8a8378, lane: 0xf4f0e6, sidewalk: 0xe6dccb, lawn: 0x9fb862,
        styles: [
          { wall: "#f4f1ea", trim: "#d98c5f", glass: "#2f6a8a" },
          { wall: "#efe2c8", trim: "#c9774a", glass: "#346f8c" },
          { wall: "#f2d7b6", trim: "#ffffff", glass: "#2c6585" },
          { wall: "#e9eef0", trim: "#3a7ca5", glass: "#2b5f7d" }
        ],
        walls: [0xf4f1ea, 0xefe2c8, 0xf2d7b6, 0xe9eef0, 0xf0c9a0],
        roof: "mixed", roofColours: [0xc9774a, 0xb8643e, 0xe2dcd0],
        trees: { palm: 5, round: 1 }, heights: 0.7, parks: 0.2,
        tanks: 0, chimneys: false
      }
    },
    {
      id: "fjord",
      planet: { ocean: 0x2c4f6e, land: 0xc9d6dc, high: 0xffffff, ice: 0.55, sea: 0.48, bands: 0, ring: false },
      city: {
        skyTop: 0x8db8d8, horizon: 0xe8eef2, sun: 0xfff4e6, ground: 0xe4ebee,
        street: 0x5a5f63, lane: 0xf0f0ea, sidewalk: 0xd6dbde, lawn: 0xdfe8ec,
        styles: [
          { wall: "#9b3b30", trim: "#f2efe8", glass: "#3c4b56" },
          { wall: "#d9a63e", trim: "#f2efe8", glass: "#3f4e58" },
          { wall: "#2f3a40", trim: "#e9e6df", glass: "#56687a" },
          { wall: "#e7e2d6", trim: "#2f3a40", glass: "#40505c" }
        ],
        walls: [0x9b3b30, 0xd9a63e, 0x2f3a40, 0xe7e2d6, 0x6f8a7a, 0xb04a3a],
        roof: "pitched", roofColours: [0x2b2f33, 0x3a3f44, 0x4a3a32],
        trees: { pine: 6, round: 1 }, heights: 0.7, parks: 0.25,
        tanks: 0, chimneys: true, snow: true
      }
    }
  ];

  function hash(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // One theme per course; courses shown together never share one while themes remain
  function assign(courses) {
    var taken = {};
    var order = courses.map(function (c, i) { return { id: String(c.id), i: i }; })
      .sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    var out = [];
    order.forEach(function (o) {
      var k = hash(o.id) % THEMES.length;
      for (var probe = 0; probe < THEMES.length && taken[k]; probe++) k = (k + 1) % THEMES.length;
      taken[k] = true;
      out[o.i] = THEMES[k];
      if (Object.keys(taken).length === THEMES.length) taken = {};
    });
    return out;
  }

  return { assign: assign, all: THEMES };
})();
