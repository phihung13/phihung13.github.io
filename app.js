/* The living city: camera, day/night, weather, traffic, people, boats, disasters. */
import {
  TW, TH, GRID, P, rnd, wx, wy, key, road, canal, bridge, isRoad, isWater,
  plots, plotOf, lanes, walkCells, events, dmg, strike, recomputeDamage,
} from "./world.js";
import { spriteFor, invalidate } from "./sprites.js";

const cv = document.getElementById("cv");
const g = cv.getContext("2d", { alpha: false });
let VW = 0, VH = 0, DPR = Math.min(2, devicePixelRatio || 1);

function resize() {
  VW = cv.clientWidth; VH = cv.clientHeight;
  cv.width = Math.floor(VW * DPR); cv.height = Math.floor(VH * DPR);
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
}
addEventListener("resize", resize);

/* ── camera ───────────────────────────────────────────────────────── */
const cam = { x: wx(20, 20), y: wy(20, 20), z: 0.75 };
const W2S = (x, y) => [(x - cam.x) * cam.z + VW / 2, (y - cam.y) * cam.z + VH / 2];
const S2W = (sx, sy) => [(sx - VW / 2) / cam.z + cam.x, (sy - VH / 2) / cam.z + cam.y];
function cellAt(sx, sy) {
  const [x, y] = S2W(sx, sy);
  const gx = Math.floor((x / (TW / 2) + y / (TH / 2)) / 2);
  const gy = Math.floor((y / (TH / 2) - x / (TW / 2)) / 2);
  return [gx, gy];
}

let drag = null;
cv.addEventListener("pointerdown", e => {
  drag = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: 0 };
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener("pointermove", e => {
  if (!drag) return;
  const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
  drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
  cam.x = drag.cx - dx / cam.z;
  cam.y = drag.cy - dy / cam.z;
  clampCam();
});
cv.addEventListener("pointerup", e => {
  if (drag && drag.moved < 5) {                    // a click, not a drag → drop a missile there
    const r = cv.getBoundingClientRect();
    const [gx, gy] = cellAt(e.clientX - r.left, e.clientY - r.top);
    if (gx >= 0 && gx < GRID && gy >= 0 && gy < GRID && !isWater(gx, gy)) launchMissile(gx, gy);
  }
  drag = null;
});
cv.addEventListener("wheel", e => {
  e.preventDefault();
  const r = cv.getBoundingClientRect();
  const before = S2W(e.clientX - r.left, e.clientY - r.top);
  cam.z = Math.max(0.32, Math.min(1.9, cam.z * (e.deltaY < 0 ? 1.12 : 0.893)));
  const after = S2W(e.clientX - r.left, e.clientY - r.top);
  cam.x += before[0] - after[0];                    // zoom toward the cursor
  cam.y += before[1] - after[1];
  clampCam();
}, { passive: false });

function clampCam() {
  const pad = 400;
  cam.x = Math.max(wx(0, GRID) - pad, Math.min(wx(GRID, 0) + pad, cam.x));
  cam.y = Math.max(wy(0, 0) - pad, Math.min(wy(GRID, GRID) + pad, cam.y));
}

/* ── ground, baked into big tiles once ────────────────────────────── */
const TILE = 1024;
const groundTiles = new Map();
function groundTile(tx, ty) {
  const id = tx + "," + ty;
  let t = groundTiles.get(id);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = TILE; c.height = TILE;
  const q = c.getContext("2d");
  q.translate(-tx * TILE, -ty * TILE);
  q.fillStyle = P.dirt;
  q.fillRect(tx * TILE, ty * TILE, TILE, TILE);
  const poly = (pts, fill, a = 1) => {
    q.globalAlpha = a; q.fillStyle = fill;
    q.beginPath(); q.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) q.lineTo(pts[i][0], pts[i][1]);
    q.closePath(); q.fill(); q.globalAlpha = 1;
  };
  const line = (p1, p2, c2, w, a = 1) => {
    q.globalAlpha = a; q.strokeStyle = c2; q.lineWidth = w;
    q.beginPath(); q.moveTo(p1[0], p1[1]); q.lineTo(p2[0], p2[1]); q.stroke(); q.globalAlpha = 1;
  };
  for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
    const N = [wx(gx, gy), wy(gx, gy)], E = [wx(gx + 1, gy), wy(gx + 1, gy)];
    const S = [wx(gx + 1, gy + 1), wy(gx + 1, gy + 1)], W = [wx(gx, gy + 1), wy(gx, gy + 1)];
    if (E[0] < tx * TILE - 80 || W[0] > (tx + 1) * TILE + 80) continue;
    if (S[1] < ty * TILE - 80 || N[1] > (ty + 1) * TILE + 80) continue;
    const water = canal[gy][gx] && !bridge[gy][gx];
    const rd = road[gy][gx] && !water;
    if (water) {
      poly([N, E, S, W], (gx + gy) % 2 ? P.water : P.waterD);
    } else if (rd) {
      poly([N, E, S, W], (gx + gy) % 2 ? P.asphalt : P.asphalt2);
      if (bridge[gy][gx]) {                                  // railings on the bridge deck
        line(N, E, "#cfc8b6", 3, 0.8);
        line(W, S, "#cfc8b6", 3, 0.8);
      }
      const ew = isRoad(gx - 1, gy) && isRoad(gx + 1, gy);
      const ns = isRoad(gx, gy - 1) && isRoad(gx, gy + 1);
      if (ew !== ns) {
        const c2 = [(N[0] + S[0]) / 2, (N[1] + S[1]) / 2];
        if (ew) line([c2[0] - 16, c2[1] - 10], [c2[0] + 16, c2[1] + 10], "#ded5c1", 2, 0.45);
        else line([c2[0] - 16, c2[1] + 10], [c2[0] + 16, c2[1] - 10], "#ded5c1", 2, 0.45);
      }
    } else {
      poly([N, E, S, W], P.walk);
      if (isRoad(gx + 1, gy)) line(E, S, P.curb, 3, 0.9);
      if (isRoad(gx, gy + 1)) line(S, W, P.curb, 3, 0.9);
    }
  }
  t = c; groundTiles.set(id, t);
  return t;
}

/* ── damage on the ground (cracks) drawn straight onto the frame ──── */
function drawCracks() {
  for (const k of dmg.cracked) {
    const [gx, gy] = k.split(",").map(Number);
    const c = [wx(gx + 0.5, gy + 0.5), wy(gx + 0.5, gy + 0.5)];
    const [sx, sy] = W2S(c[0], c[1]);
    if (sx < -80 || sx > VW + 80 || sy < -80 || sy > VH + 80) continue;
    const s = gx * 7 + gy * 13 + 3;
    g.strokeStyle = P.craterB; g.lineWidth = 7 * cam.z; g.lineJoin = "round";
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const t = i / 5, j = -8 + ((s * (i + 3) * 19) % 16);
      const [px, py] = W2S(c[0] - 48 + 96 * t, c[1] - 28 + 56 * t + j);
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.stroke();
  }
}

/* ── agents: bikes, cars, buses, people, boats ────────────────────── */
const BIKE = ["#b03e2c", "#e8e4d6", "#3a6491", "#c78d24", "#6f8f52", "#46433d", "#9e5039", "#5f86a8"];
const CAR = ["#c9c4b6", "#3f5f8a", "#8a3b32", "#4a4640", "#d8d2c4"];
const SHIRT = ["#c05a4a", "#e8e4d6", "#5f86a8", "#d8c48f", "#6f8f52", "#a05a9c", "#3a3733"];
const agents = [];

function laneGeom(lane) {
  const pts = lane.cells.map(([gx, gy]) => [wx(gx, gy), wy(gx, gy)]);
  const segs = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    segs.push({ a: pts[i], b: pts[i + 1], len, at: total });
    total += len;
  }
  lane.segs = segs; lane.total = total || 1;
}
lanes.forEach(laneGeom);

function laneAt(lane, t, off = 0) {
  const d = ((t % 1) + 1) % 1 * lane.total;
  let s = lane.segs[0];
  for (const seg of lane.segs) if (d >= seg.at) s = seg;
  const u = s.len ? Math.min(1, (d - s.at) / s.len) : 0;
  const x = s.a[0] + (s.b[0] - s.a[0]) * u;
  const y = s.a[1] + (s.b[1] - s.a[1]) * u;
  if (!off) return [x, y];
  const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], L = Math.hypot(dx, dy) || 1;
  return [x - dy / L * off, y + dx / L * off];
}

function spawnAgents() {
  agents.length = 0;
  lanes.forEach((lane, li) => {
    const n = 4 + (li % 3);
    for (let i = 0; i < n; i++) {
      const roll = (i + li) % 7;
      agents.push({
        type: "veh", lane, t: i / n, off: (i % 2 ? 1 : -1) * 9,
        v: (0.016 + (i % 3) * 0.004) * (0.8 + (li % 3) * 0.15),
        kind: roll === 0 ? "car" : roll === 3 ? "bus" : "bike",
        color: roll === 0 ? CAR[i % CAR.length] : roll === 3 ? "#c78d24" : BIKE[(i * 3 + li) % BIKE.length],
      });
    }
    for (let i = 0; i < 3; i++)                       // people shuffling along the pavement
      agents.push({
        type: "ped", lane, t: (i + 0.5) / 3, off: (i % 2 ? 1 : -1) * 34,
        v: 0.0035 + (i % 3) * 0.0008, dir: i % 2 ? 1 : -1,
        color: SHIRT[(i * 5 + li) % SHIRT.length],
      });
  });
  // boats: they follow the canal, which is a band, so we sample its middle
  const canalPts = [];
  for (let gx = 0; gx < GRID; gx++) {
    let sum = 0, n = 0;
    for (let gy = 0; gy < GRID; gy++) if (canal[gy][gx]) { sum += gy; n++; }
    if (n) canalPts.push([gx, sum / n]);
  }
  const canalLane = { cells: canalPts };
  laneGeom(canalLane);
  for (let i = 0; i < 5; i++)
    agents.push({
      type: "boat", lane: canalLane, t: i / 5, off: (i % 2 ? 1 : -1) * 12,
      v: 0.006 + (i % 3) * 0.002, color: ["#8a6a3a", "#5f6b52", "#7a5a3a"][i % 3],
    });
}
spawnAgents();

/* ── disasters + effects ──────────────────────────────────────────── */
let shake = 0, flash = 0, floodRise = 0;
const particles = [], missiles = [];
const stat = document.getElementById("stat");

function burst(x, y, n, col, spread, life) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 7, sp = Math.random() * spread;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5 - 40,
      life, max: life, r: 3 + Math.random() * 10, col,
    });
  }
}
function launchMissile(gx, gy) {
  const x = wx(gx + 0.5, gy + 0.5), y = wy(gx + 0.5, gy + 0.5);
  missiles.push({ x0: x - 700, y0: y - 900, x, y, t: 0, gx, gy });
}
function refresh() {
  invalidate();
  const wrecked = dmg.collapsed.size + dmg.charred.size + dmg.craters.size;
  stat.textContent = events.length === 0 ? "thành phố nguyên vẹn"
    : `${wrecked} công trình đổ nát · ${dmg.cracked.size + dmg.craters.size} đoạn đường hư · `
    + `${dmg.flooded.size} ô ngập · ${events.length} thảm hoạ`;
  for (const lane of lanes)
    lane.blocked = lane.cells.some(([gx, gy]) => dmg.craters.has(key(Math.floor(gx), Math.floor(gy))));
}

function doStrike(kind) {
  if (kind === "war") {                              // aim at the middle of the view
    const [x, y] = S2W(VW / 2, VH / 2);
    const gx = Math.floor((x / (TW / 2) + y / (TH / 2)) / 2);
    const gy = Math.floor((y / (TH / 2) - x / (TW / 2)) / 2);
    launchMissile(Math.max(0, Math.min(GRID - 1, gx)), Math.max(0, Math.min(GRID - 1, gy)));
    return;
  }
  strike(kind);
  if (kind === "earthquake") shake = 1;
  if (kind === "lightning") flash = 1;
  if (kind === "flood") floodRise = 0;
  if (kind === "reset") { floodRise = 0; particles.length = 0; }
  refresh();
}
document.querySelectorAll("button[data-kind]").forEach(b =>
  b.addEventListener("click", () => doStrike(b.dataset.kind)));

/* ── time of day + weather ────────────────────────────────────────── */
let clock = 9 * 3600;              // seconds; the city starts mid-morning
let timeScale = 240;               // 1 real second = 4 city minutes
let rain = 0, rainWanted = 0;
const drops = [];
const timeEl = document.getElementById("time");
document.getElementById("rain").addEventListener("click", e => {
  rainWanted = rainWanted > 0 ? 0 : 1;
  e.target.textContent = rainWanted ? "☔ Tạnh mưa" : "🌧️ Mưa";
});
document.getElementById("clock").addEventListener("input", e => {
  clock = +e.target.value * 3600;
});

function nightness() {                       // 0 at noon, 1 deep at night
  const h = (clock / 3600) % 24;
  if (h >= 7 && h < 17) return 0;
  if (h >= 17 && h < 19.5) return (h - 17) / 2.5;
  if (h >= 5 && h < 7) return 1 - (h - 5) / 2;
  return 1;
}

/* ── the frame ────────────────────────────────────────────────────── */
let last = performance.now(), fpsAcc = 0, fpsN = 0;
const fpsEl = document.getElementById("fps");
const plotsByDepth = new Map();
for (const p of plots) {
  if (!plotsByDepth.has(p.depth)) plotsByDepth.set(p.depth, []);
  plotsByDepth.get(p.depth).push(p);
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clock = (clock + dt * timeScale) % 86400;
  const night = nightness();
  rain += (rainWanted - rain) * Math.min(1, dt * 0.7);

  // effects
  shake = Math.max(0, shake - dt * 1.5);
  flash = Math.max(0, flash - dt * 2);
  if (dmg.flooded.size) floodRise = Math.min(1, floodRise + dt / 2);
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    m.t += dt / 0.9;
    if (m.t >= 1) {
      burst(m.x, m.y, 60, P.ember, 260, 1.4);
      burst(m.x, m.y, 30, P.smoke, 140, 2.2);
      shake = 1; flash = 0.45;
      strike("war", [m.gx, m.gy]);
      refresh();
      missiles.splice(i, 1);
    }
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 70 * dt;
  }
  for (const a of agents) {
    if (a.type === "veh" && a.lane.blocked) continue;
    a.t = (a.t + a.v * dt * (a.dir === -1 ? -1 : 1) + 1) % 1;
  }
  if (rain > 0.05) {
    while (drops.length < 220 * rain) {
      const [x0, y0] = S2W(Math.random() * VW, -20);
      drops.push({ x: x0, y: y0, v: 900 + Math.random() * 400, len: 12 + Math.random() * 10 });
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      const dr = drops[i];
      dr.y += dr.v * dt; dr.x += 90 * dt;
      const [sx, sy] = W2S(dr.x, dr.y);
      if (sy > VH + 40 || sx > VW + 60) drops.splice(i, 1);
    }
  } else drops.length = 0;

  // ── draw ──
  g.save();
  if (shake > 0) g.translate((Math.random() - .5) * shake * 16, (Math.random() - .5) * shake * 16);
  g.fillStyle = "#0f1216";
  g.fillRect(-40, -40, VW + 80, VH + 80);

  // ground tiles
  const [wx0, wy0] = S2W(-60, -60), [wx1, wy1] = S2W(VW + 60, VH + 60);
  const tx0 = Math.floor(wx0 / TILE), tx1 = Math.floor(wx1 / TILE);
  const ty0 = Math.floor(wy0 / TILE), ty1 = Math.floor(wy1 / TILE);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const t = groundTile(tx, ty);
    const [sx, sy] = W2S(tx * TILE, ty * TILE);
    g.drawImage(t, sx, sy, TILE * cam.z, TILE * cam.z);
  }
  drawCracks();

  // canal shimmer
  g.globalAlpha = 0.18;
  g.strokeStyle = P.waterHi; g.lineWidth = 2;
  for (let gx = 0; gx < GRID; gx += 2) for (let gy = 0; gy < GRID; gy++) {
    if (!canal[gy][gx] || bridge[gy][gx]) continue;
    const [sx, sy] = W2S(wx(gx + .5, gy + .5), wy(gx + .5, gy + .5));
    if (sx < -40 || sx > VW + 40 || sy < -40 || sy > VH + 40) continue;
    const ph = Math.sin(now / 700 + gx * .6 + gy * .3) * 8;
    g.beginPath(); g.moveTo(sx - 16 + ph, sy); g.lineTo(sx + 16 + ph, sy); g.stroke();
  }
  g.globalAlpha = 1;

  // bucket the agents by depth so buildings can hide them
  const byDepth = new Map();
  for (const a of agents) {
    if (a.type === "veh" && a.lane.blocked) continue;
    const [x, y] = laneAt(a.lane, a.t, a.off);
    a.x = x; a.y = y;
    const gx = (x / (TW / 2) + y / (TH / 2)) / 2, gy = (y / (TH / 2) - x / (TW / 2)) / 2;
    const dep = Math.max(0, Math.min(2 * GRID, Math.floor(gx + gy)));
    if (!byDepth.has(dep)) byDepth.set(dep, []);
    byDepth.get(dep).push(a);
  }

  const lit = [];
  for (let dep = 0; dep <= 2 * GRID; dep++) {
    const ps = plotsByDepth.get(dep);
    if (ps) for (const p of ps) {
      const sp = spriteFor(p);
      const [sx, sy] = W2S(sp.ox, sp.oy);
      const w = sp.canvas.width * cam.z, hgt = sp.canvas.height * cam.z;
      if (sx > VW + 20 || sy > VH + 20 || sx + w < -20 || sy + hgt < -20) continue;
      g.drawImage(sp.canvas, sx, sy, w, hgt);
      if (night > 0.05) lit.push([sp, sx, sy, w, hgt]);
    }
    const as = byDepth.get(dep);
    if (as) for (const a of as) drawAgent(a);
  }

  // night: dim everything, then punch the lights back through
  if (night > 0.02) {
    g.globalAlpha = night * 0.62;
    g.fillStyle = "#0d1a33";
    g.fillRect(-40, -40, VW + 80, VH + 80);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = Math.min(1, night);
    for (const [sp, sx, sy, w, hgt] of lit) g.drawImage(sp.lights, sx, sy, w, hgt);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  }

  // floodwater sits on top of the streets
  if (dmg.flooded.size && floodRise > 0) {
    g.globalAlpha = 0.66 * floodRise;
    g.fillStyle = P.water;
    for (const k of dmg.flooded) {
      const [gx, gy] = k.split(",").map(Number);
      const lev = 12 * floodRise;
      const [nx, ny] = W2S(wx(gx, gy), wy(gx, gy) - lev);
      if (nx < -60 || nx > VW + 60 || ny < -60 || ny > VH + 60) continue;
      const hw = (TW / 2) * cam.z, hh = (TH / 2) * cam.z;
      g.beginPath();
      g.moveTo(nx, ny); g.lineTo(nx + hw, ny + hh);
      g.lineTo(nx, ny + hh * 2); g.lineTo(nx - hw, ny + hh);
      g.closePath(); g.fill();
    }
    g.globalAlpha = 1;
  }

  // smoke from the wreckage
  g.globalAlpha = 0.22;
  const t = now / 1000;
  for (const k of dmg.craters) smoke(k, t, "#a09a90", 22);
  for (const k of dmg.charred) smoke(k, t, "#8f8a80", 16);
  for (const k of dmg.collapsed) smoke(k, t, "#b9b3a8", 11);
  g.globalAlpha = 1;

  for (const m of missiles) {
    const x = m.x0 + (m.x - m.x0) * m.t, y = m.y0 + (m.y - m.y0) * m.t;
    const [sx, sy] = W2S(x, y);
    g.fillStyle = "#3a3733";
    g.beginPath(); g.ellipse(sx, sy, 10 * cam.z, 4 * cam.z, Math.PI / 5, 0, 7); g.fill();
    g.globalAlpha = 0.35; g.fillStyle = P.smoke;
    for (let k = 1; k < 8; k++)
      g.fillRect(sx - k * 14 * cam.z, sy - k * 18 * cam.z, (8 - k) * cam.z, (8 - k) * cam.z);
    g.globalAlpha = 1;
  }

  for (const p of particles) {
    const [sx, sy] = W2S(p.x, p.y);
    g.globalAlpha = Math.max(0, p.life / p.max) * 0.85;
    g.fillStyle = p.col;
    g.beginPath(); g.arc(sx, sy, p.r * cam.z, 0, 7); g.fill();
  }
  g.globalAlpha = 1;

  if (rain > 0.05) {
    g.strokeStyle = "#a9c6d8"; g.globalAlpha = 0.35 * rain; g.lineWidth = 1;
    g.beginPath();
    for (const dr of drops) {
      const [sx, sy] = W2S(dr.x, dr.y);
      g.moveTo(sx, sy); g.lineTo(sx - 3, sy + dr.len * cam.z);
    }
    g.stroke();
    g.globalAlpha = 0.10 * rain; g.fillStyle = "#5d7185";
    g.fillRect(-40, -40, VW + 80, VH + 80);
    g.globalAlpha = 1;
  }

  g.restore();

  if (flash > 0) {
    g.fillStyle = `rgba(255,252,235,${flash * 0.5})`;
    g.fillRect(0, 0, VW, VH);
    g.strokeStyle = `rgba(255,255,255,${flash})`;
    g.lineWidth = 2.5;
    for (const k of dmg.charred) {
      const [gx, gy] = k.split(",").map(Number);
      const [sx, sy] = W2S(wx(gx + .5, gy + .5), wy(gx + .5, gy + .5));
      if (sx < 0 || sx > VW) continue;
      g.beginPath(); g.moveTo(sx + 12, 0);
      let yy = 0;
      while (yy < sy - 40) { yy += 40 + Math.random() * 40; g.lineTo(sx + (Math.random() - .5) * 40, yy); }
      g.lineTo(sx, sy - 30); g.stroke();
    }
  }

  const hh = Math.floor(clock / 3600), mm = Math.floor((clock % 3600) / 60);
  timeEl.textContent = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  fpsAcc += 1 / Math.max(dt, 1e-4); fpsN++;
  if (fpsN >= 30) { fpsEl.textContent = Math.round(fpsAcc / fpsN) + " fps"; fpsAcc = 0; fpsN = 0; }
  requestAnimationFrame(frame);
}

function smoke(k, t, col, size) {
  const [gx, gy] = k.split(",").map(Number);
  const [sx, sy] = W2S(wx(gx + .5, gy + .5), wy(gx + .5, gy + .5));
  if (sx < -60 || sx > VW + 60 || sy < -60 || sy > VH + 60) return;
  g.fillStyle = col;
  for (let i = 0; i < 3; i++) {
    const ph = (t * 0.32 + i * 0.33 + gx * 0.17 + gy * 0.11) % 1;
    g.beginPath();
    g.arc(sx - 10 + i * 9 + ph * 12, sy - (30 + ph * 80) * cam.z,
      size * (0.6 + ph) * cam.z, 0, 7);
    g.fill();
  }
}

function drawAgent(a) {
  const [sx, sy] = W2S(a.x, a.y);
  if (sx < -60 || sx > VW + 60 || sy < -60 || sy > VH + 60) return;
  const z = cam.z;
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(sx + x * z, sy + y * z, w * z, h * z); };
  if (a.type === "boat") {
    R(-22, -6, 44, 8, a.color);
    R(-8, -16, 16, 10, "#cfc8b6");
    R(-2, -26, 3, 10, "#6f6a60");
    return;
  }
  if (a.type === "ped") {
    R(-3, -14, 6, 9, a.color);
    R(-3, -20, 6, 6, "#3f3b36");
    R(-3, -5, 2, 5, "#2f2b27");
    R(1, -5, 2, 5, "#2f2b27");
    return;
  }
  if (a.kind === "bus") {
    R(-30, -32, 60, 32, a.color);
    g.fillStyle = "#9fb6c4";
    for (let k = 0; k < 5; k++) g.fillRect(sx + (-25 + k * 11) * z, sy - 27 * z, 8 * z, 9 * z);
    R(-30, -6, 60, 5, "#2f2b27");
    return;
  }
  if (a.kind === "car") {
    R(-19, -13, 38, 13, a.color);
    R(-12, -23, 24, 11, a.color);
    R(-10, -21, 9, 7, "#9fb6c4");
    R(1, -21, 9, 7, "#9fb6c4");
    R(-19, -1, 38, 3, "#2f2b27");
    return;
  }
  R(-8, -6, 16, 5, a.color);
  R(-3, -17, 7, 11, "#2f2b27");
  R(-8, -1, 16, 3, "#2f2b27");
  R(-4, -22, 9, 5, "#d8c48f");
}

resize();
refresh();
requestAnimationFrame(frame);
