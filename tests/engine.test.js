import assert from 'node:assert/strict';
import { WorldAssemblyModel } from '../src/engine.js';
import { causalImpact, conditionedProbe } from '../src/metrics.js';

{
  const model = new WorldAssemblyModel({ nodeCount: 5, topology: 'line', adaptation: 0, edgeAdaptation: 0 });
  assert.equal(model.channels.length, 8, 'line should create two directed channels per adjacent pair');
}

{
  const model = new WorldAssemblyModel({
    nodeCount: 3,
    topology: 'line',
    precision: 'float32',
    transmission: 0.5,
    stateRetention: 1,
    historyRetention: 1,
    adaptation: 0,
    edgeAdaptation: 0,
    minPropagation: 0,
  });
  model.inject(0, 1);
  model.step();
  assert.equal(model.state[0], 1);
  assert.equal(model.state[1], 0);
  model.step();
  assert(Math.abs(model.state[1] - 0.5) < 1e-6, 'effect should travel through an explicit channel');
  assert.equal(model.state[2], 0);
  model.step();
  assert(Math.abs(model.state[2] - 0.25) < 1e-6, 'effect should reach the next channel one delay later');
}

{
  const model = new WorldAssemblyModel({ nodeCount: 9, topology: 'sparse', seed: 42 });
  const clone = model.clone();
  assert.deepEqual(
    clone.channels.map(({ src, dst }) => [src, dst]),
    model.channels.map(({ src, dst }) => [src, dst]),
    'forks must preserve substrate channels exactly',
  );
  model.inject(0, 0.7);
  const impact = causalImpact(model, 0, 0.7, 10);
  assert(impact.area > 0, 'a perturbation should create a measurable counterfactual difference');
}

{
  const model = new WorldAssemblyModel({ precision: 'ternary', nodeCount: 4, topology: 'line' });
  assert.equal(model.quantize(0.2), 0);
  assert.equal(model.quantize(0.6), 1);
  assert.equal(model.quantize(-0.7), -1);
}

{
  const model = new WorldAssemblyModel({
    nodeCount: 5,
    topology: 'line',
    transmission: 0.4,
    stateRetention: 0.2,
    historyRetention: 0.999,
    adaptation: 0.55,
    edgeAdaptation: 0,
  });
  const result = conditionedProbe(model, {
    conditionNode: 0,
    probeNode: 0,
    conditionSteps: 4,
    settleSteps: 8,
    horizon: 8,
  });
  assert(result.after.area > result.baseline.area, 'retained history should be able to alter later susceptibility');
}

console.log('WAM engine tests passed');
