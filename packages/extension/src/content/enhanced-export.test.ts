import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

const code = transformSync(readFileSync(new URL('./enhanced-export.ts', import.meta.url), 'utf8'), {
  loader: 'ts', format: 'cjs',
}).code;

function prompt({
  texts = [], dom = [], styles = [], elements = {}, tokens = [], comments = [], tokenEdits = [],
  selectors = {},
}: {
  texts?: any[]; dom?: any[]; styles?: any[];
  elements?: Record<string, any>; tokens?: any[]; comments?: any[];
  tokenEdits?: any[]; selectors?: Record<string, any[]>;
} = {}): string {
  const dependencies: Record<string, unknown> = {
    './helpers': {
      getElementById: (id: string) => elements[id] ?? null,
      generateSelector: (el: any) => el.selector || 'body',
      describeElement: (el: any) => el.tagName?.toLowerCase() ?? 'element',
    },
    './change-tracker': {
      getStyleChanges: () => styles, getTextChanges: () => texts, getDomChanges: () => dom,
    },
    './source-detection': { getSourceLocation: () => null },
    './root-var-store': { getTokenEdits: () => tokenEdits },
    './token-engine': { getTokenIndex: () => ({ tokens }) },
  };
  const module = { exports: {} as { exportMarkdown: (comments: any[]) => string } };
  runInNewContext(code, {
    module,
    require: (name: string) => {
      assert.ok(name in dependencies, 'Unexpected dependency: ' + name);
      return dependencies[name];
    },
    document: {
      title: 'Test page',
      body: { tagName: 'BODY' },
      querySelectorAll: (selector: string) => selectors[selector] || [],
      querySelector: (selector: string) => (selectors[selector] || [])[0] || null,
    },
    CSS: { escape: (x: string) => x.replace(/([^a-zA-Z0-9_-])/g, '\\$1') },
    window: { location: { href: 'https://example.test/page' } },
  });
  return module.exports.exportMarkdown(comments);
}

test('compact prompt contains URL once, no generated E identifiers or verbose heading', () => {
  const result = prompt({ texts: [
    { elementId: 'heading', selector: 'h2.heading', oldText: 'Old', newText: 'New',
      timestamp: 1 },
  ] });
  assert.match(result, /^Page: https:\/\/example\.test\/page\nTarget: h2\.heading\n\nChanges:\n/);
  assert.ok(result.includes('Set h2.heading text → "New".'));
  assert.ok(!result.includes('# Visual changes'));
  assert.ok(!result.includes('## Element targets'));
  assert.ok(!/\bE\d+\b/.test(result));
  assert.equal(result.split('https://example.test/page').length - 1, 1);
});

test('short unique class is preferred over long recorded nth-of-type path', () => {
  const el = { tagName: 'P', id: '', className: 'hero_paragraph muted',
    selector: 'body > main:nth-of-type(1) > section:nth-of-type(2) > p:nth-of-type(3)' };
  const result = prompt({
    elements: { paragraph: el },
    selectors: { '.hero_paragraph': [el] },
    texts: [{ elementId: 'paragraph', selector: el.selector,
      oldText: 'Hi', newText: 'Hello', timestamp: 1 }],
  });
  assert.ok(result.includes('Target: .hero_paragraph'));
  assert.ok(!result.includes('nth-of-type'));
});

test('ambiguous class falls back to recorded selector when uniqueness cannot be proven', () => {
  const el = { tagName: 'DIV', id: '', className: 'card', selector: 'main > div.card:nth-of-type(2)' };
  const other = { tagName: 'DIV', id: '', className: 'card' };
  const result = prompt({
    elements: { card: el },
    selectors: { '.card': [el, other] },
    texts: [{ elementId: 'card', selector: el.selector,
      oldText: 'Old', newText: 'Exact', timestamp: 1 }],
  });
  assert.ok(result.includes('Target: main > div.card:nth-of-type(2)'));
});

test('duplicate then move outputs only final destination and identifies edits on new copy', () => {
  const result = prompt({
    dom: [
      { elementId: 'copy', selector: 'li.copy', action: 'duplicate', tagName: 'li',
        sourceSelector: 'ul.stats > li.stat:nth-of-type(3)', timestamp: 1,
        destination: { parentSelector: 'ul.stats', index: 3 } },
      { elementId: 'copy', selector: 'li.copy', action: 'move', tagName: 'li',
        timestamp: 2, origin: { parentSelector: 'ul.stats', index: 3 },
        destination: { parentSelector: 'ul.metrics', index: 1 } },
    ],
    texts: [{ elementId: 'copy', selector: 'li.copy', timestamp: 3,
      oldText: '250', newText: '400+' }],
  });
  assert.ok(result.includes('Duplicate ul.stats > li.stat:nth-of-type(3) → ul.metrics, child 2'));
  assert.ok(result.includes('edit new copy only'));
  assert.ok(result.includes('Set new li at ul.metrics, child 2 text → "400+".'));
  assert.ok(!result.includes('Move new li'));
});

test('style changes on same element group exact final values, not truncated', () => {
  const long = 'linear-gradient(135deg, rgba(1, 2, 3, 0.55), rgba(4, 5, 6, 0.93))';
  const result = prompt({ styles: [
    { elementId: 'hero', selector: '.hero', property: 'fontSize',
      oldValue: '16px', newValue: '20px', timestamp: 1 },
    { elementId: 'hero', selector: '.hero', property: 'backgroundImage',
      oldValue: 'none', newValue: long, timestamp: 2 },
  ] });
  assert.ok(result.includes('Style .hero → font-size: 20px; background-image: ' + long));
  assert.equal((result.match(/Style \.hero/g) || []).length, 1);
});

test('move, insertion, delete, text attributes and responsive edits are retained', () => {
  const result = prompt({
    dom: [
      { elementId: 'old', selector: '.old', action: 'move', tagName: 'p',
        origin: { parentSelector: '.before', index: 1 },
        destination: { parentSelector: '.after', index: 0 }, timestamp: 1 },
      { elementId: 'added', selector: 'section.added', action: 'insert', tagName: 'section',
        destination: { parentSelector: '.after', index: 1 }, timestamp: 2 },
      { elementId: 'deleted', selector: '.deleted', action: 'delete', tagName: 'div',
        origin: { parentSelector: '.after', index: 2 }, timestamp: 3 },
    ],
    texts: [{ elementId: 'old', selector: '.old', attributeName: 'href',
      oldText: '/old', newText: '/new?a="b"', timestamp: 4,
      breakpoint: 'mobile', viewportWidth: 390 }],
  });
  assert.ok(result.includes('Move .old from .before, child 2 to .after, child 1'));
  assert.ok(result.includes('Add section at .after, child 2'));
  assert.ok(result.includes('Delete .deleted at .after, child 3'));
  assert.ok(result.includes('href → "/new?a=\\"b\\""'));
  assert.ok(result.includes('mobile · 390px'));
});

test('nested edits are explicitly scoped inside the duplicated parent', () => {
  const child: any = { tagName: 'SPAN', id: '', className: '',
    selector: 'ul.list > li:nth-of-type(2) > span', parentElement: null };
  const parent: any = { tagName: 'LI', id: '', className: '',
    selector: 'ul.list > li:nth-of-type(2)', contains: (node: any) => node === child };
  child.parentElement = parent;
  const result = prompt({
    elements: { copy: parent, nested: child },
    dom: [{ elementId: 'copy', selector: parent.selector, action: 'duplicate',
      tagName: 'li', sourceSelector: 'ul.list > li:nth-of-type(1)',
      destination: { parentSelector: 'ul.list', index: 1 }, timestamp: 1 }],
    texts: [{ elementId: 'nested', selector: child.selector, oldText: 'Old',
      newText: 'New', timestamp: 2 }],
  });
  assert.ok(result.includes('inside new li at ul.list, child 2 text → "New"'));
});

test('no-ops and resolved changes are excluded, tokens retain semantic values', () => {
  const result = prompt({
    texts: [
      { elementId: 'a', selector: '.a', oldText: 'same', newText: 'same', timestamp: 1 },
      { elementId: 'b', selector: '.b', oldText: 'old', newText: 'resolved', status: 'resolved', timestamp: 2 },
    ],
    styles: [{ elementId: 'c', selector: '.c', property: 'fontSize',
      oldValue: '16px', newValue: '3rem', timestamp: 3 }],
    tokens: [{ cssVar: '--size-lg', value: '3rem', resolvedValue: '3rem' }],
    tokenEdits: [{ cssVar: '--brand', scopeSelector: ':root', original: '#000', current: '#fff' }],
    comments: [{ selector: '.card', text: 'Align this card' }],
  });
  assert.ok(!result.includes('resolved'));
  assert.ok(!result.includes('same'));
  assert.ok(result.includes('font-size: var(--size-lg)'));
  assert.ok(result.includes('Set token --brand → #fff at its definition.'));
  assert.ok(result.includes('Note on .card: Align this card'));
});

test('only final CSS property is exported after repeated changes', () => {
  const result = prompt({ styles: [
    { elementId: 'copy', selector: '.copy', property: 'textAlign',
      oldValue: 'left', newValue: 'start', timestamp: 1 },
    { elementId: 'copy', selector: '.copy', property: 'textAlign',
      oldValue: 'start', newValue: 'center', timestamp: 2 },
    { elementId: 'copy', selector: '.copy', property: 'fontSize',
      oldValue: '16px', newValue: '18px', timestamp: 3 },
    { elementId: 'copy', selector: '.copy', property: 'fontSize',
      oldValue: '18px', newValue: '20px', timestamp: 4 },
  ] });
  assert.ok(result.includes('text-align: center'));
  assert.ok(result.includes('font-size: 20px'));
  assert.ok(!result.includes('text-align: start'));
  assert.ok(!result.includes('font-size: 18px'));
  assert.equal((result.match(/text-align:/g) || []).length, 1);
  assert.equal((result.match(/font-size:/g) || []).length, 1);
});

test('styling a duplicated paragraph scopes the override to the new copy', () => {
  const result = prompt({
    dom: [{ elementId: 'copy', selector: '.hero-copy-inner p', action: 'duplicate',
      tagName: 'p', sourceSelector: '.hero-copy-inner p', timestamp: 1,
      destination: { parentSelector: '#how > div.section-heading.centered:nth-of-type(1)', index: 2 } }],
    styles: [
      { elementId: 'copy', selector: 'p', property: 'fontSize', oldValue: '16px',
        newValue: '20px', timestamp: 2 },
      { elementId: 'copy', selector: 'p', property: 'textAlign', oldValue: 'start',
        newValue: 'center', timestamp: 3 },
    ],
    texts: [{ elementId: 'copy', selector: 'p', oldText: 'Old', newText: 'New', timestamp: 4 }],
  });
  assert.ok(result.includes('Duplicate .hero-copy-inner p'));
  assert.ok(result.includes('Keep original classes/styles; edit new copy only'));
  assert.ok(result.includes('Style new p'));
  assert.ok(result.includes('font-size: 20px; text-align: center'));
  assert.ok(result.includes('Scope to this copy (unique class/selector); never edit the shared class'));
  assert.ok(result.includes('Set new p'));
});

test('reverted style edits do not create a redundant exported instruction', () => {
  const result = prompt({ styles: [
    { elementId: 'paragraph', selector: '.paragraph', property: 'fontWeight',
      oldValue: '400', newValue: '500', timestamp: 1 },
    { elementId: 'paragraph', selector: '.paragraph', property: 'fontWeight',
      oldValue: '500', newValue: '400', timestamp: 2 },
  ] });
  assert.ok(!result.includes('font-weight:'));
  assert.ok(result.includes('No changes recorded'));
});

test('split headings export one text edit with GSAP-preservation guidance', () => {
  const output = prompt({ texts: [
    { elementId: 'title', selector: 'h1.hero-title',
      oldText: 'We build digital products', newText: 'We create useful digital experiences',
      isSplitText: true, timestamp: 1 },
  ] });
  assert.ok(output.includes('Set h1.hero-title text → "We create useful digital experiences"'));
  assert.ok(output.includes('update original source text and re-split'));
  assert.ok(output.includes('preserve animated wrappers'));
  assert.equal((output.match(/Set h1.hero-title text/g) || []).length, 1);
});
