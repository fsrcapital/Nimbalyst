import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createUser2Environment,
  resolveUser2DataDir,
  resolvePackageBinary,
  restartSignalPath,
} from '../dev-user2.mjs';

test('resolves the Windows user2 directory from APPDATA', () => {
  assert.equal(
    resolveUser2DataDir({
      platform: 'win32',
      environment: { APPDATA: 'C:\\Users\\test\\AppData\\Roaming' },
      homeDirectory: 'C:\\Users\\test',
    }),
    path.join('C:\\Users\\test\\AppData\\Roaming', '@nimbalyst', 'electron-user2'),
  );
});

test('resolves the macOS user2 directory under Application Support', () => {
  assert.equal(
    resolveUser2DataDir({
      platform: 'darwin',
      environment: {},
      homeDirectory: '/Users/test',
    }),
    path.join('/Users/test', 'Library', 'Application Support', '@nimbalyst', 'electron-user2'),
  );
});

test('resolves the Linux user2 directory from XDG_CONFIG_HOME', () => {
  assert.equal(
    resolveUser2DataDir({
      platform: 'linux',
      environment: { XDG_CONFIG_HOME: '/tmp/config' },
      homeDirectory: '/home/test',
    }),
    path.join('/tmp/config', '@nimbalyst', 'electron-user2'),
  );
});

test('creates an isolated user2 environment', () => {
  const environment = createUser2Environment({
    platform: 'win32',
    environment: {
      APPDATA: 'C:\\Users\\test\\AppData\\Roaming',
      PRESERVED: 'yes',
    },
    homeDirectory: 'C:\\Users\\test',
  });

  assert.equal(environment.PRESERVED, 'yes');
  assert.equal(environment.NIMBALYST_MCP_PORT, '3457');
  assert.equal(environment.VITE_PORT, '5274');
  assert.equal(environment.ELECTRON_ENTRY, 'out2/main/index.js');
  assert.equal(
    environment.NIMBALYST_USER_DATA_DIR,
    path.join('C:\\Users\\test\\AppData\\Roaming', '@nimbalyst', 'electron-user2'),
  );
});

test('resolves JavaScript entry points without Windows command shims', () => {
  assert.equal(path.basename(resolvePackageBinary('electron-vite')), 'electron-vite.js');
  assert.equal(path.basename(resolvePackageBinary('typescript', 'tsc')), 'tsc');
});

test('uses a per-instance restart signal', () => {
  assert.equal(
    restartSignalPath('/tmp/@nimbalyst/electron-user2', '/repo/packages/electron'),
    path.join('/repo/packages/electron', '.restart-requested-electron-user2'),
  );
});

test('loads the main module only after the custom user-data path is configured', () => {
  const testDirectory = path.dirname(fileURLToPath(import.meta.url));
  const bootstrap = readFileSync(path.resolve(testDirectory, '../../src/main/bootstrap.ts'), 'utf8');
  const setPathIndex = bootstrap.indexOf("app.setPath('userData', customUserDataDir)");
  const loadMainIndex = bootstrap.indexOf("import('./index.js')");

  assert.equal(/^import\s+['"]\.\/index\.js['"];?$/m.test(bootstrap), false);
  assert.notEqual(setPathIndex, -1);
  assert.ok(loadMainIndex > setPathIndex);
});
