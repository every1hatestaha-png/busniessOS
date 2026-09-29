const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
function category(url) {
  url = url.replace(/^\/api\/v1/, '');
  if (/^\/(manufacturing)(\/|$)/.test(url)) return 'MANUFACTURING';
  if (/^\/(restaurant|services)(\/|$)/.test(url)) return 'LEGACY_COMPATIBILITY';
  if (/^\/(sales|purchases|goods-receipts|inventory|customers|suppliers|supplier-returns|customer-returns)(\/|$)/.test(url)) return 'TRADING';
  return 'SHARED_CORE';
}
function urlFor(file) {
  const route = file.replace(/^app\//, '').replace(/\([^/]+\)\//g, '').replace(/(^|\/)(page|route)\.tsx?$/, '').replace(/\/[^/]*actions?\.ts$/, '').replace(/^\//, '');
  return '/' + route;
}
const files = walk(path.join(root, 'app')).map(full => path.relative(root, full).replaceAll('\\', '/'));
const inventory = [];
for (const file of files) {
  const kind = /\/page\.tsx$/.test(file) ? 'PAGE' : /\/route\.ts$/.test(file) ? 'API' : /\/[^/]*actions?\.ts$/.test(file) ? 'SERVER_ACTION' : null;
  if (!kind) continue;
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const url = urlFor(file);
  const scope = file.startsWith('app/(dashboard)/') ? 'dashboard layout plus entry point' : file.startsWith('app/api/v1/') ? 'API context or authenticated provisioning/switch' : 'entry point';
  const boundary = kind === 'PAGE' && file.startsWith('app/(dashboard)/') ? 'requireWorkspace in dashboard layout' :
    /requireApiContext|requireApiUser|requireWorkspace|requirePermission|requirePlatform|requestWorkspaceActivation|requireRecentPlatformMfa|strict_mfa|listCurrentUserWorkspaces|getCurrentUser/.test(source) ? 'authenticated server context' :
    /^(app\/api\/(health|readiness|desktop-config|webhooks|auth)|app\/auth\/)/.test(file) ? 'public or signed webhook/auth protocol' :
    kind === 'PAGE' && !file.startsWith('app/(dashboard)/') ? 'public, onboarding, or separate authenticated layout' : 'REVIEW';
  const methods = kind === 'API' ? [...source.matchAll(/export (?:const|(?:async )?function) (GET|POST|PATCH|PUT|DELETE)\b/g)].map(x => x[1]) : [];
  const symbols = kind === 'SERVER_ACTION' ? [...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)|export\s+const\s+(\w+)/g)].map(x => x[1] || x[2]) : [null];
  for (const symbol of symbols) inventory.push({ file, symbol, url, kind, category: category(url), methods, boundary, scope });
}
inventory.sort((a,b) => a.file.localeCompare(b.file));
if (process.argv.includes('--write')) fs.writeFileSync(path.join(root, 'docs/architecture/vertical-entrypoints.json'), JSON.stringify(inventory, null, 2) + '\n');
else {
  const expected = JSON.parse(fs.readFileSync(path.join(root, 'docs/architecture/vertical-entrypoints.json')));
  if (JSON.stringify(inventory) !== JSON.stringify(expected)) throw new Error('Route inventory changed. Review and regenerate with node scripts/vertical/entrypoints.cjs --write');
}
console.log(`Inventoried ${inventory.length} pages, API routes, and server action files`);
