import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeLocalTool, type ToolDispatch } from './tools.js';

export function createMcpServer(dispatch: ToolDispatch = executeLocalTool): McpServer {
  const server = new McpServer({ name: 'design-mode', version: '3.1.0' });

  server.tool(
    'get_changes',
    'Read everything the user has edited in this session: design-token changes, style changes, text changes, DOM changes, and pinned comments, plus a ready-to-paste CSS block. `tokenChanges` lists CSS custom properties the user redefined, each with the `scopeSelector` it is declared on and its design system — change those at their source definition in the codebase (see `tokenGuidance`), not on individual components. Spring/easing curves come through inside the style values (e.g. `transition: all 0.3s cubic-bezier(...)`).',
    async () => dispatch('get_changes')
  );

  server.tool(
    'get_focused_changes',
    'Minimal unresolved Dev Agent edits with stable IDs, selectors, route information, original and final values. No redundant CSS block or resolved operations. Prefer this for first-pass implementation; use get_changes only when more context is needed.',
    {
      routeKey: z.string().optional().describe('Optional exact routeKey or pageUrl to limit the response to one route.'),
    },
    async ({ routeKey }) => dispatch('get_focused_changes', { routeKey })
  );

  server.tool(
    'locate_react_source',
    'Search a local React JSX/TSX checkout for verified component filename or debug-source path candidates. Returns actual paths, not inferred matches. Browser selectors alone cannot establish source ownership. Never treat medium-confidence results as authoritative.',
    {
      projectRoot: z.string().describe('Absolute path to the local checked-out project directory. No remote filesystem access.'),
      componentName: z.string().optional().describe('React component name, when known from development-time source detection.'),
      sourceHint: z.string().optional().describe('Relative source file hint from React debug metadata; verified against the project directory.'),
    },
    async ({ projectRoot, componentName, sourceHint }) => dispatch('locate_react_source', { projectRoot, componentName, sourceHint })
  );

  server.tool(
    'apply_changes',
    'Push CSS changes back to the browser for live preview. Pass an array of element changes — single edits use a one-element array. Style values are CSS strings (cubic-bezier, var(--token), keyframe names — anything you would write in a stylesheet).',
    {
      changes: z.array(z.object({
        elementId: z.string().describe('Design Mode element ID (dm-*)'),
        styles: z.record(z.string()).describe('CSS property-value pairs'),
      })).describe('Array of element changes (single edit = single-element array)'),
    },
    async ({ changes }) => dispatch('apply_changes', { changes })
  );

  server.tool(
    'set_change_status',
    "Update the status of tracked changes/comments as you work: 'in_progress' when you start implementing them in code, 'resolved' once shipped, or 'todo' to reset. Pass the `id`s from get_changes (see the `items` array); omit `ids` to apply to everything. Resolved items dim in the user's Changes tab so they can see what you've handled.",
    {
      status: z.enum(['todo', 'in_progress', 'resolved']).describe('New status'),
      ids: z.array(z.string()).optional().describe('Change or comment ids from get_changes. Omit to apply to all tracked items.'),
    },
    async ({ status, ids }) => dispatch('set_change_status', { status, ids })
  );

  server.tool(
    'clear_changes',
    'Clear all tracked changes and comments for the current session — server state AND the live page (edits revert, comment pins disappear).',
    async () => dispatch('clear_changes')
  );

  server.tool(
    'mark_comment_resolved',
    'Mark a pinned comment resolved (done) or reopen it. Pass the comment `id` from get_changes output. Call this after you have implemented the change the comment asked for so the user sees the loop close in the Changes tab.',
    {
      commentId: z.string().describe('Comment id from get_changes (the `id` field)'),
      resolved: z.boolean().default(true).describe('true = resolve/done, false = reopen'),
    },
    async ({ commentId, resolved }) => dispatch('mark_comment_resolved', { commentId, resolved })
  );

  server.tool(
    'get_session_summary',
    'Connection status, active sessions, and counts. Use this for a quick health check before calling apply_changes.',
    async () => dispatch('get_session_summary')
  );

  server.tool(
    'export_changes',
    'Emit the user\'s style changes in your preferred format: plain CSS, Tailwind utility classes, nested SCSS, or camelCase JSX inline-style objects. Spring/easing values pass through verbatim because they\'re part of the underlying CSS values.',
    {
      format: z.enum(['css', 'tailwind', 'scss', 'jsx']).describe('Output format'),
    },
    async ({ format }) => dispatch('export_changes', { format })
  );

  server.tool(
    'get_screenshot',
    'Capture a PNG screenshot of the page. Pass the unique `selector` string from `get_changes` output (e.g. "main > section.hero > button:nth-of-type(2)") or a Design Mode element id (dm-*) to crop to one element; pass a `commentId` from get_changes to crop to that comment\'s flagged region (or its element); otherwise the visible viewport is returned. A generic selector like "button" or "h1" matches multiple elements and will fail with a list of candidate unique paths to pick from.',
    {
      selector: z.string().optional().describe('Unique CSS path for the element. Use the `selector` value from get_changes. Mutually exclusive with elementId.'),
      elementId: z.string().optional().describe('Design Mode element id (dm-*). Mutually exclusive with selector.'),
      commentId: z.string().optional().describe('A comment id from get_changes — crops to that comment\'s region rectangle (or its element). Takes precedence over selector/elementId.'),
    },
    async ({ selector, elementId, commentId }) => dispatch('get_screenshot', { selector, elementId, commentId })
  );

  server.tool(
    'wait_for_handoff',
    'Local MCP only. Wait up to 20 seconds for the next user "Send to Agent" round on this page. First call (pageUrl, no sessionId) creates a live session; resume only with the returned sessionId. JSON status is waiting | feedback | stopped | busy. On feedback, the report field is an immutable snapshot — implement those ids only and do not assume later edits. Cloud and Self-hosted do not expose this tool.',
    {
      pageUrl: z.string().describe('Exact page URL the live session is bound to'),
      sessionId: z.string().optional().describe('Unpredictable id from a previous wait_for_handoff. Omit to start a new session.'),
      after: z.number().int().nonnegative().optional().describe('Last consumed cursor. The next unconsumed send after this value is returned.'),
      timeoutMs: z.number().int().positive().max(20_000).optional().describe('Cap in milliseconds, maximum 20000'),
    },
    async (args, extra) => dispatch('wait_for_handoff', args, extra)
  );

  return server;
}
