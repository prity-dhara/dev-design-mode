import Link from "next/link";

export function AboutHero() {
  return (
    <section>
      <div className="container max-w-5xl">
        <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl">
          About Dev Agent
        </h1>
        <p className="text-muted-foreground mt-4 max-w-5xl text-base">
          Dev Agent is a browser visual editor for making changes directly on
          rendered websites, recording the intended changes, and handing focused
          instructions to a coding agent. The local MCP companion can connect
          Codex or another compatible client to the current browser session
          without requiring a third-party hosted relay. Explore the
          {" "}<Link href="/mcp" className="underline underline-offset-4">
            local MCP setup
          </Link>{" "}or view the source code in the project repository.
          The included open-source code is distributed under the MIT license.
        </p>
      </div>
    </section>
  );
}
