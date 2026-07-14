/* The modular kit: a handful of building prototypes, built once from primitives and merged.
 *
 * This is the Godot-starter-kit idea done in three.js — you don't model 2,800 houses, you model
 * ~16 and instance them. Every prototype carries its own vertex colours, so one material draws
 * the whole city, and the silhouette (awnings, balconies, tanks, signs) is real geometry that
 * casts real shadows.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const C = (hex) => new THREE.Color(hex).convertSRGBToLinear();

export const PAL = {
  facade: ["#e8cf9a", "#cfdcc4", "#e6cfc0", "#d8d3c5", "#f0e2bd", "#c8bda6", "#e2cdd3", "#b8c2bc"],
  trim: "#f4efe2",
  tile: "#a8543c",
  tin: "#8d9298",
  concrete: "#cfc8b8",
  dark: "#3f3c37",
  tank: "#9fb0b8",
  drum: ["#4a6b88", "#8a6338", "#5f6b52"],
  sign: ["#c4442f", "#3a6491", "#d99a2b", "#3f7d52", "#8f4d80", "#2a7076"],
  glassDay: "#5f7a8c",
  wood: "#8a6a3a",
  leaf: ["#4e7a41", "#5d8a4a", "#67974f"],
  bark: "#5f4a33",
  rubble: "#8c8474",
  char: "#3a3532",
};

/* Boxes and cones come indexed, icosahedra don't — and mergeGeometries refuses to mix the two.
   So everything is flattened to non-indexed before it gets a colour. */
function finish(g, color) {
  const ng = g.index ? g.toNonIndexed() : g;
  paint(ng, color);
  return ng;
}
function box(w, h, d, x, y, z, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return finish(g, color);
}
function paint(g, color) {
  const c = C(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}
function pyramid(w, h, d, x, y, z, color) {
  const g = new THREE.ConeGeometry(Math.SQRT1_2, h, 4, 1);
  g.rotateY(Math.PI / 4);
  g.scale(w, 1, d);
  g.translate(x, y + h / 2, z);
  return finish(g, color);
}

const rnd = (s, n) => Math.floor((s * 1103515245 + 12345) / 65536) % n;

/* ── one house prototype ───────────────────────────────────────────── */
export function makeHouse(seed) {
  const solid = [], glass = [];
  const W = 0.82, D = 0.82;                       // slightly inset so alleys stay visible
  const floors = 2 + rnd(seed + 3, 4);
  const fh = 0.52 + rnd(seed + 9, 3) * 0.05;
  const H = floors * fh;
  const col = PAL.facade[rnd(seed + 5, PAL.facade.length)];

  solid.push(box(W, H, D, 0, 0, 0, col));

  // ground floor: shopfront, awning that actually sticks out, sign board standing proud
  solid.push(box(W * 0.7, 0.34, 0.06, 0, 0.02, D / 2 + 0.02, PAL.dark));
  const sign = PAL.sign[rnd(seed + 2, PAL.sign.length)];
  solid.push(box(W * 0.98, 0.05, 0.30, 0, 0.40, D / 2 + 0.13, sign));          // awning
  solid.push(box(W * 0.9, 0.16, 0.04, 0, 0.50, D / 2 + 0.02, sign));           // sign board
  if (rnd(seed + 17, 2)) solid.push(box(0.10, 0.42, 0.10, W / 2 - 0.06, 0.55, D / 2 + 0.06,
    PAL.sign[rnd(seed + 6, PAL.sign.length)]));                                // vertical neon sign

  // upper floors: windows + balconies with railings
  for (let f = 1; f < floors; f++) {
    const y = f * fh;
    for (const [sx, sz, rot] of [[0, D / 2, 0], [0, -D / 2, 0], [W / 2, 0, 1], [-W / 2, 0, 1]]) {
      for (let k = -1; k <= 1; k += 2) {
        const ox = rot ? sx : k * 0.18, oz = rot ? k * 0.18 : sz;
        const gw = rot ? 0.04 : 0.22, gd = rot ? 0.22 : 0.04;
        const lit = rnd(seed + f * 13 + k * 7 + (rot ? 3 : 0), 4) !== 0;
        const gg = box(gw, 0.26, gd, ox, y + 0.10, oz, PAL.glassDay);
        (lit ? glass : solid).push(gg);
      }
    }
    if (rnd(seed + f * 7, 3)) {                                     // balcony on the front
      solid.push(box(W * 0.94, 0.04, 0.16, 0, y + 0.06, D / 2 + 0.07, PAL.concrete));
      solid.push(box(W * 0.94, 0.14, 0.03, 0, y + 0.10, D / 2 + 0.14, PAL.trim));
      if (rnd(seed + f, 2))                                          // a plant on it
        solid.push(box(0.10, 0.12, 0.10, W * 0.30, y + 0.10, D / 2 + 0.10, PAL.leaf[rnd(seed + f, 3)]));
    }
    if (rnd(seed + f * 3, 3) === 0)                                  // air-con box
      solid.push(box(0.14, 0.12, 0.08, -W * 0.28, y + 0.16, -D / 2 - 0.03, "#cfc9bb"));
  }

  // roof: tin, tile, or a terrace with a water tank, drums and a garden
  const roof = rnd(seed + 23, 10);
  if (roof < 4) {
    solid.push(pyramid(W * 1.08, 0.26, D * 1.08, 0, H, 0, PAL.tin));
  } else if (roof < 6) {
    solid.push(pyramid(W * 1.12, 0.34, D * 1.12, 0, H, 0, PAL.tile));
  } else {
    solid.push(box(W, 0.04, D, 0, H, 0, PAL.concrete));
    solid.push(box(W, 0.10, 0.04, 0, H, D / 2 - 0.02, PAL.concrete));          // parapet
    solid.push(box(0.04, 0.10, D, W / 2 - 0.02, H, 0, PAL.concrete));
    solid.push(box(0.18, 0.22, 0.18, -0.12, H + 0.04, -0.10, PAL.tank));       // bồn nước
    for (let k = 0; k < 1 + rnd(seed + 5, 2); k++)
      solid.push(box(0.11, 0.16, 0.11, 0.16 + k * 0.14, H + 0.04, 0.14,
        PAL.drum[rnd(seed + k * 3, 3)]));                                       // thùng phi
    if (rnd(seed + 9, 2)) for (let k = 0; k < 3; k++)
      solid.push(box(0.09, 0.11, 0.09, -0.26 + k * 0.13, H + 0.04, 0.24, PAL.leaf[k % 3]));
    if (rnd(seed + 13, 3) === 0)
      solid.push(box(0.02, 0.36, 0.02, 0.28, H + 0.04, -0.26, PAL.trim));       // ăng-ten
  }

  return {
    solid: mergeGeometries(solid),
    glass: glass.length ? mergeGeometries(glass) : null,
  };
}

export function makeTower(seed) {
  const solid = [], glass = [];
  const H = 3.4 + rnd(seed, 20) * 0.12;
  solid.push(box(0.78, H, 0.78, 0, 0, 0, "#9db2c2"));
  for (let f = 0; f < Math.floor(H / 0.34); f++) {
    const y = 0.2 + f * 0.34;
    for (const [ox, oz, gw, gd] of [[0, 0.40, 0.60, 0.03], [0, -0.40, 0.60, 0.03],
    [0.40, 0, 0.03, 0.60], [-0.40, 0, 0.03, 0.60]])
      glass.push(box(gw, 0.20, gd, ox, y, oz, "#6f93ad"));
  }
  solid.push(box(0.06, 0.5, 0.06, 0, H, 0, "#8fa6ba"));
  return { solid: mergeGeometries(solid), glass: mergeGeometries(glass) };
}

export function makePagoda(seed) {
  const solid = [];
  solid.push(box(0.9, 0.5, 0.9, 0, 0, 0, "#c2543f"));
  solid.push(pyramid(1.35, 0.30, 1.35, 0, 0.5, 0, "#8a4438"));
  solid.push(box(0.6, 0.35, 0.6, 0, 0.8, 0, "#c2543f"));
  solid.push(pyramid(1.0, 0.26, 1.0, 0, 1.15, 0, "#8a4438"));
  solid.push(box(0.05, 0.22, 0.05, 0, 1.41, 0, "#d8a24a"));
  const glass = [];
  for (const [x, z] of [[0.3, 0.46], [-0.3, 0.46]])
    glass.push(box(0.10, 0.14, 0.10, x, 0.34, z, "#ff6a4a"));       // đèn lồng đỏ
  return { solid: mergeGeometries(solid), glass: mergeGeometries(glass) };
}

export function makeMarket(seed) {
  const solid = [], glass = [];
  solid.push(box(1.7, 0.6, 1.7, 0, 0, 0, "#e6d0a0"));
  solid.push(pyramid(2.1, 0.5, 2.1, 0, 0.6, 0, "#9e5039"));
  solid.push(box(0.34, 0.9, 0.34, 0, 1.0, 0, "#e6d0a0"));           // tháp đồng hồ
  solid.push(pyramid(0.5, 0.3, 0.5, 0, 1.9, 0, "#7d3d2c"));
  for (const [x, z, w, d] of [[0, 0.86, 1.2, 0.04], [0, -0.86, 1.2, 0.04],
  [0.86, 0, 0.04, 1.2], [-0.86, 0, 0.04, 1.2]])
    glass.push(box(w, 0.32, d, x, 0.08, z, "#ffca6e"));             // sạp sáng đèn
  glass.push(box(0.16, 0.16, 0.03, 0, 1.55, 0.18, "#fff2c9"));      // mặt đồng hồ
  return { solid: mergeGeometries(solid), glass: mergeGeometries(glass) };
}

export function makeGov(seed) {
  const solid = [], glass = [];
  solid.push(box(1.7, 1.1, 1.5, 0, 0, 0, "#e0c877"));
  solid.push(box(1.76, 0.08, 1.56, 0, 1.1, 0, "#efdfa4"));
  for (let k = -2; k <= 2; k++)                                     // hàng cột
    solid.push(box(0.09, 1.0, 0.09, k * 0.33, 0, 0.78, "#efdfa4"));
  solid.push(box(0.03, 0.7, 0.03, 0.6, 1.18, -0.5, "#cfc8b6"));
  solid.push(box(0.34, 0.22, 0.02, 0.78, 1.62, -0.5, "#c8322c"));   // cờ
  for (let f = 0; f < 2; f++) for (let k = -1; k <= 1; k++)
    glass.push(box(0.18, 0.22, 0.03, k * 0.45, 0.35 + f * 0.42, 0.76, "#ffd88a"));
  return { solid: mergeGeometries(solid), glass: mergeGeometries(glass) };
}

export function makeSchool(seed) {
  const solid = [], glass = [];
  solid.push(box(2.4, 1.0, 1.4, 0, 0, 0, "#e2c9a0"));
  solid.push(box(2.5, 0.06, 1.5, 0, 1.0, 0, "#c1a980"));
  for (let f = 0; f < 2; f++) for (let k = -3; k <= 3; k++)
    glass.push(box(0.20, 0.24, 0.03, k * 0.33, 0.22 + f * 0.42, 0.72, "#ffd88a"));
  solid.push(box(0.5, 0.05, 0.35, 0, 0.9, 0.85, "#b03e2c"));
  return { solid: mergeGeometries(solid), glass: mergeGeometries(glass) };
}

export function makeTree(seed) {
  const t = new THREE.CylinderGeometry(0.045, 0.06, 0.42, 6);
  t.translate(0, 0.21, 0);
  const f = new THREE.IcosahedronGeometry(0.30, 0);
  f.scale(1, 0.85, 1);
  f.translate(0, 0.62, 0);
  const f2 = new THREE.IcosahedronGeometry(0.20, 0);
  f2.translate(0.12, 0.82, -0.06);
  return {
    solid: mergeGeometries([
      finish(t, PAL.bark),
      finish(f, PAL.leaf[seed % 3]),
      finish(f2, PAL.leaf[(seed + 1) % 3]),
    ]),
    glass: null,
  };
}

export function makeRubble(seed) {
  const parts = [box(0.86, 0.03, 0.86, 0, 0, 0, "#8f8878")];
  for (let k = 0; k < 7; k++) {
    const s = 0.10 + ((seed * (k + 3)) % 9) * 0.02;
    const x = -0.3 + ((seed * (k + 5) * 7) % 60) / 100;
    const z = -0.3 + ((seed * (k + 7) * 11) % 60) / 100;
    const g = box(s, s * (0.6 + (k % 3) * 0.3), s, x, 0.02, z, PAL.rubble);
    g.rotateY((k * 37) % 90 * Math.PI / 180);
    parts.push(g);
  }
  parts.push(box(0.14, 0.34, 0.10, 0.30, 0.02, -0.28, "#a89f8f"));   // mảng tường còn đứng
  return { solid: mergeGeometries(parts), glass: null };
}

export function makeCrater(seed) {
  const g = new THREE.CylinderGeometry(0.52, 0.30, 0.16, 10);
  g.translate(0, -0.06, 0);
  const ring = new THREE.TorusGeometry(0.5, 0.06, 4, 12);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, 0.01, 0);
  return { solid: mergeGeometries([finish(g, "#3b3630"), finish(ring, "#6f6a5f")]), glass: null };
}

/* vehicles */
export function makeBike(color) {
  const parts = [
    box(0.30, 0.07, 0.13, 0, 0.05, 0, color),
    box(0.11, 0.16, 0.11, 0, 0.12, 0, "#2f2b27"),
    box(0.10, 0.06, 0.10, 0, 0.28, 0, "#d8c48f"),
  ];
  return mergeGeometries(parts);
}
export function makeCar(color) {
  return mergeGeometries([
    box(0.62, 0.16, 0.30, 0, 0.04, 0, color),
    box(0.36, 0.14, 0.28, -0.02, 0.20, 0, color),
    box(0.34, 0.10, 0.30, -0.02, 0.22, 0, "#8fa6b8"),
  ]);
}
export function makeBus(color) {
  const parts = [box(1.10, 0.42, 0.36, 0, 0.05, 0, color)];
  for (let k = -2; k <= 2; k++) parts.push(box(0.14, 0.14, 0.38, k * 0.20, 0.26, 0, "#8fa6b8"));
  return mergeGeometries(parts);
}
export function makeBoat(color) {
  return mergeGeometries([
    box(0.80, 0.10, 0.26, 0, 0.02, 0, color),
    box(0.28, 0.16, 0.22, -0.08, 0.12, 0, "#cfc8b6"),
  ]);
}
export function makePerson(color) {
  return mergeGeometries([
    box(0.10, 0.16, 0.08, 0, 0.06, 0, color),
    box(0.09, 0.09, 0.09, 0, 0.22, 0, "#3f3b36"),
  ]);
}
