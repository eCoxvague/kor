// Statik kontrol: her import edilen isim gerçekten export ediliyor mu; kodun kullandığı DOM id'leri index.html'de var mı.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p);
  }
})(path.join(root, 'src'));

const exportsOf = {};
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const set = new Set();
  for (const m of s.matchAll(/export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) set.add(m[1]);
  for (const m of s.matchAll(/export\s*\{([^}]*)\}/g)) m[1].split(',').map(x => x.trim()).filter(Boolean).forEach(x => set.add(x.split(/\s+as\s+/).pop()));
  exportsOf[f] = set;
}

let bad = 0, count = 0;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    const target = path.resolve(path.dirname(f), m[2]);
    if (!exportsOf[target]) { console.log(`HATA ${path.relative(root, f)}: modul yok ${m[2]}`); bad++; continue; }
    for (const raw of m[1].split(',').map(x => x.trim()).filter(Boolean)) {
      const name = raw.split(/\s+as\s+/)[0];
      count++;
      if (!exportsOf[target].has(name)) { console.log(`HATA ${path.relative(root, f)}: '${name}' ${m[2]} icinde export edilmiyor`); bad++; }
    }
  }
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
let idCount = 0;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/getElementById\('([^']+)'\)/g)) {
    idCount++;
    if (!ids.has(m[1])) { console.log(`HATA ${path.relative(root, f)}: index.html'de id yok: ${m[1]}`); bad++; }
  }
}
console.log(`${count} import ve ${idCount} DOM id kontrol edildi, hata: ${bad}`);
process.exit(bad ? 1 : 0);
