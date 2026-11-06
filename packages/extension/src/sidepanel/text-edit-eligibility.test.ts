import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isEditableTextOnlyDiv } from './text-edit-eligibility';

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
