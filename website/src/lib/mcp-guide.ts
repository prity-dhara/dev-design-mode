// Keep the original exported identifier for website compatibility.
export const DESIGN_MODE_SKILL =
  "/.well-known/agent-skills/design-mode/SKILL.md";

export const MCP_SETUP_PROMPT = `Help me connect the Dev Agent browser extension to this coding agent using the LOCAL MCP server from https://github.com/prity-dhara/dev-design-mode. Do not use mcp.designmode.app or any other hosted relay. Build the local companion with npm --workspace @design-mode/mcp-local run build, then configure this agent to launch the built packages/mcp-local/dist/bin/cli.js using Node and an absolute path. Preserve existing MCP servers. Select Local with port 9960 in the extension. Check get_session_summary first, and only read get_focused_changes with my consent. Do not modify source files, resolve edits or deploy during setup. Never ask me to paste secrets into chat.`;

const CLI_PATH = "/absolute/path/to/dev-design-mode/packages/mcp-local/dist/bin/cli.js";

export const mcpClients = [
  {
    name: "Claude Code",
    location: "Project .mcp.json",
    description:
      "Build the Dev Agent local MCP companion. Replace CLI_PATH with the absolute path to the built cli.js in your local checkout. Merge this entry into the project config, restart the agent if necessary, and select Local in the extension.",
    source: "https://code.claude.com/docs/en/mcp",
    code: JSON.stringify(
      { mcpServers: { "dev-agent": { type: "stdio", command: "node", args: [CLI_PATH] } } },
      null, 2,
    ),
  },
  {
    name: "Cursor",
    location: "Project .cursor/mcp.json or user ~/.cursor/mcp.json",
    description:
      "Configure an stdio MCP server using Node and the absolute path to this repository's built local cli.js. Select Local in the browser extension.",
    source: "https://cursor.com/docs/context/mcp",
    code: JSON.stringify(
      { mcpServers: { "dev-agent": { command: "node", args: [CLI_PATH] } } },
      null, 2,
    ),
  },
  {
    name: "VS Code / Copilot",
    location: "Workspace .vscode/mcp.json",
    description:
      "Add this local stdio entry without replacing other servers, and approve it through VS Code's MCP controls.",
    source: "https://code.visualstudio.com/docs/agents/reference/mcp-configuration",
    code: JSON.stringify(
      { servers: { "dev-agent": { type: "stdio", command: "node", args: [CLI_PATH] } } },
      null, 2,
    ),
  },
];
