import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import type { TextChange } from './change-tracker';

const code = transformSync(readFileSync(new URL('./enhanced-export.ts', import.meta.url), 'utf8'), {
  loader: 'ts', format: 'cjs',
}).code;

function prompt(changes: TextChange[], domChanges: Record<string, unknown>[] = [], styleChanges: Record<string, unknown>[] = []): string {
  const dependencies: Record<string, unknown> = {
    './helpers': { getElementById: () => null },
    './change-tracker': {
      getStyleChanges: () => styleChanges, getTextChanges: () => changes, getDomChanges: () => domChanges,
    },
    './source-detection': {},
    './root-var-store': { getTokenEdits: () => [] },
    './token-engine': { getTokenIndex: () => ({ tokens: [] }) },
  };
  const module = { exports: {} as { exportMarkdown: () => string } };
  runInNewContext(code, {
    module,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    document: { title: 'Link fixture' },
    window: { location: { href: 'https://example.test/active' } },
  });
  return module.exports.exportMarkdown();
}

function change(overrides: Partial<TextChange> = {}): TextChange {
  return {
    id: 'link-edit', elementId: 'link', selector: 'a.link', timestamp: 1,
    oldText: '/before', newText: '/after', attributeName: 'href', ...overrides,
  };
}

test('active-route prompt labels href edits as attributes, retaining exact before and after values', () => {
  for (const [oldText, newText] of [
    ['/before', '/after'],
    ['', '/added'],
    ['/removed', ''],
    [' /before?q="quoted" ', ' /after?q="quoted" '],
  ]) {
    const result = prompt([change({ oldText, newText, breakpoint: 'mobile', viewportWidth: 390 })]);
    assert.ok(result.includes(`- E1 href: ${JSON.stringify(oldText)} → ${JSON.stringify(newText)} _(mobile · 390px)_`));
    assert.ok(!result.includes('E1 text'));
    assert.ok(!result.includes('Text edits use git word-diff'));
  }
});

test('mixed attribute and text edits preserve chronology, text word-diff and rewrite formatting', () => {
  const result = prompt([
    change({ timestamp: 3 }),
    change({ id: 'text-diff', attributeName: undefined, oldText: 'Read the old guide', newText: 'Read the new guide', timestamp: 1 }),
    change({ id: 'text-rewrite', attributeName: undefined, oldText: 'Before', newText: 'After', timestamp: 2 }),
  ]);
  assert.ok(result.includes('- E1 text: Read the [-old-]{+new+} guide'));
  assert.ok(result.includes('- E1 text → "After"'));
  assert.ok(result.includes('Text edits use git word-diff'));
  assert.ok(result.indexOf('E1 text:') < result.indexOf('E1 text →'));
  assert.ok(result.indexOf('E1 text →') < result.indexOf('E1 href:'));
});

test('copy prompt indexes the target selector once and skips no-op/resolved changes', () => {
  const result = prompt([
    change({ id: 'edit', timestamp: 1 }),
    change({ id: 'resolved', timestamp: 2, oldText: '/one', newText: '/two', status: 'resolved' }),
    change({ id: 'noop', timestamp: 3, oldText: '/same', newText: '/same' }),
  ]);
  assert.ok(result.includes('## Element targets'));
  assert.ok(result.includes('- `E1`: `a.link`'));
  assert.equal(result.split('a.link').length - 1, 1);
  assert.ok(result.includes('- E1 href: "/before" → "/after"'));
  assert.ok(!result.includes('/two'));
  assert.ok(!result.includes('/same'));
});

test('duplicate instruction names the final destination and shares target with text edits', () => {
  const result = prompt([
    change({ id: 'label', elementId: 'tag-new', selector: 'span.tag-new',
      attributeName: undefined, oldText: 'Old', newText: 'Test Tag', timestamp: 2 }),
  ], [{
    id: 'duplicate-new', elementId: 'tag-new', selector: 'span.tag-new',
    action: 'duplicate', tagName: 'span', timestamp: 1,
    sourceSelector: 'div.tag-list > span.tag:nth-of-type(3)',
    destination: { parentSelector: 'div.tag-list', index: 3 },
  }]);
  assert.ok(result.includes('Duplicate source (div.tag-list > span.tag:nth-of-type(3)) into div.tag-list[3] (0-based child position)'));
  assert.ok(result.includes('E1 text'));
  assert.ok(result.includes('- `E1`: `span.tag-new`'));
});

test('clone then move is one duplicate instruction at final position', () => {
  const output = prompt([
    change({ elementId: 'new-card', selector: 'h2.new-card', oldText: 'Old', newText: 'Tes Only',
      attributeName: undefined, timestamp: 4 }),
  ], [
    { id: 'clone', elementId: 'new-card', selector: 'h2.new-card', action: 'duplicate',
      tagName: 'h2', timestamp: 1, sourceSelector: 'section.original > h2.title',
      destination: { parentSelector: 'section.original', index: 2 } },
    { id: 'move', elementId: 'new-card', selector: 'h2.new-card', action: 'move',
      tagName: 'h2', timestamp: 3,
      origin: { parentSelector: 'section.original', index: 2 },
      destination: { parentSelector: 'aside.sidebar', index: 0 } },
  ]);
  assert.ok(output.includes('Duplicate source (section.original > h2.title) into aside.sidebar[0]'));
  assert.ok(!output.includes('Move from'));
  assert.ok(!output.includes('section.original[2]'));
  assert.ok(output.includes('- E1 text → "Tes Only"'));
  assert.ok(!output.includes('Text edits use git word-diff'));
});

test('moving an existing element still records the original and final positions', () => {
  const output = prompt([], [{
    id: 'move-only', elementId: 'existing', selector: 'p.existing', action: 'move',
    tagName: 'p', timestamp: 1,
    origin: { parentSelector: 'section.hero', index: 1 },
    destination: { parentSelector: 'aside.sidebar', index: 0 },
  }]);
  assert.ok(output.includes('Move from section.hero[1] to aside.sidebar[0]'));
});

test('duplicate card then move and edit style and text exports one final creation', () => {
  const result = prompt([
    change({ id: 'text-card', elementId: 'card-copy', selector: 'article.card.copy > h3',
      attributeName: undefined, oldText: 'Old product', newText: 'New product', timestamp: 5 }),
  ], [
    { id: 'clone-card', elementId: 'card-copy', selector: 'article.card.copy', action: 'duplicate',
      tagName: 'article', sourceSelector: 'section.featured > article.card:nth-of-type(2)',
      destination: { parentSelector: 'section.featured', index: 2 }, timestamp: 1 },
    { id: 'move-card', elementId: 'card-copy', selector: 'article.card.copy', action: 'move',
      tagName: 'article', origin: { parentSelector: 'section.featured', index: 2 },
      destination: { parentSelector: 'aside.recommendations', index: 0 }, timestamp: 3 },
  ], [
    { id: 'bg-card', elementId: 'card-copy', selector: 'article.card.copy',
      property: 'backgroundColor', oldValue: 'rgb(255, 255, 255)',
      newValue: '#ff842e', timestamp: 4 },
  ]);

  assert.ok(result.includes('## Element targets'));
  assert.ok(result.includes('Duplicate source (section.featured > article.card:nth-of-type(2)) into aside.recommendations[0]'));
  assert.equal((result.match(/Duplicate source/g) || []).length, 1);
  assert.ok(!result.includes('Move from section.featured'));
  assert.ok(!result.includes('section.featured[2]'));
  assert.ok(result.includes('background-color'));
  assert.ok(result.includes('#ff842e'));
  // One word changes, so the exporter preserves the shared "product" context.
  assert.ok(result.includes('text: [-Old-]{+New+} product'));
  assert.ok(!result.includes('Text edits use git word-diff'));
});
