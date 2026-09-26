# World Assembly Model

A minimal, browser-native research prototype for asking what relational organisation can arise when the developmental system is not given a target, reward, classifier, object ontology, agent ontology, or preferred topology.

The current prototype is deliberately small. It is not a claim that `Float32`, a graph, a ring, a torus, or any other supplied substrate is fundamental. It is a workbench for varying those assumptions and measuring what survives.

## Core framing

The model does **not** attempt to reconstruct a presumed external world inside an internal representation.

Instead, a computational world is treated as whatever relational structure becomes available through:

1. perturbation,
2. explicit channels by which one state can alter another,
3. retained consequences of prior interaction,
4. changes in later susceptibility to otherwise comparable perturbations.

Relations are therefore *enacted* by channels, not merely labelled in an all-to-all relation matrix.

## Substrate-first rule

A difference exists only where the chosen substrate affords a differentiable state. A relation exists only where the chosen substrate affords a channel by which one state can alter another.

The browser prototype currently makes its substrate assumptions explicit:

- 49 state-bearing units;
- Float32, quantised signed 8-bit, or ternary state precision;
- deterministic event-arrival scheduling;
- explicit directed message channels;
- configurable state retention and interaction-history retention;
- optional signed adaptation of node susceptibility and channel gain;
- fixed one-tick channel delay.

These are experimental conditions, not hidden ontological claims.

## Why several topologies are included

`Sparse`, `line`, `ring`, `mesh`, and `torus` are **comparison conditions**. The torus is no longer privileged as the baseline architecture. If toroidal or other recurrent organisation matters, it should earn that status through comparative results rather than being guaranteed by construction.

In `sparse` mode, node positions on screen are visual only. The simulation uses only the explicit message channels.

## Developmental process

There is no training objective.

A perturbation changes a local state. Only an actual state change can propagate through an available channel. Interaction history can persist longer than immediate state and, when adaptation is non-zero, can alter the effect of later perturbations.

Positive and negative adaptation are both available. The interface does not treat sensitisation or habituation as the correct direction in advance.

## Observer-side measurements

Measurements do not feed back into development.

The first two perturbational measures are:

### Causal impact

Fork the same present state into two copies. Perturb one copy and leave the other untouched. The divergence over subsequent steps estimates whether that difference persisted and propagated through the substrate.

### Susceptibility shift

From the same starting state, first measure the effect of a probe. In another branch, apply an earlier conditioning perturbation, allow immediate activity to settle, and apply the same probe. The difference between those probe effects asks whether prior difference altered later susceptibility to difference.

These are deliberately structural descriptions. They are not pre-labelled as awareness, agency, learning, memory, or intelligence.

## Running

No build system or third-party JavaScript package is required.

Serve the repository directory with any local static server, for example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Tests

The engine has dependency-free Node tests:

```bash
npm test
```

The tests currently verify explicit-channel propagation, deterministic substrate cloning, finite-precision behaviour, perturbational causal measurement, and history-dependent susceptibility.

## Next experiments

The highest-value next step is **not** to add language, vision, reward, or a task. It is to vary the substrate and local law systematically while keeping the perturbational measurements fixed.

Immediate comparisons should include:

- Float32 vs quantised vs ternary state spaces;
- synchronous versus event-arrival scheduling;
- fixed versus rewritable channel structures;
- sensitising, neutral, and habituating history dependence;
- line, ring, mesh, torus, sparse graph, and non-geometric routing substrates;
- matched perturbations across those conditions;
- external measurement of persistence, propagation, susceptibility change, directed influence, closure, and trajectory topology.

A later version should add topology analysis such as persistent homology **as an observer-side measurement**, not as a developmental target.
