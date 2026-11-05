import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';

// Transpile the browser module and stub its imports so the pure predicate
// can be tested without a DOM.
const source = fs.readFileSync(new URL('./visual-builder.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
const exports: Record<string, any> = {};
vm.runInNewContext(compiled, {
  exports, require: () => ({}),
});
const shouldShow = exports.shouldShowEmptyBuilderMarker as (kind: string, element: any) => boolean;

test('empty sections, containers, divs, and grids receive editor markers', () => {
  for (const kind of ['section', 'container', 'div', 'grid']) {
    assert.equal(shouldShow(kind, { children: { length: 0 }, textContent: '' }), true);
  }
});

test('markers are hidden for content and non-structural elements', () => {
  assert.equal(shouldShow('section', { children: { length: 1 }, textContent: '' }), false);
  assert.equal(shouldShow('container', { children: { length: 0 }, textContent: 'Hello' }), false);
  for (const kind of ['heading', 'paragraph', 'button', 'card']) {
    assert.equal(shouldShow(kind, { children: { length: 0 }, textContent: '' }), false);
  }
});

test('Image is not an available builder preset', () => {
  assert.equal(exports.BUILDER_KINDS.includes('image'), false);
});
