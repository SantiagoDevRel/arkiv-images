import {readFileSync, readdirSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/** Versioned help must describe the registry package that the sample actually uses. */
export function checkSampleRelease(root) {
  const findings = [];
  const sample = path.join(root, 'sample');
  const manifest = JSON.parse(readFileSync(path.join(sample, 'package.json'), 'utf8'));
  const version = manifest.dependencies['arkiv-images'];
  if (!/^\d+\.\d+\.\d+$/.test(version)) findings.push('sample/package.json: use an exact registry version');
  const files = ['README.md'];
  function visit(dir, prefix) {
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
      if (['node_modules', '.vercel', '.git'].includes(entry.name)) continue;
      const relative = prefix + entry.name;
      if (entry.isDirectory()) visit(path.join(dir, entry.name), relative + '/');
      else files.push(relative);
    }
  }
  visit(sample, 'sample/');
  for (const file of files) {
    const bytes = readFileSync(path.join(root, file));
    if (bytes.includes(0)) continue;
    let text;
    try { text = new TextDecoder('utf8', {fatal: true}).decode(bytes); } catch { continue; }
    const pattern = /https:\/\/github\.com\/SantiagoDevRel\/arkiv-images\/(?:tree|blob|releases\/tag)\/v([^\s/#?"'<>`)]+)/g;
    for (const match of text.matchAll(pattern)) {
      if (match[1] !== version) findings.push(`${file}:${text.slice(0, match.index).split('\n').length}: sample link must use v${version}`);
    }
  }
  const config = JSON.parse(readFileSync(path.join(sample, 'vercel.json'), 'utf8'));
  if (config.framework !== 'vite' || config.installCommand !== 'npm ci' || config.buildCommand !== 'npm run build' || config.outputDirectory !== 'dist') findings.push('sample/vercel.json: preserve the documented remote source build');
  const uploads = readFileSync(path.join(sample, '.vercelignore'), 'utf8').split(/\r?\n/);
  for (const input of ['package.json', 'package-lock.json', 'tsconfig.json', 'index.html', 'vercel.json', 'api', 'api/**', 'src', 'src/**', 'public', 'public/**']) {
    if (!uploads.includes('!/' + input)) findings.push(`sample/.vercelignore: remote build must upload ${input}`);
  }
  if (!existsSync(path.join(sample, 'api/rpc.mjs'))) findings.push('sample/api/rpc.mjs: server read function is required');
  return findings;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = checkSampleRelease(path.resolve(process.argv[2] ?? fileURLToPath(new URL('../', import.meta.url))));
  if (findings.length) { console.error(findings.join('\n')); process.exitCode = 1; }
  else console.log('PASS sample version links and remote source build inputs');
}
