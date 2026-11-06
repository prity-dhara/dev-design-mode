import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isSplitTextRoot, isGeneratedSplitWrapper, splitTextRoot, splitTextValue } from './split-text.ts';

type FakeEl = {
  tagName: string;
  classList: Set<string>;
  parentElement: FakeEl | null;
  children: FakeEl[];
  textContent: string;
  getAttribute: (name: string) => string | null;
  hasAttribute: (name: string) => boolean;
  querySelector: (selector: string) => FakeEl | null;
  querySelectorAll: (selector: string) => FakeEl[];
};
function node(tagName: string, classes: string[] = [], text = '', attrs: Record<string, string> = {}): FakeEl {
  const el: FakeEl = {
    tagName, classList: new Set(classes), parentElement: null, children: [], textContent: text,
    getAttribute: name => attrs[name] ?? null,
    hasAttribute: name => Object.hasOwn(attrs, name),
    querySelector: selector => el.querySelectorAll(selector)[0] ?? null,
    querySelectorAll: selector => {
      const all: FakeEl[] = [];
      const collect = (p: FakeEl) => { for (const child of p.children) { all.push(child); collect(child); } };
      collect(el);
      if (selector === '[aria-hidden="true"]') return all.filter(p => p.getAttribute('aria-hidden') === 'true');
      return all;
    },
  };
  return el;
}
function children(root: FakeEl, parts: FakeEl[]) {
  root.children = parts;
  parts.forEach(part => { part.parentElement = root; });
}
describe('animated split text selection', () => {
  it('recognizes real Webflow gsap_split_word-mask and gsap_split_word classes', () => {
    const mask = node('SPAN', ['gsap_split_word-mask'], 'reading');
    const word = node('SPAN', ['gsap_split_word'], 'reading');
    assert.equal(isGeneratedSplitWrapper(mask as unknown as HTMLElement), true);
    assert.equal(isGeneratedSplitWrapper(word as unknown as HTMLElement), true);
    assert.equal(isGeneratedSplitWrapper(node('H3', ['heading-style-h3']) as unknown as HTMLElement), false);
  });

  it('selects the original heading when clicking a generated GSAP word', () => {
    const heading = node('H1', ['hero-heading'], 'Hello world', { 'aria-label': 'Hello world' });
    const a = node('SPAN', ['word'], 'Hello', { 'aria-hidden': 'true' });
    const b = node('SPAN', ['word'], 'world', { 'aria-hidden': 'true' });
    children(heading, [a, b]);
    assert.equal(splitTextRoot(b as unknown as HTMLElement), heading);
    assert.equal(splitTextValue(heading as unknown as HTMLElement), 'Hello world');
  });
  it('does not mistake ordinary layout classes for GSAP text', () => {
    const wrapper = node('DIV', ['line'], 'Navigation');
    const child = node('SPAN', [], 'Navigation');
    children(wrapper, [child]);
    assert.equal(isSplitTextRoot(wrapper as unknown as HTMLElement), false);
    assert.equal(splitTextRoot(child as unknown as HTMLElement), null);
  });
  it('recognizes headings split into separate lines', () => {
    const heading = node('H2', [], 'FirstSecond');
    const first = node('DIV', ['line'], 'First');
    const second = node('DIV', ['line'], 'Second');
    children(heading, [first, second]);
    assert.equal(splitTextRoot(second as unknown as HTMLElement), heading);
  });
  it('recognizes nested Webflow gsap_split_word-mask > gsap_split_word wrappers', () => {
    const paragraph = node('DIV', ['text-size-regular'], 'GalentAI builds a context graph');
    const firstMask = node('SPAN', ['gsap_split_word-mask'], 'GalentAI');
    const firstWord = node('SPAN', ['gsap_split_word'], 'GalentAI');
    const secondMask = node('SPAN', ['gsap_split_word-mask'], 'builds');
    const secondWord = node('SPAN', ['gsap_split_word'], 'builds');
    const thirdMask = node('SPAN', ['gsap_split_word-mask'], 'a');
    const thirdWord = node('SPAN', ['gsap_split_word'], 'a');
    children(firstMask, [firstWord]);
    children(secondMask, [secondWord]);
    children(thirdMask, [thirdWord]);
    children(paragraph, [firstMask, secondMask, thirdMask]);
    const container = node('DIV', ['home-banner_box'], 'Other page content');
    children(container, [paragraph]);
    assert.equal(isSplitTextRoot(paragraph as unknown as HTMLElement), true);
    assert.equal(isSplitTextRoot(container as unknown as HTMLElement), false);
    assert.equal(splitTextRoot(secondWord as unknown as HTMLElement), paragraph);
    assert.equal(splitTextValue(paragraph as unknown as HTMLElement), 'GalentAI builds a context graph');
  });
  it('detects an H3 with one generated GSAP line and nested words', () => {
    const heading = node('H3', ['heading-style-h3'], 'A better future');
    const line = node('DIV', ['gsap_split_line'], 'A better future');
    const a = node('SPAN', ['gsap_split_word-mask'], 'A');
    const b = node('SPAN', ['gsap_split_word-mask'], 'better');
    const c = node('SPAN', ['gsap_split_word-mask'], 'future');
    children(a, [node('SPAN', ['gsap_split_word'], 'A')]);
    children(b, [node('SPAN', ['gsap_split_word'], 'better')]);
    children(c, [node('SPAN', ['gsap_split_word'], 'future')]);
    children(line, [a, b, c]);
    children(heading, [line]);
    const parent = node('DIV', ['section'], 'Surrounding content');
    children(parent, [heading]);
    assert.equal(isSplitTextRoot(heading as unknown as HTMLElement), true);
    assert.equal(isSplitTextRoot(parent as unknown as HTMLElement), false);
    assert.equal(splitTextRoot(b.children[0] as unknown as HTMLElement), heading);
    assert.equal(splitTextValue(heading as unknown as HTMLElement), 'A better future');
  });
  it('reconstructs word boundaries if a custom splitter removed whitespace', () => {
    const paragraph = node('P', [], 'Helloworld');
    const one = node('SPAN', ['gsap_split_word'], 'Hello');
    const two = node('SPAN', ['gsap_split_word'], 'world');
    children(paragraph, [one, two]);
    assert.equal(splitTextValue(paragraph as unknown as HTMLElement), 'Hello world');
  });
});
