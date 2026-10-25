// Shared helpers: where things are, and how to run a command and keep its output.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const docsDir = path.join(root, 'docs');
export const outDir = path.join(root, 'out');

// Full path to a dotnet that has the .NET 11 RC2 SDK. Defaults to the one on PATH.
export const dotnet11 = process.env.DOTNET11 ?? 'dotnet';

// The build-time document step (dotnet-getdocument) starts whichever `dotnet` is on PATH,
// so the .NET 11 build needs that folder first on PATH and in DOTNET_ROOT.
export function env11() {
  if (!process.env.DOTNET11) return process.env;
  const dir = path.dirname(dotnet11);
  return { ...process.env, PATH: dir + path.delimiter + process.env.PATH, DOTNET_ROOT: dir };
}

export function run(cmd, args, { cwd = root, env = process.env } = {}) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

export function mustRun(cmd, args, opts) {
  const r = run(cmd, args, opts);
  if (r.code !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (exit ${r.code}):\n${r.out.slice(-2000)}`);
  }
  return r;
}

export function readVersion(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8')).openapi;
}

export function lineDiff(a, b) {
  const x = fs.readFileSync(a, 'utf8').split(/\r?\n/);
  const y = fs.readFileSync(b, 'utf8').split(/\r?\n/);
  const diffs = [];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] !== y[i]) diffs.push({ line: i + 1, a: x[i], b: y[i] });
  }
  return diffs;
}

export function isMain(metaUrl) {
  return metaUrl === pathToFileURL(process.argv[1]).href;
}
