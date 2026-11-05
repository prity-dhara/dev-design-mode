// Local-only React source hints. A browser selector alone cannot identify
// its JSX owner. Return only files that actually exist in the requested repo.
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path';

const SKIP = new Set(['node_modules', '.git', '.next', '.nuxt', 'dist', 'build', 'coverage', '.output', '.turbo']);
const REACT_EXT = new Set(['.tsx', '.jsx']);
const MAX_FILES = 3000;
const MAX_DEPTH = 9;

type Candidate = { file: string; reason: string; confidence: 'high' | 'medium' };

export function locateReactSource(args: {
  projectRoot: string; componentName?: string; sourceHint?: string;
}): { framework: string; projectRoot: string; candidates: Candidate[]; note: string } {
  if (!args.projectRoot?.trim()) throw new Error('projectRoot is required; provide the checked-out project directory.');
  const root = realpathSync(resolve(args.projectRoot));
  if (!statSync(root).isDirectory()) throw new Error('projectRoot must be a directory.');
  const component = (args.componentName || '').trim();
  const hint = (args.sourceHint || '').trim().replace(/\\/g, '/').split('?')[0];
  if (!component && !hint) throw new Error('Provide a componentName or sourceHint; CSS selectors alone cannot reliably map to source files.');
  if (component && !/^[A-Za-z][\w.$-]{0,100}$/.test(component)) throw new Error('Invalid componentName.');
  const candidates: Candidate[] = [];
  const visited = new Set<string>();
  let scanned = 0;

  const add = (abs: string, why: string, confidence: 'high' | 'medium') => {
    const real = realpathSync(abs);
    const rel = relative(root, real);
    // Do not follow symlinks out of the selected project root.
    if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) return;
    if (!REACT_EXT.has(extname(real).toLowerCase())) return;
    if (!candidates.some(c => c.file === rel)) candidates.push({ file: rel, reason: why, confidence });
  };

  // An explicit source hint is a candidate ONLY when the file exists in
  // this root; we do not trust browser-provided absolute paths.
  if (hint && !hint.includes('\0')) {
    const cleaned = hint.replace(/^\[project\]\//, '').replace(/^\.\//, '');
    const test = resolve(root, cleaned);
    try {
      if (statSync(test).isFile()) add(test, 'Verified exact source hint', 'high');
    } catch { /* File is absent here; fall back to component search. */ }
  }

  function walk(dir: string, depth: number): void {
    if (depth > MAX_DEPTH || scanned >= MAX_FILES) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      if (scanned >= MAX_FILES) break;
      if (ent.isSymbolicLink()) continue;
      const abs = resolve(dir, ent.name);
      if (ent.isDirectory()) {
        if (!SKIP.has(ent.name) && !ent.name.startsWith('.')) walk(abs, depth + 1);
        continue;
      }
      if (!ent.isFile() || !REACT_EXT.has(extname(ent.name).toLowerCase())) continue;
      scanned++;
      if (!component) continue;
      const withoutExt = basename(ent.name, extname(ent.name));
      if (withoutExt === component) {
        add(abs, 'React component filename matches', 'high');
        continue;
      }
      // Read only small files when looking for a component declaration.
      let stats;
      try { stats = statSync(abs); } catch { continue; }
      if (stats.size > 256 * 1024) continue;
      let body = '';
      try { body = readFileSync(abs, 'utf8'); } catch { continue; }
      const safe = component.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const declaration = new RegExp('(?:function|class|const|export\\s+(?:default\\s+)?)\\s+' + safe + '\\b');
      if (declaration.test(body)) add(abs, 'React component declaration matches', 'medium');
    }
  }
  walk(root, 0);
  candidates.sort((a,b) => (a.confidence === 'high' ? 0 : 1) - (b.confidence === 'high' ? 0 : 1) || a.file.localeCompare(b.file));
  return {
    framework: 'react', projectRoot: root, candidates: candidates.slice(0, 20),
    note: candidates.length === 0
      ? 'No verified React JSX/TSX match. Search project code manually; do not invent a path.'
      : 'These are candidate files, not confirmed DOM-to-component mappings. Verify the rendered element and relevant CSS before editing.',
  };
}
