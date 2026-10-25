// Runs each client generator against each document and prints a pass/fail table.
//
//   node scripts/run-generators.mjs
//
// "same" means the generated code is byte-for-byte what the generator wrote from the
// .NET 10 document. Generated files land in out/<generator>-<document>/.
import fs from 'node:fs';
import path from 'node:path';
import { docsDir, outDir, root, run, isMain } from './lib.mjs';

// The npm generators are started through their own entry scripts, with this Node.
const bin = rel => path.join(root, 'node_modules', rel);
const node = (rel, args) => run(process.execPath, [bin(rel), ...args]);

const tools = path.join(root, 'tools'); // local dotnet tool manifest, .NET 10 SDK pinned there

export const documents = [
  { key: 'net10', label: '.NET 10' },
  { key: 'net11', label: '.NET 11' },
  { key: 'net11-pinned', label: '.NET 11 pinned' },
];

// Each generator writes into a folder. `ignore` lists files that differ for reasons that
// have nothing to do with the document's content (Kiota records the input path).
export const generators = [
  {
    name: 'NSwag',
    run: (doc, dir) => run('dotnet', ['nswag', 'openapi2tsclient', `/input:${doc}`, `/output:${path.join(dir, 'client.ts')}`, '/template:Angular'], { cwd: tools }),
  },
  {
    name: 'openapi-typescript',
    run: (doc, dir) => node('openapi-typescript/bin/cli.js', [doc, '-o', path.join(dir, 'schema.ts')]),
  },
  {
    name: 'ng-openapi-gen',
    run: (doc, dir) => node('ng-openapi-gen/lib/index.js', ['--input', doc, '--output', dir]),
  },
  {
    name: 'orval',
    run: (doc, dir) => node('orval/dist/bin/orval.mjs', ['--input', doc, '--output', path.join(dir, 'api.ts'), '--client', 'angular']),
  },
  {
    name: 'Kiota',
    run: (doc, dir) => run('dotnet', ['kiota', 'generate', '-l', 'typescript', '-d', doc, '-o', dir, '-c', 'TodoClient', '--clean-output'], { cwd: tools }),
    ignore: ['kiota-lock.json'],
  },
];

function readTree(dir, ignore = []) {
  const files = {};
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || ignore.includes(entry.name)) continue;
    const full = path.join(entry.parentPath, entry.name);
    files[path.relative(dir, full)] = fs.readFileSync(full, 'utf8');
  }
  return files;
}

function sameTree(a, b) {
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  return ka.length > 0 && ka.join('|') === kb.join('|') && ka.every(k => a[k] === b[k]);
}

// The first line of output that names the problem, for the table.
function firstError(out) {
  return out.split(/\r?\n/).find(l => /error|unsupported|not supported|invalid/i.test(l))?.trim() ?? out.trim().split(/\r?\n/).pop();
}

export function runGenerators() {
  const results = [];
  for (const g of generators) {
    const row = { generator: g.name, cells: {} };
    let baseline;
    for (const d of documents) {
      const dir = path.join(outDir, `${g.name.toLowerCase()}-${d.key}`);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const r = g.run(path.join(docsDir, `${d.key}.json`), dir);
      const tree = readTree(dir, g.ignore);
      const ok = r.code === 0 && Object.keys(tree).length > 0;
      if (d.key === 'net10') baseline = tree;
      row.cells[d.key] = ok
        ? { status: 'accepted', same: sameTree(tree, baseline) }
        : { status: 'refused', exit: r.code, error: firstError(r.out) };
    }
    results.push(row);
  }
  return results;
}

export function formatTable(results) {
  const cell = c => c.status === 'refused' ? `REFUSED (exit ${c.exit})` : (c.same ? 'ok, same' : 'ok, DIFFERENT');
  const header = ['generator', ...documents.map(d => `${d.label}`)];
  const rows = results.map(r => [r.generator, ...documents.map(d => cell(r.cells[d.key]))]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
  const line = r => r.map((v, i) => v.padEnd(widths[i])).join('  ');
  const versions = documents.map(d => `${d.label} = "${JSON.parse(fs.readFileSync(path.join(docsDir, d.key + '.json'), 'utf8')).openapi}"`);
  const errors = results.flatMap(r => documents.filter(d => r.cells[d.key].status === 'refused')
    .map(d => `  ${r.generator} on ${d.label}: ${r.cells[d.key].error}`));
  return [
    `documents: ${versions.join(', ')}`,
    '',
    line(header),
    line(widths.map(w => '-'.repeat(w))),
    ...rows.map(line),
    ...(errors.length ? ['', 'refusals:', ...errors] : []),
  ].join('\n');
}

if (isMain(import.meta.url)) {
  console.log(formatTable(runGenerators()));
}
