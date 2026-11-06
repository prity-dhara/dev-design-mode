import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isSplitTextRoot, splitTextRoot, splitTextValue } from './split-text.ts';

type FakeEl = {
  tagName: string;
  classList: Set<string>;
  parentElement: FakeEl | null;
  textContent: string;
  getAttribute: (name: string) => string | null;
  hasAttribute: (name: string) => boolean;
  querySelectorAll: (selector: string) => FakeEl[];
};
function node(tagName: string, classes: string[] = [], text = '', attrs: Record<string, string> = {}): FakeEl {
  const el: FakeEl = {
    tagName, classList: new Set(classes), parentElement: null, textContent: text,
    getAttribute: name => attrs[name] ?? null,
    hasAttribute: name => Object.hasOwn(attrs, name),
    querySelectorAll: () => [],
  };
  return el;
}
function children(root: FakeEl, parts: FakeEl[]) {
  parts.forEach(part => { part.parentElement = root; });
  root.querySelectorAll = () => parts;
}
describe('animated split text selection', () => {
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
});
