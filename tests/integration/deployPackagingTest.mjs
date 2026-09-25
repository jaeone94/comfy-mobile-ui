import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

// Exercise the actual staging copy routine without building or replacing release artifacts.
const source = fs.readFileSync('scripts/deploy.js', 'utf8');
const code = source.slice(source.indexOf('const EXCLUDED_NAMES'), source.indexOf('\ntry {'));
const context = vm.createContext({ fs, path, console: { log() {} } });
vm.runInContext(code, context);
const copyFolder = vm.runInContext('copyFolderSync', context);
const tempBase = fs.realpathSync(os.tmpdir());
const fixture = fs.mkdtempSync(path.join(tempBase, 'comfy-package-test-'));
try {
  const input = path.join(fixture, 'input');
  const output = path.join(fixture, 'output');
  fs.mkdirSync(path.join(input, 'nested'), { recursive: true });
  for (const name of ['cookie.txt', 'cookies.txt', 'COOKIE.TXT', 'comfyui_original_args.json', 'nested/cookie.txt', 'nested/cache.pyc', 'nested/runtime.log', 'nested/keep.py']) {
    fs.writeFileSync(path.join(input, name), 'synthetic test fixture');
  }
  copyFolder(input, output);
  assert.deepEqual(fs.readdirSync(output), ['nested']);
  assert.deepEqual(fs.readdirSync(path.join(output, 'nested')), ['keep.py']);
  console.log('PASS: deployment staging excludes cookies (including nested/case variants) and runtime files');
} finally {
  const resolved = fs.realpathSync(fixture);
  assert.equal(path.dirname(resolved), tempBase);
  assert.ok(path.basename(resolved).startsWith('comfy-package-test-'));
  fs.rmSync(resolved, { recursive: true, force: true });
}
