import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { room, speakers, comparisonSubs, sourceLinks } from './model-data.js';
import { calculateModes, heatmap, recommendSeats, compareSubLayouts } from './acoustics.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const base = { length: room.length / 1000, width: room.width / 1000, height: room.height / 1000 };
const presets = {
  recommended: { ...base },
  insulated: { length: 6.0, width: 5.0, height: 2.7 },
  compact: { length: 5.5, width: 4.6, height: 2.5 }
};
const state = {
  dims: { ...base }, frequency: 42, mode: 'cinema', view: 'house', filter: 'all', selected: null, subLayout: 'dual',
  modes: [], seatPlan: null, cameraTween: null, dragStart: null, comparisonScale: null
};
const stage = $('#scene');
const palette = { room: 0x28475a, line: 0x819dac, gold: 0xe7b86f, cyan: 0x64c6d3, sub: 0x859ce9, ktv: 0xf2a56d, seat: 0x9b816c };
const heatColors = [[38,70,115],[65,142,172],[138,188,154],[237,179,107],[221,108,78]];
let renderer;
let scene;
let camera;
let controls;
let houseGroup;
let theaterGroup;
let dynamicGroup;
let heatPlane;
let screenMesh;
let latestComparison;
const pickables = [];
const items = new Map();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: .74, metalness: .08, transparent: options.opacity !== undefined, opacity: options.opacity ?? 1, emissive: options.emissive ?? 0x000000, emissiveIntensity: options.emissiveIntensity ?? 0 });
}

function box(parent, size, center, color, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color, options));
  mesh.position.set(...center);
  mesh.castShadow = options.castShadow ?? false;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function outline(parent, width, depth, center, color, y = .02) {
  const points = [
    [-width / 2, y, -depth / 2], [width / 2, y, -depth / 2], [width / 2, y, depth / 2],
    [-width / 2, y, depth / 2], [-width / 2, y, -depth / 2]
  ].map(point => new THREE.Vector3(point[0] + center[0], point[1] + center[1], point[2] + center[2]));
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity: .82 }));
  parent.add(line);
  return line;
}

function labelSprite(text, fill = '#243c4b', color = '#edf5f6', scale = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 112;
  const context = canvas.getContext('2d');
  context.fillStyle = fill;
  context.beginPath(); context.roundRect(4, 8, 504, 96, 18); context.fill();
  context.strokeStyle = 'rgba(214,232,238,.45)'; context.lineWidth = 3; context.stroke();
  context.fillStyle = color; context.font = '600 43px Microsoft YaHei, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillText(text, 256, 56, 480);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(3.2 * scale, .7 * scale, 1);
  return sprite;
}

function houseLabel(text, x, y, z, fill) {
  const sprite = labelSprite(text, fill);
  sprite.position.set(x, y, z);
  sprite.userData.houseLabel = true;
  houseGroup.add(sprite);
  return sprite;
}

function buildHouse() {
  houseGroup = new THREE.Group();
  houseGroup.name = '原平面概念体块';
  scene.add(houseGroup);
  // The source plan gives 11.1 m + 6.8 m horizontally and a roughly 12.05 m lower band.
  box(houseGroup, [17.9, .12, 12.05], [8.95, -.08, 6.025], 0x243542);
  box(houseGroup, [11.1, .035, 6.25], [5.55, .025, 8.925], 0x244653);
  box(houseGroup, [6.8, .035, 6.25], [14.5, .03, 8.925], 0x283c48);
  box(houseGroup, [11.1, .035, 5.8], [5.55, .03, 2.9], 0x2b3e4a);
  outline(houseGroup, 11.1, 6.25, [5.55, 0, 8.925], 0x68abb2, .08);
  outline(houseGroup, 6.8, 6.25, [14.5, 0, 8.925], 0x8ea2ae, .08);
  outline(houseGroup, 11.1, 5.8, [5.55, 0, 2.9], 0x8ea2ae, .08);
  outline(houseGroup, 6.8, 5.8, [14.5, 0, 2.9], palette.gold, 2.77);
  // Transparent perimeter and band dividers express the original plan without asserting structural type.
  for (const [size, center] of [
    [[.12, 5.8, 12.05], [0, 2.9, 6.025]], [[.12, 5.8, 12.05], [17.9, 2.9, 6.025]],
    [[17.9, 5.8, .12], [8.95, 2.9, 0]], [[17.9, 5.8, .12], [8.95, 2.9, 12.05]],
    [[.12, 5.8, 12.05], [11.1, 2.9, 6.025]], [[17.9, 5.8, .1], [8.95, 2.9, 5.8]]
  ]) box(houseGroup, size, center, 0x7894a6, { opacity: .075 });
  // Ground-level slabs and upper building are ghosted so the yellow bay stays legible.
  box(houseGroup, [11.1, .18, 5.8], [5.55, 5.82, 2.9], 0x607e8b, { opacity: .13 });
  box(houseGroup, [6.8, .18, 6.25], [14.5, 5.82, 8.925], 0x607e8b, { opacity: .16 });
  box(houseGroup, [17.9, .16, 7.7], [8.95, 5.82, -3.85], 0x628091, { opacity: .26 });
  box(houseGroup, [17.9, 2.8, 7.7], [8.95, 7.3, -3.85], 0x47677a, { opacity: .13 });
  outline(houseGroup, 17.9, 7.7, [8.95, 5.9, -3.85], 0x83a0ae, .03);
  // The only railing is on the terrace edge; these posts are conceptual.
  for (let x = 11.45; x <= 17.65; x += 1.05) box(houseGroup, [.035, .58, .035], [x, 6.17, 12.03], 0xa8bdc6, { opacity: .7 }).userData.terraceRail = true;
  box(houseGroup, [6.8, .035, .035], [14.5, 6.47, 12.03], 0xa8bdc6, { opacity: .7 }).userData.terraceRail = true;
  houseLabel('主建筑 · 图纸上方', 8.95, 8.94, -3.9, '#1b3547');
  houseLabel('左侧地下室', 5.55, 2.5, 2.9, '#213d4f');
  houseLabel('下沉庭院', 5.55, .38, 8.925, '#16404c');
  houseLabel('右下区域', 14.5, 1.8, 8.925, '#213d4f');
  houseLabel('黄色框 · 上层影院', 14.5, 6.15, 2.9, '#74542d');
}

function toSceneCoordinate(source) {
  return new THREE.Vector3(-source.x / 1000, source.z / 1000, source.y / 1000);
}

function scaledSpeaker(source) {
  const { length, width, height } = state.dims;
  return {
    ...source,
    x: source.x * width / base.width,
    y: source.y * length / base.length,
    z: source.group === 'top' ? (height - .17) * 1000 : source.group === 'ktv' ? Math.min(source.z, (height - .5) * 1000) : source.z
  };
}

function registerPick(mesh, item) {
  mesh.userData.itemId = item.id;
  pickables.push(mesh);
  items.set(item.id, item);
}

function addSeat(id, x, depth, riser) {
  const group = new THREE.Group();
  const y = riser + .08;
  const leather = material(0x8b765f);
  const accent = material(0xbba27f);
  const cushion = new THREE.Mesh(new THREE.BoxGeometry(.68, .18, .56), leather);
  cushion.position.set(x, y + .35, depth); group.add(cushion);
  const back = new THREE.Mesh(new THREE.BoxGeometry(.69, .68, .15), leather);
  back.position.set(x, y + .72, depth + .28); back.rotation.x = -.1; group.add(back);
  for (const side of [-.38, .38]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(.11, .38, .67), accent);
    arm.position.set(x + side, y + .33, depth + .04); group.add(arm);
  }
  const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(.58, .16, .48), material(0x394550));
  baseMesh.position.set(x, y + .12, depth + .03); group.add(baseMesh);
  for (const child of group.children) registerPick(child, { id, kind: 'seat', name: `第 ${id.startsWith('F') ? '一' : '二'} 排 ${id.slice(1)} 号位`, row: id.startsWith('F') ? 1 : 2 });
  dynamicGroup.add(group);
}

function screenTexture(ktv = false) {
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 432;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 768, 432);
  if (ktv) { gradient.addColorStop(0, '#4b2548'); gradient.addColorStop(.55, '#9c5d4c'); gradient.addColorStop(1, '#241f45'); }
  else { gradient.addColorStop(0, '#122b49'); gradient.addColorStop(.48, '#4b7992'); gradient.addColorStop(1, '#11233d'); }
  context.fillStyle = gradient; context.fillRect(0, 0, 768, 432);
  if (ktv) {
    context.fillStyle = 'rgba(255,230,174,.8)'; context.font = '54px Microsoft YaHei, sans-serif'; context.textAlign = 'center';
    context.fillText('一起唱', 384, 234);
    context.font = '20px Microsoft YaHei, sans-serif'; context.fillText('KTV 模式 · 独立扩声', 384, 278);
  } else {
    context.fillStyle = 'rgba(15,36,58,.8)';
    context.beginPath(); context.moveTo(0, 355); context.lineTo(190, 140); context.lineTo(390, 351); context.lineTo(560, 196); context.lineTo(768, 368); context.fill();
    context.fillStyle = 'rgba(241,220,180,.74)'; context.fillRect(0, 360, 768, 72);
    context.fillStyle = 'rgba(255,255,255,.6)'; context.font = '18px Microsoft YaHei, sans-serif'; context.textAlign = 'left'; context.fillText('CINEMA / 7.2.4', 28, 43);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function speakerMesh(source) {
  const item = scaledSpeaker(source);
  const center = toSceneCoordinate(item);
  const isSub = item.group === 'sub';
  const isTop = item.group === 'top';
  const isKtv = item.group === 'ktv';
  const size = isSub ? [.43, .54, .36] : isTop ? [.32, .1, .32] : isKtv ? [.3, .42, .24] : [.29, .42, .2];
  const color = isSub ? palette.sub : isKtv ? palette.ktv : palette.cyan;
  const mesh = box(dynamicGroup, size, center.toArray(), color, { emissive: color, emissiveIntensity: .1 });
  const face = box(dynamicGroup, [size[0] * .57, size[1] * .55, .026], [center.x, center.y, center.z + size[2] / 2 + .016], 0x10202a);
  registerPick(mesh, item); registerPick(face, item);
  mesh.userData.baseScale = 1; face.userData.baseScale = 1;
  mesh.userData.group = item.group; face.userData.group = item.group;
  mesh.userData.mainBox = true;
  return mesh;
}

function heatColor(value, low, high) {
  const t = THREE.MathUtils.clamp((value - low) / Math.max(2, high - low), 0, 1) * (heatColors.length - 1);
  const a = Math.min(heatColors.length - 2, Math.floor(t)); const mix = t - a;
  return heatColors[a].map((component, index) => Math.round(component * (1 - mix) + heatColors[a + 1][index] * mix));
}

function makeHeatTexture() {
  const map = heatmap(state.dims, state.modes, state.frequency, 54, 60, state.mode === 'modes' ? state.subLayout : 'dual');
  const low = state.comparisonScale?.low ?? map.low;
  const high = state.comparisonScale?.high ?? map.high;
  const canvas = document.createElement('canvas'); canvas.width = map.columns; canvas.height = map.rows;
  const context = canvas.getContext('2d');
  const image = context.createImageData(map.columns, map.rows);
  for (let index = 0; index < map.values.length; index++) {
    const color = heatColor(map.values[index], low, high);
    const baseIndex = index * 4;
    for (let component = 0; component < 3; component++) image.data[baseIndex + component] = color[component];
    image.data[baseIndex + 3] = 218;
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function updateHeatmap() {
  if (!heatPlane) return;
  if (heatPlane.material.map) heatPlane.material.map.dispose();
  heatPlane.material.map = makeHeatTexture();
  heatPlane.material.needsUpdate = true;
}

function disposeGroup(group) {
  group.traverse(object => {
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(entry => { if (entry.map) entry.map.dispose(); entry.dispose(); });
    }
  });
  group.removeFromParent();
}

function buildTheater() {
  if (theaterGroup) disposeGroup(theaterGroup);
  pickables.length = 0; items.clear();
  const { length, width, height } = state.dims;
  theaterGroup = new THREE.Group(); theaterGroup.name = '黄色框上层影音室';
  theaterGroup.position.set(17.6, 2.7, 2.9);
  theaterGroup.rotation.y = -Math.PI / 2;
  scene.add(theaterGroup);
  dynamicGroup = new THREE.Group(); theaterGroup.add(dynamicGroup);
  // Upper and lower floors use the same yellow-box footprint. Structure thickness is a scenario, not a design section.
  box(dynamicGroup, [width, .22, length], [0, -.12, length / 2], 0x314452);
  box(dynamicGroup, [width, .035, length], [0, .016, length / 2], 0x263845);
  box(dynamicGroup, [width, .055, length], [0, -2.71, length / 2], 0x2c4250);
  for (const side of [-1, 1]) box(dynamicGroup, [.07, 2.42, length], [side * width / 2, -1.46, length / 2], 0x6d8794, { opacity: .13 });
  box(dynamicGroup, [width, 2.42, .06], [0, -1.46, length], 0x698291, { opacity: .13 });
  box(dynamicGroup, [width, 2.42, .06], [0, -1.46, 0], 0x698291, { opacity: .13 });
  // Original top slab fixed at the user's approximate 5.8 m above basement floor; changing clear height can collide with it.
  box(dynamicGroup, [width + .24, .13, length + .24], [0, 3.08, length / 2], 0x93aab3, { opacity: .12 });
  box(dynamicGroup, [width, height, .07], [0, height / 2, .02], 0x496576, { opacity: .22 });
  box(dynamicGroup, [width, height, .07], [0, height / 2, length], 0x617b8a, { opacity: .1 });
  box(dynamicGroup, [.07, height, length], [-width / 2, height / 2, length / 2], 0x617b8a, { opacity: .1 });
  box(dynamicGroup, [.07, height, length], [width / 2, height / 2, length / 2], 0x617b8a, { opacity: .09 });
  box(dynamicGroup, [width, .025, length], [0, height, length / 2], 0x7195a3, { opacity: .085 });
  outline(dynamicGroup, width, length, [0, 0, length / 2], palette.gold, .055);
  const upperLabel = labelSprite('上层影院', '#735331', '#fff1d6', .77);
  upperLabel.position.set(0, 1.93, length * .72); upperLabel.userData.sectionLabel = true; upperLabel.material.depthTest = false; upperLabel.renderOrder = 9; dynamicGroup.add(upperLabel);
  const lowerLabel = labelSprite('下层用途待定', '#23465a', '#e0f2f4', .77);
  lowerLabel.position.set(0, -1.38, length * .72); lowerLabel.userData.sectionLabel = true; lowerLabel.material.depthTest = false; lowerLabel.renderOrder = 9; dynamicGroup.add(lowerLabel);
  // A room-height-independent screen width makes size comparisons visible.
  const screenHeight = room.screen.height / 1000;
  const screenBottom = Math.min(.6, Math.max(.28, height - screenHeight - .4));
  const screenFrame = box(dynamicGroup, [2.91, screenHeight + .11, .09], [0, screenBottom + screenHeight / 2, .31], 0x0a1620);
  screenFrame.material.roughness = .35;
  screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.8, screenHeight), new THREE.MeshBasicMaterial({ map: screenTexture(state.mode === 'ktv'), side: THREE.DoubleSide }));
  screenMesh.position.set(0, screenBottom + screenHeight / 2, .365);
  dynamicGroup.add(screenMesh);
  // Stage / performer area becomes visible only in KTV mode.
  const singerMat = new THREE.MeshStandardMaterial({ color: palette.ktv, transparent: true, opacity: .2, emissive: palette.ktv, emissiveIntensity: .15, side: THREE.DoubleSide });
  const singer = new THREE.Mesh(new THREE.CircleGeometry(.57, 36), singerMat);
  singer.rotation.x = -Math.PI / 2; singer.position.set(0, .07, 1.45); singer.name = 'ktv-singer'; dynamicGroup.add(singer);
  // Seats and both candidate zones follow the dimensions.
  const plan = state.seatPlan;
  const rearStart = Math.max(plan ? plan.rear - .72 : 3.75, 3.45);
  const platformDepth = Math.max(.6, length - rearStart);
  box(dynamicGroup, [Math.min(width - .5, 4.5), .18, platformDepth], [0, .09, rearStart + platformDepth / 2], 0x4c4650);
  if (plan) {
    for (const [index, depth] of [[0, plan.front], [1, plan.rear]]) {
      const zone = box(dynamicGroup, [2.75, .008, .42], [0, index ? .201 : .071, depth], 0x58d5c6, { opacity: .23 });
      zone.name = 'seat-zone';
      for (let seat = 0; seat < 3; seat++) addSeat(`${index ? 'R' : 'F'}${seat + 1}`, (seat - 1) * .9, depth, index ? .2 : 0);
    }
  }
  // Modal response is mapped to the horizontal listening plane at fixed ear height in the acoustic calculation.
  heatPlane = new THREE.Mesh(new THREE.PlaneGeometry(width, length), new THREE.MeshBasicMaterial({ map: makeHeatTexture(), transparent: true, opacity: .68, depthWrite: false, side: THREE.DoubleSide }));
  heatPlane.rotation.x = -Math.PI / 2; heatPlane.position.set(0, .052, length / 2); heatPlane.name = 'relative-bass-heatmap'; dynamicGroup.add(heatPlane);
  speakers.forEach(speakerMesh);
  comparisonSubs.forEach(speakerMesh);
  applyModeVisibility();
  updateSelectionVisual();
}

function applyModeVisibility() {
  if (!dynamicGroup) return;
  const acoustics = state.mode === 'modes';
  const ktv = state.mode === 'ktv';
  heatPlane.visible = acoustics;
  dynamicGroup.children.forEach(object => {
    if (object.name === 'seat-zone') object.visible = acoustics;
    if (object.name === 'ktv-singer') object.visible = ktv;
    if (object.userData.sectionLabel) object.visible = state.view === 'section';
    if (object.userData.group) {
      const id = object.userData.itemId;
      const activeLayout = acoustics ? state.subLayout : 'dual';
      object.visible = !(id === 'SUB-R' && activeLayout === 'single') && !(id?.startsWith('SUB-S') && activeLayout !== 'quad');
      const active = state.mode === 'section' || acoustics || (ktv ? object.userData.group === 'ktv' : object.userData.group !== 'ktv');
      object.material.opacity = active ? 1 : .16;
      object.material.transparent = !active;
      object.material.depthWrite = active;
    }
  });
  if (screenMesh) {
    screenMesh.material.map.dispose();
    screenMesh.material.map = screenTexture(ktv);
    screenMesh.material.opacity = acoustics ? .4 : 1;
    screenMesh.material.transparent = acoustics;
    screenMesh.material.needsUpdate = true;
  }
  houseGroup.visible = true;
}

function updateSelectionVisual() {
  for (const object of pickables) {
    if (!object.userData.mainBox) continue;
    const selected = object.userData.itemId === state.selected;
    object.material.emissiveIntensity = selected ? .68 : .1;
    object.scale.setScalar(selected ? 1.17 : 1);
  }
  $$('.speaker-item').forEach(button => button.classList.toggle('selected', button.dataset.id === state.selected));
}

function renderSelection() {
  const detail = $('#selection-detail');
  const item = items.get(state.selected);
  if (!item) { detail.innerHTML = '<strong>空间全景</strong><p>点击场景中的座位或音箱，查看位置与设计说明。</p>'; return; }
  if (item.kind === 'seat') {
    const depth = item.row === 1 ? state.seatPlan.front : state.seatPlan.rear;
    detail.innerHTML = `<strong>${item.name}</strong><p>耳位距银幕墙约 ${depth.toFixed(2)} m；${item.row === 2 ? `距后墙约 ${state.seatPlan.rearClearance.toFixed(2)} m，地台暂按 0.20 m。` : `屏幕水平视角约 ${state.seatPlan.frontAngle.toFixed(0)}°（理论）。`}</p>`;
  } else {
    detail.innerHTML = `<strong>${item.name}</strong><p>${item.note}</p>`;
  }
}

function selectItem(id) {
  state.selected = id;
  renderSelection(); updateSelectionVisual();
}

function renderSpeakerList() {
  const list = $('#speaker-list'); list.replaceChildren();
  for (const speaker of speakers.filter(item => state.filter === 'all' || item.group === state.filter)) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'speaker-item'; button.dataset.id = speaker.id;
    button.innerHTML = `<span>${speaker.name}</span><code>${speaker.id}</code>`;
    button.addEventListener('click', () => selectItem(speaker.id));
    list.append(button);
  }
  updateSelectionVisual();
}

function renderModeList() {
  const list = $('#mode-list'); list.replaceChildren();
  const first = state.modes.filter(mode => mode.kind === '轴向').slice(0, 8);
  for (const mode of first) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'mode-pill';
    button.textContent = `${mode.ny ? '长' : mode.nx ? '宽' : '高'}${mode.nx + mode.ny + mode.nz} · ${mode.hz.toFixed(1)} Hz`;
    button.title = `理论轴向模态 (${mode.nx},${mode.ny},${mode.nz})`;
    button.classList.toggle('active', Math.abs(mode.hz - state.frequency) < .6);
    button.addEventListener('click', () => { $('#frequency-slider').value = Math.round(mode.hz); setFrequency(Math.round(mode.hz)); setMode('modes'); });
    list.append(button);
  }
}

function renderSeatZone() {
  const plan = state.seatPlan;
  if (!plan) { $('#seat-zone').textContent = '当前长度无法按两排与后墙预留条件排布。'; return; }
  $('#seat-zone').innerHTML = `<strong>候选区：前排 ${plan.frontRange[0].toFixed(2)}–${plan.frontRange[1].toFixed(2)} m</strong>后排耳位约 ${plan.rear.toFixed(2)} m；两排间距 ${plan.gap.toFixed(2)} m。前/后排理论水平视角约 ${plan.frontAngle.toFixed(0)}° / ${plan.rearAngle.toFixed(0)}°；后排至后墙约 ${plan.rearClearance.toFixed(2)} m，最外侧耳位至侧墙约 ${plan.sideClearance.toFixed(2)} m。`;
}

function drawComparisonMap(layout, map, low, high) {
  const canvas = $(`#map-${layout}`);
  const context = canvas.getContext('2d');
  const cellW = canvas.width / map.columns; const cellH = canvas.height / map.rows;
  map.values.forEach((value, index) => {
    const [r, g, b] = heatColor(value, low, high);
    context.fillStyle = `rgb(${r},${g},${b})`;
    context.fillRect(Math.floor((index % map.columns) * cellW), Math.floor(Math.floor(index / map.columns) * cellH), Math.ceil(cellW + 1), Math.ceil(cellH + 1));
  });
  context.fillStyle = 'rgba(7,18,28,.78)'; context.fillRect(0, 0, canvas.width, 23);
  context.fillStyle = '#f4dfb7'; context.font = 'bold 12px Microsoft YaHei, sans-serif'; context.textAlign = 'center';
  context.fillText('银幕墙', canvas.width / 2, 16);
  const marks = [[.5, .54 / 6.2]];
  if (layout !== 'single') marks.push([.5, 5.65 / 6.2]);
  if (layout === 'quad') marks.push([.55 / 5.3, .5], [1 - .55 / 5.3, .5]);
  for (const [x, y] of marks) {
    context.beginPath(); context.arc(x * canvas.width, y * canvas.height, 8, 0, Math.PI * 2);
    context.fillStyle = '#a8a0ff'; context.fill(); context.lineWidth = 2; context.strokeStyle = '#f2f2ff'; context.stroke();
  }
  if (state.seatPlan) for (const depth of [state.seatPlan.front, state.seatPlan.rear]) for (const offset of [-.9, 0, .9]) {
    context.beginPath(); context.arc((.5 - offset / state.dims.width) * canvas.width, (depth / state.dims.length) * canvas.height, 4.2, 0, Math.PI * 2);
    context.fillStyle = '#fff'; context.fill(); context.lineWidth = 1.5; context.strokeStyle = '#183646'; context.stroke();
  }
}

function drawSpreadChart(comparison) {
  const svg = $('#spread-chart');
  const chartWidth = window.innerWidth <= 520 ? 320 : 640;
  svg.setAttribute('viewBox', `0 0 ${chartWidth} 180`);
  const left = 37, right = chartWidth - 14, top = 12, bottom = 150;
  const maxValue = Math.max(6, Math.ceil(Math.max(...comparison.single, ...comparison.dual, ...comparison.quad) / 2) * 2);
  const x = hz => left + (hz - 30) / 90 * (right - left);
  const y = value => bottom - value / maxValue * (bottom - top);
  const line = (layout, color) => `<path d="${comparison[layout].map((value, index) => `${index ? 'L' : 'M'}${x(comparison.frequencies[index]).toFixed(1)},${y(value).toFixed(1)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
  const guides = [0, maxValue / 2, maxValue].map(value => `<line x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}" stroke="#456071" stroke-dasharray="3 5"/><text x="30" y="${y(value) + 4}" fill="#92aab6" font-size="10" text-anchor="end">${value.toFixed(0)}</text>`).join('');
  const ticks = [30, 60, 90, 120].map(hz => `<text x="${x(hz)}" y="171" fill="#92aab6" font-size="10" text-anchor="middle">${hz} Hz</text>`).join('');
  const selectedX = x(Math.max(30, Math.min(120, state.frequency)));
  svg.innerHTML = `<title>六个座位低频响应的标准差，单炮、双炮和四炮比较</title>${guides}<line x1="${selectedX}" x2="${selectedX}" y1="${top}" y2="${bottom}" stroke="#e7b86f" opacity=".55" stroke-dasharray="5 4"/>${line('single','#9cb0bc')}${line('dual','#65c9d3')}${line('quad','#e7b86f')}${ticks}`;
}

function renderComparison() {
  const comparison = compareSubLayouts(state.dims, state.modes, state.seatPlan, state.frequency);
  if (!comparison) { $('#comparison-takeaway').textContent = '当前尺寸无法布置两排六座，需调整长度后比较。'; return; }
  latestComparison = comparison;
  const layouts = ['single', 'dual', 'quad'];
  const maps = Object.fromEntries(layouts.map(layout => [layout, heatmap(state.dims, state.modes, state.frequency, 32, 38, layout)]));
  const all = layouts.flatMap(layout => [...maps[layout].values]).sort((a, b) => a - b);
  const low = all[Math.floor(all.length * .1)], high = all[Math.floor(all.length * .9)];
  state.comparisonScale = { low, high };
  for (const layout of layouts) {
    drawComparisonMap(layout, maps[layout], low, high);
    $(`#spread-${layout}`).textContent = `${comparison[`${layout}Mean`].toFixed(1)} dB`;
  }
  drawSpreadChart(comparison);
  $('#comparison-frequency').textContent = `${state.frequency} Hz 截面`;
  const dualChange = (comparison.singleMean - comparison.dualMean) / comparison.singleMean * 100;
  const quadChange = (comparison.singleMean - comparison.quadMean) / comparison.singleMean * 100;
  const describe = (name, change) => `${name}${change >= 0 ? `比单炮低 ${change.toFixed(0)}%` : `比单炮高 ${(-change).toFixed(0)}%`}`;
  $('#comparison-takeaway').textContent = `当前尺寸下，30–120 Hz 六座平均差异：${describe('双炮', dualChange)}，${describe('四炮', quadChange)}。单看 ${state.frequency} Hz，三档分别为 ${comparison.selectedSingle.toFixed(1)} / ${comparison.selectedDual.toFixed(1)} / ${comparison.selectedQuad.toFixed(1)} dB；炮数增加后也可能出现更差的频点。`;
}

function renderDimensionStatus() {
  const { length, width, height } = state.dims;
  for (const [name, value] of Object.entries(state.dims)) {
    $(`#${name}-value`).textContent = `${value.toFixed(1)} m`;
    $(`#metric-${name}`).innerHTML = `${value.toFixed(1)} <small>m</small>`;
  }
  const warnings = [];
  if (length > 6.2 || width > 5.3) warnings.push('超过当前完成面预留目标，须重算墙体/隔声厚度');
  if (height > 2.8) warnings.push('净高高于当前夹层目标，须与下层净高和梁位一起复核');
  if (length / width < 1.15 || length / width > 1.45) warnings.push('长宽比偏离 RP22 的一般建议 1.15–1.45:1');
  if (width <= 4.8) warnings.push('六座侧墙距已失去当前 Level 4 单项的几何余量');
  if (width / height > 1.92 && width / height < 2.08) warnings.push('宽高接近 2:1，需特别检查低频模态重合');
  const status = $('#fit-status');
  status.textContent = warnings.length ? warnings.join('；') + '。' : `当前在暂估尺寸范围内；长宽比 ${(length / width).toFixed(2)}:1。`;
  status.classList.toggle('warning', warnings.length > 0);
}

function setDimensions(next, preset = null) {
  state.dims = { ...next };
  state.modes = calculateModes(state.dims);
  state.seatPlan = recommendSeats(state.dims, state.modes);
  for (const key of ['length', 'width', 'height']) $(`#${key}-slider`).value = state.dims[key];
  $$('.preset-button').forEach(button => button.classList.toggle('active', button.dataset.preset === preset));
  renderDimensionStatus(); renderModeList(); renderSeatZone(); renderComparison();
  if (scene) { buildTheater(); renderSelection(); }
}

function setFrequency(hz) {
  state.frequency = hz;
  $('#frequency-value').textContent = `${hz} Hz`;
  renderModeList();
  renderComparison();
  if (scene) updateHeatmap();
}

const modeText = {
  cinema: ['电影优先的 7.2.4 布局', '黄色框上层布置两排六座、7 个平面声道、2 只低音炮和 4 只实体顶部音箱。点击声道可查看初排位置。', '影院声道与六座布局'],
  ktv: ['同室 KTV · 独立扩声', 'KTV 左右音箱位于前侧，麦克风经独立处理与功放链路。模式切换时影院声道暂静音，演唱区与反馈裕量待现场调试。', 'KTV 左右声道与演唱区'],
  modes: ['尺寸与房间模式联动', '拖动净长、净宽、净高，理论模态频率和所选频率的相对热区会同步变化；下方可比较单炮、双炮与四炮。', '相对低频响应与座位候选区'],
  section: ['影院嵌在房屋的夹层上部', '全屋体块保留主建筑、左侧地下室、下沉庭院和右下区域；黄色框内上层为影院，下层用途待定。梁位与承载未建模。', '原平面黄色框与上下层剖面']
};

function setMode(mode) {
  state.mode = mode;
  $$('.mode-tab').forEach(button => { const active = button.id === `mode-${mode}`; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  const [title, description, caption] = modeText[mode];
  $('#mode-title').textContent = title; $('#mode-description').textContent = description; $('#scene-caption').textContent = caption;
  $('#sub-switch').hidden = mode !== 'modes';
  if (dynamicGroup) applyModeVisibility();
  if (mode === 'modes' && scene) updateHeatmap();
  if (mode === 'section') setView('section');
  if (mode === 'modes') setView('top');
  if (mode === 'ktv' || mode === 'cinema') setView('room');
}

function setSubLayout(layout, revealScene = false) {
  state.subLayout = layout;
  $$('.comparison-card').forEach(button => { const active = button.dataset.subLayout === layout; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  $$('.sub-switch button').forEach(button => { const active = button.dataset.subSwitch === layout; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  if (state.mode !== 'modes') setMode('modes');
  else { applyModeVisibility(); updateHeatmap(); }
  if (revealScene) $('#stage-frame').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function cameraPreset(name) {
  const roomCenter = new THREE.Vector3(14.5, 4.15, 2.9);
  const plan = state.seatPlan;
  if (name === 'house') return { position: new THREE.Vector3(26, 17, 24), target: new THREE.Vector3(9.1, 4.1, 2), up: new THREE.Vector3(0, 1, 0) };
  if (name === 'room') return { position: new THREE.Vector3(21, 9.2, 11.8), target: roomCenter, up: new THREE.Vector3(0, 1, 0) };
  if (name === 'top') return { position: new THREE.Vector3(14.5, 15.2, 2.9), target: new THREE.Vector3(14.5, 3.75, 2.9), up: new THREE.Vector3(-1, 0, 0) };
  if (name === 'seat') {
    const position = theaterGroup.localToWorld(new THREE.Vector3(0, 1.3, plan?.front ?? 3));
    const target = theaterGroup.localToWorld(new THREE.Vector3(0, 1.35, .23));
    return { position, target, up: new THREE.Vector3(0, 1, 0) };
  }
  return { position: new THREE.Vector3(20.8, 6.6, 11.8), target: new THREE.Vector3(14.5, 2.65, 2.9), up: new THREE.Vector3(0, 1, 0) };
}

function setView(name, immediate = false) {
  if (!camera || !theaterGroup) return;
  state.view = name;
  $$('.view-button').forEach(button => button.classList.toggle('active', button.dataset.view === name));
  houseGroup.traverse(object => {
    if (object.userData.houseLabel || object.userData.terraceRail) object.visible = name === 'house';
  });
  if (dynamicGroup) dynamicGroup.children.forEach(object => { if (object.userData.sectionLabel) object.visible = name === 'section'; });
  const next = cameraPreset(name);
  if (stage.clientWidth < 520 && name !== 'seat') {
    const factor = name === 'house' ? 1.55 : name === 'top' ? 1.08 : 1.28;
    next.position.sub(next.target).multiplyScalar(factor).add(next.target);
  }
  if (immediate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    camera.position.copy(next.position); camera.up.copy(next.up); controls.target.copy(next.target); controls.update();
    state.cameraTween = null;
  } else {
    state.cameraTween = { start: performance.now(), duration: 650, fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), fromUp: camera.up.clone(), ...next };
  }
}

function animate(now) {
  if (state.cameraTween) {
    const tween = state.cameraTween;
    const t = Math.min(1, (now - tween.start) / tween.duration);
    const smooth = t * t * (3 - 2 * t);
    camera.position.lerpVectors(tween.fromPosition, tween.position, smooth);
    controls.target.lerpVectors(tween.fromTarget, tween.target, smooth);
    camera.up.lerpVectors(tween.fromUp, tween.up, smooth).normalize();
    if (t >= 1) state.cameraTween = null;
  }
  controls.update();
  renderer.render(scene, camera);
}

function onCanvasClick(event) {
  if (!state.dragStart || Math.hypot(event.clientX - state.dragStart.x, event.clientY - state.dragStart.y) > 7) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickables, false)[0];
  if (hit?.object.userData.itemId) selectItem(hit.object.userData.itemId);
}

function showFailure(error) {
  const stateBox = $('#load-state');
  stateBox.classList.remove('is-hidden');
  stateBox.innerHTML = `<div><strong>三维场景未能启动</strong><p>请使用支持 WebGL2 的浏览器打开演示。概念示意图与规划说明仍可在右侧查看。</p><small>${String(error?.message || error).replace(/[<>]/g, '')}</small></div>`;
  console.error(error);
}

function initScene() {
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x0c1c29); scene.fog = new THREE.Fog(0x0c1c29, 31, 65);
  camera = new THREE.PerspectiveCamera(43, 1, .06, 90);
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.43;
  stage.append(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); showFailure(new Error('WebGL 上下文已丢失，请刷新页面重试。')); });
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .08;
  controls.minDistance = .5; controls.maxDistance = 62;
  controls.maxPolarAngle = Math.PI * .94;
  controls.addEventListener('start', () => { state.cameraTween = null; });
  renderer.domElement.addEventListener('pointerdown', event => { state.dragStart = { x: event.clientX, y: event.clientY }; });
  renderer.domElement.addEventListener('pointerup', onCanvasClick);
  scene.add(new THREE.AmbientLight(0xd7e5ec, 1.7));
  const sun = new THREE.DirectionalLight(0xffe2b5, 2.3); sun.position.set(6, 20, 12); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x79b4df, 1.5); rim.position.set(22, 9, -4); scene.add(rim);
  buildHouse(); buildTheater(); setView('house', true);
  let previousNarrow = stage.clientWidth < 520;
  const resize = () => {
    const { width, height } = stage.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    camera.aspect = width / height; camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    const narrow = width < 520;
    if (narrow !== previousNarrow) { previousNarrow = narrow; setView(state.view, true); }
  };
  new ResizeObserver(resize).observe(stage); resize();
  // Mark ready only after a real render, never after a fixed timeout.
  renderer.render(scene, camera);
  $('#load-state').classList.add('is-hidden');
  renderer.setAnimationLoop(animate);
}

function bindUi() {
  window.addEventListener('resize', () => { if (latestComparison) drawSpreadChart(latestComparison); });
  $$('.mode-tab').forEach(button => button.addEventListener('click', () => setMode(button.id.replace('mode-', ''))));
  $$('.view-button').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  $$('.filter-button').forEach(button => button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    $$('.filter-button').forEach(other => { const active = other === button; other.classList.toggle('active', active); other.setAttribute('aria-pressed', String(active)); });
    renderSpeakerList();
  }));
  $$('.preset-button').forEach(button => button.addEventListener('click', () => setDimensions(presets[button.dataset.preset], button.dataset.preset)));
  $$('.comparison-card').forEach(button => button.addEventListener('click', () => setSubLayout(button.dataset.subLayout, true)));
  $$('.sub-switch button').forEach(button => button.addEventListener('click', () => setSubLayout(button.dataset.subSwitch)));
  for (const name of ['length', 'width', 'height']) $(`#${name}-slider`).addEventListener('input', event => {
    setDimensions({ ...state.dims, [name]: Number(event.target.value) });
    if (state.mode !== 'modes') setMode('modes');
  });
  $('#frequency-slider').addEventListener('input', event => { setFrequency(Number(event.target.value)); if (state.mode !== 'modes') setMode('modes'); });
  $('#reset-camera').addEventListener('click', () => setView(state.view));
  const sourceViews = {
    plan: {
      title: '平面示意 · 黄色框为上层影院候选范围',
      src: './assets/plan-diagram.svg',
      alt: '上层影院候选布局和银幕方向示意',
      caption: '平面展示候选范围、两排座位与银幕方向，具体尺寸需复尺。'
    },
    section: {
      title: '剖面关系 · 红线为规划中的上层影院',
      src: './assets/section-diagram.svg',
      alt: '影院候选开间的平面与剖面关系示意',
      caption: '红线标出规划的上层影院范围，剖切线、梁位和尺寸待现场复核。'
    }
  };
  function openSource(name) {
    const view = sourceViews[name];
    $('#dialog-title').textContent = view.title;
    $('#dialog-image').src = view.src;
    $('#dialog-image').alt = view.alt;
    $('#dialog-caption').textContent = view.caption;
    $('#plan-dialog').showModal();
  }
  $('#open-plan').addEventListener('click', () => openSource('plan'));
  $('#open-section').addEventListener('click', () => openSource('section'));
  $('#close-plan').addEventListener('click', () => $('#plan-dialog').close());
  $('#plan-dialog').addEventListener('click', event => { if (event.target === $('#plan-dialog')) $('#plan-dialog').close(); });
}

function start() {
  // Keep the source links traceable in the model data and in the page.
  document.querySelector('.source-links a').href = sourceLinks.dolby;
  setDimensions(base, 'recommended'); setFrequency(42); bindUi(); renderSpeakerList();
  try { initScene(); } catch (error) { showFailure(error); }
}

window.addEventListener('error', event => { if (!renderer) showFailure(event.error || event.message); });
window.addEventListener('unhandledrejection', event => { if (!renderer) showFailure(event.reason); });
start();
