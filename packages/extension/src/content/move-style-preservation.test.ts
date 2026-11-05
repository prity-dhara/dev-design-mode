import test from 'node:test';
import assert from 'node:assert/strict';
import { captureMoveTextStyle, preserveMovedTextStyle, MOVE_TEXT_PROPERTIES } from './move-style-preservation';

test('preserves only typography changed by reparenting', () => {
  const original = new Map([['font-size', '32px'], ['color', 'rgb(20, 20, 20)'], ['line-height', '40px']]);
  const moved = new Map([['font-size', '16px'], ['color', 'rgb(20, 20, 20)'], ['line-height', 'normal']]);
  let values = original;
  const prior = globalThis.window;
  // Test the pure getComputedStyle boundary without a browser.
  (globalThis as any).window = {
    getComputedStyle: () => ({ getPropertyValue: (name: string) => values.get(name) || '' }),
  };
  try {
    const before = captureMoveTextStyle({} as Element);
    values = moved;
    const applied: Array<[string, string]> = [];
    const changed = preserveMovedTextStyle({} as Element, before, (property, value) => applied.push([property, value]));
    assert.deepEqual(changed, ['font-size', 'line-height']);
    assert.deepEqual(applied, [['font-size', '32px'], ['line-height', '40px']]);
  } finally {
    (globalThis as any).window = prior;
  }
});

test('same inherited typography yields no style overrides', () => {
  const prior = globalThis.window;
  (globalThis as any).window = {
    getComputedStyle: () => ({ getPropertyValue: (name: string) => name === 'font-size' ? '16px' : '' }),
  };
  try {
    const before = captureMoveTextStyle({} as Element);
    let count = 0;
    assert.deepEqual(preserveMovedTextStyle({} as Element, before, () => { count++; }), []);
    assert.equal(count, 0);
    assert.ok(MOVE_TEXT_PROPERTIES.includes('font-size'));
  } finally {
    (globalThis as any).window = prior;
  }
});
