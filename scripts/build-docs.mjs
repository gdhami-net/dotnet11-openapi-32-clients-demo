// Builds the same API on .NET 10 and on .NET 11 RC2 and collects the OpenAPI documents.
//
//   node scripts/build-docs.mjs            -> writes docs/*.json (the committed documents)
//   node scripts/build-docs.mjs <folder>   -> writes them to <folder> instead
//
// Build-time documents come from Microsoft.Extensions.ApiDescription.Server.
// Runtime documents come from starting the app and fetching /openapi/v1.json.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { root, docsDir, dotnet11, env11, mustRun, isMain } from './lib.mjs';

const api10 = path.join(root, 'src', 'Api10');
const api11 = path.join(root, 'src', 'Api11');

function buildTime(project, dotnet, env, extra = []) {
  mustRun(dotnet, ['build', '--no-incremental', '-nologo', '-v:q', ...extra], { cwd: project, env });
  const file = path.join(project, 'obj', 'openapi', path.basename(project) + '.json');
  return fs.readFileSync(file, 'utf8');
}

async function runtime(project, env, extra, port) {
  mustRun(dotnet11, ['build', '--no-incremental', '-nologo', '-v:q', ...extra], { cwd: project, env });
  const child = spawn(dotnet11, ['run', '--no-build', '--urls', `http://localhost:${port}`], { cwd: project, env });
  try {
    for (let i = 0; i < 60; i++) {
      try {
        const res = await fetch(`http://localhost:${port}/openapi/v1.json`);
        if (res.ok) return await res.text();
      } catch { /* not listening yet */ }
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('the app never answered on /openapi/v1.json');
  } finally {
    // dotnet run starts TodoApi.exe as a child; kill the whole tree.
    if (process.platform === 'win32') mustRun('taskkill', ['/PID', String(child.pid), '/T', '/F']);
    else child.kill();
  }
}

export async function buildDocs(target = docsDir) {
  fs.mkdirSync(target, { recursive: true });
  const write = (name, text) => fs.writeFileSync(path.join(target, name), text);
  const pin = ['-p:PinOpenApi31=true'];
  const flag = ['-p:PinBuildTime31=true'];

  // The three documents the generators are fed.
  write('net10.json', buildTime(api10, 'dotnet', process.env));
  write('net11.json', buildTime(api11, dotnet11, env11()));
  write('net11-pinned.json', buildTime(api11, dotnet11, env11(), [...pin, ...flag]));

  // The evidence for "the pin in AddOpenApi doesn't reach build-time generation".
  write('net11-pin-only-buildtime.json', buildTime(api11, dotnet11, env11(), pin));
  write('net11-runtime.json', await runtime(api11, env11(), [], 5311));
  write('net11-pin-only-runtime.json', await runtime(api11, env11(), pin, 5312));

  // Leave the project built the default way.
  buildTime(api11, dotnet11, env11());
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const target = process.argv[2] ? path.resolve(process.argv[2]) : docsDir;
  await buildDocs(target);
  console.log(`documents written to ${target}`);
}
