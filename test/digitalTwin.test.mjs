import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TWIN,
  cloneTwin,
  applyAction,
  evaluateSafety,
  planFromIntent,
  serializeTwinSnapshot,
  validateTwinSchema
} from '../src/digitalTwin.js';

test('sample twin schema defines assets, joints, sensors, actions, and agent roles', () => {
  const report = validateTwinSchema(DEFAULT_TWIN);
  assert.equal(report.valid, true, report.errors.join('\n'));
  assert.equal(DEFAULT_TWIN.name, 'Agentic Digital Twin');
  assert.ok(DEFAULT_TWIN.assets.some(asset => asset.kind === 'robot-arm'));
  assert.ok(DEFAULT_TWIN.actions.some(action => action.id === 'safe-fold'));
  assert.ok(DEFAULT_TWIN.agent.roles.includes('Planner'));
});

test('applyAction clamps joint state and records an auditable event', () => {
  const twin = cloneTwin(DEFAULT_TWIN);
  const updated = applyAction(twin, 'reach-fixture', { actor: 'test-agent' });
  const shoulder = updated.joints.find(joint => joint.id === 'shoulder');
  assert.equal(shoulder.target, 24);
  assert.equal(updated.events.at(-1).actionId, 'reach-fixture');
  assert.equal(updated.events.at(-1).actor, 'test-agent');
  assert.equal(updated.events.at(-1).status, 'applied');
});

test('evaluateSafety detects joint limit risk and healthy nominal state', () => {
  const healthy = evaluateSafety(DEFAULT_TWIN);
  assert.equal(healthy.level, 'nominal');

  const risky = cloneTwin(DEFAULT_TWIN);
  risky.joints.find(joint => joint.id === 'elbow').target = -999;
  const risk = evaluateSafety(risky);
  assert.equal(risk.level, 'blocked');
  assert.match(risk.messages.join(' '), /elbow/);
});

test('planFromIntent maps natural goals into ordered twin actions', () => {
  const inspect = planFromIntent('inspect the end effector and report vibration');
  assert.deepEqual(inspect.actionIds, ['inspection-pose', 'capture-telemetry']);
  assert.match(inspect.rationale, /inspect/i);

  const safe = planFromIntent('emergency stop and fold into safe home mode');
  assert.deepEqual(safe.actionIds, ['safe-fold']);
});

test('serializeTwinSnapshot returns portable JSON without private integration data', () => {
  const snapshot = serializeTwinSnapshot(DEFAULT_TWIN);
  const parsed = JSON.parse(snapshot);
  assert.equal(parsed.name, 'Agentic Digital Twin');
  assert.equal(parsed.metadata.source, 'open-demo');
  assert.doesNotMatch(snapshot, /gissing|private|token|secret|internal/i);
});
