// ============================================================
// Markdown / GitHub-issue exports for "Copy Prompt" + "Send to Agent".
// Designed for minimum-token, maximum-signal output to a coding agent:
// real markdown headers (so parsers see structure), values resolved to
// design tokens when possible (so the agent preserves the design system),
// and a source-files block so the agent opens the right files.
// ============================================================

import { getElementById, generateSelector, describeElement } from './helpers';
import { getStyleChanges, getTextChanges, getDomChanges } from './change-tracker';
import { getSourceLocation } from './source-detection';
import type { CommentData } from './comments';
import { getTokenEdits } from './root-var-store';
import { getTokenIndex, type PageToken } from './token-engine';
import { type Breakpoint } from '../shared';

// Breakpoint annotation for the agent. Only mobile/tablet are tagged —
// desktop is the implicit default. Takes every change on a line (style
// groups collapse multiple edits) and renders one suffix; a group spanning
// breakpoints lists them narrowest-first instead of a single px.
function breakpointTag(items: { breakpoint?: Breakpoint; viewportWidth?: number }[]): string {
  const tagged = items.filter(i => i.breakpoint && i.breakpoint !== 'desktop');
  if (tagged.length === 0) return '';
  const kinds = [...new Set(tagged.map(i => i.breakpoint!))];
  if (kinds.length === 1) {
    const widths = tagged.map(i => i.viewportWidth).filter((w): w is number => typeof w === 'number');
    const px = widths.length ? ` · ${Math.min(...widths)}px` : '';
    return ` _(${kinds[0]}${px})_`;
  }
  const order: Record<Breakpoint, number> = { mobile: 0, tablet: 1, desktop: 2 };
  return ` _(${kinds.sort((a, b) => order[a] - order[b]).join(', ')})_`;
}

// Human trigger labels for Motion state-variants in the agent prompt.
const MOTION_STATE_LABEL: Record<string, string> = {
  ':hover': 'on hover',
  ':active': 'on press',
  ':focus-visible': 'on focus',
  '@starting': 'on appear',
};

interface ElementContext {
  selector: string;
  tagName: string;
  smartLabel: string;
  // True when smartLabel matches more than one element on the page —
  // lines then carry the full selector so the agent can pinpoint the node.
  ambiguous?: boolean;
  sourceFile?: string;
  componentName?: string;
  framework?: string;
  line?: number;
}

function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
}

function shortenValue(v: string, max = 32): string {
  if (!v) return '';
  return v.length > max ? v.slice(0, max - 1) + '…' : v;
}

// Word-level diff for text edits, in git `--word-diff` notation
// (`[-removed-]` / `{+added+}`). Emitting only the changed words with a few
// words of context, instead of the whole before+after paragraph, keeps the
// exported prompt small (it's fed to the agent as input tokens). The element
// pointer already localises the edit, so the agent just needs which words
// changed. A legend in the ## Changes header explains the markers.
type DiffOp = { type: 'eq' | 'del' | 'ins'; text: string };

function wordDiff(a: string[], b: string[]): DiffOp[] {
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops: DiffOp[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ type: 'eq', text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ type: 'del', text: a[i] }); i++; }
    else { ops.push({ type: 'ins', text: b[j] }); j++; }
  }
  while (i < n) ops.push({ type: 'del', text: a[i++] });
  while (j < m) ops.push({ type: 'ins', text: b[j++] });
  return ops;
}

// Render the diff inline: `[-removed-] {+added+}`, plain unchanged context, and
// `…` where a long unchanged run is elided (keeping CTX words each side of a
// change). Returns null when the two share no words — the caller then emits the
// new text alone, since diffing two unrelated strings only adds noise.
function inlineTextDiff(oldText: string, newText: string): string | null {
  const a = oldText.split(/\s+/).filter(Boolean);
  const b = newText.split(/\s+/).filter(Boolean);
  const bSet = new Set(b);
  if (!a.some(w => bSet.has(w))) return null;
  const ops = wordDiff(a, b);
  const CTX = 4;
  const out: string[] = [];
  let k = 0;
  while (k < ops.length) {
    if (ops[k].type === 'eq') {
      const run: string[] = [];
      while (k < ops.length && ops[k].type === 'eq') run.push(ops[k++].text);
      const atStart = out.length === 0, atEnd = k >= ops.length;
      if (run.length <= CTX * 2) out.push(...run);
      else if (atStart) out.push('…', ...run.slice(-CTX));
      else if (atEnd) out.push(...run.slice(0, CTX), '…');
      else out.push(...run.slice(0, CTX), '…', ...run.slice(-CTX));
    } else {
      const dels: string[] = [], inss: string[] = [];
      while (k < ops.length && ops[k].type !== 'eq') {
        (ops[k].type === 'del' ? dels : inss).push(ops[k].text); k++;
      }
      // Adjacent del+ins render as one token (`[-old-]{+new+}`) — the git
      // word-diff form for a substitution.
      const del = dels.length ? '[-' + dels.join(' ') + '-]' : '';
      const ins = inss.length ? '{+' + inss.join(' ') + '+}' : '';
      if (del || ins) out.push(del + ins);
    }
  }
  return out.join(' ');
}

function gatherElementContext(elementId: string, selector: string): ElementContext {
  const el = getElementById(elementId);
  let tagName = '';
  let smartLabel = selector;
  let ambiguous = false;
  let sourceFile: string | undefined;
  let componentName: string | undefined;
  let framework: string | undefined;
  let line: number | undefined;
  if (el) {
    tagName = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls = (typeof el.className === 'string' && el.className.trim())
      ? '.' + el.className.trim().split(/\s+/)[0]
      : '';
    // Class-less markup would give a bare tag ("div") — fall back to the
    // recognition label (text snippet / accessible name / position).
    smartLabel = id || (cls ? tagName + cls : describeElement(el));
    // Regenerate from the live element: recorded selectors are positional
    // (nth-of-type) and go stale once anything is reordered.
    selector = generateSelector(el);
    if (!id) {
      // A throwing label (e.g. a Tailwind `md:flex` class) can't be used
      // by the agent as a selector either — treat it as ambiguous.
      try { ambiguous = document.querySelectorAll(smartLabel).length > 1; }
      catch { ambiguous = true; }
    }
    const src = getSourceLocation(el);
    if (src) {
      sourceFile = src.cleanPath || (src.file !== 'unknown' ? src.file : undefined);
      componentName = src.component;
      framework = src.framework;
      line = src.line;
    }
  }
  return { selector, tagName, smartLabel, ambiguous, sourceFile, componentName, framework, line };
}

// ── Page design tokens ──
// Build a value→name map so we can rewrite raw values in the changes list to
// `var(--name)` references — the agent then preserves the design system
// instead of inlining hex colors and px sizes.

// Emit a focused list of CSS variable changes the user made in this
// session. Only fires when the user has actually modified at least one
// token — otherwise the export stays silent on the design system.
// Returns an empty string when no edits exist, so the caller can skip
// the section without producing trailing whitespace.
function buildTokenChangesSection(): string {
  const edits = getTokenEdits();
  if (edits.length === 0) return '';
  const lines: string[] = [];
  lines.push('## Tokens changed');
  for (const e of edits) {
    const scope = e.scopeSelector !== ':root' ? ` (scope \`${e.scopeSelector}\`)` : '';
    const system = e.system ? ` [${e.system}]` : '';
    lines.push(`- \`${e.cssVar}\`${system}${scope}: ${e.original || '(unset)'} → ${e.current}`);
  }
  lines.push('');
  lines.push('These redefine CSS custom properties. Find each token\'s definition in the codebase (SCSS variable, theme file, Tailwind @theme block, or CSS rule on the scope selector) and change it at the source — do not restyle individual components.');
  return lines.join('\n');
}

// Normalize a value for comparison: strip spaces, lower-case, collapse
// 6-digit hex to lowercase with leading #, etc. Robust enough for the
// common cases (hex, rgb/rgba, named colors, px sizes).
function normalize(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, '');
}

function buildTokenLookup(tokens: PageToken[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const t of tokens) {
    const v = t.resolvedValue || t.value;
    if (!v) continue;
    // Tailwind's internal --tw-* utilities are implementation details, not
    // design-system choices. Generic values like 0px/auto/inherit are too
    // common to associate reliably with any one token.
    if (/^--tw-/.test(t.cssVar) || /^(?:0(?:px|rem|em|%)?|auto|none|normal|inherit|initial|unset)$/i.test(v.trim())) continue;
    const key = normalize(v);
    // If multiple tokens share a resolved value, do not arbitrarily pick the
    // last one: that would silently substitute the wrong variable.
    if (lookup.has(key)) {
      lookup.set(key, '');
    } else {
      lookup.set(key, t.cssVar);
    }
  }
  return lookup;
}

// If the value matches a token's resolved value, rewrite it as `var(--name)`.
// Already-`var(...)` values pass through untouched.
function tokenize(value: string, lookup: Map<string, string>, used: Set<string>): string {
  if (!value) return value;
  if (value.startsWith('var(')) {
    const m = value.match(/var\((--[^),\s]+)/);
    if (m) used.add(m[1]);
    return value;
  }
  const hit = lookup.get(normalize(value));
  if (hit) {
    used.add(hit);
    return `var(${hit})`;
  }
  return value;
}

// ── Markdown — short, chronological, agent-friendly ──
// A short selector is useful only if it actually points to the intended node.
// Prefer a unique ID, then a unique class, then a named ancestor + class and
// 1-based position. Retain the recorded path if we cannot verify the match.
function compactSelector(elementId: string | undefined, recorded: string, explicit?: HTMLElement | null): string {
  const el = explicit ?? (elementId ? getElementById(elementId) : null);
  if (!el) return recorded;
  const matches = (selector: string, node: Element): boolean => {
    try { return document.querySelectorAll(selector).length === 1 && document.querySelector(selector) === node; }
    catch { return false; }
  };
  if (el.id) {
    const byId = '#' + CSS.escape(el.id);
    if (matches(byId, el)) return byId;
  }
  const classes = typeof el.className === 'string'
    ? el.className.trim().split(/\s+/).filter(v => v && !v.startsWith('dm-'))
    : [];
  for (const cls of classes) {
    const byClass = '.' + CSS.escape(cls);
    if (matches(byClass, el)) return byClass;
  }
  for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const parentClasses = typeof parent.className === 'string'
      ? parent.className.trim().split(/\s+/).filter(v => v && !v.startsWith('dm-'))
      : [];
    const anchors = [...(parent.id ? ['#' + CSS.escape(parent.id)] : []),
      ...parentClasses.map(v => '.' + CSS.escape(v))];
    for (const anchor of anchors) {
      for (const cls of classes) {
        const candidate = anchor + ' .' + CSS.escape(cls);
        if (matches(candidate, el)) return candidate;
      }
      const tagCandidate = anchor + ' ' + el.tagName.toLowerCase();
      if (matches(tagCandidate, el)) return tagCandidate;
    }
  }
  // Even a nonunique class is useful when accompanied by its exact position.
  if (el.parentElement && classes.length > 0) {
    const parent = el.parentElement;
    const siblings = Array.from(parent.children).filter(child =>
      child.classList?.contains(classes[0]));
    const index = siblings.indexOf(el) + 1;
    const parentSelector = compactSelectorForParent(parent);
    if (index > 0 && parentSelector) {
      const childPosition = Array.from(parent.children).indexOf(el) + 1;
      return parentSelector + ' > .' + CSS.escape(classes[0]) + ':nth-child(' + childPosition + ')';
    }
  }
  return recorded || generateSelector(el);
}

// Only abbreviate a recorded duplicate source when the original still
// resolves uniquely and is not the newly created clone.
function compactDuplicateSource(recorded: string, cloneId: string): string {
  try {
    const nodes = document.querySelectorAll(recorded);
    if (nodes.length !== 1 || nodes[0] === getElementById(cloneId)) return recorded;
    return compactSelector(undefined, recorded, nodes[0] as HTMLElement);
  } catch { return recorded; }
}

function compactSelectorForParent(parent: HTMLElement): string {
  if (parent.id) return '#' + CSS.escape(parent.id);
  const classes = typeof parent.className === 'string'
    ? parent.className.trim().split(/\s+/).filter(v => v && !v.startsWith('dm-'))
    : [];
  for (const cls of classes) {
    const candidate = '.' + CSS.escape(cls);
    try {
      if (document.querySelectorAll(candidate).length === 1) return candidate;
    } catch { /* fallback to DOM selector */ }
  }
  return generateSelector(parent);
}

function locationLabel(location: { parentSelector: string; index: number; parentId?: string },
  elementId?: string, current = false): string {
  const el = elementId ? getElementById(elementId) : null;
  if (current && el?.parentElement) {
    return compactSelectorForParent(el.parentElement) + ', child ' +
      (Array.from(el.parentElement.children).indexOf(el) + 1);
  }
  const parent = location.parentId ? getElementById(location.parentId) : null;
  return (parent ? compactSelectorForParent(parent) : location.parentSelector) +
    ', child ' + (location.index + 1);
}

// Copy Prompt is intentionally separate from the structured MCP change report:
// short human-readable instructions, with no ephemeral E-number references.
export function exportMarkdown(pageComments: CommentData[] = []): string {
  const styleHistory = getStyleChanges().filter(c => c.status !== 'resolved' && c.oldValue !== c.newValue);
  // Export final intended CSS, not a log of intermediate slider/picker edits.
  // The earliest original value and latest edited value determine whether a
  // property still has an effective change.
  const finalStyles = new Map<string, (typeof styleHistory)[number] & { firstOldValue: string }>();
  for (const change of [...styleHistory].sort((a, b) => a.timestamp - b.timestamp)) {
    const key = [change.elementId, change.property, change.state || '',
      change.breakpoint || 'desktop', change.viewportWidth || ''].join('|');
    const firstOldValue = finalStyles.get(key)?.firstOldValue ?? change.oldValue;
    finalStyles.set(key, { ...change, firstOldValue });
  }
  const styles = [...finalStyles.values()].filter(c => normalize(c.firstOldValue) !== normalize(c.newValue));
  const texts = getTextChanges().filter(c => c.status !== 'resolved' && c.oldText !== c.newText);
  const dom = getDomChanges().filter(c => c.status !== 'resolved');
  const tokens = getTokenIndex().tokens;
  const lookup = buildTokenLookup(tokens);
  const used = new Set<string>();
  const created = new Map<string, (typeof dom)[number]>(dom.filter(c => c.action === 'duplicate' || c.action === 'insert').map(c => [c.elementId, c] as const));
  const finalMoves = new Map<string, (typeof dom)[number]>(dom.filter(c => c.action === 'move' && c.destination).map(c => [c.elementId, c] as const));
  const createdContext = (elementId: string, recordedSelector: string): string => {
    const el = getElementById(elementId);
    if (created.has(elementId)) {
      const d = created.get(elementId)!;
      const loc = finalMoves.get(elementId)?.destination ?? d.destination;
      return 'new ' + (d.tagName || 'element') + (loc ? ' at ' + locationLabel(loc, elementId, true) : '');
    }
    for (const [id, d] of created) {
      const parent = getElementById(id);
      if (el && parent && parent !== el && parent.contains(el)) {
        const loc = finalMoves.get(id)?.destination ?? d.destination;
        return compactSelector(elementId, recordedSelector) + ' inside new ' + d.tagName +
          (loc ? ' at ' + locationLabel(loc, id, true) : '');
      }
    }
    return '';
  };
  const elementLabel = (elementId: string, selector: string) =>
    createdContext(elementId, selector) || compactSelector(elementId, selector);

  // Use one shared target when possible, otherwise label each affected item.
  const firstDom = dom.find(c => c.destination || c.origin);
  const firstStyle = styles[0];
  const firstText = texts[0];
  const rootTarget = firstDom
    ? locationLabel(finalMoves.get(firstDom.elementId)?.destination ?? firstDom.destination ?? firstDom.origin!, undefined).split(', child ')[0]
    : firstStyle ? elementLabel(firstStyle.elementId, firstStyle.selector)
    : firstText ? elementLabel(firstText.elementId, firstText.selector)
    : '';
  const lines: string[] = ['Page: ' + window.location.href];
  if (rootTarget) lines.push('Target: ' + rootTarget);
  lines.push('', 'Changes:');

  type Entry = { time: number; order: number; text: string };
  const entries: Entry[] = [];
  for (const change of dom) {
    if (change.action === 'move' && created.has(change.elementId)) continue;
    const final = finalMoves.get(change.elementId)?.destination ?? change.destination;
    let description = '';
    if (change.action === 'duplicate') {
      const source = compactDuplicateSource(change.sourceSelector || change.selector, change.elementId);
      description = 'Duplicate ' + source +
        (final ? ' → ' + locationLabel(final, change.elementId, true) : '') +
        '. Keep original classes/styles; edit new copy only.';
    } else if (change.action === 'insert') {
      // Include markup only when it contains useful structure or authored
      // attributes. Empty divs/sections remain one short instruction.
      const markup = (change.outerHTML || '')
        .replace(/\sdata-dm-id="[^"]*"/g, '')
        .replace(/\sdata-dm-[\w-]+="[^"]*"/g, '');
      const meaningful = /\s(?:class|style|id|src|alt|href)=/.test(markup) ||
        />\s*[^<\s]/.test(markup) || /<\w[^>]*>\s*<\w/.test(markup);
      description = 'Add ' + change.tagName +
        (final ? ' at ' + locationLabel(final, change.elementId, true) : '') +
        (meaningful ? ': ' + markup : '.') ;
    } else if (change.action === 'move') {
      description = 'Move ' + elementLabel(change.elementId, change.selector) +
        (change.origin ? ' from ' + locationLabel(change.origin) : '') +
        (final ? ' to ' + locationLabel(final, change.elementId, true) : '') +
        '. Preserve content and classes.';
    } else if (change.action === 'delete') {
      description = 'Delete ' + elementLabel(change.elementId, change.selector) +
        (change.origin ? ' at ' + locationLabel(change.origin) : '') + '.';
    }
    if (description) entries.push({ time: change.timestamp, order: 0, text: description + breakpointTag([change]) });
  }

  // Group style edits by the affected element and breakpoint/state; keep all
  // exact output values and explicit states. Do not truncate CSS values.
  const styleGroups = new Map<string, typeof styles>();
  for (const change of styles) {
    const key = change.elementId + '|' + (change.state || '') + '|' + (change.breakpoint || 'desktop') + '|' + (change.viewportWidth || '');
    if (!styleGroups.has(key)) styleGroups.set(key, []);
    styleGroups.get(key)!.push(change);
  }
  for (const group of styleGroups.values()) {
    const first = group[0];
    const changes = group.map(change =>
      camelToKebab(change.property) + ': ' + tokenize(change.newValue, lookup, used)).join('; ');
    const state = first.state ? ' (' + (MOTION_STATE_LABEL[first.state] || first.state) + ')' : '';
    const scopedCopy = created.has(first.elementId) || createdContext(first.elementId, first.selector) !== '';
    entries.push({ time: Math.min(...group.map(c => c.timestamp)), order: 1,
      text: 'Style ' + elementLabel(first.elementId, first.selector) + state + ' → ' +
        changes + (scopedCopy
          ? '. Scope to this copy (unique class/selector); never edit the shared class.'
          : '.') + breakpointTag(group) });
  }

  for (const change of texts) {
    const value = JSON.stringify(change.newText);
    const name = change.attributeName ? ' ' + change.attributeName : ' text';
    entries.push({ time: change.timestamp, order: 2, text: 'Set ' +
      elementLabel(change.elementId, change.selector) + name + ' → ' + value +
      '.' + breakpointTag([change]) });
  }
  const tokenEdits = getTokenEdits();
  for (const edit of tokenEdits) {
    entries.push({ time: 0, order: 0, text: 'Set token ' + edit.cssVar +
      (edit.scopeSelector !== ':root' ? ' on ' + edit.scopeSelector : '') +
      ' → ' + edit.current + ' at its definition.' });
  }

  entries.sort((a, b) => a.time - b.time || a.order - b.order);
  if (entries.length === 0 && pageComments.length === 0) lines.push('- No changes recorded.');
  for (const entry of entries) lines.push('- ' + entry.text);
  for (const comment of pageComments) {
    lines.push('- Note on ' + comment.selector + ': ' + comment.text.trim());
  }
  return lines.join('\n');
}

// ── GitHub issue body — same content with a heavier preamble ──
export function exportGitHubIssueBody(): string {
  return exportMarkdown();
}
