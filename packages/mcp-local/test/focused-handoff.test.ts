import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { state } from '../src/state.js';
import { focusedChangeReport } from '../src/focused-report.js';
import { locateReactSource } from '../src/react-source-map.js';

test('focused handoff keeps unresolved IDs but drops resolved edits and redundant CSS', () => {
  state.clear();
  state.addStyleChange({
    id: 'style-1', elementId: 'a', selector: '.hero', property: 'color',
    oldValue: 'black', newValue: 'orange', timestamp: 1, routeKey: '/home',
  });
  state.addStyleChange({
    id: 'style-2', elementId: 'a', selector: '.hero', property: 'width',
    oldValue: '100px', newValue: '200px', timestamp: 2, routeKey: '/home', status: 'resolved',
  });
  const report = focusedChangeReport() as Record<string, any>;
  assert.deepEqual(report.styles.map((c: any) => c.id), ['style-1']);
  assert.equal(report.unresolvedCount, 1);
  assert.equal(report.cssBlock, undefined);
  assert.equal((focusedChangeReport('/other') as Record<string, any>).unresolvedCount, 0);
  state.clear();
});

test('React source mapper verifies actual TSX paths and avoids imagined files', () => {
  const root = mkdtempSync(join(tmpdir(), 'dev-agent-react-'));
  try {
    mkdirSync(join(root, 'src', 'components'), { recursive: true });
    writeFileSync(join(root, 'src', 'components', 'Hero.tsx'),
      'export function Hero() { return <h1>Hello</h1>; }');
    const found = locateReactSource({ projectRoot: root, componentName: 'Hero',
      sourceHint: 'src/components/Hero.tsx' });
    assert.ok(found.candidates.some(c => c.file.includes('Hero.tsx') && c.confidence === 'high'));
    assert.deepEqual(locateReactSource({ projectRoot: root, componentName: 'Nonexistent' }).candidates, []);
    assert.deepEqual(locateReactSource({ projectRoot: root, sourceHint: '../outside.tsx' }).candidates, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
