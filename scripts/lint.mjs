import { spawnSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';

const files = [
  'src/digitalTwin.js',
  'src/robotArmScene.js',
  'src/main.js',
  'vite.config.js',
  'scripts/lint.mjs',
  'test/digitalTwin.test.mjs',
  'test/openSource.test.mjs'
];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const forbidden = [/Gissing/i, /吉兴/, /internal endpoint/i, /AIza[0-9A-Za-z_-]{20,}/, /sk-[A-Za-z0-9]{20,}/, /gho_[A-Za-z0-9_]{20,}/];
const publicFiles = ['README.md', 'index.html', 'src/main.js', 'src/digitalTwin.js', 'examples/twin.sample.json'];
for (const file of publicFiles) {
  const text = await fsp.readFile(path.resolve(file), 'utf8');
  for (const pattern of forbidden) {
    if (pattern.test(text)) {
      console.error(`Forbidden public text ${pattern} found in ${file}`);
      process.exit(1);
    }
  }
}
console.log('lint ok');
