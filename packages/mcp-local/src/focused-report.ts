// A small, lossless handoff view: unresolved operations only, no redundant
// CSS block or full session snapshots. IDs remain available for status updates.
import { state } from './state.js';

type Item = { id: string; kind: string; selector: string; status?: string; [key: string]: unknown };

export function focusedChangeReport(routeKey?: string): object {
  const raw = state.getFullChangeReport() as Record<string, any>;
  const items = (raw.items ?? []) as Item[];
  const unresolved = items.filter(item => item.status !== 'resolved' &&
    (!routeKey || item.routeKey === routeKey || item.pageUrl === routeKey));
  const ids = new Set(unresolved.map(item => item.id));
  const styles = state.getStyleChanges().filter(c => ids.has(c.id)).map(c => ({
    id: c.id, route: c.routeKey ?? c.pageUrl, selector: c.selector,
    property: c.property, from: c.oldValue, to: c.newValue,
    ...(c.breakpoint ? { breakpoint: c.breakpoint } : {}),
    ...(c.viewportWidth !== undefined ? { viewportWidth: c.viewportWidth } : {}),
  }));
  const texts = state.getTextChanges().filter(c => ids.has(c.id)).map(c => ({
    id: c.id, route: c.routeKey ?? c.pageUrl, selector: c.selector,
    ...(c.attributeName ? { attribute: c.attributeName } : {}),
    from: c.oldText, to: c.newText,
    ...(c.breakpoint ? { breakpoint: c.breakpoint } : {}),
  }));
  const dom = state.getDomChanges().filter(c => ids.has(c.id)).map(c => ({
    id: c.id, route: c.routeKey ?? c.pageUrl, selector: c.selector,
    action: c.action, tag: c.tagName,
    ...(c.origin ? { origin: c.origin } : {}),
    ...(c.destination ? { destination: c.destination } : {}),
    ...(c.breakpoint ? { breakpoint: c.breakpoint } : {}),
  }));
  const comments = state.getComments().filter(c => ids.has(c.id)).map(c => ({
    id: c.id, route: c.routeKey ?? c.pageUrl, selector: c.selector,
    text: c.text, ...(c.region ? { region: c.region } : {}),
  }));
  const tokenChanges = (raw.tokenChanges ?? []).filter((t: any) => t.oldValue !== t.newValue);
  // Token edits have no status IDs in the existing protocol; don't silently
  // discard them when the user asks for unresolved work.
  return {
    format: 'dev-agent-focused-v1',
    pageUrl: raw.pageUrl, ...(raw.handoff ? { handoff: raw.handoff } : {}),
    ...(routeKey ? { requestedRoute: routeKey } : {}),
    styles, texts, dom, comments, tokenChanges,
    sourceHints: (raw.sourceHints ?? []).filter((h: { id: string }) => ids.has(h.id)),
    unresolvedCount: unresolved.length,
    note: 'Source paths are unverified until locate_react_source matches local files. Preserve layout and component behavior.',
  };
}
