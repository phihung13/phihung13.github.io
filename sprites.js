/* Every building is drawn ONCE into its own little canvas, then cached.
 *
 * That is the whole performance story: a frame is a few hundred drawImage calls, not a few
 * hundred thousand path ops. Each plot gets two sprites — the daytime one, and a "lights" one
 * (lit windows, neon, lamps) that is blended on top after dark.
 */
import { TW, TH, ZH, P, rnd, wx, wy, key, isRoad, dmg } from "./world.js";

const cache = new Map();
export function invalidate() { cache.clear(); }

const fp = (A, B, u, v) => [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u - v];

function ctxHelpers(g) {
  return {
    poly(pts, fill, a = 1) {
      g.globalAlpha = a; g.fillStyle = fill;
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.closePath(); g.fill(); g.globalAlpha = 1;
    },
    line(p, q, c, w = 1, a = 1) {
      g.globalAlpha = a; g.strokeStyle = c; g.lineWidth = w;
      g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); g.globalAlpha = 1;
    },
    rect(x, y, w, h, c, a = 1) { g.globalAlpha = a; g.fillStyle = c; g.fillRect(x, y, w, h); g.globalAlpha = 1; },
    ell(x, y, rx, ry, c, a = 1) {
      g.globalAlpha = a; g.fillStyle = c;
      g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); g.globalAlpha = 1;
    },
    panel(A, B, u0, u1, v0, v1, c, a = 1) {
      this.poly([fp(A, B, u0, v0), fp(A, B, u1, v0), fp(A, B, u1, v1), fp(A, B, u0, v1)], c, a);
    },
  };
}

/* how tall does this thing get? decides the sprite box */
function heightOf(p) {
  const { kind, seed } = p;
  if (kind === "tower") return 240 + rnd(seed + 5, 120);
  if (kind === "market") return 96;
  if (kind === "pagoda") return 92;
  if (kind === "gov") return 3 * ZH + 40;
  if (kind === "school") return 3 * ZH + 24;
  if (kind === "park" || kind === "garden") return 70;
  const floors = 1 + rnd(seed + 3, 5);
  const fh = ZH - 2 + rnd(seed + 31, 5);
  return floors * fh + 8 + rnd(seed + 7, 10) + 30;
}

export function spriteFor(p) {
  const k = key(p.gx, p.gy);
  const state = dmg.craters.has(k) ? "crater"
    : dmg.collapsed.has(k) ? "rubble"
      : dmg.charred.has(k) ? "burnt" : "ok";
  const id = `${k}|${state}`;
  const hit = cache.get(id);
  if (hit) return hit;

  const { gx, gy, w, d } = p;
  const H = heightOf(p) + 60;
  const left = wx(gx, gy + d) - 30;
  const top = wy(gx, gy) - H;
  const width = (wx(gx + w, gy) - left) + 40;
  const height = (wy(gx + w, gy + d) - top) + 50;

  const cv = document.createElement("canvas");
  cv.width = Math.max(2, Math.ceil(width));
  cv.height = Math.max(2, Math.ceil(height));
  const g = cv.getContext("2d");
  g.translate(-left, -top);
  const lights = document.createElement("canvas");
  lights.width = cv.width; lights.height = cv.height;
  const lg = lights.getContext("2d");
  lg.translate(-left, -top);

  drawPlot(g, lg, p, state);

  const sp = { canvas: cv, lights, ox: left, oy: top };
  cache.set(id, sp);
  return sp;
}

function corners(p) {
  const { gx, gy, w, d } = p;
  return [
    [wx(gx, gy), wy(gx, gy)],                    // N
    [wx(gx + w, gy), wy(gx + w, gy)],            // E
    [wx(gx + w, gy + d), wy(gx + w, gy + d)],    // S
    [wx(gx, gy + d), wy(gx, gy + d)],            // W
  ];
}

function drawPlot(g, lg, p, state) {
  const h = ctxHelpers(g), L = ctxHelpers(lg);
  if (state === "crater") return drawCrater(h, p);
  if (state === "rubble") return drawRubble(h, p);
  switch (p.kind) {
    case "tower": return drawTower(h, L, p);
    case "market": return drawMarket(h, L, p);
    case "pagoda": return drawPagoda(h, L, p);
    case "park": return drawPark(h, L, p);
    case "garden": return drawGarden(h, p);
    case "gov": return drawHouse(h, L, p, state, "gov");
    case "school": return drawHouse(h, L, p, state, "school");
    default: return drawHouse(h, L, p, state, "house");
  }
}

/* ── the everyday house: the thing there are a thousand of ─────────── */
function drawHouse(h, L, p, state, kind) {
  const { gx, gy, w, d, seed } = p;
  const [N, E, S, W] = corners(p);
  const burnt = state === "burnt";
  const govt = kind === "gov", school = kind === "school";
  let floors = govt || school ? 3 : 1 + rnd(seed + 3, 5);
  const fh = ZH - 2 + rnd(seed + 31, 5);
  const H = floors * fh + 8 + rnd(seed + 7, 10);
  let [r, l, t] = govt ? P.gov : school ? P.school : P.facades[rnd(seed + 5, P.facades.length)];
  if (burnt) { r = P.char[2]; l = P.char[1]; t = P.char[0]; }

  h.poly([[N[0] + 10, N[1] + 6], [E[0] + 10, E[1] + 6], [S[0] + 10, S[1] + 6],
  [W[0] + 10, W[1] + 6]], "#5a5346", 0.16);
  const up = q => [q[0], q[1] - H];
  h.poly([W, S, up(S), up(W)], l);
  h.poly([S, E, up(E), up(S)], r);
  h.poly([up(N), up(E), up(S), up(W)], t);

  let streetR = false, streetL = false;
  for (let i = 0; i < d; i++) if (isRoad(gx + w, gy + i)) streetR = true;
  for (let i = 0; i < w; i++) if (isRoad(gx + i, gy + d)) streetL = true;

  for (const [A, B] of [[S, E], [W, S]]) {
    for (let m = 0; m < 3; m++) {
      const u = 0.08 + rnd(seed + m * 5, 70) / 100;
      h.panel(A, B, u, Math.min(u + 0.10, 0.98), 0, 3 + rnd(seed + m, 8), P.moss, 0.22);
    }
    for (let m = 0; m < 2; m++) {
      const u = 0.15 + rnd(seed + m * 9 + 3, 60) / 100;
      h.panel(A, B, u, u + 0.04, 6, H - 14, P.stain, 0.07);
    }
  }

  for (let f = 0; f < floors; f++) {
    const v = 10 + f * fh;
    if (v + fh > H - 4) break;
    const ground = f === 0;
    for (const [A, B, sunny, faces] of [[S, E, true, streetR], [W, S, false, streetL]]) {
      const a = sunny ? 1 : 0.9;
      if (ground && faces) {
        if (govt || school) {
          h.panel(A, B, 0.30, 0.70, 0, 20, "#6d5f4a", a);
          for (let k = 0; k < 4; k++) h.panel(A, B, 0.20 + k * 0.20, 0.235 + k * 0.20, 0, H - 20, "#eee3c9", a);
          continue;
        }
        h.panel(A, B, 0.14, 0.60, 0, 16, "#3f3c37", a);
        for (let k = 0; k < 6; k++)
          h.line(fp(A, B, 0.14, 3 + k * 2.4), fp(A, B, 0.60, 3 + k * 2.4), "#54504a", 1, 0.7);
        h.panel(A, B, 0.66, 0.90, 0, 14, "#38352f", a);
        const sign = P.signs[rnd(seed + 4, P.signs.length)];
        h.panel(A, B, 0.08, 0.96, 16, 19, P.signs[rnd(seed + 2, P.signs.length)], a);
        h.panel(A, B, 0.12, 0.92, 21, 28, sign, a);
        if (sunny) {                                    // the shop sign glows at night
          L.panel(A, B, 0.12, 0.92, 21, 28, sign, 0.85);
          L.panel(A, B, 0.14, 0.58, 1, 15, "#ffdca8", 0.35);   // light spilling out the door
        }
        continue;
      }
      if (ground) { h.panel(A, B, 0.22, 0.52, 0, 13, "#46433d", a); continue; }
      const nwin = (w === 1 && d === 1) ? 2 : 3;
      for (let i = 0; i < nwin; i++) {
        const u0 = 0.12 + i * (0.76 / nwin), u1 = u0 + 0.76 / nwin - 0.10;
        h.panel(A, B, u0, u1, v, v + 13, P.frame, a);
        h.panel(A, B, u0 + 0.02, u1 - 0.02, v + 2, v + 11, P.glass, a);
        if (!burnt && rnd(seed + f * 13 + i * 3, 3) !== 0)      // not everyone is home
          L.panel(A, B, u0 + 0.02, u1 - 0.02, v + 2, v + 11,
            rnd(seed + f + i, 4) === 0 ? "#9fd4ff" : "#ffd88a", 0.9);
      }
      if (sunny && rnd(seed + f * 7, 3)) {
        h.panel(A, B, 0.10, 0.92, v - 3, v - 1, "#c2bba9");
        for (let k = 0; k < 11; k++)
          h.line(fp(A, B, 0.10 + k * 0.082, v - 3), fp(A, B, 0.10 + k * 0.082, v + 5), P.rail, 1, 0.8);
        if (rnd(seed + f, 2)) {
          h.panel(A, B, 0.78, 0.88, v - 1, v + 4, "#a26f4c");
          h.panel(A, B, 0.76, 0.90, v + 4, v + 10, P.tree);
        }
      }
      if (!sunny && rnd(seed + f * 3, 3) === 0) h.panel(A, B, 0.60, 0.78, v + 2, v + 9, "#cfc9bb", 0.95);
    }
  }

  const rc = [(N[0] + S[0]) / 2, (N[1] + S[1]) / 2], rcy = rc[1] - H;
  const roof = govt || school ? 9 : rnd(seed + 23, 10);
  if (roof < 4) {
    const pitch = 20 + rnd(seed, 10);
    const apex = [rc[0], rc[1] - H - pitch];
    h.poly([up(W), up(S), apex], P.tinL);
    h.poly([up(S), up(E), apex], P.tinR);
    for (let k = 1; k < 9; k++)
      h.line([up(S)[0] + (up(E)[0] - up(S)[0]) * k / 9, up(S)[1] + (up(E)[1] - up(S)[1]) * k / 9],
        apex, "#a7acb2", 1, 0.5);
    if (rnd(seed + 2, 2))
      h.poly([up(S), [up(S)[0] + 18, up(S)[1] - 10], [apex[0], apex[1] + 14],
      [up(S)[0] + 4, up(S)[1] - 2]], P.rust, 0.35);
  } else if (roof < 6) {
    const apex = [rc[0], rc[1] - H - 26];
    h.poly([up(W), up(S), apex], P.tileL);
    h.poly([up(S), up(E), apex], P.tileR);
    for (let k = 1; k < 7; k++)
      h.line([up(S)[0] + (up(E)[0] - up(S)[0]) * k / 7, up(S)[1] + (up(E)[1] - up(S)[1]) * k / 7],
        apex, P.tileHL, 1, 0.3);
  } else {
    for (const [A, B] of [[S, E], [W, S]]) {
      h.panel(A, B, 0, 1, H - 7, H, "#d6cfbe", 0.92);
      for (let k = 0; k < 12; k++) h.panel(A, B, 0.04 + k * 0.08, 0.07 + k * 0.08, H - 7, H - 1, "#b6ae9c", 0.9);
    }
    const tx = rc[0] - 14, ty = rcy - 18;
    h.poly([[tx, ty + 10], [tx + 12, ty + 3], [tx + 24, ty + 10], [tx + 12, ty + 17]], P.tankT);
    h.poly([[tx, ty + 10], [tx + 12, ty + 17], [tx + 12, ty + 29], [tx, ty + 22]], P.tankL);
    h.poly([[tx + 12, ty + 17], [tx + 24, ty + 10], [tx + 24, ty + 22], [tx + 12, ty + 29]], P.tankR);
    for (let k = 0; k < 1 + rnd(seed + 5, 2); k++) {
      const dx = rc[0] + 16 + k * 13, dy = rcy - 4 + k * 5;
      h.poly([[dx, dy], [dx + 6, dy - 3], [dx + 12, dy], [dx + 6, dy + 3]], "#c9c2b0");
      h.rect(dx, dy, 12, 14, P.drum[rnd(seed + k * 3, P.drum.length)]);
    }
    if (rnd(seed + 9, 2)) for (let k = 0; k < 3; k++) {
      h.rect(rc[0] - 30 + k * 11, rcy + 6 - k * 4, 8, 6, "#a26f4c");
      h.rect(rc[0] - 31 + k * 11, rcy - 1 - k * 4, 10, 8, P.tree);
    }
    if (rnd(seed + 11, 2)) {
      h.line([rc[0] - 28, rcy + 2], [rc[0] + 2, rcy - 14], P.rail, 1, 0.9);
      ["#c05a4a", "#e8e4d6", "#5f86a8", "#d8c48f"].forEach((c, k) =>
        h.rect(rc[0] - 26 + k * 7, rcy + 1 - k * 3.7, 5, 9 + k % 2, c));
    }
  }

  if (govt) {
    h.line([rc[0], rcy - 8], [rc[0], rcy - 52], P.rail, 2);
    h.rect(rc[0], rcy - 52, 28, 18, "#c8322c");
    h.poly([[rc[0] + 14, rcy - 48], [rc[0] + 18, rcy - 37], [rc[0] + 8, rcy - 44],
    [rc[0] + 20, rcy - 44], [rc[0] + 10, rcy - 37]], "#f2d64b");
    L.rect(rc[0], rcy - 52, 28, 18, "#c8322c", 0.5);
  }
  if (burnt) {
    for (const [A, B] of [[S, E], [W, S]]) h.panel(A, B, 0.30, 0.55, 18, 34, P.ember, 0.55);
    L.ell(rc[0], rcy + 4, 24, 11, P.ember, 0.75);
  }
}

/* ── landmarks ─────────────────────────────────────────────────────── */
function drawTower(h, L, p) {
  const [N, E, S, W] = corners(p);
  const H = 240 + rnd(p.seed + 5, 120);
  const up = q => [q[0], q[1] - H];
  h.poly([[N[0] + 10, N[1] + 6], [E[0] + 10, E[1] + 6], [S[0] + 10, S[1] + 6],
  [W[0] + 10, W[1] + 6]], "#5a5346", 0.16);
  h.poly([W, S, up(S), up(W)], "#7e93a4");
  h.poly([S, E, up(E), up(S)], "#9db2c2");
  h.poly([up(N), up(E), up(S), up(W)], "#c2d2dd");
  const floors = Math.floor((H - 20) / 16);
  for (let f = 0; f < floors; f++) {
    const v = 12 + f * 16;
    for (const [A, B] of [[S, E], [W, S]]) {
      h.panel(A, B, 0.12, 0.88, v, v + 10, "#5f7f99");
      if (rnd(p.seed + f * 7, 4) !== 0) L.panel(A, B, 0.12, 0.88, v, v + 10, "#cfe4ff", 0.55);
    }
  }
  const rc = [(N[0] + S[0]) / 2, (N[1] + S[1]) / 2 - H];
  h.rect(rc[0] - 3, rc[1] - 40, 5, 40, "#8fa6ba");
  L.ell(rc[0], rc[1] - 42, 4, 4, "#ff5a4a", 0.9);          // the aviation light
}

function drawMarket(h, L, p) {
  const [N, E, S, W] = corners(p);
  const H = 60;
  const up = q => [q[0], q[1] - H];
  h.poly([W, S, up(S), up(W)], "#d3bd8e");
  h.poly([S, E, up(E), up(S)], "#e6d0a0");
  for (const [A, B] of [[S, E], [W, S]])
    for (let k = 0; k < 4; k++) {
      h.panel(A, B, 0.10 + k * 0.21, 0.23 + k * 0.21, 0, 26, "#4a453d");
      L.panel(A, B, 0.10 + k * 0.21, 0.23 + k * 0.21, 2, 24, "#ffca6e", 0.55);
    }
  const apex = [(N[0] + S[0]) / 2, (N[1] + S[1]) / 2 - H - 36];
  h.poly([up(W), up(S), apex], "#7d3d2c");
  h.poly([up(S), up(E), apex], "#9e5039");
  const tcx = apex[0], tcy = apex[1] + 8;
  h.rect(tcx - 16, tcy - 58, 32, 58, "#e6d0a0");
  h.rect(tcx + 4, tcy - 58, 12, 58, "#c9b183");
  h.poly([[tcx - 20, tcy - 58], [tcx + 20, tcy - 58], [tcx, tcy - 86]], "#7d3d2c");
  h.ell(tcx - 2, tcy - 38, 11, 11, "#4a453d");
  h.ell(tcx - 2, tcy - 38, 9, 9, "#f6f1e2");
  L.ell(tcx - 2, tcy - 38, 9, 9, "#fff2c9", 0.8);
  p.clock = [tcx - 2, tcy - 38];
}

function drawPagoda(h, L, p) {
  const [N, E, S, W] = corners(p);
  const H = 46;
  const up = q => [q[0], q[1] - H];
  h.poly([W, S, up(S), up(W)], P.pagoda[1]);
  h.poly([S, E, up(E), up(S)], P.pagoda[0]);
  for (const [A, B] of [[S, E], [W, S]]) {
    h.panel(A, B, 0.36, 0.64, 0, 30, "#4a2c22");
    L.panel(A, B, 0.36, 0.64, 2, 28, "#ffb45e", 0.6);
    for (let k = 0; k < 2; k++) {                       // đèn lồng đỏ treo hai bên
      h.ell(...fp(A, B, 0.18 + k * 0.64, 24), 5, 7, "#c8322c");
      L.ell(...fp(A, B, 0.18 + k * 0.64, 24), 6, 8, "#ff6a4a", 0.85);
    }
  }
  // sweeping tiered roofs
  for (let tier = 0; tier < 2; tier++) {
    const y = H + tier * 26, spread = 1 + (1 - tier) * 0.35;
    const nn = [N[0], N[1] - y], ee = [E[0], E[1] - y], ss = [S[0], S[1] - y], ww = [W[0], W[1] - y];
    const wide = q => [(q[0] - (N[0] + S[0]) / 2) * spread + (N[0] + S[0]) / 2,
    (q[1] - (N[1] + S[1]) / 2 + y) * spread + (N[1] + S[1]) / 2 - y];
    const apex = [(N[0] + S[0]) / 2, (N[1] + S[1]) / 2 - y - 26];
    h.poly([wide(ww), wide(ss), apex], "#6d3329");
    h.poly([wide(ss), wide(ee), apex], "#8a4438");
    h.poly([wide(ww), wide(ss), [wide(ss)[0], wide(ss)[1] + 5], [wide(ww)[0], wide(ww)[1] + 5]], P.pagoda[2], 0.9);
  }
}

function drawPark(h, L, p) {
  const [N, E, S, W] = corners(p);
  const c = [(N[0] + S[0]) / 2, (N[1] + S[1]) / 2];
  h.poly([N, E, S, W], P.grass);
  h.poly([[c[0] - 46, c[1]], [c[0], c[1] - 28], [c[0] + 46, c[1]], [c[0], c[1] + 28]], P.grassD, 0.5);
  h.poly([[c[0] - 26, c[1] + 12], [c[0] - 2, c[1]], [c[0] + 22, c[1] + 12], [c[0] - 2, c[1] + 24]], P.water);
  for (const [ox, oy, s] of [[-34, -26, 1.3], [28, -30, 1.1], [0, -42, 1.0], [38, 14, 0.9]]) {
    const bx = c[0] + ox, by = c[1] + oy;
    h.rect(bx, by - 24 * s, 5, 24 * s, P.trunk);
    h.rect(bx - 16 * s, by - 48 * s, 36 * s, 26 * s, P.tree);
    h.rect(bx - 16 * s, by - 25 * s, 36 * s, 3, P.treeD);
  }
  for (const [bx, by] of [[c[0] - 44, c[1] - 4], [c[0] + 28, c[1] + 2]]) {
    h.rect(bx, by, 20, 4, "#b6ae9c");
    h.rect(bx, by + 4, 3, 5, "#8f8878");
    h.rect(bx + 17, by + 4, 3, 5, "#8f8878");
  }
  h.line([c[0] + 12, c[1] - 8], [c[0] + 12, c[1] - 52], P.rail, 2);   // đèn công viên
  h.ell(c[0] + 12, c[1] - 55, 5, 5, "#efe8d4");
  L.ell(c[0] + 12, c[1] - 55, 12, 12, "#ffe9b0", 0.5);
}

function drawGarden(h, p) {
  const [N, , S] = corners(p);
  const c = [(N[0] + S[0]) / 2, (N[1] + S[1]) / 2];
  for (const [ox, oy, s] of [[-16, 6, 1.2], [12, -4, 0.9]]) {
    h.rect(c[0] + ox, c[1] + oy - 22 * s, 4, 22 * s, P.trunk);
    h.rect(c[0] + ox - 14 * s, c[1] + oy - 44 * s, 32 * s, 24 * s, P.tree);
    h.rect(c[0] + ox - 14 * s, c[1] + oy - 22 * s, 32 * s, 3, P.treeD);
  }
}

/* ── ruins ─────────────────────────────────────────────────────────── */
function drawRubble(h, p) {
  const { seed } = p;
  const [N, E, S, W] = corners(p);
  h.poly([N, E, S, W], "#8f8878");
  [[0.10, 26], [0.42, 14], [0.78, 22]].forEach(([u, hh], i) => {
    const [A, B] = i % 2 ? [S, E] : [W, S];
    h.panel(A, B, u, u + 0.16, 0, hh, P.rubble[i % 2]);
    h.panel(A, B, u, u + 0.16, hh - 3, hh, P.rubble[2]);
  });
  const c = [(N[0] + S[0]) / 2, (N[1] + S[1]) / 2];
  for (let k = 0; k < 10; k++) {
    const ox = -34 + ((seed * (k + 3) * 17) % 68);
    const oy = -6 + ((seed * (k + 5) * 11) % 22);
    const s = 5 + ((seed * (k + 7)) % 9);
    h.poly([[c[0] + ox, c[1] + oy], [c[0] + ox + s, c[1] + oy - s * 0.6],
    [c[0] + ox + 2 * s, c[1] + oy], [c[0] + ox + s, c[1] + oy + s * 0.6]], P.rubble[(seed + k) % 3]);
  }
}

function drawCrater(h, p) {
  const [N, E, S, W] = corners(p);
  const c = [(N[0] + S[0]) / 2, (N[1] + S[1]) / 2];
  h.poly([[c[0] - 46, c[1]], [c[0], c[1] - 28], [c[0] + 46, c[1]], [c[0], c[1] + 28]], P.craterA);
  h.poly([[c[0] - 30, c[1]], [c[0], c[1] - 18], [c[0] + 30, c[1]], [c[0], c[1] + 18]], P.craterB);
  h.ell(c[0], c[1] - 6, 26, 14, P.ember, 0.28);
}
