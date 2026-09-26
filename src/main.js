import { WorldAssemblyModel, mulberry32 } from './engine.js';
import { causalImpact, conditionedProbe, summaryMetrics } from './metrics.js';

const $ = (id) => document.getElementById(id);
const canvas = $('field');
const ctx = canvas.getContext('2d');

const controls = {
  topology: $('topology'),
  precision: $('precision'),
  transmission: $('transmission'),
  stateRetention: $('stateRetention'),
  historyRetention: $('historyRetention'),
  adaptation: $('adaptation'),
  edgeAdaptation: $('edgeAdaptation'),
  speed: $('speed'),
  ambient: $('ambient'),
  conditionNode: $('conditionNode'),
  probeNode: $('probeNode'),
};

const valueLabels = {
  transmission: $('transmissionValue'),
  stateRetention: $('stateRetentionValue'),
  historyRetention: $('historyRetentionValue'),
  adaptation: $('adaptationValue'),
  edgeAdaptation: $('edgeAdaptationValue'),
  speed: $('speedValue'),
};

let model;
let selected = 0;
let running = true;
let positions = [];
let lastProbe = null;
let lastConditioned = null;
let ambientCounter = 0;

function configFromUI() {
  return {
    nodeCount: 49,
    topology: controls.topology.value,
    precision: controls.precision.value,
    seed: 7,
    meanDegree: 4,
    transmission: Number(controls.transmission.value),
    stateRetention: Number(controls.stateRetention.value),
    historyRetention: Number(controls.historyRetention.value),
    adaptation: Number(controls.adaptation.value),
    edgeAdaptation: Number(controls.edgeAdaptation.value),
    minPropagation: controls.precision.value === 'ternary' ? 0 : 0.002,
    channelDelay: 1,
  };
}

function resetModel() {
  model = new WorldAssemblyModel(configFromUI());
  selected = Math.min(selected, model.config.nodeCount - 1);
  controls.conditionNode.max = model.config.nodeCount - 1;
  controls.probeNode.max = model.config.nodeCount - 1;
  controls.conditionNode.value = Math.min(Number(controls.conditionNode.value), model.config.nodeCount - 1);
  controls.probeNode.value = Math.min(Number(controls.probeNode.value), model.config.nodeCount - 1);
  lastProbe = null;
  lastConditioned = null;
  ambientCounter = 0;
  makePositions();
  updateAssumptionLedger();
  updateMetrics();
}

function makePositions() {
  const n = model.config.nodeCount;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const pad = 42;
  positions = [];

  if (model.config.topology === 'mesh' || model.config.topology === 'torus') {
    const side = Math.round(Math.sqrt(n));
    for (let i = 0; i < n; i++) {
      const x = i % side;
      const y = Math.floor(i / side);
      positions.push({
        x: pad + (x / (side - 1)) * (w - pad * 2),
        y: pad + (y / (side - 1)) * (h - pad * 2),
      });
    }
    return;
  }

  if (model.config.topology === 'line') {
    for (let i = 0; i < n; i++) {
      positions.push({
        x: pad + (i / (n - 1)) * (w - pad * 2),
        y: h / 2 + Math.sin(i * 0.9) * 28,
      });
    }
    return;
  }

  const rand = mulberry32(941);
  const radius = Math.min(w, h) * 0.39;
  const cx = w / 2;
  const cy = h / 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const jitter = model.config.topology === 'sparse' ? (rand() - 0.5) * 42 : 0;
    positions.push({
      x: cx + Math.cos(a) * (radius + jitter),
      y: cy + Math.sin(a) * (radius + jitter),
    });
  }
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (model) makePositions();
}

function stateColour(v) {
  const x = Math.max(-1, Math.min(1, v));
  if (x >= 0) {
    const p = Math.round(52 + x * 170);
    return `rgb(${p}, ${Math.round(92 + x * 90)}, ${Math.round(128 + x * 90)})`;
  }
  const a = Math.abs(x);
  return `rgb(${Math.round(76 + a * 116)}, ${Math.round(86 + a * 28)}, ${Math.round(130 + a * 40)})`;
}

function draw() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#080b10';
  ctx.fillRect(0, 0, w, h);

  ctx.lineWidth = 1;
  for (const ch of model.channels) {
    if (ch.src > ch.dst) continue; // draw each bidirectional substrate link once
    const a = positions[ch.src];
    const b = positions[ch.dst];
    const flux = Math.min(1, ch.lastFlux * 2.5);
    ctx.strokeStyle = `rgba(150, 171, 195, ${0.10 + flux * 0.65})`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (let i = 0; i < model.config.nodeCount; i++) {
    const p = positions[i];
    const r = 5.5 + Math.min(5, Math.abs(model.susceptibility[i] - 1) * 6);
    ctx.fillStyle = stateColour(model.state[i]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();

    if (i === selected) {
      ctx.strokeStyle = '#f3f6fa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }
}

function updateValueLabels() {
  for (const [key, el] of Object.entries(valueLabels)) {
    const value = Number(controls[key].value);
    el.textContent = key === 'speed' ? `${value}×` : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  }
}

function updateAssumptionLedger() {
  $('assumptions').innerHTML = model.describeAssumptions().map((x) => `<li>${x}</li>`).join('');
  $('topologyNote').textContent = model.config.topology === 'sparse'
    ? 'Node positions are visual only. Dynamics use only the explicit message channels.'
    : 'The selected channel structure is an imposed substrate condition for comparison, not a discovered topology.';
}

function fmt(v, digits = 4) {
  return Number.isFinite(v) ? v.toFixed(digits) : '—';
}

function updateMetrics() {
  const m = summaryMetrics(model);
  $('tickMetric').textContent = model.tick;
  $('eventsMetric').textContent = m.pendingEvents;
  $('activityMetric').textContent = fmt(m.activity);
  $('historyMetric').textContent = fmt(m.history);
  $('susMetric').textContent = fmt(m.meanSusceptibility);
  $('fluxMetric').textContent = fmt(m.lastFlux);

  $('causalAreaMetric').textContent = lastProbe ? fmt(lastProbe.area) : '—';
  $('reachMetric').textContent = lastProbe ? `${Math.round(lastProbe.reachFraction * 100)}%` : '—';
  $('shiftMetric').textContent = lastConditioned ? fmt(lastConditioned.susceptibilityShift) : '—';
  $('relativeShiftMetric').textContent = lastConditioned ? `${fmt(lastConditioned.relativeShift * 100, 2)}%` : '—';
}

function pulse(amplitude) {
  model.inject(selected, amplitude);
  updateMetrics();
}

function runProbe() {
  const probeNode = Number(controls.probeNode.value);
  lastProbe = causalImpact(model, probeNode, 0.65, 24);
  lastConditioned = conditionedProbe(model, {
    conditionNode: Number(controls.conditionNode.value),
    probeNode,
    conditionAmplitude: 0.8,
    probeAmplitude: 0.65,
    conditionSteps: 6,
    settleSteps: 8,
    horizon: 24,
  });
  updateMetrics();
}

canvas.addEventListener('click', (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  let best = 0;
  let bestDist = Infinity;
  positions.forEach((p, i) => {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  selected = best;
  controls.probeNode.value = best;
  $('selectedNode').textContent = best;
});

$('pulsePositive').addEventListener('click', () => pulse(0.8));
$('pulseNegative').addEventListener('click', () => pulse(-0.8));
$('runProbe').addEventListener('click', runProbe);
$('reset').addEventListener('click', resetModel);
$('pause').addEventListener('click', () => {
  running = !running;
  $('pause').textContent = running ? 'Pause' : 'Run';
});

for (const key of ['topology', 'precision']) {
  controls[key].addEventListener('change', resetModel);
}
for (const key of ['transmission', 'stateRetention', 'historyRetention', 'adaptation', 'edgeAdaptation']) {
  controls[key].addEventListener('input', () => {
    updateValueLabels();
    resetModel();
  });
}
controls.speed.addEventListener('input', updateValueLabels);

function animate() {
  if (running) {
    const steps = Number(controls.speed.value);
    for (let i = 0; i < steps; i++) {
      if (controls.ambient.checked) {
        ambientCounter += 1;
        if (ambientCounter % 35 === 0) {
          const node = Math.floor(ambientCounter / 35) % model.config.nodeCount;
          const sign = Math.floor(ambientCounter / 35) % 2 === 0 ? 0.55 : -0.55;
          model.inject(node, sign);
        }
      }
      model.step();
    }
  }
  draw();
  updateMetrics();
  requestAnimationFrame(animate);
}

window.addEventListener('resize', resize);
updateValueLabels();
resetModel();
resize();
animate();
