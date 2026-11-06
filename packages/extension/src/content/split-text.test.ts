import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

const source = transformSync(readFileSync(new URL('./split-text.ts', import.meta.url), 'utf8'), {
  loader: 'ts', format: 'cjs',
}).code;

function load() {
  const module = { exports: {} as Record<string, (...args: any[]) => any> };
  const document = {
    createTreeWalker(el: any) {
      let i = 0;
      return { nextNode: () => el.nodes[i++] || null };
    },
  };
  runInNewContext(source, { module, document, NodeFilter: { SHOW_TEXT: 4 } });
  return module.exports;
}

function makeNode(value: string) { return { nodeValue: value }; }
function wrapper(className: string) {
  return { getAttribute: (name: string) => name === 'class' ? className : null, attributes: [] };
}
function heading(classes = ['line', 'line'], tagName = 'H1') {
  const nodes = [makeNode('We build '), makeNode('websites')];
  const element: any = {
    tagName, parentElement: null, textContent: 'We build websites', nodes,
    querySelectorAll: () => classes.map(wrapper), querySelector: () => null,
  };
  return element;
}

test('clicking a GSAP line resolves to one heading', () => {
  const api = load();
  const headingElement = heading(['line', 'word', 'word']);
  const line: any = { tagName: 'DIV', parentElement: headingElement, querySelectorAll: () => [],
    querySelector: () => null, textContent: 'We build', attributes: [] };
  assert.equal(api.getSplitTextHost(line), headingElement);
  assert.equal(api.isSplitTextHost(headingElement), true);
});

test('unrelated single line class does not trigger split detection', () => {
  const api = load();
  assert.equal(api.isSplitTextHost(heading(['line'])), false);
  assert.equal(api.isSplitTextHost(heading(['line', 'line'], 'SECTION')), false);
});

test('editing and restoring animated heading preserves original wrapper nodes', () => {
  const api = load();
  const element = heading();
  const originalNodes = [...element.nodes];
  const segments = api.captureSplitTextSegments(element);
  assert.equal(api.previewSplitText(element, 'We design great products'), true);
  assert.equal(element.nodes.map((n: any) => n.nodeValue).join(''), 'We design great products');
  assert.equal(api.restoreSplitTextSegments(element, segments), true);
  assert.equal(element.nodes.map((n: any) => n.nodeValue).join(''), 'We build websites');
  assert.deepEqual(element.nodes, originalNodes);
});
