import { DEFAULT_TWIN, applyAction, cloneTwin, evaluateSafety, planFromIntent, runPlan, serializeTwinSnapshot, summarizeTwin } from './digitalTwin.js';
import { createRobotArmScene } from './robotArmScene.js';
import './styles.css';

let twin = cloneTwin(DEFAULT_TWIN);
const sceneMount = document.querySelector('[data-scene]');
const jointPanel = document.querySelector('[data-joints]');
const sensorPanel = document.querySelector('[data-sensors]');
const eventPanel = document.querySelector('[data-events]');
const planOutput = document.querySelector('[data-plan-output]');
const safetyBadge = document.querySelector('[data-safety]');
const intentInput = document.querySelector('#intent');
const snapshotOutput = document.querySelector('[data-snapshot]');
const actionButtons = [...document.querySelectorAll('[data-action]')];
const animateButton = document.querySelector('[data-animate]');
const planButton = document.querySelector('[data-plan]');
const resetButton = document.querySelector('[data-reset]');

const scene = createRobotArmScene(sceneMount, twin);
let autoAnimate = false;

function targetsFromTwin() {
  return Object.fromEntries(twin.joints.map(joint => [joint.id, joint.target]));
}

function render() {
  scene.setTargets(targetsFromTwin());
  const safety = evaluateSafety(twin);
  safetyBadge.textContent = safety.level === 'nominal' ? 'NOMINAL' : 'BLOCKED';
  safetyBadge.dataset.level = safety.level;
  jointPanel.innerHTML = twin.joints.map(joint => `
    <label class="joint-row">
      <span>${joint.label}</span>
      <output>${Math.round(joint.target)}${joint.unit}</output>
      <input type="range" min="${joint.min}" max="${joint.max}" value="${joint.target}" data-joint="${joint.id}" />
    </label>
  `).join('');
  sensorPanel.innerHTML = twin.sensors.map(sensor => `
    <li><span>${sensor.label}</span><strong>${sensor.value}${sensor.unit}</strong></li>
  `).join('');
  eventPanel.innerHTML = twin.events.slice(-5).reverse().map(event => `
    <li><code>${event.actionId}</code><span>${event.actor}</span><small>${event.status}</small></li>
  `).join('');
  const summary = summarizeTwin(twin);
  snapshotOutput.textContent = JSON.stringify(summary, null, 2);
  jointPanel.querySelectorAll('[data-joint]').forEach(input => {
    input.addEventListener('input', () => {
      const joint = twin.joints.find(item => item.id === input.dataset.joint);
      joint.target = Number(input.value);
      render();
    }, { once: true });
  });
}

actionButtons.forEach(button => {
  button.addEventListener('click', () => {
    twin = applyAction(twin, button.dataset.action, { actor: 'human-operator' });
    planOutput.textContent = `Applied action: ${button.dataset.action}`;
    render();
  });
});

animateButton.addEventListener('click', () => {
  autoAnimate = !autoAnimate;
  scene.setAutoAnimate(autoAnimate);
  animateButton.classList.toggle('is-running', autoAnimate);
  animateButton.textContent = autoAnimate ? 'Stop animation' : 'Auto animate';
});

planButton.addEventListener('click', () => {
  const plan = planFromIntent(intentInput.value);
  twin = runPlan(twin, plan, { actor: 'agent-planner' });
  planOutput.textContent = `${plan.rationale}\nActions: ${plan.actionIds.join(' → ')}`;
  render();
});

resetButton.addEventListener('click', () => {
  twin = cloneTwin(DEFAULT_TWIN);
  planOutput.textContent = 'Twin reset to open demo baseline.';
  render();
});

document.querySelector('[data-copy-snapshot]').addEventListener('click', async () => {
  await navigator.clipboard.writeText(serializeTwinSnapshot(twin));
  planOutput.textContent = 'Full twin JSON snapshot copied to clipboard.';
});

render();
window.addEventListener('beforeunload', () => scene.dispose());
