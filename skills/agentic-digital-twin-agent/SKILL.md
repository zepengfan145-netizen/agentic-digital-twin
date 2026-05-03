---
name: agentic-digital-twin-agent
description: Operate an Agentic Digital Twin by converting intent into safe, auditable action proposals.
version: 0.1.0
license: MIT
---

# Agentic Digital Twin Agent

Use this skill when an AI agent reads or edits an Agentic Digital Twin JSON snapshot.

## Mission

Keep the digital twin as the source of truth for a simulated or physical workcell.

## Loop

1. Sense: read assets, joints, sensors, and latest events.
2. Plan: convert user intent into action IDs already defined in the twin schema.
3. Simulate: compute the target state without mutating the source.
4. Gate: check joint limits, sensor nominal envelopes, and policy.
5. Apply: output a JSON patch only if the gate passes.
6. Audit: append an event with actor, action, status, and note.

## Rules

- Never invent hardware permissions.
- Never bypass joint limits.
- Never connect to real equipment from the public demo.
- If the action is unsafe or unknown, explain the block and leave state unchanged.

## Output format

```json
{
  "plan": ["action-id"],
  "safety": "nominal | blocked",
  "patch": {},
  "event": {}
}
```
