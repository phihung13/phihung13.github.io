/* Sài Gòn — the world itself: streets, canal, plots, disasters.
 *
 * No drawing happens here. This file only decides WHAT exists and WHERE.
 */

export const TW = 104, TH = 66, ZH = 25;
export const GRID = 64;                       // a real district, not a diorama

/* ── palettes ─────────────────────────────────────────────────────── */
export const P = {
  asphalt: "#68635c", asphalt2: "#605b54",
  walk: "#b8b1a0", curb: "#968f80", dirt: "#9c9481",
  grass: "#6f8f52", grassD: "#5a7742",
  water: "#4b7f9e", waterD: "#3c6a86", waterHi: "#7fb0c8",
  moss: "#5d7a4a", stain: "#6b6455",
  tileR: "#9e5039", tileL: "#7d3d2c", tileHL: "#b56a4f",
  tinR: "#8d9298", tinL: "#6f747a", rust: "#8a5a3c",
  tankT: "#9aa8ae", tankL: "#5c686e", tankR: "#7a878d",
  tree: "#57813f", treeD: "#3b5c31", trunk: "#5f4a33",
  glass: "#5a6c7d", frame: "#e9e3d3", rail: "#8f8878",
  rubble: ["#a89f8f", "#8c8474", "#6f6a5f"],
  char: ["#5c534b", "#443d37", "#6e6459"],
  ember: "#d8632c", craterA: "#4a453e", craterB: "#332f2a",
  smoke: "#b9b3a8",
  drum: ["#4a6b88", "#7a5a3a", "#5f6b52"],
  signs: ["#b03e2c", "#3a6491", "#c78d24", "#3f7d52", "#8f4d80", "#2a7076"],
  facades: [
    ["#d9c089", "#b6a06e", "#e6d3a6"], ["#bcc9b0", "#9caa91", "#d3ded0"],
    ["#d8c1b2", "#b59c8d", "#e7d5cb"], ["#c6c1b3", "#a49f90", "#dad6cb"],
    ["#e0d2ad", "#bcae8b", "#eee3c9"], ["#b9af99", "#978d78", "#cfc7b5"],
    ["#cfbcc2", "#ab99a0", "#e1d2d7"], ["#a9b3ad", "#8b968f", "#c3ccc6"],
  ],
  gov: ["#e0c877", "#bda75d", "#efdfa4"],
  pagoda: ["#c2543f", "#9c422f", "#d8a24a"],
  school: ["#e2c9a0", "#c1a980", "#f0dcbb"],
};

export const rnd = (s, n) => Math.floor((s * 1103515245 + 12345) / 65536) % n;
export const wx = (gx, gy) => (gx - gy) * (TW / 2);      // world coords (no camera)
export const wy = (gx, gy) => (gx + gy) * (TH / 2);
export const cellMid = (gx, gy, w = 1, d = 1) =>
  [wx(gx + w / 2, gy + d / 2), wy(gx + w / 2, gy + d / 2)];
export const key = (x, y) => x + "," + y;

/* ── terrain ──────────────────────────────────────────────────────── */
export const road = Array.from({ length: GRID }, () => Array(GRID).fill(false));
export const canal = Array.from({ length: GRID }, () => Array(GRID).fill(false));
export const bridge = Array.from({ length: GRID }, () => Array(GRID).fill(false));
const taken = Array.from({ length: GRID }, () => Array(GRID).fill(false));

function run(pts) {
  let [x, y] = pts[0];
  if (inside(x, y)) road[y][x] = true;
  for (const [tx, ty] of pts.slice(1)) {
    while (x !== tx) { x += tx > x ? 1 : -1; if (inside(x, y)) road[y][x] = true; }
    while (y !== ty) { y += ty > y ? 1 : -1; if (inside(x, y)) road[y][x] = true; }
  }
}
const inside = (x, y) => x >= 0 && x < GRID && y >= 0 && y < GRID;

/* the canal cuts diagonally across the district — Saigon always has water in the way */
for (let gy = 0; gy < GRID; gy++) {
  for (let gx = 0; gx < GRID; gx++) {
    const drift = Math.sin(gx * 0.22) * 3 + Math.sin(gx * 0.07) * 5;
    const band = gy - (gx * 0.55 + 24 + drift);
    if (band > -1.6 && band < 1.6) canal[gy][gx] = true;
  }
}

/* boulevards, with a jog in them so nothing reads as graph paper */
run([[0, 8], [12, 8], [12, 11], [30, 11], [30, 14], [63, 14]]);
run([[0, 30], [18, 30], [18, 34], [40, 34], [40, 30], [63, 30]]);
run([[0, 50], [22, 50], [22, 54], [45, 54], [45, 50], [63, 50]]);
run([[6, 0], [6, 22], [10, 22], [10, 63]]);
run([[20, 0], [20, 63]]);
run([[34, 0], [34, 26], [38, 26], [38, 63]]);
run([[50, 0], [50, 63]]);
run([[58, 0], [58, 40], [62, 40], [62, 63]]);
/* alleys */
run([[0, 20], [6, 20]]);
run([[14, 14], [14, 30]]);
run([[26, 18], [26, 40]]);
run([[44, 8], [44, 34]]);
run([[54, 20], [54, 46]]);
run([[28, 44], [46, 44]]);
run([[12, 40], [30, 40]]);
run([[40, 56], [58, 56]]);

/* two cells wide, so the street surface is actually visible */
{
  const wide = Array.from({ length: GRID }, () => Array(GRID).fill(false));
  for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
    if (!road[gy][gx]) continue;
    wide[gy][gx] = true;
    if (gx + 1 < GRID) wide[gy][gx + 1] = true;
    if (gy + 1 < GRID) wide[gy + 1][gx] = true;
  }
  for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) road[gy][gx] = wide[gy][gx];
}

/* wherever a road meets the canal, that's a bridge — otherwise the road just stops at water */
for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
  if (road[gy][gx] && canal[gy][gx]) { bridge[gy][gx] = true; }
}
export const isRoad = (x, y) => inside(x, y) && road[y][x] && !(canal[y][x] && !bridge[y][x]);
export const isWater = (x, y) => inside(x, y) && canal[y][x] && !bridge[y][x];

/* ── plots ────────────────────────────────────────────────────────── */
export const plots = [];
const plotAt = new Map();

function occupy(gx, gy, w, d) {
  for (let y = gy; y < gy + d; y++) for (let x = gx; x < gx + w; x++)
    if (inside(x, y)) taken[y][x] = true;
}
function free(gx, gy, w, d) {
  for (let y = gy; y < gy + d; y++) for (let x = gx; x < gx + w; x++) {
    if (!inside(x, y) || road[y][x] || canal[y][x] || taken[y][x]) return false;
  }
  return true;
}
function place(gx, gy, w, d, kind, seed) {
  occupy(gx, gy, w, d);
  const p = { gx, gy, w, d, kind, seed, depth: gx + gy };
  plots.push(p);
  plotAt.set(key(gx, gy), p);
  return p;
}

/* landmarks first — they get the good corners */
const LANDMARKS = [
  [16, 16, 2, 2, "market"], [42, 20, 2, 2, "pagoda"], [24, 46, 2, 2, "gov"],
  [48, 44, 3, 2, "school"], [30, 22, 2, 2, "park"], [52, 12, 2, 2, "park"],
  [14, 52, 2, 2, "park"], [46, 60, 2, 2, "market"], [8, 36, 2, 2, "pagoda"],
];
for (const [gx, gy, w, d, kind] of LANDMARKS)
  if (free(gx, gy, w, d)) place(gx, gy, w, d, kind, gx * 31 + gy * 17 + 3);

/* the downtown towers cluster around one crossroads */
for (const [gx, gy] of [[22, 12], [24, 13], [21, 15], [25, 16], [23, 18], [27, 12]])
  if (free(gx, gy, 1, 1)) place(gx, gy, 1, 1, "tower", gx * 7 + gy * 13);

for (let depth = 0; depth < 2 * GRID; depth++) {
  for (let gx = 0; gx < GRID; gx++) {
    const gy = depth - gx;
    if (!inside(gx, gy) || road[gy][gx] || canal[gy][gx] || taken[gy][gx]) continue;
    const seed = gx * 37 + gy * 19 + 5;
    const roll = rnd(seed, 14);
    if (roll === 0) { place(gx, gy, 1, 1, "garden", seed); continue; }
    const shape = rnd(seed + 41, 10);
    let w = 1, d = 1;
    if (shape < 2 && free(gx, gy, 2, 1)) w = 2;
    else if (shape < 4 && free(gx, gy, 1, 2)) d = 2;
    place(gx, gy, w, d, "house", seed);
  }
}
export const plotOf = (gx, gy) => plotAt.get(key(gx, gy));

/* ── disasters ────────────────────────────────────────────────────── */
export const events = [];
export const dmg = {
  collapsed: new Set(), charred: new Set(), craters: new Set(),
  cracked: new Set(), flooded: new Set(),
};

function pickCells(seed, n, wantRoad = false) {
  const out = [];
  let k = (seed * 7919) % (GRID * GRID);
  for (let i = 0; i < GRID * GRID && out.length < n; i++) {
    const gx = k % GRID, gy = Math.floor(k / GRID);
    k = (k + 3517) % (GRID * GRID);
    if (canal[gy][gx] && !bridge[gy][gx]) continue;
    if (road[gy][gx] === wantRoad) out.push([gx, gy]);
  }
  return out;
}

export function recomputeDamage() {
  for (const s of Object.values(dmg)) s.clear();
  let tides = 0;
  for (const ev of events) {
    const { kind, seed } = ev;
    if (kind === "earthquake") {
      for (const [ex, ey] of pickCells(seed, 14)) {
        dmg.collapsed.add(key(ex, ey));
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
          const nx = ex + dx, ny = ey + dy;
          if (inside(nx, ny) && !road[ny][nx] && !canal[ny][nx] && (dx + dy + seed) % 2 === 0)
            dmg.collapsed.add(key(nx, ny));
        }
      }
      for (const [cx, cy] of pickCells(seed + 31, 26, true)) dmg.cracked.add(key(cx, cy));
    } else if (kind === "lightning") {
      for (const [cx, cy] of pickCells(seed + 7, 12)) dmg.charred.add(key(cx, cy));
    } else if (kind === "war") {
      const spots = ev.at ? [ev.at] : pickCells(seed + 13, 4);
      for (const [ex, ey] of spots) {
        dmg.craters.add(key(ex, ey));
        for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
          const nx = ex + dx, ny = ey + dy, man = Math.abs(dx) + Math.abs(dy);
          if (!inside(nx, ny) || man > 2) continue;
          if (road[ny][nx]) { if (man <= 1) dmg.craters.add(key(nx, ny)); }
          else if (canal[ny][nx]) continue;
          else if (man <= 1) dmg.collapsed.add(key(nx, ny));
          else if ((dx + dy + seed) % 2 === 0) dmg.charred.add(key(nx, ny));
        }
      }
    } else if (kind === "flood") {
      tides++;
      // the canal bursts: water spreads outward from it, further with each tide
      const reach = 3 + 4 * tides;
      for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
        if (canal[gy][gx]) continue;
        let near = false;
        for (let r = 1; r <= reach && !near; r++) {
          for (let a = -r; a <= r && !near; a++) {
            const c1 = canal[Math.max(0, Math.min(GRID - 1, gy + a))]?.[
              Math.max(0, Math.min(GRID - 1, gx + (r - Math.abs(a))))];
            const c2 = canal[Math.max(0, Math.min(GRID - 1, gy + a))]?.[
              Math.max(0, Math.min(GRID - 1, gx - (r - Math.abs(a))))];
            if (c1 || c2) near = true;
          }
        }
        if (near) dmg.flooded.add(key(gx, gy));
      }
    }
  }
  for (const k of dmg.craters) dmg.collapsed.delete(k);
  for (const k of dmg.collapsed) dmg.charred.delete(k);
  for (const k of dmg.craters) dmg.charred.delete(k);
}

export function strike(kind, at = null, seed = null) {
  if (kind === "reset") { events.length = 0; recomputeDamage(); return null; }
  const ev = { kind, seed: seed ?? (events.length + 1) * 977 + 13 };
  if (at) ev.at = at;
  events.push(ev);
  recomputeDamage();
  return ev;
}

/* ── lanes: follow the actual carriageways, and stop at the water ──── */
export const lanes = [];
function traceLane(cells) {
  const clean = cells.filter(([gx, gy]) => inside(Math.floor(gx), Math.floor(gy)));
  if (clean.length > 1) lanes.push({ cells: clean });
}
const range = (a, b) => { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; };

traceLane([...range(0, 12).map(x => [x, 8.5]), [12.5, 9.5], [12.5, 10.5],
...range(13, 30).map(x => [x, 11.5]), [30.5, 12.5], [30.5, 13.5],
...range(31, 63).map(x => [x, 14.5])]);
traceLane([...range(0, 18).map(x => [x, 30.5]), [18.5, 31.5], [18.5, 33.5],
...range(19, 40).map(x => [x, 34.5]), [40.5, 32.5], [40.5, 30.5],
...range(41, 63).map(x => [x, 30.5])]);
traceLane([...range(0, 22).map(x => [x, 50.5]), [22.5, 51.5], [22.5, 53.5],
...range(23, 45).map(x => [x, 54.5]), [45.5, 52.5],
...range(46, 63).map(x => [x, 50.5])]);
traceLane([...range(0, 22).map(y => [6.5, y]), [7.5, 22.5], [9.5, 22.5],
...range(23, 63).map(y => [10.5, y])]);
traceLane(range(0, 63).map(y => [20.5, y]));
traceLane(range(0, 63).map(y => [34.5, y]).slice(0, 27).concat(
  [[35.5, 26.5], [37.5, 26.5]], range(27, 63).map(y => [38.5, y])));
traceLane(range(63, 0).map((_, i) => [50.5, 63 - i]));
traceLane(range(0, 63).map(y => [58.5, y]));
traceLane(range(14, 30).map(y => [14.5, y]));
traceLane(range(18, 40).map(y => [26.5, y]));
traceLane(range(8, 34).map(y => [44.5, y]));
traceLane(range(20, 46).map(y => [54.5, y]));
traceLane(range(28, 46).map(x => [x, 44.5]));
traceLane(range(12, 30).map(x => [x, 40.5]));

/* pavements the pedestrians shuffle along: any plot cell that touches a street */
export const walkCells = [];
for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
  if (road[gy][gx] || canal[gy][gx]) continue;
  if (isRoad(gx + 1, gy) || isRoad(gx, gy + 1) || isRoad(gx - 1, gy) || isRoad(gx, gy - 1))
    walkCells.push([gx, gy]);
}

recomputeDamage();
