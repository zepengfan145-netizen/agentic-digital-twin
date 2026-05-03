const ISO_EPOCH = '2026-01-01T00:00:00.000Z';

export const DEFAULT_TWIN = Object.freeze({
  name: 'Agentic Digital Twin',
  version: '0.1.0',
  metadata: {
    source: 'open-demo',
    domain: 'robotic-workcell',
    license: 'MIT',
    description: 'A browser-based robotic arm digital twin with an agent action loop.'
  },
  assets: [
    {
      id: 'arm-01',
      kind: 'robot-arm',
      label: '6-axis robotic arm',
      location: 'demo-cell-a',
      capabilities: ['reach', 'fold', 'inspect', 'telemetry-capture'],
      safetyZone: 'green-cage'
    },
    {
      id: 'fixture-01',
      kind: 'assembly-fixture',
      label: 'Inspection fixture',
      location: 'demo-cell-a',
      capabilities: ['hold-part', 'visual-reference']
    }
  ],
  joints: [
    { id: 'base', label: 'Base yaw', value: 18, target: 18, min: -95, max: 95, unit: 'deg' },
    { id: 'shoulder', label: 'Shoulder pitch', value: 34, target: 34, min: 10, max: 78, unit: 'deg' },
    { id: 'elbow', label: 'Elbow fold', value: -62, target: -62, min: -104, max: -18, unit: 'deg' },
    { id: 'wrist', label: 'Wrist pitch', value: -14, target: -14, min: -55, max: 42, unit: 'deg' },
    { id: 'gripper', label: 'Gripper aperture', value: 22, target: 22, min: 2, max: 42, unit: 'deg' }
  ],
  sensors: [
    { id: 'load', label: 'End-effector load', value: 1.8, unit: 'kg', nominal: [0, 3.2] },
    { id: 'vibration', label: 'Joint vibration', value: 0.12, unit: 'mm/s', nominal: [0, 0.35] },
    { id: 'temperature', label: 'Servo temperature', value: 41, unit: '°C', nominal: [18, 68] }
  ],
  actions: [
    {
      id: 'inspection-pose',
      label: 'Inspection pose',
      description: 'Move the arm into a stable pose for camera or human inspection.',
      patch: { base: 12, shoulder: 38, elbow: -68, wrist: -18, gripper: 18 },
      preconditions: ['safety-zone-clear']
    },
    {
      id: 'reach-fixture',
      label: 'Reach fixture',
      description: 'Reach toward the fixture while keeping the elbow inside the safe envelope.',
      patch: { base: 78, shoulder: 24, elbow: -34, wrist: 10, gripper: 10 },
      preconditions: ['fixture-ready', 'safety-zone-clear']
    },
    {
      id: 'safe-fold',
      label: 'Fold to safe home',
      description: 'Fold the arm into a compact low-risk home posture.',
      patch: { base: -24, shoulder: 64, elbow: -96, wrist: -36, gripper: 36 },
      preconditions: []
    },
    {
      id: 'capture-telemetry',
      label: 'Capture telemetry',
      description: 'Record load, vibration, and temperature without moving the robot.',
      patch: {},
      preconditions: []
    }
  ],
  agent: {
    roles: ['Planner', 'Simulator', 'SafetyChecker', 'Operator'],
    loop: ['sense', 'plan', 'simulate', 'gate', 'apply', 'audit'],
    policy: 'All action proposals must pass joint limits and sensor nominal checks before application.'
  },
  events: [
    { id: 'evt-demo-ready', at: ISO_EPOCH, actor: 'system', actionId: 'boot', status: 'applied', note: 'Open demo twin initialized.' }
  ]
});

export function cloneTwin(twin = DEFAULT_TWIN) {
  return JSON.parse(JSON.stringify(twin));
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

export function validateTwinSchema(twin) {
  const errors = [];
  if (!twin || typeof twin !== 'object') errors.push('twin must be an object');
  if (!twin?.name) errors.push('name is required');
  for (const key of ['assets', 'joints', 'sensors', 'actions', 'events']) {
    if (!Array.isArray(twin?.[key])) errors.push(`${key} must be an array`);
  }
  if (!twin?.agent || !Array.isArray(twin.agent.roles) || !Array.isArray(twin.agent.loop)) {
    errors.push('agent roles and loop are required');
  }
  const jointIds = new Set();
  for (const joint of twin?.joints || []) {
    if (!joint.id) errors.push('joint id is required');
    if (jointIds.has(joint.id)) errors.push(`duplicate joint ${joint.id}`);
    jointIds.add(joint.id);
    if (!(Number.isFinite(joint.min) && Number.isFinite(joint.max) && joint.min < joint.max)) {
      errors.push(`joint ${joint.id} must have valid min/max`);
    }
  }
  for (const action of twin?.actions || []) {
    if (!action.id) errors.push('action id is required');
    for (const jointId of Object.keys(action.patch || {})) {
      if (!jointIds.has(jointId)) errors.push(`action ${action.id} references unknown joint ${jointId}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function evaluateSafety(twin) {
  const messages = [];
  for (const joint of twin.joints || []) {
    const target = Number(joint.target ?? joint.value);
    if (target < joint.min || target > joint.max) {
      messages.push(`${joint.id} target ${target}${joint.unit || ''} exceeds [${joint.min}, ${joint.max}]`);
    }
  }
  for (const sensor of twin.sensors || []) {
    if (!Array.isArray(sensor.nominal)) continue;
    const [min, max] = sensor.nominal;
    if (sensor.value < min || sensor.value > max) {
      messages.push(`${sensor.id} sensor ${sensor.value}${sensor.unit || ''} outside nominal [${min}, ${max}]`);
    }
  }
  return {
    level: messages.length ? 'blocked' : 'nominal',
    messages: messages.length ? messages : ['All joint targets and sensors are inside the demo envelope.']
  };
}

export function applyAction(twin, actionId, options = {}) {
  const next = cloneTwin(twin);
  const action = next.actions.find(item => item.id === actionId);
  if (!action) throw new Error(`Unknown action: ${actionId}`);

  const patch = action.patch || {};
  for (const joint of next.joints) {
    if (Object.prototype.hasOwnProperty.call(patch, joint.id)) {
      joint.target = clamp(patch[joint.id], joint.min, joint.max);
    }
  }
  const safety = evaluateSafety(next);
  next.events.push({
    id: `evt-${next.events.length + 1}`,
    at: options.at || new Date().toISOString(),
    actor: options.actor || 'agent',
    actionId,
    status: safety.level === 'nominal' ? 'applied' : 'blocked',
    note: safety.messages.join(' ')
  });
  return next;
}

export function planFromIntent(intent = '') {
  const value = String(intent).toLowerCase();
  if (/emergency|stop|safe|fold|home/.test(value)) {
    return { actionIds: ['safe-fold'], rationale: 'Safety intent detected; fold into a compact home posture first.' };
  }
  if (/inspect|camera|vision|vibration|telemetry|report/.test(value)) {
    return { actionIds: ['inspection-pose', 'capture-telemetry'], rationale: 'Inspection intent detected; move to inspection pose and capture telemetry.' };
  }
  if (/reach|fixture|assembly|pick|place/.test(value)) {
    return { actionIds: ['reach-fixture', 'capture-telemetry'], rationale: 'Fixture intent detected; reach target and then verify state.' };
  }
  return { actionIds: ['inspection-pose'], rationale: 'Default demo intent; choose a visible inspection posture.' };
}

export function runPlan(twin, plan, options = {}) {
  return plan.actionIds.reduce((state, actionId) => applyAction(state, actionId, options), twin);
}

export function serializeTwinSnapshot(twin) {
  const copy = cloneTwin(twin);
  return JSON.stringify(copy, null, 2);
}

export function summarizeTwin(twin) {
  const safety = evaluateSafety(twin);
  return {
    name: twin.name,
    assets: twin.assets.length,
    joints: Object.fromEntries(twin.joints.map(joint => [joint.id, joint.target])),
    safety: safety.level,
    latestEvent: twin.events.at(-1)
  };
}
