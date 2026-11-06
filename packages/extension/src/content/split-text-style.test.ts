import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { splitTypographyProps, splitTypographySelector } from './split-text-style.ts';

describe('logical GSAP SplitText typography preview', () => {
  it('mirrors text styling into generated spans without changing animation properties', () => {
    const incoming = new Map([
      ['fontSize', '32px'], ['fontWeight', '700'], ['color', '#123456'],
      ['lineHeight', '1.3'], ['letterSpacing', '-0.02em'],
      ['transform', 'translateY(50px)'], ['opacity', '0.2'],
      ['position', 'relative'], ['overflow', 'hidden'], ['display', 'flex'],
    ]);
    const typography = splitTypographyProps(incoming);
    assert.deepEqual([...typography], [
      ['fontSize', '32px'], ['fontWeight', '700'], ['color', '#123456'],
      ['lineHeight', '1.3'], ['letterSpacing', '-0.02em'],
    ]);
  });

  it('keeps selectors scoped to the original host and supports Webflow masks', () => {
    const selector = splitTypographySelector('[data-dm-id="dm-3"][data-dm-id]');
    assert.match(selector, /\[data-dm-id="dm-3"\]/);
    assert.match(selector, /gsap_split_/);
    assert.match(selector, /\.char/);
    assert.match(selector, /\.word/);
    assert.match(selector, /\.line/);
  });

  it('does not mirror layout changes into generated children', () => {
    const typography = splitTypographyProps(new Map([
      ['width', '300px'], ['height', '150px'], ['marginTop', '8px'],
      ['padding', '12px'], ['backgroundColor', '#fff'],
    ]));
    assert.equal(typography.size, 0);
  });
});
