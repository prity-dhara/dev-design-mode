import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isEditableTextHost, findEditableTextDescendants } from './editable-text-host.ts';

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

type FakeElement = HTMLElement & {
  _children: FakeElement[];
};
function el(tagName: string, text = '', classNames: string[] = []): FakeElement {
  const o: any = {
    tagName,
    textContent: text,
    classList: new Set(classNames),
    _children: [],
    children: [],
    parentElement: null,
    hasAttribute: () => false,
    getAttribute: () => null,
    matches: () => false,
    closest: () => null,
    contains(other: any) { return this === other || this._children.some((c: any) => c.contains(other)); },
    querySelector: () => null,
    querySelectorAll(selector: string) {
      const descendants: any[] = [];
      function visit(x: any) { for (const child of x._children) { descendants.push(child); visit(child); } }
      visit(this);
      if (selector === '*') return descendants;
      const tags = selector.toUpperCase().split(',').map(k => k.trim());
      return descendants.filter(c => tags.includes(c.tagName));
    },
  };
  return o as FakeElement;
}
function add(parent: FakeElement, ...kids: FakeElement[]) {
  kids.forEach(child => { (child as any).parentElement = parent; });
  parent._children.push(...kids);
  (parent as any).children = parent._children;
}

describe('text found inside decorated Webflow wrappers', () => {
  it('shows EXPORT as one text target when div.p-tagline contains an icon and a text span', () => {
    const root = el('DIV', 'EXPORT', ['p-tagline']);
    const icon = el('SVG', '', ['icon']);
    const text = el('SPAN', 'EXPORT', ['tagline-copy']);
    add(root, icon, text);
    assert.deepEqual(findEditableTextDescendants(root), [text]);
  });
  it('finds a deeply nested text leaf rather than editing the whole layout', () => {
    const root = el('DIV', 'EXPORT', ['p-tagline']);
    const mask = el('DIV', 'EXPORT', ['mask']);
    const text = el('SPAN', 'EXPORT', ['text']);
    add(mask, text);
    add(root, mask);
    assert.deepEqual(findEditableTextDescendants(root), [text]);
  });
  it('keeps two headings separate instead of merging their text', () => {
    const root = el('DIV', 'Title and description', ['card']);
    const title = el('H3', 'Title');
    const paragraph = el('P', 'Description');
    add(root, title, paragraph);
    assert.deepEqual(findEditableTextDescendants(root), [title, paragraph]);
  });
  it('does not expose inner generated GSAP word spans as independent targets', () => {
    const root = el('DIV', 'Some animation', ['wrapper']);
    const host = el('DIV', 'Some animation', ['text-size-regular']);
    const a = el('SPAN', 'Some', ['gsap_split_word']);
    const b = el('SPAN', 'animation', ['gsap_split_word']);
    add(host, a, b);
    add(root, host);
    assert.deepEqual(findEditableTextDescendants(root), [host]);
  });
});
