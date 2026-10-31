import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
const files = ['README.md', 'AGENTS.md', 'CLAUDE.md', 'sample/README.md', 'sample/AGENTS.md', 'sample/CLAUDE.md', 'sample/index.html'];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await walk(path);
    else if (/\.(?:ts|mjs)$/.test(path) && path !== 'scripts/lint.mjs') files.push(path);
  }
}
for (const dir of ['src', 'scripts', 'sample/src', 'sample/api', 'test']) await walk(dir);
const obsolete = /Tiramisu|7738577|@arkiv-network\/sdk\/attr|permanent\(\)|\bpayload\b|\bTTL\b|\bBTL\b|time-to-live/;
let failed = false;
for (const path of files) {
  const source = await readFile(path, 'utf8');
  if (obsolete.test(source)) { console.error(`${path}: obsolete current guidance`); failed = true; }
  if (path.endsWith('.ts')) {
    const diagnostics = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).diagnostics ?? [];
    if (diagnostics.some(d => d.category === ts.DiagnosticCategory.Error)) { console.error(`${path}: invalid TypeScript syntax`); failed = true; }
  } else if (path.endsWith('.mjs')) {
    const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
    if (result.status !== 0) { console.error(result.stderr); failed = true; }
  }
}
if (failed) process.exitCode = 1;
else console.log(`Syntax and current-guidance checks passed for ${files.length} files.`);
