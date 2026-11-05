#!/usr/bin/env node
// Build script for the browser extension.
// Runs vite build once per entry point since content scripts need IIFE format.
// Create browser-specific manifests: Chrome MV3 rejects Firefox-only
// background.scripts and warns about sidebar_action. Firefox retains those
// fields in its own distribution; runtime browser detection remains shared.

import { execFileSync } from 'child_process';
import { cpSync, mkdirSync, existsSync, readFileSync, writeFileSync, lstatSync } from 'fs';
import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { analyticsBuildEnv } from './analytics-build-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const viteCli = resolve(dirname(require.resolve('vite/package.json')), 'bin/vite.js');

const safari = process.argv.includes('--safari');
const firefox = process.argv.includes('--firefox');
if (safari && firefox) throw new Error('Choose either --safari or --firefox');
const output = safari ? 'dist-safari' : firefox ? 'dist-firefox' : 'dist';
const entries = ['content', 'background', 'sidepanel', ...(safari ? ['devtools'] : [])];
const isolated = safari || process.env.DM_ISOLATED_BUILD === '1';
if (isolated && existsSync(resolve(__dirname, output)) && lstatSync(resolve(__dirname, output)).isSymbolicLink()) {
  throw new Error(`Isolated build refuses symlinked ${output}. Unlink the worktree symlink first; preserve its target.`);
}

let buildEnv = process.env;
try {
  if (process.argv.slice(2).some(arg => arg !== '--analytics' && arg !== '--safari' && arg !== '--firefox')) throw new Error('Unknown build option');
  if (process.argv.includes('--analytics')) buildEnv = analyticsBuildEnv(__dirname);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}


console.log('\n◆ Building Design Mode extension...\n');

for (const entry of entries) {
  console.log(`  Building ${entry}...`);
  execFileSync(process.execPath, [viteCli, 'build'], {
    cwd: __dirname,
    env: { ...buildEnv, ENTRY: entry, DM_BROWSER: safari ? 'safari' : firefox ? 'firefox' : 'chrome' },
    stdio: 'inherit',
    shell: false,
  });
}

// Copy static files to dist
console.log('  Copying static assets...');
try {
  const manifest = JSON.parse(readFileSync(resolve(__dirname, 'public/manifest.json'), 'utf8'));
  if (!safari && !firefox) {
    // Chrome MV3 needs only service_worker; Firefox-specific keys are invalid.
    delete manifest.background.scripts;
    delete manifest.sidebar_action;
    delete manifest.browser_specific_settings;
  } else if (firefox) {
    // Firefox uses background.scripts and sidebar_action instead.
    delete manifest.background.service_worker;
    delete manifest.background.type;
    delete manifest.side_panel;
    manifest.permissions = manifest.permissions.filter(permission => permission !== 'sidePanel');
  } else if (safari) {
    delete manifest.side_panel;
    delete manifest.sidebar_action;
    delete manifest.browser_specific_settings;
    manifest.permissions = manifest.permissions.filter(permission => permission !== 'sidePanel');
    manifest.permissions.push('devtools');
    manifest.background = { scripts: ['background.js'], persistent: false };
    manifest.devtools_page = 'devtools.html';
    manifest.action.default_popup = 'safari-help.html';
    cpSync(resolve(__dirname, 'src/inspector/devtools.html'), resolve(__dirname, output, 'devtools.html'));
    cpSync(resolve(__dirname, 'src/inspector/safari-help.html'), resolve(__dirname, output, 'safari-help.html'));
  }
  writeFileSync(resolve(__dirname, output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  // Copy sidepanel HTML
  mkdirSync(resolve(__dirname, output, 'sidepanel'), { recursive: true });
  cpSync(resolve(__dirname, 'src/sidepanel/index.html'), resolve(__dirname, output, 'sidepanel/index.html'));
  cpSync(resolve(__dirname, 'src/sidepanel/builder-reveal.js'), resolve(__dirname, output, 'sidepanel/builder-reveal.js'));

  // Copy assets
  if (existsSync(resolve(__dirname, 'public/assets'))) {
    cpSync(resolve(__dirname, 'public/assets'), resolve(__dirname, output, 'assets'), { recursive: true });
  }

  // Copy icons — prefer the repo-root /icons folder (user-provided), fall back to public/icons
  try {
    const rootIcons = resolve(__dirname, '../../icons');
    const publicIcons = resolve(__dirname, 'public/icons');
    if (existsSync(rootIcons)) {
      cpSync(rootIcons, resolve(__dirname, output, 'icons'), { recursive: true });
    } else if (existsSync(publicIcons)) {
      cpSync(publicIcons, resolve(__dirname, output, 'icons'), { recursive: true });
    }
  } catch {}
} catch (e) {
  throw new Error('Failed copying extension assets', { cause: e });
}

console.log(safari
  ? '\n✓ Safari build complete! Load dist-safari/ in Safari Settings → Developer → Add Temporary Extension.\n'
  : firefox
  ? '\n✓ Firefox build complete! Load dist-firefox/ via about:debugging.\n'
  : '\n✓ Chrome build complete! Load dist/ via chrome://extensions.\n');
