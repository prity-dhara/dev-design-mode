import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canPreviewSplitText } from './split-text-preview.ts';

type Fake = {
  tagName: string;
  classList: Set<string>;
  children: Fake[];
  childNodes: Array<{ nodeType: number; textContent: string }>;
  textContent: string;
  hasAttribute: (n: string) => boolean;
  getAttribute: (n: string) => string | null;
  querySelectorAll: (selector: string) => Fake[];
};
function fake(tag: string, classes: string[], text: string): Fake {
  const el: Fake = {
    tagName: tag, classList: new Set(classes), children: [],
    childNodes: [], textContent: text,
    hasAttribute: () => false, getAttribute: () => null,
    querySelectorAll: () => [],
  };
  return el;
}
function append(parent: Fake, ...children: Fake[]) {
  parent.children.push(...children);
  parent.childNodes.push(...children.map(() => ({ nodeType: 1, textContent: '' })));
  parent.querySelectorAll = () => children.flatMap(child =>
    [child, ...child.querySelectorAll('*')]);
}
describe('reversible GSAP static preview safety', () => {
  it('allows a text host composed entirely of generated split wrappers', () => {
    const heading = fake('DIV', ['text-size-regular'], 'Hello world');
    const mask1 = fake('SPAN', ['gsap_split_word-mask'], 'Hello');
    const mask2 = fake('SPAN', ['gsap_split_word-mask'], 'world');
    append(heading, mask1, mask2);
    assert.equal(canPreviewSplitText(heading as unknown as HTMLElement), true);
  });
  it('never hides authored links or media mixed with split wrappers', () => {
    const heading = fake('DIV', ['text-size-regular'], 'Hello world');
    append(heading,
      fake('SPAN', ['gsap_split_word'], 'Hello'),
      fake('A', ['real-link'], 'world'));
    assert.equal(canPreviewSplitText(heading as unknown as HTMLElement), false);
  });
  it('does not hide a layout container with multiple nested text blocks', () => {
    const wrapper = fake('DIV', ['home-banner_box'], 'Text and CTA');
    append(wrapper,
      fake('DIV', ['text-size-regular'], 'Text'),
      fake('BUTTON', ['button'], 'CTA'));
    assert.equal(canPreviewSplitText(wrapper as unknown as HTMLElement), false);
  });
});
