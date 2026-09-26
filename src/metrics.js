const meanAbs = (arr) => {
  let total = 0;
  for (const v of arr) total += Math.abs(v);
  return total / arr.length;
};

export function stateDistance(a, b) {
  if (a.length !== b.length) throw new Error('State vectors differ in length');
  let total = 0;
  for (let i = 0; i < a.length; i++) total += Math.abs(a[i] - b[i]);
  return total / a.length;
}

export function causalImpact(model, node, amplitude = 0.75, horizon = 20, threshold = 0.01) {
  const baseline = model.clone();
  const perturbed = model.clone();
  perturbed.inject(node, amplitude);

  let area = 0;
  let peak = 0;
  let final = 0;
  const maxByNode = new Float32Array(model.config.nodeCount);

  for (let t = 0; t < horizon; t++) {
    baseline.step();
    perturbed.step();
    final = stateDistance(baseline.state, perturbed.state);
    area += final;
    peak = Math.max(peak, final);
    for (let i = 0; i < maxByNode.length; i++) {
      const d = Math.abs(baseline.state[i] - perturbed.state[i]);
      if (d > maxByNode[i]) maxByNode[i] = d;
    }
  }

  let reached = 0;
  for (const d of maxByNode) if (d >= threshold) reached += 1;

  return {
    area,
    peak,
    final,
    reached,
    reachFraction: reached / maxByNode.length,
    maxByNode,
  };
}

export function conditionedProbe(
  model,
  {
    conditionNode = 1,
    probeNode = 0,
    conditionAmplitude = 0.8,
    probeAmplitude = 0.65,
    conditionSteps = 6,
    settleSteps = 8,
    horizon = 20,
  } = {},
) {
  const baseline = causalImpact(model, probeNode, probeAmplitude, horizon);

  const conditioned = model.clone();
  conditioned.inject(conditionNode, conditionAmplitude);
  conditioned.run(conditionSteps);
  conditioned.run(settleSteps);
  const after = causalImpact(conditioned, probeNode, probeAmplitude, horizon);

  return {
    baseline,
    after,
    susceptibilityShift: after.area - baseline.area,
    relativeShift: baseline.area === 0 ? 0 : (after.area - baseline.area) / baseline.area,
  };
}

export function summaryMetrics(model) {
  return {
    activity: meanAbs(model.state),
    history: meanAbs(model.history),
    meanSusceptibility: model.susceptibility.reduce((a, b) => a + b, 0) / model.susceptibility.length,
    pendingEvents: model.pendingEvents(),
    lastFlux: model.lastFlux,
  };
}
