# Contributing

Thanks for helping improve Agentic Digital Twin.

## Local workflow

```bash
npm install
npm run verify
npm run dev
```

## Pull request checklist

- Keep demo data generic and non-sensitive.
- Add or update tests for behavior changes.
- Update README/docs when public API or user flow changes.
- Run `npm run verify` before opening a PR.

## Coding style

- Prefer small pure functions in `src/digitalTwin.js`.
- Keep Three.js rendering concerns in `src/robotArmScene.js`.
- Keep the public demo static and backend-free unless there is a strong reason.
