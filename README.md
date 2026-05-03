# Agentic Digital Twin

<p align="center">
  <img src="public/logo.svg" alt="Agentic Digital Twin logo" width="170" />
</p>

<p align="center">
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white" alt="Node.js 20+" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://agentic-digital-twin.vercel.app"><img src="https://img.shields.io/badge/demo-vercel-black?logo=vercel" alt="Live Demo" /></a>
</p>

**Agentic Digital Twin** is an open-source workbench for showing how AI agents can operate against a live digital twin before touching the physical world.

The first demo is a browser-based **robotic arm** workcell: a 3D model, joint limits, sensors, action types, safety gating, and an audit log wrapped in one small static app.

Built and maintained with support from the WhiteMirror AI Team.

## Features

- Interactive Three.js robotic arm with orbit camera and joint sliders.
- Portable digital twin schema: assets, joints, sensors, actions, agent roles, and events.
- Agentic loop: sense → plan → simulate → gate → apply → audit.
- Natural-language intent mapping for demo agent actions.
- Safety guardrail that blocks out-of-range joint targets and sensor anomalies.
- Static Vite app: no backend required for the public demo.
- Open-source-ready docs, examples, tests, CI, and package dry-run.

## Live Demo

Production demo:

<https://agentic-digital-twin.vercel.app>

Try these goals in the Agent Console:

```text
Inspect the end effector and report vibration.
Reach the assembly fixture and capture telemetry.
Emergency stop and fold into safe home mode.
```

## Quick Start

```bash
git clone <repo-url> agentic-digital-twin
cd agentic-digital-twin
npm install
npm run dev
```

Open:

<http://127.0.0.1:4188>

Build locally:

```bash
npm run verify
```

## Agent Harness

Use this instruction with a local coding or operations agent that writes or edits digital twin JSON:

```text
You are operating an Agentic Digital Twin.

Goal:
- Keep the digital twin as the source of truth for a physical or simulated workcell.
- Never apply an action until it passes joint limits, sensor envelopes, and policy checks.
- Every action must create an auditable event.

Loop:
1. Sense: read assets, joints, sensors, and latest events.
2. Plan: convert user intent into one or more action IDs.
3. Simulate: calculate target joint state without mutating the real twin.
4. Gate: run safety checks and explain any blocked action.
5. Apply: update only allowed target state.
6. Audit: append event with actor, action, status, and note.

Output:
- Proposed action IDs
- Safety result
- Updated JSON patch or explanation for why no patch was applied
```

The reusable skill file is [`skills/agentic-digital-twin-agent/SKILL.md`](skills/agentic-digital-twin-agent/SKILL.md).

## Architecture

```mermaid
flowchart TD
  User[Human operator] --> UI[Vite browser UI]
  UI --> Agent[Agent intent planner]
  Agent --> Twin[Digital twin state JSON]
  Twin --> Safety[Safety gate]
  Safety -->|allowed| Action[Apply action patch]
  Safety -->|blocked| Explain[Explain risk]
  Action --> Scene[Three.js robotic arm]
  Action --> Audit[Event log]
  Explain --> Audit
```

```mermaid
sequenceDiagram
  participant U as User
  participant A as Agent planner
  participant T as Twin state
  participant S as Safety gate
  participant V as 3D view
  participant E as Event log

  U->>A: natural-language goal
  A->>T: read schema + current state
  A->>S: propose action sequence
  alt nominal
    S->>T: apply clamped targets
    T->>V: update robot arm pose
    T->>E: append applied event
  else blocked
    S->>E: append blocked event with reason
  end
```

## Project Structure

```text
src/digitalTwin.js                 Core twin schema and agent action functions
src/robotArmScene.js               Three.js robotic arm scene
src/main.js                        Browser UI controller
examples/twin.sample.json          Portable sample twin snapshot
skills/agentic-digital-twin-agent  Agent harness instruction
public/logo.svg                    Project logo
docs/                              Architecture, demo, test results
test/                              Node test suite
```

## Testing / Reproducibility

```bash
npm run lint
npm test
npm run build
npm run pack:check
```

Detailed record: [`docs/TEST_RESULTS.md`](docs/TEST_RESULTS.md).

## Deployment

This is a static Vite app. Vercel can deploy it with:

```bash
npm run build
vercel --prod
```

No server credentials are needed for the demo.

## Contributing

Good first PRs:

- Add a new workcell sample under `examples/`.
- Add more safety checks in `src/digitalTwin.js`.
- Add new Three.js fixtures or end-effectors.
- Improve accessibility and keyboard control.

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a PR.

## Security

Do not submit production facility data, private CAD files, or credentials in public issues. See [`SECURITY.md`](SECURITY.md).

## License

MIT License. See [`LICENSE`](LICENSE).
