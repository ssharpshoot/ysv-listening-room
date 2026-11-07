// Concept-only rigid rectangular room model. Values are relative; no wall loss, EQ, speaker response or measured data.
export const SOUND_SPEED = 343;
const Q = 8;

export function calculateModes({ length, width, height }, maxHz = 140) {
  const result = [];
  for (let nx = 0; nx <= 5; nx++) {
    for (let ny = 0; ny <= 6; ny++) {
      for (let nz = 0; nz <= 3; nz++) {
        if (nx + ny + nz === 0) continue;
        const hz = (SOUND_SPEED / 2) * Math.hypot(nx / width, ny / length, nz / height);
        if (hz > maxHz) continue;
        const order = (nx > 0) + (ny > 0) + (nz > 0);
        result.push({ nx, ny, nz, hz, kind: order === 1 ? '轴向' : order === 2 ? '切向' : '斜向', weight: 1 / Math.sqrt(nx * nx + ny * ny + nz * nz) });
      }
    }
  }
  return result.sort((a, b) => a.hz - b.hz);
}

function modalShape(mode, point, dims) {
  return Math.cos(mode.nx * Math.PI * point.x / dims.width) *
    Math.cos(mode.ny * Math.PI * point.y / dims.length) *
    Math.cos(mode.nz * Math.PI * point.z / dims.height);
}

export function responseDb(dims, modes, hz, point, layout = 'dual') {
  if (layout !== 'single' && layout !== 'dual' && layout !== 'quad') throw new Error(`Unknown subwoofer layout: ${layout}`);
  const first = { x: dims.width * .5, y: dims.length * (.54 / 6.2), z: .38 };
  const second = { x: dims.width * .5, y: dims.length * (5.65 / 6.2), z: .38 };
  const third = { x: dims.width * (.55 / 5.3), y: dims.length * .5, z: .38 };
  const fourth = { x: dims.width * (1 - .55 / 5.3), y: dims.length * .5, z: .38 };
  let real = 1;
  let imaginary = 0;
  for (const mode of modes) {
    // Divide by source count: compare the spatial pattern at equal nominal total input.
    let source = modalShape(mode, first, dims);
    if (layout !== 'single') source += modalShape(mode, second, dims);
    if (layout === 'quad') source += modalShape(mode, third, dims) + modalShape(mode, fourth, dims);
    source /= layout === 'single' ? 1 : layout === 'dual' ? 2 : 4;
    if (Math.abs(source) < .0001) continue;
    const receiver = modalShape(mode, point, dims);
    const ratio = hz / mode.hz;
    const detune = 1 - ratio * ratio;
    const damping = ratio / Q;
    const scale = mode.weight * source * receiver / (detune * detune + damping * damping);
    real += scale * detune;
    imaginary -= scale * damping;
  }
  return 20 * Math.log10(Math.max(.025, Math.hypot(real, imaginary)));
}

export function heatmap(dims, modes, hz, columns = 60, rows = 70, layout = 'dual') {
  const values = new Float32Array(columns * rows);
  let index = 0;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      // Canvas top maps to the screen wall; Three.js room x is mirrored relative to engineering x.
      values[index++] = responseDb(dims, modes, hz, {
        x: dims.width * (1 - (column + .5) / columns),
        y: dims.length * ((row + .5) / rows),
        z: 1.2
      }, layout);
    }
  }
  const sorted = [...values].sort((a, b) => a - b);
  return { values, columns, rows, low: sorted[Math.floor(sorted.length * .1)], high: sorted[Math.floor(sorted.length * .9)] };
}

function variance(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

export function compareSubLayouts(dims, modes, seatPlan, selectedHz) {
  if (!seatPlan) return null;
  const points = [seatPlan.front, seatPlan.rear].flatMap((depth, row) =>
    [-.9, 0, .9].map(offset => ({ x: dims.width / 2 + offset, y: depth, z: row === 0 ? 1.1 : 1.3 })));
  const spreadAt = (hz, layout) => Math.sqrt(variance(points.map(point => responseDb(dims, modes, hz, point, layout))));
  const frequencies = Array.from({ length: 31 }, (_, index) => 30 + index * 3);
  const curves = Object.fromEntries(['single', 'dual', 'quad'].map(layout => [layout, frequencies.map(hz => spreadAt(hz, layout))]));
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    frequencies,
    ...Object.fromEntries(['single', 'dual', 'quad'].flatMap(layout => [
      [layout, curves[layout]], [`${layout}Mean`, mean(curves[layout])], [`selected${layout[0].toUpperCase()}${layout.slice(1)}`, spreadAt(selectedHz, layout)]
    ]))
  };
}

export function recommendSeats(dims, modes, screenWidth = 2.8) {
  const gapOptions = [1.35, 1.45, 1.55];
  const firstMin = Math.max(2.65, dims.length * .4);
  const firstMax = Math.min(3.35, dims.length - 1.35 - 1.18);
  let best = null;
  for (let first = firstMin; first <= firstMax + .001; first += .12) {
    for (const gap of gapOptions) {
      const rear = first + gap;
      if (dims.length - rear < 1.18) continue;
      const points = [first, rear].flatMap((depth, row) => [-.9, 0, .9].map(x => ({ x: dims.width / 2 + x, y: depth, z: row === 0 ? 1.1 : 1.3 })));
      const seatResponses = points.map(() => []);
      let acrossSeats = 0;
      let sampleCount = 0;
      for (let hz = 30; hz <= 120; hz += 6) {
        const atFrequency = points.map((point, index) => {
          const db = responseDb(dims, modes, hz, point);
          seatResponses[index].push(db);
          return db;
        });
        acrossSeats += variance(atFrequency);
        sampleCount++;
      }
      const spectral = seatResponses.reduce((sum, values) => sum + variance(values), 0) / points.length;
      const frontAngle = 2 * Math.atan(screenWidth / (2 * Math.max(.5, first - .28))) * 180 / Math.PI;
      const rearAngle = 2 * Math.atan(screenWidth / (2 * Math.max(.5, rear - .28))) * 180 / Math.PI;
      const viewPenalty = ((frontAngle - 50) / 13) ** 2 + ((rearAngle - 38) / 12) ** 2;
      const rearPenalty = 2 / Math.max(.25, dims.length - rear - 1);
      const score = .38 * acrossSeats / sampleCount + .08 * spectral + 4 * viewPenalty + rearPenalty;
      if (!best || score < best.score) best = { front: first, rear, gap, score, frontAngle, rearAngle };
    }
  }
  if (!best) return null;
  return {
    ...best,
    frontRange: [Math.max(firstMin, best.front - .18), Math.min(firstMax, best.front + .18)],
    rearClearance: dims.length - best.rear,
    sideClearance: dims.width / 2 - .9,
    method: '双低音假设 + 30–120 Hz 相对响应一致性 + 两排观看角度及后墙距离的多目标搜索'
  };
}
