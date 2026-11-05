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
export function exportMarkdown(pageComments: CommentData[] = []): string {
  // A prompt represents final unresolved intent, not the full edit history.
  const styleChanges = getStyleChanges().filter(c => c.status !== 'resolved' && c.oldValue !== c.newValue);
  const textChanges = getTextChanges().filter(c => c.status !== 'resolved' && c.oldText !== c.newText);
  const domChanges = getDomChanges().filter(c => c.status !== 'resolved');

  const tokens = getTokenIndex().tokens;
  const tokenLookup = buildTokenLookup(tokens);
  const tokensUsed = new Set<string>();

  const lines: string[] = [];
  // One page pointer is enough; avoid repeating the document title and URL.
  lines.push(`Page: ${window.location.href}`);

  // Tokens-changed context — only included when the user has actually
  // modified at least one :root CSS variable in this session. Avoids
  // bloating every export with the full design-system catalog.
  const tokensChanged = buildTokenChangesSection();
  if (tokensChanged) {
    lines.push('');
    lines.push(tokensChanged);
  }

  // Build context once per element for stable short labels + source file hints.
  const idsToContext = new Map<string, ElementContext>();
  const ensureCtx = (elementId: string, selector: string) => {
    if (!idsToContext.has(elementId)) idsToContext.set(elementId, gatherElementContext(elementId, selector));
    return idsToContext.get(elementId)!;
  };

  type Entry = { t: number; line: string };
  const entries: Entry[] = [];

  // Each change is one numbered instruction in the final Markdown.
  // Retain compact element references and chronological ordering.
  // A clone that was subsequently moved is ONE final create operation.
  // Keep the new node's final destination and its style/text edits, but do
  // not ask the coding agent to first create it elsewhere then move it.
  const createdIds = new Set(
    domChanges.filter(d => d.action === 'duplicate' || d.action === 'insert').map(d => d.elementId),
  );
  const finalMoves = new Map<string, (typeof domChanges)[number]>();
  for (const change of domChanges) {
    if (change.action === 'move' && change.destination) finalMoves.set(change.elementId, change);
  }
  // Each element receives one short reference. Include its exact selector
  // once in the target index rather than on every modification line.
  const targets = new Map<string, { ref: string; ctx: ElementContext }>();
  const label = (elementId: string, ctx: ElementContext): string => {
    let entry = targets.get(elementId);
    if (!entry) {
      entry = { ref: 'E' + (targets.size + 1), ctx };
      targets.set(elementId, entry);
    }
    return entry.ref;
  };

  // A nested text/style edit may belong to a newly duplicated parent,
  // not to the pre-existing element with a similar CSS selector.
  // Use actual live DOM ancestry, never infer this from nth-of-type paths.
  const createdParents = domChanges.filter(c =>
    c.action === 'duplicate' || c.action === 'insert',
  );
  const nestedInCreated = (elementId: string): string => {
    const child = getElementById(elementId);
    if (!child) return '';
    let closest: { id: string; depth: number } | null = null;
    for (const parentChange of createdParents) {
      if (parentChange.elementId === elementId) continue;
      const parent = getElementById(parentChange.elementId);
      if (!parent || !parent.contains(child)) continue;
      let depth = 0;
      for (let current = child.parentElement; current && current !== parent; current = current.parentElement) depth++;
      if (!closest || depth < closest.depth) closest = { id: parentChange.elementId, depth };
    }
    if (!closest) return '';
    const parentChange = createdParents.find(c => c.elementId === closest!.id)!;
    const parentRef = label(parentChange.elementId, ensureCtx(parentChange.elementId, parentChange.selector));
    return ' (inside newly created ' + parentRef + ')';
  };

  // One CSS property per instruction: no long semicolon-separated paragraphs.
  // Move/duplicate intent is still resolved to its final destination below.
  for (const c of styleChanges) {
    const ctx = ensureCtx(c.elementId, c.selector);
    const before = shortenValue(tokenize(c.oldValue, tokenLookup, tokensUsed));
    const after = shortenValue(tokenize(c.newValue, tokenLookup, tokensUsed));
    const trigger = c.state ? ` (${MOTION_STATE_LABEL[c.state] || c.state})` : '';
    entries.push({
      t: c.timestamp,
      line: `${label(c.elementId, ctx)}${nestedInCreated(c.elementId)}: Set ${camelToKebab(c.property)} ${before} → ${after}${trigger}${breakpointTag([c])}`,
    });
  }

  // Text changes ship as a compact inline word-diff (`~~removed~~ **added**`,
  // unchanged runs elided) instead of the whole before+after paragraph, so the
  // agent gets only the corrections. A total rewrite (no shared words) or an
  // oversized edit falls back to the new text alone.
  for (const c of textChanges) {
    const ctx = ensureCtx(c.elementId, c.selector);
    if (c.attributeName) {
      entries.push({
        t: c.timestamp,
        line: `${label(c.elementId, ctx)}${nestedInCreated(c.elementId)}: Set ${c.attributeName} ${JSON.stringify(c.oldText)} → ${JSON.stringify(c.newText)}` + breakpointTag([c]),
      });
      continue;
    }
    const oldText = (c.oldText || '').trim();
    const newText = (c.newText || '').trim();
    const head = `${label(c.elementId, ctx)}${nestedInCreated(c.elementId)}`;
    const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;
    const diff = wordCount(oldText) > 400 || wordCount(newText) > 400
      ? null
      : inlineTextDiff(oldText, newText);
    entries.push({
      t: c.timestamp,
      line: (diff !== null ? `${head}: Update text ${diff}` : `${head}: Set text → ${JSON.stringify(newText)}`) + breakpointTag([c]),
    });
  }

  // DOM changes (delete/duplicate/insert/move). Moves surface BOTH ends:
  // origin (stored at drag time, parent selector re-resolved live via its
  // data-dm-id) and destination (the element's CURRENT position — stored
  // destinations are positional and go stale after later reorders).
  const describeStored = (loc: { parentSelector: string; index: number; parentId?: string }): string => {
    const parent = loc.parentId ? getElementById(loc.parentId) : null;
    return `${parent ? generateSelector(parent) : loc.parentSelector}[${loc.index}]`;
  };
  const describeCurrent = (el: HTMLElement | null, fallback: { parentSelector: string; index: number; parentId?: string }): string => {
    if (el?.parentElement) {
      return `${generateSelector(el.parentElement)}[${Array.from(el.parentElement.children).indexOf(el)}]`;
    }
    return describeStored(fallback);
  };
  for (const c of domChanges) {
    // New elements are described once at their FINAL position, even if
    // subsequently moved. The following style and text changes still
    // reference the new element via its stable E-number.
    if (c.action === 'move' && createdIds.has(c.elementId)) continue;
    const ctx = ensureCtx(c.elementId, c.selector);
    let line: string;
    if (c.action === 'move' && c.destination) {
      const dest = describeCurrent(getElementById(c.elementId), c.destination);
      line = c.origin
        ? `${label(c.elementId, ctx)}: Move from ${describeStored(c.origin)} to ${dest} (0-based child positions). Preserve its content and classes.`
        : `${label(c.elementId, ctx)}: Move to ${dest} (0-based child position). Preserve its content and classes.`;
    } else if ((c.action === 'duplicate' || c.action === 'insert') && c.destination) {
      const destination = describeCurrent(getElementById(c.elementId), finalMoves.get(c.elementId)?.destination ?? c.destination);
      // Newly created nodes keep their own E-reference, so subsequent
      // text and appearance edits unambiguously apply to the new node.
      const origin = c.action === 'duplicate'
        ? (c.sourceSelector ? `Duplicate source (${c.sourceSelector}) into` : 'Duplicate element into')
        : 'Insert element at';
      line = `${label(c.elementId, ctx)}: ${origin} ${destination} (0-based child position). Apply later edits to this new element.`;
    } else if (c.action === 'delete' && c.origin) {
      line = `${label(c.elementId, ctx)}: Delete from ${describeStored(c.origin)}.`;
    } else {
      const verb =
        c.action === 'delete' ? 'Delete element' :
        c.action === 'duplicate' ? 'Duplicate element' :
        c.action === 'insert' ? 'Insert element' :
        c.action === 'move' ? 'Move element' : c.action;
      line = `${label(c.elementId, ctx)}: ${verb}`;
    }
    entries.push({ t: c.timestamp, line: line + breakpointTag([c]) });
  }

  // Reviewer comments — promoted to their own section below for visibility.
  // Style/text/DOM changes go in the chronological list; comments live in
  // their own block so an agent can spot reviewer intent quickly.

  if (entries.length === 0 && pageComments.length === 0) {
    lines.push('');
    lines.push('(no changes recorded yet)');
    return lines.join('\n');
  }

  if (entries.length > 0) {
    lines.push('');
    lines.push('## Targets');
    for (const entry of targets.values()) {
      const { ref, ctx } = entry;
      const path = ctx.selector || ctx.smartLabel;
      const shortName = ctx.smartLabel !== path ? ctx.smartLabel + ' — ' : '';
      lines.push('- `' + ref + '`: ' + shortName + '`' + path + '`');
      if (ctx.sourceFile && ctx.framework === 'react') {
        lines.push('  - React source hint (verify locally): `' +
          ctx.sourceFile + (ctx.line ? ':' + ctx.line : '') + '`' +
          (ctx.componentName ? ' · component ' + ctx.componentName : ''));
      }
    }
    entries.sort((a, b) => a.t - b.t);
    lines.push('');
    lines.push('## Changes');
    if (textChanges.filter(c => !c.attributeName).length > 1 && entries.some(e => /\[-.*?-\]|\{\+.*?\+\}/.test(e.line))) {
      lines.push('> Text edits use git word-diff notation: `[-…-]` = removed, `{+…+}` = added, unmarked words are unchanged, and `…` marks unchanged text omitted for brevity. Apply the edit to the element — do not write the markers into the text.');
    }
    const hasBreakpoints = [...styleChanges, ...textChanges, ...domChanges]
      .some(c => c.breakpoint && c.breakpoint !== 'desktop');
    if (hasBreakpoints) {
      lines.push('_A trailing `(breakpoint · width)` marks the responsive width the edit was made at — scope it to that breakpoint (e.g. a media query). Untagged changes are desktop._');
    }
    for (const [index, e] of entries.entries()) lines.push(`${index + 1}. ${e.line}`);
  }

  // Comments section — only if any pinned notes exist. Inline a source
  // pointer so the agent can reach the file the comment was left on.
  if (pageComments.length > 0) {
    lines.push('');
    lines.push('## Comments');
    for (const c of pageComments) {
      // Comments don't carry an elementId we can look up here; rely on the
      // selector and skip source pointers for them.
      lines.push(`- note on ${c.selector}: ${c.text.trim()}`);
    }
  }

  // Available design tokens — only those actually referenced in the changes.
  // Saves the agent a discovery step ("does this codebase have a --primary
  // var?") and signals which design-system primitives this edit touched.
  if (tokensUsed.size > 0) {
    lines.push('');
    lines.push('## Design tokens used');
    const usedList = tokens.filter(t => tokensUsed.has(t.cssVar));
    for (const t of usedList) {
      lines.push(`- \`${t.cssVar}\`: ${t.value}`);
    }
  }

  return lines.join('\n');
}

// ── GitHub issue body — same content with a heavier preamble ──
export function exportGitHubIssueBody(): string {
  const lines: string[] = [];
  lines.push(`## Visual changes required`);
  lines.push(``);
  lines.push(`**Page:** ${document.title}`);
  lines.push(`**URL:** ${window.location.href}`);
  lines.push(``);
  lines.push(exportMarkdown());
  return lines.join('\n');
}
