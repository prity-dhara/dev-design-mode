import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import type { TextChange } from './change-tracker';

const code = transformSync(readFileSync(new URL('./enhanced-export.ts', import.meta.url), 'utf8'), {
  loader: 'ts', format: 'cjs',
}).code;

function prompt(changes: TextChange[], domChanges: Record<string, unknown>[] = [], styleChanges: Record<string, unknown>[] = [], elements: Record<string, unknown> = {}, tokens: Record<string, unknown>[] = []): string {
  const dependencies: Record<string, unknown> = {
    './helpers': { getElementById: (id: string) => elements[id] ?? null, generateSelector: (el: any) => el.selector, describeElement: (el: any) => el.tagName?.toLowerCase() ?? 'element' },
    './change-tracker': {
      getStyleChanges: () => styleChanges, getTextChanges: () => changes, getDomChanges: () => domChanges,
    },
    './source-detection': { getSourceLocation: () => null },
    './root-var-store': { getTokenEdits: () => [] },
    './token-engine': { getTokenIndex: () => ({ tokens }) },
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
    assert.ok(result.includes(`1. E1: Set href ${JSON.stringify(oldText)} → ${JSON.stringify(newText)} _(mobile · 390px)_`));
    assert.ok(!result.includes('E1: Set text'));
    assert.ok(!result.includes('Text edits use git word-diff'));
  }
});

test('mixed attribute and text edits preserve chronology, text word-diff and rewrite formatting', () => {
  const result = prompt([
    change({ timestamp: 3 }),
    change({ id: 'text-diff', attributeName: undefined, oldText: 'Read the old guide', newText: 'Read the new guide', timestamp: 1 }),
    change({ id: 'text-rewrite', attributeName: undefined, oldText: 'Before', newText: 'After', timestamp: 2 }),
  ]);
  assert.ok(result.includes('E1: Update text Read the [-old-]{+new+} guide'));
  assert.ok(result.includes('E1: Set text → "After"'));
  assert.ok(result.includes('Text edits use git word-diff'));
  assert.ok(result.indexOf('E1: Update text') < result.indexOf('E1: Set text →'));
  assert.ok(result.indexOf('E1: Set text →') < result.indexOf('E1: Set href'));
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
  assert.ok(result.includes('1. E1: Set href "/before" → "/after"'));
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
  assert.ok(result.includes('E1: Set text'));
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
  assert.ok(output.includes('E1: Set text → "Tes Only"'));
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
  assert.ok(result.includes('Update text [-Old-]{+New+} product'));
  assert.ok(!result.includes('Text edits use git word-diff'));
});

test('text inside duplicated list item identifies its new parent, not the original item', () => {
  const duplicate: any = {
    tagName: 'LI', id: '', className: 'flex items-center',
    selector: 'ul.list > li:nth-of-type(1)',
    parentElement: null,
    contains(child: any) { return child === nested; },
  };
  const nested: any = {
    tagName: 'SPAN', id: '', className: 'truncate font-semibold',
    selector: 'ul.list > li:nth-of-type(1) > span.truncate',
    parentElement: duplicate,
  };
  const output = prompt([
    change({ id: 'name-edit', elementId: 'name-in-copy',
      selector: 'ul.list > li:nth-of-type(1) > span.truncate',
      attributeName: undefined, oldText: 'John', newText: 'Arun', timestamp: 2 }),
  ], [{
    id: 'new-list-item', elementId: 'copied-item', selector: 'ul.list > li:nth-of-type(1)',
    action: 'duplicate', tagName: 'li', timestamp: 1,
    sourceSelector: 'ul.list > li:nth-of-type(4)',
    destination: { parentSelector: 'ul.list', index: 0 },
  }], [], { 'copied-item': duplicate, 'name-in-copy': nested });
  assert.ok(output.includes('E1 (inside newly created E2): Set text → "Arun"'));
  assert.ok(output.includes('E2: Duplicate source (ul.list > li:nth-of-type(4)) into ul.list[0]'));
  assert.ok(output.includes('## Element targets'));
});

test('text without verified DOM ancestry does not claim it is inside a duplicate', () => {
  const output = prompt([
    change({ id: 'name-edit', elementId: 'existing-name', selector: 'span.existing',
      attributeName: undefined, oldText: 'John', newText: 'Arun', timestamp: 2 }),
  ], [{
    id: 'new-list-item', elementId: 'copied-item', selector: 'li.new',
    action: 'duplicate', tagName: 'li', timestamp: 1,
    sourceSelector: 'li.old', destination: { parentSelector: 'ul.list', index: 0 },
  }]);
  assert.ok(output.includes('Set text → "Arun"'));
  assert.ok(!output.includes('inside newly created'));
});

test('Tailwind default zero never masquerades as a meaningful spacing token', () => {
  const output = prompt([], [], [
    { id: 'position', elementId: 'heading', selector: 'h1.title', property: 'position',
      oldValue: 'static', newValue: 'relative', timestamp: 1 },
    { id: 'top', elementId: 'heading', selector: 'h1.title', property: 'top',
      oldValue: '0px', newValue: '-7px', timestamp: 2 },
    { id: 'size', elementId: 'heading', selector: 'h1.title', property: 'fontSize',
      oldValue: '54.2px', newValue: '3rem', timestamp: 3 },
  ], {}, [
    { cssVar: '--tw-ring-offset-width', value: '0px', resolvedValue: '0px' },
    { cssVar: '--size-lg', value: '3rem', resolvedValue: '3rem' },
  ]);
  assert.ok(output.includes('top 0px → -7px'));
  assert.ok(output.includes('font-size 54.2px → var(--size-lg)'));
  assert.ok(!output.includes('--tw-ring-offset-width'));
  assert.ok(!output.includes('## Design tokens used\\n- \`--tw-ring-offset-width\`'));
});

test('ambiguous equal-value tokens are not substituted arbitrarily', () => {
  const output = prompt([], [], [{
    id: 'bg', elementId: 'panel', selector: 'div.panel',
    property: 'backgroundColor', oldValue: '#fff', newValue: '#123456', timestamp: 1,
  }], {}, [
    { cssVar: '--brand', value: '#123456', resolvedValue: '#123456' },
    { cssVar: '--alternate', value: '#123456', resolvedValue: '#123456' },
  ]);
  assert.ok(output.includes('background-color #fff → #123456'));
  assert.ok(!output.includes('var(--brand)'));
  assert.ok(!output.includes('var(--alternate)'));
});

test('copy prompt gives each duplicate, style, and text action its own numbered step', () => {
  const result = prompt([
    change({ id: 'button-label', elementId: 'new-button', selector: 'a.btn-copy',
      attributeName: undefined, oldText: 'Click', newText: 'Continue', timestamp: 4 }),
  ], [{
    id: 'clone-button', elementId: 'new-button', selector: 'a.btn-copy',
    action: 'duplicate', tagName: 'a', timestamp: 1, sourceSelector: 'a.btn-original',
    destination: { parentSelector: 'div.actions', index: 2 },
  }], [
    { id: 'margin', elementId: 'new-button', selector: 'a.btn-copy',
      property: 'marginTop', oldValue: '0px', newValue: '1rem', timestamp: 2 },
    { id: 'color', elementId: 'new-button', selector: 'a.btn-copy',
      property: 'backgroundColor', oldValue: '#fff', newValue: '#161412', timestamp: 3 },
  ]);
  assert.ok(result.includes('1. E1: Duplicate source (a.btn-original) into div.actions[2]'));
  assert.ok(result.includes('2. E1: Set margin-top 0px → 1rem'));
  assert.ok(result.includes('3. E1: Set background-color #fff → #161412'));
  assert.ok(result.includes('4. E1: Set text → "Continue"'));
  assert.ok(!result.includes('margin-top 0px → 1rem; background-color'));
  assert.equal((result.match(/Duplicate source/g) || []).length, 1);
});
