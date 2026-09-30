import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'android'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) files.push(full);
  }
}

walk(root);

const routes = [];
const routePattern = /(?:app|router)\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = routePattern.exec(source))) {
    routes.push({
      method: match[1].toUpperCase(),
      path: match[2],
      file: path.relative(root, file)
    });
  }
}

routes.sort((a, b) =>
  a.method.localeCompare(b.method) ||
  a.path.localeCompare(b.path) ||
  a.file.localeCompare(b.file)
);

fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'artifacts/api-inventory.json'),
  JSON.stringify({
    schemaVersion: 'GEAS-API-INVENTORY-1.0',
    generatedAt: new Date().toISOString(),
    routeCount: routes.length,
    routes
  }, null, 2) + '\n'
);

console.log('Generated API inventory:', routes.length);
