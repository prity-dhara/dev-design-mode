import Link from "next/link";
import { Github, ShieldCheck, Bug, BookOpen } from "lucide-react";

const REPO_URL = "https://github.com/prity-dhara/dev-design-mode";

export function ContactHero() {
  return (
    <div className="container max-w-5xl">
      <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl">Dev Agent support</h1>
      <p className="text-muted-foreground mt-4 max-w-3xl text-base">
        Find setup instructions, report a problem, or review the Dev Agent source code.
      </p>
    </div>
  );
}

export function ContactChannels() {
  return (
    <div className="container max-w-5xl grid gap-6 sm:grid-cols-2">
      <div className="bg-card border-border rounded-2xl border p-6 shadow-sm">
        <h2 className="text-foreground flex items-center gap-2 text-base font-semibold"><Bug className="size-6" /> Issues and feature requests</h2>
        <p className="text-muted-foreground mt-4 text-base leading-relaxed">
          Use the project's issue tracker with steps to reproduce and your extension version.
        </p>
        <a href={REPO_URL + "/issues"} target="_blank" rel="noopener noreferrer" className="mt-4 block underline underline-offset-4">Open Dev Agent issues</a>
      </div>
      <div className="bg-card border-border rounded-2xl border p-6 shadow-sm">
        <h2 className="text-foreground flex items-center gap-2 text-base font-semibold"><Github className="size-6" /> Source repository</h2>
        <p className="text-muted-foreground mt-4 text-base leading-relaxed">
          Review the implementation, local MCP setup instructions, and development status.
        </p>
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="mt-4 block underline underline-offset-4">Open Dev Agent on GitHub</a>
      </div>
    </div>
  );
}

export function ContactReports() {
  return (
    <div className="container max-w-3xl grid gap-6 sm:grid-cols-2">
      <div className="bg-card border-border rounded-2xl border p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-2xl font-semibold"><BookOpen className="size-6" /> Reporting a bug</h2>
        <p className="text-muted-foreground mt-4 text-base leading-relaxed">
          Open Help in Dev Agent, copy diagnostics, and include a minimal reproduction with your issue.
        </p>
      </div>
      <div className="bg-card border-border rounded-2xl border p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-2xl font-semibold"><ShieldCheck className="size-6" /> Security</h2>
        <p className="text-muted-foreground mt-4 text-base leading-relaxed">
          For sensitive reports, follow the project's <Link href={REPO_URL + "/blob/main/SECURITY.md"} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">security disclosure policy</Link> rather than posting details publicly.
        </p>
      </div>
    </div>
  );
}
