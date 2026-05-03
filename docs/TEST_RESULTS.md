# Reproducible Test Results

Environment:

- OS: macOS Darwin 25.2.0 arm64
- Node.js: v24.13.0 locally; project supports Node.js 20+
- npm: 11.6.2
- Package manager: npm
- Date: 2026-05-03 14:01 AEST
- Commit: verify with `git rev-parse HEAD` after checkout

Commands:

```bash
npm run lint
npm test
npm run build
npm run pack:check
```

Results:

- Lint: pass (`node scripts/lint.mjs`)
- Unit/open-source tests: pass (`npm test`, 7/7 tests)
- Build: pass (`vite build`)
- Package smoke: pass (`npm pack --dry-run`, 23 files, ~156.8 kB package)
- Secret scan: pass; no real API keys, private keys, database URLs, or tailnet IPs detected
- Browser smoke: pass; local page renders one Three.js canvas, 5 joint controls, `NOMINAL` safety state, and agent plan output
- Vercel smoke: pass; `https://agentic-digital-twin.vercel.app/` and `/logo.svg` return HTTP 200
- Production browser smoke: pass; Vercel page renders one canvas, 5 joint controls, `NOMINAL` safety state, and Plan & apply updates the audit log
- Visual QA: pass; 3D robotic arm and Agent Console visible on production deployment

Known limitations:

- Static simulation only; not connected to physical hardware.
- Agent planning is deterministic keyword mapping for the demo.
- Three.js geometry is a browser demo, not manufacturing-grade CAD.
- Any real hardware integration needs independent safety systems, authentication, authorization, and emergency stop procedures.
