import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VENDOR_FILES } from './vendor-order.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(here, '..');
const vendorDir = path.join(pkgDir, 'vendor');
const dataPkg = path.resolve(pkgDir, '..', 'data');
const lock = JSON.parse(fs.readFileSync(path.join(dataPkg, 'pvpoke.lock.json'), 'utf8')) as {
  commit: string;
};
const checkout = process.env.PICKTHREE_PVPOKE_DIR ?? path.join(dataPkg, '.pvpoke');
const jsDir = path.join(checkout, 'src', 'js');

if (!fs.existsSync(jsDir)) {
  console.error(`PvPoke checkout not found at ${checkout}. Run npm run data:fetch first.`);
  process.exit(1);
}

fs.mkdirSync(vendorDir, { recursive: true });
const files = VENDOR_FILES.map((f) => {
  const bytes = fs.readFileSync(path.join(jsDir, f.source));
  fs.writeFileSync(path.join(vendorDir, f.name), bytes);
  return {
    name: f.name,
    source: `src/js/${f.source}`,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
});
fs.copyFileSync(path.join(checkout, 'LICENSE'), path.join(pkgDir, 'LICENSE-pvpoke'));
fs.writeFileSync(
  path.join(vendorDir, 'MANIFEST.json'),
  `${JSON.stringify({ commit: lock.commit, files }, null, 2)}\n`,
);
console.log(`vendored ${files.length} files from pvpoke @ ${lock.commit.slice(0, 7)}`);
