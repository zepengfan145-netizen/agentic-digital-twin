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
const cadAssetPanel = document.querySelector('[data-cad-assets]');
const assetUploadForm = document.querySelector('[data-asset-upload]');
const actionButtons = [...document.querySelectorAll('[data-action]')];
const animateButton = document.querySelector('[data-animate]');
const planButton = document.querySelector('[data-plan]');
const resetButton = document.querySelector('[data-reset]');

const scene = createRobotArmScene(sceneMount, twin);
let autoAnimate = false;
const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';

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

function assetUrl(asset) {
  if (!asset.convertedFilePath) return null;
  if (/^https?:\/\//.test(asset.convertedFilePath)) return asset.convertedFilePath;
  return `${API_BASE}${asset.convertedFilePath}`;
}

function originalAssetUrl(asset) {
  if (!asset.originalFilePath) return null;
  if (/^https?:\/\//.test(asset.originalFilePath)) return asset.originalFilePath;
  return `${API_BASE}${asset.originalFilePath}`;
}

function cadViewerUrl(asset) {
  const params = new URLSearchParams({
    url: originalAssetUrl(asset),
    name: asset.name
  });
  return `/cad-viewer.html?${params.toString()}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

async function loadCadAssets() {
  try {
    const assets = await fetch(`${API_BASE}/api/cad-assets`).then(response => {
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      return response.json();
    });
    if (!assets.length) {
      cadAssetPanel.innerHTML = '<li><span>No CAD assets yet.</span></li>';
      return;
    }
    cadAssetPanel.innerHTML = assets.map(asset => {
      const canLoad = Boolean(asset.convertedFilePath && ['glb', 'gltf', 'stl'].includes(asset.convertedFormat));
      const canOpenCadViewer = ['dwg', 'dxf'].includes(asset.originalFormat);
      return `
        <li>
          <span>
            <strong>${escapeHtml(asset.name)}</strong>
            <small>${escapeHtml(asset.originalFormat.toUpperCase())} · ${escapeHtml(asset.status)}</small>
          </span>
          <span class="asset-actions">
            ${canOpenCadViewer ? `<a class="asset-button" href="${escapeHtml(cadViewerUrl(asset))}" target="_blank" rel="noopener">Viewer</a>` : ''}
            ${canLoad ? `<button type="button" data-load-model="${asset.id}">Load</button>` : '<small>needs GLB/STL</small>'}
          </span>
        </li>
      `;
    }).join('');
    cadAssetPanel.querySelectorAll('[data-load-model]').forEach(button => {
      button.addEventListener('click', () => {
        const asset = assets.find(item => item.id === button.dataset.loadModel);
        scene.setImportedModel(assetUrl(asset), asset.convertedFormat);
        planOutput.textContent = `Loaded model: ${asset.name}`;
      });
    });
  } catch (error) {
    cadAssetPanel.innerHTML = '<li><span>API server is offline.</span></li>';
  }
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

assetUploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const fileInput = assetUploadForm.elements.file;
  if (!fileInput.files.length) {
    planOutput.textContent = 'Choose a CAD, GLB, or STL file first.';
    return;
  }
  const body = new FormData(assetUploadForm);
  const response = await fetch(`${API_BASE}/api/cad-assets`, { method: 'POST', body });
  if (!response.ok) {
    planOutput.textContent = `Upload failed: ${response.status}`;
    return;
  }
  const asset = await response.json();
  assetUploadForm.reset();
  await loadCadAssets();
  if (asset.convertedFilePath) {
    scene.setImportedModel(assetUrl(asset), asset.convertedFormat);
    planOutput.textContent = `Uploaded and loaded model: ${asset.name}`;
  } else {
    planOutput.textContent = `Uploaded ${asset.name}. Convert it to GLB/STL before loading in Three.js.`;
  }
});

render();
loadCadAssets();
window.addEventListener('beforeunload', () => scene.dispose());
