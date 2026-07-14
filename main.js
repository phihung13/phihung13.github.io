/* Sài Gòn in real 3D: orthographic isometric camera, one sun casting real shadows,
 * every building an instanced prototype. Drag to pan, wheel to zoom, right-drag to spin. */
import * as THREE from "three";
import {
  GRID, road, canal, bridge, isRoad, isWater, plots, lanes, events, dmg, strike, key,
} from "./world.js";
import {
  makeHouse, makeTower, makePagoda, makeMarket, makeGov, makeSchool, makeTree,
  makeRubble, makeCrater, makeBike, makeCar, makeBus, makeBoat, makePerson,
  makePlaza, makeLamp, makeBench, makePlanter, PAL,
} from "./kit.js";

const canvas = document.getElementById("cv");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.45;      // ACES eats a lot of light; give it back
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
// the camera sits 120 units back, so fog has to start beyond that or it eats the whole city
scene.fog = new THREE.Fog(0xcfd8dd, 130, 235);

const HALF = GRID / 2;
const cell = (gx, gy) => [gx - HALF + 0.5, gy - HALF + 0.5];   // grid → world (x, z)

/* Only cells that touch a street get paved. Everything deeper in the block is grass —
   otherwise the whole district reads as one giant concrete apron. */
const nearRoad = (gx, gy) =>
  isRoad(gx + 1, gy) || isRoad(gx - 1, gy) || isRoad(gx, gy + 1) || isRoad(gx, gy - 1);

/* ── camera: true isometric, orthographic ─────────────────────────── */
let zoom = 13, yaw = Math.PI / 4;      // start down in the streets, not up in orbit
const camTarget = new THREE.Vector3(0, 0, 0);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
function placeCamera() {
  const a = 34 * Math.PI / 180;                                  // classic iso pitch
  const r = 120;
  camera.position.set(
    camTarget.x + Math.sin(yaw) * Math.cos(a) * r,
    camTarget.y + Math.sin(a) * r,
    camTarget.z + Math.cos(yaw) * Math.cos(a) * r);
  camera.lookAt(camTarget);
}
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  camera.left = -zoom * aspect; camera.right = zoom * aspect;
  camera.top = zoom; camera.bottom = -zoom;
  camera.updateProjectionMatrix();
  placeCamera();
}
addEventListener("resize", resize);

/* ── light ────────────────────────────────────────────────────────── */
const sun = new THREE.DirectionalLight(0xfff0d6, 3.1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -46; sun.shadow.camera.right = 46;
sun.shadow.camera.top = 46; sun.shadow.camera.bottom = -46;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

const sky = new THREE.HemisphereLight(0xcfe6f5, 0x8a7f68, 1.25);   // bounce light into the alleys
scene.add(sky);

/* ── ground: roads and pavements baked into one texture ───────────── */
const TEX = 2048;
const gc = document.createElement("canvas");
gc.width = gc.height = TEX;
const q = gc.getContext("2d");
const px = TEX / GRID;
q.fillStyle = "#9c9481"; q.fillRect(0, 0, TEX, TEX);
for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
  const water = canal[gy][gx] && !bridge[gy][gx];
  const rd = road[gy][gx] && !water;
  q.fillStyle = water ? ((gx + gy) % 2 ? "#3f7794" : "#376c88")
    : rd ? ((gx + gy) % 2 ? "#67625b" : "#5f5a53")
      : nearRoad(gx, gy) ? "#cfc8b6"                       // pavement (the slab sits on top)
        : ((gx * 7 + gy * 3) % 7 === 0 ? "#7aa062" : "#84ab68");   // grassy courtyards
  q.fillRect(gx * px, gy * px, px + 1, px + 1);
  if (rd) {                                            // lane markings + kerb
    const ew = isRoad(gx - 1, gy) && isRoad(gx + 1, gy);
    const ns = isRoad(gx, gy - 1) && isRoad(gx, gy + 1);
    q.strokeStyle = "#ded5c1"; q.lineWidth = px * 0.05; q.globalAlpha = 0.55;
    q.beginPath();
    if (ew && !ns) { q.moveTo(gx * px + px * 0.15, gy * px + px / 2); q.lineTo(gx * px + px * 0.85, gy * px + px / 2); }
    if (ns && !ew) { q.moveTo(gx * px + px / 2, gy * px + px * 0.15); q.lineTo(gx * px + px / 2, gy * px + px * 0.85); }
    q.stroke(); q.globalAlpha = 1;
  }
  if (!rd && !water && (isRoad(gx + 1, gy) || isRoad(gx - 1, gy) || isRoad(gx, gy + 1) || isRoad(gx, gy - 1))) {
    q.strokeStyle = "#8f8878"; q.lineWidth = px * 0.06;
    q.strokeRect(gx * px + 1, gy * px + 1, px - 2, px - 2);
  }
}
const groundTex = new THREE.CanvasTexture(gc);
groundTex.colorSpace = THREE.SRGBColorSpace;
groundTex.magFilter = THREE.LinearFilter;
groundTex.anisotropy = 8;
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GRID, GRID),
  new THREE.MeshLambertMaterial({ map: groundTex })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/* the canal gets a real water surface that catches the light */
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(GRID, GRID, 1, 1),
  new THREE.MeshStandardMaterial({
    color: 0x2f6b88, transparent: true, opacity: 0.55,
    roughness: 0.15, metalness: 0.3,
  })
);
water.rotation.x = -Math.PI / 2;
water.position.y = 0.02;
water.visible = false;                       // only shown where it matters — see flood below
scene.add(water);

/* ── the city, instanced ──────────────────────────────────────────── */
const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const GLASS = new THREE.MeshLambertMaterial({
  vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0,
});

const protos = [];
for (let i = 0; i < 16; i++) protos.push({ kind: "house", geo: makeHouse(i * 97 + 11) });
protos.push({ kind: "tower", geo: makeTower(3) });
protos.push({ kind: "pagoda", geo: makePagoda(5) });
protos.push({ kind: "market", geo: makeMarket(7) });
protos.push({ kind: "gov", geo: makeGov(9) });
protos.push({ kind: "school", geo: makeSchool(11) });
protos.push({ kind: "garden", geo: makeTree(2) });
protos.push({ kind: "plaza", geo: makePlaza(4) });
const RUBBLE = { geo: makeRubble(13) }, CRATER = { geo: makeCrater(17) };

const groups = [];                            // one InstancedMesh pair per prototype
function makeGroup(geo, max) {
  const solid = new THREE.InstancedMesh(geo.solid, MAT, max);
  solid.castShadow = true; solid.receiveShadow = true;
  solid.count = 0;
  scene.add(solid);
  let glass = null;
  if (geo.glass) {
    glass = new THREE.InstancedMesh(geo.glass, GLASS, max);
    glass.count = 0;
    scene.add(glass);
  }
  return { solid, glass, n: 0 };
}
for (const p of protos) p.group = makeGroup(p.geo, 900);
const rubbleGroup = makeGroup(RUBBLE.geo, 400);
const craterGroup = makeGroup(CRATER.geo, 200);

const dummy = new THREE.Object3D();
const protoOf = (p) => {
  if (p.kind === "house") return protos[p.seed % 16];
  return protos.find(x => x.kind === p.kind) || protos[0];
};

function rebuildCity() {
  for (const p of protos) { p.group.n = 0; }
  rubbleGroup.n = 0; craterGroup.n = 0;

  for (const p of plots) {
    const k = key(p.gx, p.gy);
    const [x, z] = cell(p.gx, p.gy);
    const cx = x + (p.w - 1) / 2, cz = z + (p.d - 1) / 2;

    const y = nearRoad(p.gx, p.gy) ? WALK_H : 0;    // on the kerb, or out on the grass

    if (dmg.craters.has(k)) { push(craterGroup, cx, cz, 0, 1, false, y); continue; }
    if (dmg.collapsed.has(k)) { push(rubbleGroup, cx, cz, (p.seed % 4) * 0.4, 1, false, y); continue; }

    const proto = protoOf(p);
    const burnt = dmg.charred.has(k);
    // the shopfront is modelled on the +Z face, so turn the house until that face meets the street
    let rot = (p.seed % 4) * Math.PI / 2;
    if (p.kind === "house") {
      if (isRoad(p.gx, p.gy + p.d)) rot = 0;
      else if (isRoad(p.gx, p.gy - 1)) rot = Math.PI;
      else if (isRoad(p.gx + p.w, p.gy)) rot = Math.PI / 2;
      else if (isRoad(p.gx - 1, p.gy)) rot = -Math.PI / 2;
    }
    push(proto.group, cx, cz, rot,
      p.kind === "house" ? (p.w > 1 || p.d > 1 ? 1.1 : 1) : 1, burnt, y);
  }

  for (const grp of [...protos.map(p => p.group), rubbleGroup, craterGroup]) {
    grp.solid.count = grp.n;
    grp.solid.instanceMatrix.needsUpdate = true;
    if (grp.solid.instanceColor) grp.solid.instanceColor.needsUpdate = true;
    if (grp.glass) {
      grp.glass.count = grp.n;
      grp.glass.instanceMatrix.needsUpdate = true;
    }
  }
}
const CHAR = new THREE.Color(0x4a423c).convertSRGBToLinear();
const WHITE = new THREE.Color(0xffffff);
const WALK_H = 0.09;                       // buildings stand ON the pavement, not in the road
function push(grp, x, z, rot, scale, burnt = false, y = WALK_H) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, rot, 0);
  dummy.scale.set(scale, scale, scale);
  dummy.updateMatrix();
  grp.solid.setMatrixAt(grp.n, dummy.matrix);
  grp.solid.setColorAt(grp.n, burnt ? CHAR : WHITE);
  if (grp.glass) {
    if (burnt) dummy.scale.set(0, 0, 0);                 // burnt houses have no lights left
    dummy.updateMatrix();
    grp.glass.setMatrixAt(grp.n, dummy.matrix);
  }
  grp.n++;
}

/* ── the pavement: a real raised slab with a kerb, not a colour on a texture ─────── */
{
  const slab = new THREE.BoxGeometry(1, 0.09, 1);
  slab.translate(0, 0.045, 0);
  const cols = new Float32Array(slab.attributes.position.count * 3);
  const cc = new THREE.Color(PAL.stone).convertSRGBToLinear();
  for (let i = 0; i < slab.attributes.position.count; i++) {
    cols[i * 3] = cc.r; cols[i * 3 + 1] = cc.g; cols[i * 3 + 2] = cc.b;
  }
  slab.setAttribute("color", new THREE.BufferAttribute(cols, 3));

  const walks = new THREE.InstancedMesh(slab, MAT, GRID * GRID);
  walks.receiveShadow = true;
  walks.castShadow = true;
  let n = 0;
  for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
    if (road[gy][gx] || canal[gy][gx] || !nearRoad(gx, gy)) continue;   // only along the street
    const [x, z] = cell(gx, gy);
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    walks.setMatrixAt(n++, dummy.matrix);
  }
  walks.count = n;
  scene.add(walks);
}

/* trees, lamps, benches and pot plants scattered along the kerb */
{
  const kit = [
    { geo: makeTree(1), max: 1600, scale: () => 0.9 + Math.random() * 0.35 },
    { geo: makeLamp(), max: 400, scale: () => 1 },
    { geo: makeBench(), max: 300, scale: () => 1 },
    { geo: makePlanter(2), max: 400, scale: () => 1 },
  ];
  const meshes = kit.map(k => {
    const solid = new THREE.InstancedMesh(k.geo.solid, MAT, k.max);
    solid.castShadow = true; solid.receiveShadow = true; solid.count = 0;
    scene.add(solid);
    let glass = null;
    if (k.geo.glass) {
      glass = new THREE.InstancedMesh(k.geo.glass, GLASS, k.max);
      glass.count = 0;
      scene.add(glass);
    }
    return { solid, glass, n: 0 };
  });

  for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
    if (road[gy][gx] || canal[gy][gx]) continue;
    if (!(isRoad(gx + 1, gy) || isRoad(gx, gy + 1) || isRoad(gx - 1, gy) || isRoad(gx, gy - 1))) continue;
    const s = (gx * 13 + gy * 7) % 6;
    const which = s === 0 || s === 3 ? 0 : s === 1 ? 1 : s === 4 ? 2 : s === 5 ? 3 : -1;
    if (which < 0) continue;
    const m = meshes[which];
    if (m.n >= kit[which].max) continue;
    const [x, z] = cell(gx, gy);
    // hug whichever edge actually faces the street
    const ox = isRoad(gx + 1, gy) ? 0.40 : isRoad(gx - 1, gy) ? -0.40 : 0;
    const oz = isRoad(gx, gy + 1) ? 0.40 : isRoad(gx, gy - 1) ? -0.40 : 0;
    dummy.position.set(x + ox, 0.09, z + oz);
    dummy.rotation.set(0, ((gx * gy) % 4) * Math.PI / 2, 0);
    const sc = kit[which].scale();
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    m.solid.setMatrixAt(m.n, dummy.matrix);
    if (m.glass) m.glass.setMatrixAt(m.n, dummy.matrix);
    m.n++;
  }
  for (const m of meshes) {
    m.solid.count = m.n;
    m.solid.instanceMatrix.needsUpdate = true;
    if (m.glass) { m.glass.count = m.n; m.glass.instanceMatrix.needsUpdate = true; }
  }
}

/* flooded tiles: a rising sheet of water, one instance per drowned cell */
const floodGeo = new THREE.BoxGeometry(1, 1, 1);
const floodMat = new THREE.MeshStandardMaterial({
  color: 0x2f6b88, transparent: true, opacity: 0.62, roughness: 0.12, metalness: 0.35,
});
const floodMesh = new THREE.InstancedMesh(floodGeo, floodMat, GRID * GRID);
floodMesh.count = 0;
scene.add(floodMesh);
let floodRise = 0;
function rebuildFlood() {
  let n = 0;
  for (const k of dmg.flooded) {
    const [gx, gy] = k.split(",").map(Number);
    const [x, z] = cell(gx, gy);
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    floodMesh.setMatrixAt(n++, dummy.matrix);
  }
  for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
    if (!canal[gy][gx] || bridge[gy][gx]) continue;      // the canal itself always holds water
    const [x, z] = cell(gx, gy);
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    floodMesh.setMatrixAt(n++, dummy.matrix);
  }
  floodMesh.count = n;
  floodMesh.instanceMatrix.needsUpdate = true;
}

/* ── traffic ──────────────────────────────────────────────────────── */
const agents = [];
const fleets = [];
function fleet(geo, max) {
  const m = new THREE.InstancedMesh(geo, MAT, max);
  m.castShadow = true;
  m.count = 0;
  scene.add(m);
  fleets.push(m);
  return m;
}
const bikeMeshes = ["#c4442f", "#e8e4d6", "#3a6491", "#d99a2b", "#6f8f52"].map(c => fleet(makeBike(c), 120));
const carMeshes = ["#c9c4b6", "#3f5f8a", "#8a3b32"].map(c => fleet(makeCar(c), 60));
const busMesh = fleet(makeBus("#d99a2b"), 24);
const boatMesh = fleet(makeBoat("#8a6a3a"), 16);
const pedMeshes = ["#c05a4a", "#e8e4d6", "#5f86a8", "#d8c48f"].map(c => fleet(makePerson(c), 120));

for (const lane of lanes) {
  const pts = lane.cells.map(([gx, gy]) => {
    const [x, z] = cell(Math.floor(gx), Math.floor(gy));
    return new THREE.Vector2(x + (gx % 1), z + (gy % 1));
  });
  lane.pts = pts;
  lane.len = 0;
  lane.segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const d = pts[i].distanceTo(pts[i + 1]);
    lane.segs.push({ a: pts[i], b: pts[i + 1], d, at: lane.len });
    lane.len += d;
  }
}
lanes.forEach((lane, li) => {
  const N = 2 + (li % 2);                       // a sleepy street, not rush hour
  for (let i = 0; i < N; i++) {
    const roll = (i + li) % 5;
    const mesh = roll === 0 ? carMeshes[(i + li) % carMeshes.length]
      : roll === 3 ? busMesh : bikeMeshes[(i * 3 + li) % bikeMeshes.length];
    agents.push({
      lane, mesh, t: i / N, off: (i % 2 ? 1 : -1) * 0.22,
      v: (0.016 + (i % 3) * 0.004) / Math.max(1, lane.len / 30), y: 0,
    });
  }
  for (let i = 0; i < 3; i++)                   // people, ambling on the raised pavement
    agents.push({
      lane, mesh: pedMeshes[(i + li) % pedMeshes.length], t: (i + .3) / 3,
      off: (i % 2 ? 1 : -1) * 0.78, v: 0.004 / Math.max(1, lane.len / 30), y: WALK_H,
    });
});
// boats down the canal
{
  const pts = [];
  for (let gx = 0; gx < GRID; gx++) {
    let sum = 0, n = 0;
    for (let gy = 0; gy < GRID; gy++) if (canal[gy][gx]) { sum += gy; n++; }
    if (n) { const [x, z] = cell(gx, sum / n); pts.push(new THREE.Vector2(x, z)); }
  }
  const lane = { pts, segs: [], len: 0, cells: [] };
  for (let i = 0; i < pts.length - 1; i++) {
    const d = pts[i].distanceTo(pts[i + 1]);
    lane.segs.push({ a: pts[i], b: pts[i + 1], d, at: lane.len });
    lane.len += d;
  }
  for (let i = 0; i < 6; i++)
    agents.push({ lane, mesh: boatMesh, t: i / 6, off: (i % 2 ? .3 : -.3), v: 0.004, y: 0.06 });
}

function laneAt(lane, t, off) {
  const d = ((t % 1) + 1) % 1 * lane.len;
  let s = lane.segs[0];
  for (const seg of lane.segs) if (d >= seg.at) s = seg;
  const u = s.d ? Math.min(1, (d - s.at) / s.d) : 0;
  const x = s.a.x + (s.b.x - s.a.x) * u;
  const z = s.a.y + (s.b.y - s.a.y) * u;
  const dx = s.b.x - s.a.x, dz = s.b.y - s.a.y;
  const L = Math.hypot(dx, dz) || 1;
  // The vehicles are modelled lying along +X. A rotation of θ about Y sends local +X to
  // (cosθ, 0, −sinθ), so to point it down the lane we need θ = atan2(−dz, dx).
  // Using atan2(dx, dz) — which is what this was — turned every car 90° and they drove sideways.
  return [x - dz / L * off, z + dx / L * off, Math.atan2(-dz, dx)];
}

/* ── disasters ────────────────────────────────────────────────────── */
let shake = 0, flash = 0;
const statEl = document.getElementById("stat");
function refresh() {
  rebuildCity();
  rebuildFlood();
  for (const lane of lanes)
    lane.blocked = lane.cells.some(([gx, gy]) => dmg.craters.has(key(Math.floor(gx), Math.floor(gy))));
  const wrecked = dmg.collapsed.size + dmg.charred.size + dmg.craters.size;
  statEl.textContent = events.length === 0 ? "thành phố nguyên vẹn"
    : `${wrecked} công trình đổ nát · ${dmg.cracked.size + dmg.craters.size} đoạn đường hư · `
    + `${dmg.flooded.size} ô ngập · ${events.length} thảm hoạ`;
}
function doStrike(kind, at = null) {
  if (kind === "reset") floodRise = 0;
  if (kind === "flood") floodRise = 0;
  strike(kind, at);
  if (kind === "earthquake" || kind === "war") shake = 1;
  if (kind === "lightning") flash = 1;
  refresh();
}
document.querySelectorAll("button[data-kind]").forEach(b =>
  b.addEventListener("click", () => {
    if (b.dataset.kind === "war") {
      const gx = Math.floor(camTarget.x + HALF), gy = Math.floor(camTarget.z + HALF);
      doStrike("war", [Math.max(1, Math.min(GRID - 2, gx)), Math.max(1, Math.min(GRID - 2, gy))]);
    } else doStrike(b.dataset.kind);
  }));

/* ── controls ─────────────────────────────────────────────────────── */
let drag = null;
const ray = new THREE.Raycaster();
canvas.addEventListener("pointerdown", e => {
  drag = { x: e.clientX, y: e.clientY, btn: e.button, tx: camTarget.x, tz: camTarget.z, yaw, moved: 0 };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
  if (drag.btn === 2) { yaw = drag.yaw + dx * 0.005; placeCamera(); return; }
  const k = (zoom * 2) / canvas.clientHeight;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  camTarget.x = drag.tx - (dx * c - dy * s) * k * 1.2;
  camTarget.z = drag.tz + (dx * s + dy * c) * k * 1.2;
  placeCamera();
});
canvas.addEventListener("pointerup", e => {
  if (drag && drag.moved < 5 && drag.btn === 0) {          // click = missile
    const r = canvas.getBoundingClientRect();
    const p = new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(p, camera);
    const hit = ray.intersectObject(ground)[0];
    if (hit) {
      const gx = Math.round(hit.point.x + HALF - 0.5), gy = Math.round(hit.point.z + HALF - 0.5);
      if (gx > 0 && gx < GRID - 1 && gy > 0 && gy < GRID - 1 && !isWater(gx, gy))
        doStrike("war", [gx, gy]);
    }
  }
  drag = null;
});
canvas.addEventListener("contextmenu", e => e.preventDefault());
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  zoom = Math.max(8, Math.min(60, zoom * (e.deltaY < 0 ? 0.9 : 1.11)));
  resize();
}, { passive: false });

/* ── day / night / rain ───────────────────────────────────────────── */
let clock = 9 * 3600, rainOn = 0, rain = 0;
const timeEl = document.getElementById("time"), fpsEl = document.getElementById("fps");
document.getElementById("clock").addEventListener("input", e => clock = +e.target.value * 3600);
document.getElementById("rain").addEventListener("click", e => {
  rainOn = rainOn ? 0 : 1;
  e.target.textContent = rainOn ? "☔ Tạnh mưa" : "🌧️ Mưa";
});

const rainGeo = new THREE.BufferGeometry();
const RN = 4000, rpos = new Float32Array(RN * 3);
for (let i = 0; i < RN; i++) {
  rpos[i * 3] = (Math.random() - .5) * 90;
  rpos[i * 3 + 1] = Math.random() * 40;
  rpos[i * 3 + 2] = (Math.random() - .5) * 90;
}
rainGeo.setAttribute("position", new THREE.BufferAttribute(rpos, 3));
const rainPts = new THREE.Points(rainGeo, new THREE.PointsMaterial({
  color: 0xbcd3e0, size: 0.10, transparent: true, opacity: 0,
}));
scene.add(rainPts);

const DAY_SKY = new THREE.Color(0xcfd8dd), NIGHT_SKY = new THREE.Color(0x121a2a);
const DAY_SUN = new THREE.Color(0xfff0d6), DUSK_SUN = new THREE.Color(0xffb070);

function night() {
  const h = (clock / 3600) % 24;
  if (h >= 7 && h < 17) return 0;
  if (h >= 17 && h < 19.5) return (h - 17) / 2.5;
  if (h >= 5 && h < 7) return 1 - (h - 5) / 2;
  return 1;
}

/* ── loop ─────────────────────────────────────────────────────────── */
let last = performance.now(), acc = 0, n = 0;
refresh();
resize();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clock = (clock + dt * 240) % 86400;
  const nt = night();
  rain += (rainOn - rain) * Math.min(1, dt * 0.8);

  // sun rides the sky; at night it becomes a pale moon
  const h = (clock / 3600) % 24;
  const ang = ((h - 6) / 12) * Math.PI;
  sun.position.set(Math.cos(ang) * 60 + camTarget.x, Math.max(6, Math.sin(ang) * 70), 28 + camTarget.z);
  sun.target.position.copy(camTarget);
  sun.intensity = (1 - nt) * 3.1 + nt * 0.20;
  sun.color.copy(DAY_SUN).lerp(DUSK_SUN, Math.min(1, nt * 1.6));
  sky.intensity = 1.25 - nt * 0.95;
  sky.color.setHex(nt > 0.5 ? 0x2c3f63 : 0xbcd7ea);
  scene.background = DAY_SKY.clone().lerp(NIGHT_SKY, nt);
  scene.fog.color.copy(scene.background);
  GLASS.emissiveIntensity = nt * 1.5;
  GLASS.color.setHex(nt > 0.4 ? 0xffffff : 0x9fb2c0);

  shake = Math.max(0, shake - dt * 1.6);
  flash = Math.max(0, flash - dt * 2.2);
  if (dmg.flooded.size || true) floodRise = Math.min(1, floodRise + dt * 0.6);
  floodMesh.position.y = -0.5 + 0.12 * floodRise;      // the sheet rises into place

  for (const a of agents) {
    if (a.lane.blocked) continue;
    a.t = (a.t + a.v * dt + 1) % 1;
  }
  const counts = new Map();
  for (const a of agents) {
    if (a.lane.blocked) continue;
    const [x, z, rot] = laneAt(a.lane, a.t, a.off);
    const i = counts.get(a.mesh) || 0;
    dummy.position.set(x, a.y, z);
    dummy.rotation.set(0, rot, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    a.mesh.setMatrixAt(i, dummy.matrix);
    counts.set(a.mesh, i + 1);
  }
  for (const m of fleets) {
    m.count = counts.get(m) || 0;
    m.instanceMatrix.needsUpdate = true;
  }

  if (rain > 0.02) {
    rainPts.material.opacity = 0.45 * rain;
    const p = rainGeo.attributes.position.array;
    for (let i = 0; i < RN; i++) {
      p[i * 3 + 1] -= (26 + (i % 7)) * dt;
      if (p[i * 3 + 1] < 0) p[i * 3 + 1] = 40;
    }
    rainGeo.attributes.position.needsUpdate = true;
    rainPts.position.set(camTarget.x, 0, camTarget.z);
  } else rainPts.material.opacity = 0;

  if (shake > 0) {
    camera.position.x += (Math.random() - .5) * shake * 1.2;
    camera.position.y += (Math.random() - .5) * shake * 1.2;
  }
  renderer.toneMappingExposure = 1.45 + flash * 1.6;

  renderer.render(scene, camera);
  if (shake > 0) placeCamera();

  const hh = Math.floor(clock / 3600), mm = Math.floor((clock % 3600) / 60);
  timeEl.textContent = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  acc += 1 / Math.max(dt, 1e-4); n++;
  if (n >= 30) { fpsEl.textContent = Math.round(acc / n) + " fps"; acc = 0; n = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
