import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

const code = transformSync(readFileSync(new URL('./text-edit-eligibility.ts', import.meta.url), 'utf8'), {
  loader: 'ts', format: 'cjs',
}).code;
const mod = { exports: {} as { isEditableTextOnlyDiv: (html: string, text: string | null | undefined) => boolean } };
runInNewContext(code, { module: mod });
const { isEditableTextOnlyDiv } = mod.exports;

test('plain div text is editable, including Webflow opacity-75 div', () => {
  assert.equal(isEditableTextOnlyDiv('We organize enterprise context.', 'We organize enterprise context.'), true);
  assert.equal(isEditableTextOnlyDiv('<span class="opacity-75">Business meaning</span>', 'Business meaning'), true);
  assert.equal(isEditableTextOnlyDiv('<strong>Business</strong> meaning', 'Business meaning'), true);
});

test('structural layout divs are not exposed as text editors', () => {
  assert.equal(isEditableTextOnlyDiv('<div class="card">Text</div>', 'Text'), false);
  assert.equal(isEditableTextOnlyDiv('<p>Nested paragraph</p>', 'Nested paragraph'), false);
  assert.equal(isEditableTextOnlyDiv('<svg><path /></svg>', 'Icon'), false);
  assert.equal(isEditableTextOnlyDiv('<button>Buy now</button>', 'Buy now'), false);
  assert.equal(isEditableTextOnlyDiv('<span></span>', ''), false);
});


test('GSAP line wrappers inside a text div still show Typography text editor', () => {
  const html = [
    '<div class="gsap_split_line-mask"><div class="gsap_split_line">First line</div></div>',
    '<div class="gsap_split_line-mask"><div class="gsap_split_line">Second line</div></div>',
  ].join('');
  assert.equal(isEditableTextOnlyDiv(html, 'First lineSecond line'), true);
  assert.equal(isEditableTextOnlyDiv('<div class="gsap_split_word">one</div><span class="char">two</span>', 'onetwo'), true);
});

test('a paragraph with cards or badge divs is not an editable text-only div', () => {
  assert.equal(isEditableTextOnlyDiv('<div class="badges"><span>GOVERNANCE</span></div>', 'GOVERNANCE'), false);
  assert.equal(isEditableTextOnlyDiv('<div class="card"><p>Card copy</p></div>', 'Card copy'), false);
  assert.equal(isEditableTextOnlyDiv('<div class="w-layout-grid">Grid text</div>', 'Grid text'), false);
});
