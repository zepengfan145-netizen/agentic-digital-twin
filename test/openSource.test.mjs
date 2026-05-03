import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const root = path.resolve(new URL('..', import.meta.url).pathname);
async function read(file) { return fsp.readFile(path.join(root, file), 'utf8'); }
async function exists(file) { try { await fsp.access(path.join(root, file)); return true; } catch { return false; } }

test('open-source repository has required public files', async () => {
  const required = [
    'README.md', 'LICENSE', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md', '.gitignore',
    '.github/workflows/ci.yml', '.github/ISSUE_TEMPLATE/bug_report.yml', '.github/ISSUE_TEMPLATE/feature_request.yml', '.github/pull_request_template.md',
    'docs/ARCHITECTURE.md', 'docs/DEMO.md', 'docs/TEST_RESULTS.md', 'examples/twin.sample.json',
    'skills/agentic-digital-twin-agent/SKILL.md', 'public/logo.svg'
  ];
  for (const file of required) assert.equal(await exists(file), true, `${file} should exist`);
});

test('README explains Agentic Digital Twin with diagrams, usage, demo, and agent prompt', async () => {
  const readme = await read('README.md');
  for (const text of ['# Agentic Digital Twin', '## Features', '## Live Demo', '## Quick Start', '## Agent Harness', '## Architecture', '## Testing / Reproducibility', 'Built and maintained with support from the WhiteMirror AI Team']) {
    assert.match(readme, new RegExp(escapeRegExp(text)));
  }
  assert.match(readme, /```mermaid/);
  assert.match(readme, /robotic arm/i);
  assert.match(readme, /digital twin/i);
  assert.doesNotMatch(readme, /Gissing|吉兴|token|secret|internal endpoint/i);
});
