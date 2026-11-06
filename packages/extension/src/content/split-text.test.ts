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

test('GSAP character spans are detected with ordinary whitespace-separated classes', () => {
  const api = load();
  const root = heading(['char gsap-char', 'char', 'word', 'line']);
  assert.equal(api.isSplitTextHost(root), true);
});

test('clicking a character inside nested GSAP word selects the whole heading', () => {
  const api = load();
  const root = heading(['line', 'word', 'char', 'char']);
  const word: any = {
    tagName: 'DIV', parentElement: root, attributes: [], textContent: 'build',
    getAttribute: () => null, querySelectorAll: () => [wrapper('char'), wrapper('char')],
    querySelector: () => null,
  };
  const char: any = {
    tagName: 'SPAN', parentElement: word, attributes: [], textContent: 'b',
    getAttribute: () => 'char', querySelectorAll: () => [], querySelector: () => null,
  };
  assert.equal(api.getSplitTextHost(char), root);
});

test('a GSAP-split text-only div is editable as one host', () => {
  const api = load();
  const root = heading(['word', 'char', 'char'], 'DIV');
  assert.equal(api.isSplitTextHost(root), true);
  const char: any = {
    tagName: 'SPAN', parentElement: root, attributes: [], textContent: 'W',
    getAttribute: () => 'char', querySelectorAll: () => [], querySelector: () => null,
  };
  assert.equal(api.getSplitTextHost(char), root);
});

test('ordinary layout div containing a heading is not mistaken for one text value', () => {
  const api = load();
  const root = heading(['char', 'char'], 'DIV');
  root.querySelector = (selector: string) => selector.includes('h1') ? {} : null;
  assert.equal(api.isSplitTextHost(root), false);
});

function unmarkedUnit(text: string, style = ''): any {
  return {
    tagName: 'SPAN', textContent: text, attributes: [],
    getAttribute(name: string) { return name === 'style' ? style : ''; },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

test('classless GSAP word spans select the complete sentence, not one word', () => {
  const api = load();
  const parts = ['Outcomes ', 'delivered ', 'through ', 'GalentAI ', 'platform-based ', 'engineering ', 'services.'];
  const children = parts.map((p, i) => unmarkedUnit(p, i === 0 ? 'transform:translateY(0px)' : ''));
  const host: any = {
    tagName: 'P', textContent: parts.join(''), parentElement: null,
    querySelectorAll: () => children,
    getAttribute: () => '',
    querySelector: () => null,
  };
  const clicked: any = { ...children[6], parentElement: host };
  assert.equal(api.isSplitTextHost(host), true);
  assert.equal(api.getSplitTextHost(clicked), host);
});

test('ordinary heading with two decorative spans is not recognized as SplitText', () => {
  const api = load();
  const children = [unmarkedUnit('Hello '), unmarkedUnit('world')];
  const host: any = {
    tagName: 'H2', textContent: 'Hello world', parentElement: null,
    querySelectorAll: () => children,
    querySelector: () => null,
  };
  assert.equal(api.isSplitTextHost(host), false);
});

test('animated split word markup with a nested semantic heading is not treated as layout text', () => {
  const api = load();
  const children = ['One ', 'two ', 'three ', 'four '].map(s => unmarkedUnit(s, 'transform:translateY(0)'));
  const layout: any = {
    tagName: 'DIV', textContent: 'One two three four ', parentElement: null,
    querySelectorAll: () => children,
    querySelector: (selector: string) => selector.includes('h1') ? {} : null,
    getAttribute: () => '',
  };
  assert.equal(api.isSplitTextHost(layout), false);
});


test('gsap_split_line-mask and gsap_split_line identify the complete host', () => {
  const api = load();
  const text = heading([
    'gsap_split_line-mask', 'gsap_split_line',
    'gsap_split_line-mask', 'gsap_split_line',
  ], 'DIV');
  const mask: any = {
    tagName: 'SPAN', parentElement: text, attributes: [], textContent: 'services.',
    getAttribute: (name: string) => name === 'class' ? 'gsap_split_line-mask' : null,
    querySelectorAll: () => [wrapper('gsap_split_line')],
    querySelector: () => null,
  };
  const leaf: any = {
    tagName: 'SPAN', parentElement: mask, attributes: [], textContent: 'services.',
    getAttribute: (name: string) => name === 'class' ? 'gsap_split_line' : null,
    querySelectorAll: () => [], querySelector: () => null,
  };
  assert.equal(api.isSplitTextHost(text), true);
  assert.equal(api.getSplitTextHost(leaf), text);
});

test('editing line-split text keeps words intact across GSAP text nodes', () => {
  const api = load();
  const element = heading(['gsap_split_line-mask', 'gsap_split_line',
    'gsap_split_line-mask', 'gsap_split_line']);
  element.nodes = [makeNode('A whole first line '), makeNode('and second line')];
  const value = 'Whole text needs to change, preserving the spaces between each word.';
  assert.equal(api.previewSplitText(element, value), true);
  assert.equal(element.nodes.map((node: any) => node.nodeValue).join(''), value);
  assert.ok(element.nodes.every((node: any) => {
    const fragment = node.nodeValue as string;
    return !fragment || fragment.endsWith(' ') || node === element.nodes.at(-1);
  }));
});

test('clicking an inline span inside a regular paragraph selects the full paragraph', () => {
  const api = load();
  const para: any = { tagName: 'P', parentElement: null, querySelector: () => null };
  const inline: any = {
    tagName: 'SPAN', parentElement: para, closest: () => null,
  };
  assert.equal(api.getParagraphTextHost(inline), para);
});

test('Webflow text-size-regular div selects the full text block', () => {
  const api = load();
  const block: any = {
    tagName: 'DIV', className: 'text-size-regular',
    parentElement: null, querySelector: () => null,
  };
  const line: any = {
    tagName: 'SPAN', parentElement: block, closest: () => null,
  };
  assert.equal(api.getParagraphTextHost(line), block);
});

test('paragraph lookup does not swallow interactive links or unrelated layout containers', () => {
  const api = load();
  const para: any = { tagName: 'P', parentElement: null, querySelector: () => null };
  const link: any = { tagName: 'A', parentElement: para, closest: () => null };
  assert.equal(api.getParagraphTextHost(link), null);
  const layout: any = { tagName: 'DIV', className: 'card-grid', parentElement: null, querySelector: () => null };
  const leaf: any = { tagName: 'SPAN', parentElement: layout, closest: () => null };
  assert.equal(api.getParagraphTextHost(leaf), null);
});

test('paragraph plus badge row is not treated as one GSAP text host', () => {
  const api = load();
  const paragraph: any = {
    tagName: 'P', parentElement: null, textContent: 'GalentAI reads your systems',
    querySelectorAll: () => [], querySelector: () => null,
    getAttribute: () => null, attributes: [],
  };
  const badge: any = {
    tagName: 'DIV', parentElement: null, className: 'badges',
    textContent: 'KNOWLEDGE GRAPH GOVERNANCE',
    getAttribute: () => null, attributes: [],
    querySelector: () => null, querySelectorAll: () => [],
  };
  const words = ['KNOWLEDGE', 'GRAPH', 'GOVERNANCE', 'TRACEABILITY', 'ZERO'];
  const spans = words.map(word => ({
    tagName: 'SPAN', parentElement: badge, textContent: word,
    getAttribute: () => null, attributes: [], querySelector: () => null, querySelectorAll: () => [],
  }));
  const parent: any = {
    tagName: 'DIV', textContent: paragraph.textContent + ' ' + words.join(' '),
    className: 'feature-content', parentElement: null,
    querySelectorAll: () => [paragraph, badge, ...spans],
    querySelector: (selector: string) => selector.includes('div:not(') ? badge :
      selector.includes('p') ? paragraph : null,
    getAttribute: () => null, attributes: [],
  };
  paragraph.parentElement = parent;
  badge.parentElement = parent;
  assert.equal(api.isSplitTextHost(parent), false);
  assert.equal(api.getSplitTextHost(paragraph), null);
});

test('known gsap_split_line-mask div remains recognized when no unrelated nested div exists', () => {
  const api = load();
  const host = heading(['gsap_split_line-mask', 'gsap_split_line',
    'gsap_split_line-mask', 'gsap_split_line'], 'DIV');
  assert.equal(api.isSplitTextHost(host), true);
});

test('nested GSAP DIV line masks use the full text editor rather than parent layout', () => {
  const api = load();
  const line = (name: string): any => ({
    tagName: 'DIV', textContent: name, parentElement: null,
    attributes: [], querySelector: () => null, querySelectorAll: () => [],
    getAttribute: (key: string) => key === 'class' ? 'gsap_split_line' : null,
  });
  const first = line('First line');
  const second = line('Second line');
  const mask = (child: any): any => ({
    tagName: 'DIV', textContent: child.textContent, parentElement: null,
    attributes: [], querySelector: () => null,
    querySelectorAll: () => [child],
    getAttribute: (key: string) => key === 'class' ? 'gsap_split_line-mask' : null,
  });
  const maskA = mask(first);
  const maskB = mask(second);
  const host: any = {
    tagName: 'DIV', textContent: 'First lineSecond line',
    parentElement: null, attributes: [], getAttribute: () => '',
    querySelectorAll: () => [maskA, first, maskB, second],
    querySelector: () => null,
  };
  maskA.parentElement = host;
  maskB.parentElement = host;
  first.parentElement = maskA;
  second.parentElement = maskB;
  assert.equal(api.isSplitTextHost(host), true);
  assert.equal(api.getSplitTextHost(second), host);
});
