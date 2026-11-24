/**
 * Lager public/THIRD_PARTY_LICENSES.txt med lisensteksten til alle avhengigheter
 * som bygges inn i appen (issue #9). MIT og Apache-2.0 krever at lisensteksten
 * følger med når koden distribueres, og den bygde siden distribuerer koden.
 *
 * Kjøres automatisk før `npm run build` (prebuild), så filen alltid følger
 * package-lock.json. Filen havner i dist/ og publiseres med siden.
 *
 * Med: alle pakker i package-lock.json som ikke er dev-avhengigheter, unntatt
 * @types/* (bare typer, bygges ikke inn). Pakker uten lisensfil i npm-pakken
 * må ha en tekst i scripts/licenses/<pakkenavn>.txt, ellers stopper bygget.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LICENSE_FILE = /^(licen[cs]e|copying)([-.].*)?$/i;

const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
const packages = [];
const missing = [];

for (const [path, info] of Object.entries(lock.packages)) {
  if (!path || info.dev) continue;
  const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
  if (name.startsWith('@types/')) continue;

  const dir = join(root, path);
  if (!existsSync(dir)) {
    if (info.optional) continue; // Valgfri pakke som ikke er installert på denne plattformen
    throw new Error(`${name} er ikke installert. Kjør npm install først.`);
  }
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const license = pkg.license || info.license || 'UNKNOWN';
  // «SEE LICENSE IN <fil>» i license-feltet: ta med den filen også
  const seeFile = /SEE LICENSE IN (\S+)/i.exec(license)?.[1];
  const files = readdirSync(dir).filter((f) => LICENSE_FILE.test(f) || f === seeFile).sort();
  let text = files.map((f) => readFileSync(join(dir, f), 'utf8').trim()).join('\n\n');
  const fallback = join(root, 'scripts', 'licenses', `${name.replace('/', '__')}.txt`);
  if (!text && existsSync(fallback)) text = readFileSync(fallback, 'utf8').trim();
  if (!text) missing.push(name);

  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  packages.push({ name, version: pkg.version, license, homepage: pkg.homepage || repo || '', text });
}

if (missing.length) {
  throw new Error(`Mangler lisenstekst for: ${missing.join(', ')}. Legg teksten i scripts/licenses/<pakkenavn>.txt.`);
}

packages.sort((a, b) => a.name.localeCompare(b.name));
const rule = '='.repeat(78);
let out = `RENE CloudStream3D – third-party software licenses

RENE CloudStream3D is proprietary software, Copyright (c) Reinertsen New Energy AS.
It includes the following open source packages, which are licensed under their
own terms as reproduced below.

Generated from package-lock.json by scripts/third-party-licenses.mjs. Do not edit.

`;
for (const p of packages) out += `  ${p.name} ${p.version} (${p.license})\n`;
for (const p of packages) {
  out += `\n${rule}\n${p.name} ${p.version}\nLicense: ${p.license}\n${p.homepage ? `Source: ${p.homepage}\n` : ''}${rule}\n\n${p.text}\n`;
}

writeFileSync(join(root, 'public', 'THIRD_PARTY_LICENSES.txt'), out);
console.log(`THIRD_PARTY_LICENSES.txt: ${packages.length} pakker`);
