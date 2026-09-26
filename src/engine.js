const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function key(src, dst) {
  return `${src}:${dst}`;
}

export class WorldAssemblyModel {
  constructor(options = {}) {
    this.config = {
      nodeCount: 49,
      topology: 'sparse',
      precision: 'float32',
      seed: 7,
      meanDegree: 4,
      transmission: 0.55,
      stateRetention: 0.93,
      historyRetention: 0.985,
      adaptation: 0.35,
      edgeAdaptation: 0.0,
      minPropagation: 0.002,
      channelDelay: 1,
      ...options,
    };

    this._validateConfig();
    this.reset();
  }

  _validateConfig() {
    const c = this.config;
    c.nodeCount = Math.max(2, Math.floor(c.nodeCount));
    c.meanDegree = Math.max(1, Math.floor(c.meanDegree));
    c.seed = Math.floor(c.seed) >>> 0;
    c.transmission = clamp(Number(c.transmission), 0, 1);
    c.stateRetention = clamp(Number(c.stateRetention), 0, 1);
    c.historyRetention = clamp(Number(c.historyRetention), 0, 1);
    c.adaptation = clamp(Number(c.adaptation), -0.95, 0.95);
    c.edgeAdaptation = clamp(Number(c.edgeAdaptation), -0.95, 0.95);
    c.minPropagation = Math.max(0, Number(c.minPropagation));
    c.channelDelay = Math.max(1, Math.floor(c.channelDelay));
  }

  reset() {
    const n = this.config.nodeCount;
    this.tick = 0;
    this.state = new Float32Array(n);
    this.history = new Float32Array(n);
    this.susceptibility = new Float32Array(n);
    this.susceptibility.fill(1);
    this.channels = [];
    this.outgoing = Array.from({ length: n }, () => []);
    this.queue = new Map();
    this.lastFlux = 0;
    this._buildTopology();
  }

  _addChannel(src, dst) {
    if (src === dst) return;
    const duplicate = this.outgoing[src].some((idx) => this.channels[idx].dst === dst);
    if (duplicate) return;
    const idx = this.channels.length;
    this.channels.push({
      src,
      dst,
      baseGain: 1,
      gain: 1,
      history: 0,
      lastFlux: 0,
    });
    this.outgoing[src].push(idx);
  }

  _addPair(a, b) {
    this._addChannel(a, b);
    this._addChannel(b, a);
  }

  _buildTopology() {
    const { topology, nodeCount: n } = this.config;
    if (topology === 'line') {
      for (let i = 0; i < n - 1; i++) this._addPair(i, i + 1);
      return;
    }
    if (topology === 'ring') {
      for (let i = 0; i < n; i++) this._addPair(i, (i + 1) % n);
      return;
    }
    if (topology === 'mesh' || topology === 'torus') {
      const side = Math.round(Math.sqrt(n));
      if (side * side !== n) {
        throw new Error(`${topology} requires nodeCount to be a perfect square`);
      }
      const id = (x, y) => y * side + x;
      const seen = new Set();
      const pair = (a, b) => {
        const k = a < b ? key(a, b) : key(b, a);
        if (seen.has(k)) return;
        seen.add(k);
        this._addPair(a, b);
      };
      for (let y = 0; y < side; y++) {
        for (let x = 0; x < side; x++) {
          if (x + 1 < side) pair(id(x, y), id(x + 1, y));
          else if (topology === 'torus') pair(id(x, y), id(0, y));
          if (y + 1 < side) pair(id(x, y), id(x, y + 1));
          else if (topology === 'torus') pair(id(x, y), id(x, 0));
        }
      }
      return;
    }

    // Sparse topology: the display has no computational geometry. The only
    // relations are these explicit message channels.
    const rand = mulberry32(this.config.seed);
    const targetPairs = Math.max(n - 1, Math.round((n * this.config.meanDegree) / 2));
    const pairs = new Set();

    // First ensure the substrate is connected without privileging a visible layout.
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (let i = 0; i < n - 1; i++) {
      const a = order[i];
      const b = order[i + 1];
      pairs.add(a < b ? key(a, b) : key(b, a));
    }

    while (pairs.size < targetPairs) {
      const a = Math.floor(rand() * n);
      let b = Math.floor(rand() * n);
      if (a === b) b = (b + 1) % n;
      pairs.add(a < b ? key(a, b) : key(b, a));
    }

    for (const pair of pairs) {
      const [a, b] = pair.split(':').map(Number);
      this._addPair(a, b);
    }
  }

  quantize(value) {
    const v = clamp(value, -1, 1);
    switch (this.config.precision) {
      case 'ternary':
        if (v > 1 / 3) return 1;
        if (v < -1 / 3) return -1;
        return 0;
      case '8bit':
        return Math.round(v * 127) / 127;
      case 'float32':
      default:
        return Math.fround(v);
    }
  }

  inject(node, amplitude = 1, delay = 0) {
    if (!Number.isInteger(node) || node < 0 || node >= this.config.nodeCount) {
      throw new Error(`Invalid node ${node}`);
    }
    this._schedule(this.tick + Math.max(0, Math.floor(delay)), {
      dst: node,
      value: this.quantize(amplitude),
      channel: -1,
    });
  }

  _schedule(atTick, event) {
    if (!this.queue.has(atTick)) this.queue.set(atTick, []);
    this.queue.get(atTick).push(event);
  }

  step() {
    const c = this.config;
    this.lastFlux = 0;

    for (let i = 0; i < this.state.length; i++) {
      this.state[i] = this.quantize(this.state[i] * c.stateRetention);
      this.history[i] = Math.fround(this.history[i] * c.historyRetention);
      this.susceptibility[i] = Math.fround(clamp(1 + c.adaptation * this.history[i], 0.05, 3));
    }
    for (const ch of this.channels) {
      ch.history *= c.historyRetention;
      ch.gain = clamp(ch.baseGain * (1 + c.edgeAdaption * ch.history), 0.05, 3);
      ch.lastFlux = 0;
    }

    const events = this.queue.get(this.tick) || [];
    this.queue.delete(this.tick);

    // Events are applied in deterministic arrival order. This is an explicit
    // scheduler choice, not a claim that biological or physical systems update so.
    for (const event of events) {
      const i = event.dst;
      const before = this.state[i];
      const proposed = before + event.value * this.susceptibility[i];
      const after = this.quantize(proposed);
      const delta = this.quantize(after - before);
      this.state[i] = after;
      this.history[i] = Math.fround(this.history[i] + Math.abs(delta));
      this.susceptibility[i] = Math.fround(clamp(1 + c.adaptation * this.history[i], 0.05, 3));

      if (event.channel >= 0) {
        const incoming = this.channels[event.channel];
        const flux = Math.abs(event.value);
        incoming.lastFlux += flux;
        incoming.history += flux * Math.abs(delta);
        this.lastFlux += flux;
      }

      if (Math.abs(delta) < c.minPropagation) continue;
      for (const channelIndex of this.outgoing[i]) {
        // Do not instantly echo a message back down the exact channel it arrived on.
        const incoming = event.channel >= 0 ? this.channels[event.channel] : null;
        const outChannel = this.channels[channelIndex];
        if (incoming && outChannel.dst === incoming.src) continue;
        const transmitted = this.quantize(delta * c.transmission * outChannel.gain);
        if (Math.abs(transmitted) < c.minPropagation) continue;
        this._schedule(this.tick + c.channelDelay, {
          dst: outChannel.dst,
          value: transmitted,
          channel: channelIndex,
        });
      }
    }

    this.tick += 1;
    return events.length;
  }

  run(steps = 1) {
    let processed = 0;
    for (let i = 0; i < steps; i++) processed += this.step();
    return processed;
  }

  pendingEvents() {
    let count = 0;
    for (const events of this.queue.values()) count += events.length;
    return count;
  }

  clone() {
    const copy = new WorldAssemblyModel({ ...this.config });
    copy.tick = this.tick;
    copy.state.set(this.state);
    copy.history.set(this.history);
    copy.susceptibility.set(this.susceptibility);
    for (let i = 0; i < this.channels.length; i++) {
      copy.channels[i].baseGain = this.channels[i].baseGain;
      copy.channels[i].gain = this.channels[i].gain;
      copy.channels[i].history = this.channels[i].history;
      copy.channels[i].lastFlux = this.channels[i].lastFlux;
    }
    copy.queue = new Map();
    for (const [tick, events] of this.queue.entries()) {
      copy.queue.set(tick, events.map((event) => ({ ...event })));
    }
    copy.lastFlux = this.lastFlux;
    return copy;
  }

  describeAssumptions() {
    return [
      `state precision: ${this.config.precision}`,
      `substrate channels: ${this.config.topology}`,
      `scheduler: deterministic event arrival`,
      `state retention: ${this.config.stateRetention.toFixed(3)}`,
      `history retention: ${this.config.historyRetention.toFixed(3)}`,
      `node adaptation: ${this.config.adaptation.toFixed(3)}`,
      `channel adaptation: ${this.config.edgeAdaptation.toFixed(3)}`,
      `transmission: ${this.config.transmission.toFixed(3)}`,
      `no reward, target, classifier, object labels, agent labels, or preferred outcome`,
    ];
  }
}
