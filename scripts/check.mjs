// Asserts every claim the blog post makes, from a fresh build and a fresh generator run.
//
//   node scripts/check.mjs     (or: npm run check)
//
// Exits 0 and prints ALL CHECKS PASSED only if every check passes.
import fs from 'node:fs';
import path from 'node:path';
import { root, docsDir, outDir, readVersion, lineDiff } from './lib.mjs';
import { buildDocs } from './build-docs.mjs';
import { runGenerators, formatTable } from './run-generators.mjs';

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (detail) console.log(`      ${detail}`);
  if (!ok) failed++;
}

// 1. Fresh documents, built now, compared with the committed ones.
const fresh = path.join(outDir, 'fresh');
await buildDocs(fresh);
for (const name of fs.readdirSync(docsDir).filter(f => f.endsWith('.json'))) {
  const same = fs.readFileSync(path.join(fresh, name), 'utf8') === fs.readFileSync(path.join(docsDir, name), 'utf8');
  check(`docs/${name} is what the build produces today`, same);
}

const v = name => readVersion(path.join(fresh, name));

// 2. The default moved.
check('.NET 10 writes OpenAPI 3.1.1 by default', v('net10.json') === '3.1.1', `openapi: ${v('net10.json')}`);
check('.NET 11 RC2 writes OpenAPI 3.2.0 by default, at run time', v('net11-runtime.json') === '3.2.0', `openapi: ${v('net11-runtime.json')}`);
check('.NET 11 RC2 writes OpenAPI 3.2.0 by default, at build time', v('net11.json') === '3.2.0', `openapi: ${v('net11.json')}`);

// 3. Nothing else in the document moved.
const d1011 = lineDiff(path.join(fresh, 'net10.json'), path.join(fresh, 'net11.json'));
check('the .NET 10 and .NET 11 documents differ in one line only, the version',
  d1011.length === 1 && d1011[0].line === 2, d1011.map(d => `line ${d.line}: ${d.a?.trim()} -> ${d.b?.trim()}`).join('; '));

// 4. The pin in AddOpenApi works at run time and not at build time.
check('the AddOpenApi pin gives 3.1.2 at run time', v('net11-pin-only-runtime.json') === '3.1.2', `openapi: ${v('net11-pin-only-runtime.json')}`);
check('the AddOpenApi pin alone leaves the build-time document at 3.2.0', v('net11-pin-only-buildtime.json') === '3.2.0', `openapi: ${v('net11-pin-only-buildtime.json')}`);
check('adding --openapi-version OpenApi3_1 to the build pins it to 3.1.2', v('net11-pinned.json') === '3.1.2', `openapi: ${v('net11-pinned.json')}`);

// The run-time document carries a servers entry from the running host; nothing else differs.
const strip = f => { const j = JSON.parse(fs.readFileSync(path.join(fresh, f), 'utf8')); delete j.servers; return JSON.stringify(j); };
check('the run-time and build-time documents match apart from servers', strip('net11-runtime.json') === strip('net11.json'));

const d10pin = lineDiff(path.join(fresh, 'net10.json'), path.join(fresh, 'net11-pinned.json'));
check('the pinned .NET 11 document differs from .NET 10 in the version line only (3.1.1 -> 3.1.2)',
  d10pin.length === 1 && d10pin[0].line === 2, d10pin.map(d => `line ${d.line}: ${d.a?.trim()} -> ${d.b?.trim()}`).join('; '));

// 5. The snippets in the post are the code in this repo.
const program = fs.readFileSync(path.join(root, 'src', 'Shared', 'Program.cs'), 'utf8');
check('Program.cs holds the one-line pin the post shows',
  program.includes('options.OpenApiVersion = Microsoft.OpenApi.OpenApiSpecVersion.OpenApi3_1;'));
const csproj = fs.readFileSync(path.join(root, 'src', 'Api11', 'Api11.csproj'), 'utf8');
check('Api11.csproj holds the build-time pin the post shows',
  csproj.includes('<OpenApiGenerateDocumentsOptions>--openapi-version OpenApi3_1</OpenApiGenerateDocumentsOptions>'));

// 6. The generators. This is the table in the post.
const expected = {
  'NSwag': ['same', 'same', 'same'],
  'openapi-typescript': ['same', 'same', 'same'],
  'ng-openapi-gen': ['same', 'refused', 'same'],
  'orval': ['same', 'same', 'same'],
  'Kiota': ['same', 'same', 'same'],
};
const results = runGenerators();
console.log('');
console.log(formatTable(results).split('\n').map(l => '      ' + l).join('\n'));
console.log('');
for (const r of results) {
  const got = ['net10', 'net11', 'net11-pinned'].map(k => r.cells[k].status === 'refused' ? 'refused' : (r.cells[k].same ? 'same' : 'different'));
  check(`${r.generator}: ${got.join(' / ')} (3.1.1 / 3.2.0 / pinned 3.1.2)`, JSON.stringify(got) === JSON.stringify(expected[r.generator]));
}
const ngog = results.find(r => r.generator === 'ng-openapi-gen').cells.net11;
check('ng-openapi-gen refuses 3.2.0 with the message the post quotes',
  ngog.status === 'refused' && ngog.error.includes('Unsupported OpenAPI version: 3.2.0. Only OpenAPI 3.0.x and 3.1.x are supported.'),
  ngog.error?.replace(/^.*?(Error: Unsupported)/, '$1'));

console.log('');
if (failed) {
  console.log(`${failed} CHECK(S) FAILED`);
  process.exit(1);
}
console.log('ALL CHECKS PASSED');
