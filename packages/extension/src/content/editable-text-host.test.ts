import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isEditableTextHost } from './editable-text-host.ts';

function fakeHost(tagName: string, text: string, children: string[] = []): HTMLElement {
  return {
    tagName,
    textContent: text,
    querySelectorAll: () => children.map(tagName => ({ tagName })),
  } as unknown as HTMLElement;
}

describe('Webflow text-only div editing', () => {
  it('allows a plain text div even without SplitText wrappers', () => {
    assert.equal(isEditableTextHost(fakeHost('DIV', 'GalentAI builds a context graph')), true);
  });
  it('allows authored inline spans, bold text and links inside one div', () => {
    assert.equal(isEditableTextHost(fakeHost('DIV', 'Hello world', ['SPAN', 'STRONG', 'A'])), true);
  });
  it('does not treat cards, sections or text collections as a single editable div', () => {
    assert.equal(isEditableTextHost(fakeHost('DIV', 'Two paragraphs', ['P', 'P'])), false);
    assert.equal(isEditableTextHost(fakeHost('DIV', 'A card', ['DIV', 'H3'])), false);
    assert.equal(isEditableTextHost(fakeHost('SECTION', 'Heading')), false);
  });
  it('rejects empty divs and divs containing non-text media/controls', () => {
    assert.equal(isEditableTextHost(fakeHost('DIV', ' ')), false);
    assert.equal(isEditableTextHost(fakeHost('DIV', 'Caption', ['IMG'])), false);
    assert.equal(isEditableTextHost(fakeHost('DIV', 'Click', ['BUTTON'])), false);
  });
});
