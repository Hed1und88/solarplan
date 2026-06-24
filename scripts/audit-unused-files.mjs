import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const srcRoot = path.join(root, 'src');
const extensions = ['.js', '.jsx', '.ts', '.tsx', '.css'];
const sourceExtensions = new Set(extensions);
const ignoreDirectories = new Set(['node_modules', 'dist', '.git', 'coverage']);

function walk(directory) {
  const rows = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoreDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) rows.push(...walk(absolute));
    else if (sourceExtensions.has(path.extname(entry.name))) rows.push(absolute);
  }
  return rows;
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

function resolveCandidate(base) {
  const candidates = [
    base,
    ...extensions.map(extension => `${base}${extension}`),
    ...extensions.map(extension => path.join(base, `index${extension}`)),
  ];
  return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

function resolveImport(fromFile, specifier) {
  if (!specifier || (!specifier.startsWith('.') && !specifier.startsWith('@/'))) return null;
  const base = specifier.startsWith('@/')
    ? path.join(srcRoot, specifier.slice(2))
    : path.resolve(path.dirname(fromFile), specifier);
  return resolveCandidate(base);
}

function importsFor(file) {
  const text = fs.readFileSync(file, 'utf8');
  const patterns = [
    /(?:import|export)\s+(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  const imports = new Set();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const resolved = resolveImport(file, match[1]);
      if (resolved) imports.add(resolved);
    }
  }
  return [...imports];
}

const files = walk(srcRoot);
const fileSet = new Set(files);
const graph = new Map(files.map(file => [file, importsFor(file).filter(item => fileSet.has(item))]));
const reverseReferences = new Map(files.map(file => [file, []]));
for (const [from, targets] of graph) {
  for (const target of targets) reverseReferences.get(target)?.push(from);
}

const rootCandidates = [
  path.join(srcRoot, 'main.jsx'),
  path.join(srcRoot, 'main.js'),
  path.join(srcRoot, 'App.jsx'),
  path.join(srcRoot, 'App.js'),
].filter(fs.existsSync);

const reachable = new Set();
const queue = [...rootCandidates];
while (queue.length) {
  const current = queue.shift();
  if (!current || reachable.has(current)) continue;
  reachable.add(current);
  for (const dependency of graph.get(current) || []) queue.push(dependency);
}

const ignoredCandidatePatterns = [
  /\/components\/ui\//,
  /\.d\.ts$/,
  /\/test(s)?\//,
  /\.(test|spec)\.[jt]sx?$/,
];
const unreachable = files
  .filter(file => !reachable.has(file))
  .filter(file => !ignoredCandidatePatterns.some(pattern => pattern.test(relative(file))))
  .sort();
const noInbound = files
  .filter(file => !rootCandidates.includes(file))
  .filter(file => (reverseReferences.get(file) || []).length === 0)
  .filter(file => !ignoredCandidatePatterns.some(pattern => pattern.test(relative(file))))
  .sort();

const basenameGroups = new Map();
for (const file of files) {
  const key = relative(file).replace(/\.(jsx?|tsx?)$/, '');
  const group = basenameGroups.get(key) || [];
  group.push(file);
  basenameGroups.set(key, group);
}
const duplicateBasenames = [...basenameGroups.entries()].filter(([, group]) => group.length > 1);
const suspiciousNames = files.filter(file => /(?:old|legacy|backup|copy|unused|deprecated|temp|tmp|v\d+)\.(?:jsx?|tsx?)$/i.test(path.basename(file))).sort();
const emptyOrStub = files.filter(file => {
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return true;
  return text.length < 120 && /return\s+(?:null|<div\s*\/>)/.test(text);
}).sort();

function list(items, formatter = relative) {
  return items.length ? items.map(item => `- \`${formatter(item)}\``).join('\n') : '- Inga träffar.';
}

const overlap = unreachable.filter(file => noInbound.includes(file));
const report = `# SolarPlan – icke-destruktiv filgranskning

Skapad: ${new Date().toISOString()}

Ingen fil har tagits bort. Resultatet är kandidater som måste verifieras mot Base44, dynamiska anrop och historiska flöden innan eventuell rensning.

## Kontroll 1 – Importgraf från aktiva startpunkter

Startpunkter: ${rootCandidates.map(relative).join(', ')}

Nåbara filer: **${reachable.size} av ${files.length}**

Filer som inte nås från startpunkterna:

${list(unreachable)}

## Kontroll 2 – Filer utan inkommande statisk referens

${list(noInbound)}

## Kontroll 3 – Starkare kandidater

Dessa förekommer både som onåbara och utan inkommande statisk referens:

${list(overlap)}

## Kontroll 4 – Dubbla .js/.jsx/.ts/.tsx-basnamn

${duplicateBasenames.length ? duplicateBasenames.map(([key, group]) => `- \`${key}\`: ${group.map(relative).map(value => `\`${value}\``).join(', ')}`).join('\n') : '- Inga dubbla basnamn hittades.'}

## Kontroll 5 – Namn som antyder äldre eller alternativa versioner

${list(suspiciousNames)}

## Extra kontroll – tomma filer eller uppenbara stubbkomponenter

${list(emptyOrStub)}

## Tolkning

- **Ta inte bort automatiskt.** Dynamiska Base44-komponenter och strängbaserade laddningar kan undgå en statisk importgraf.
- Kandidater i både kontroll 1 och 2 är starkare än filer som bara förekommer i en kontroll.
- Dubbla basnamn måste granskas särskilt eftersom Base44 tidigare har laddat fel .js/.jsx-komponent.
- Produktionsbygget ska vara godkänt innan någon framtida rensning görs.
`;

const output = process.argv[2] || 'UNUSED_FILE_AUDIT.md';
fs.writeFileSync(path.resolve(root, output), report, 'utf8');
console.log(report);
