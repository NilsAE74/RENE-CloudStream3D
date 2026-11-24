import * as THREE from 'three';
import { heightToColor } from './colorScale.js';

// --- Skilletegn og desimaltegn (issue #7) ---

// Tall med desimalpunktum eller desimalkomma (som regex-kildetekst)
const NUM_DOT = '[+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?';
const NUM_COMMA = '[+-]?\\d*,?\\d+(?:[eE][+-]?\\d+)?';
const TOKEN_DECIMAL_COMMA = /^[+-]?\d+(?:,\d+)?(?:[eE][+-]?\d+)?$/;
const DATA_LINE = /^[ \t]*[+-]?\.?\d/;

/**
 * Finner skilletegn og desimaltegn ut fra de første datalinjene.
 * Bare linjer som starter med et tall brukes (headere/kommentarer hoppes over).
 *
 * Regler per linje:
 * - Inneholder ';'                      → skilletegn ';', desimalkomma hvis linjen har komma
 * - Inneholder ',' og de tre første
 *   mellomrom/tab-separerte feltene er
 *   tall med desimalkomma (f.eks. "1,5 2,5 3,5") → skilletegn mellomrom, desimalkomma
 * - Inneholder ellers ','               → skilletegn ',', desimalpunktum ("1.5,2.5,3.5" og "1.5, 2.5, 3.5")
 * - Ellers                              → skilletegn mellomrom/tab, desimalpunktum
 * Flertallet av de undersøkte linjene avgjør skilletegnet.
 *
 * @param {string} content - Filinnhold (bare starten leses)
 * @param {number} maxLines - Antall datalinjer som undersøkes
 * @returns {{delimiter: 'whitespace'|','|';', decimalComma: boolean}}
 */
export function detectFormat(content, maxLines = 50) {
  return formatFromVotes(formatVotes(content, maxLines).votes);
}

/**
 * Stemmer per linjetype for de første `maxLines` datalinjene i content[0..end).
 * @returns {{votes: Map<string, number>, checked: number}} checked = antall datalinjer undersøkt
 */
function formatVotes(content, maxLines, end = content.length) {
  const votes = new Map();
  let start = 0;
  let checked = 0;

  while (checked < maxLines && start < end) {
    let lineEnd = content.indexOf('\n', start);
    if (lineEnd === -1 || lineEnd > end) lineEnd = end;
    const line = content.slice(start, lineEnd);
    start = lineEnd + 1;

    if (!DATA_LINE.test(line)) continue;
    checked++;

    let key;
    if (line.includes(';')) {
      key = line.includes(',') ? ';|comma' : ';|dot';
    } else if (line.includes(',')) {
      const tokens = line.trim().split(/[ \t]+/);
      const wsDecimalComma = tokens.length >= 3 &&
        tokens.slice(0, 3).every((t) => TOKEN_DECIMAL_COMMA.test(t));
      key = wsDecimalComma ? 'whitespace|comma' : ',|dot';
    } else {
      key = 'whitespace|dot';
    }
    votes.set(key, (votes.get(key) || 0) + 1);
  }
  return { votes, checked };
}

function formatFromVotes(votes) {
  // Skilletegn avgjøres av flertallet. Desimalkomma velges hvis minst én linje med
  // det skilletegnet har desimalkomma: linjer med bare heltall (f.eks. "500000 6000000 12")
  // har ingen komma, men "12,5" på en annen linje må likevel ikke leses som 12.
  const delimCount = new Map();
  for (const [key, count] of votes) {
    const delim = key.split('|')[0];
    delimCount.set(delim, (delimCount.get(delim) || 0) + count);
  }

  let delimiter = 'whitespace';
  let bestCount = 0;
  for (const [delim, count] of delimCount) {
    if (count > bestCount) { delimiter = delim; bestCount = count; }
  }

  return { delimiter, decimalComma: votes.has(`${delimiter}|comma`) };
}

/**
 * Lager regex som leser de tre FØRSTE tallene på hver linje for gitt format.
 * - Flagg 'm': ^ matcher starten av hver linje, så en match alltid starter på en ny linje.
 * - Skilletegn bruker [ \t] (ikke \s), så en match aldri går over et linjeskift.
 */
export function buildLineRegex({ delimiter, decimalComma }) {
  const num = `(${decimalComma ? NUM_COMMA : NUM_DOT})`;
  const sep = delimiter === 'whitespace' ? '[ \\t]+' : `[ \\t]*${delimiter}[ \\t]*`;
  return new RegExp(`^[ \\t]*${num}${sep}${num}${sep}${num}`, 'gm');
}

// --- Felles punktsamler ---

/**
 * Samler punkter i en Float32Array relativt til første punkt (origin, double),
 * oppdaterer bounds og hopper over ikke-endelige punkter (NaN i organiserte PCD-skyer).
 * Brukes av alle parsere. Kan fylles i flere omganger (biter), og avsluttes med finish().
 *
 * Presisjon: Float32 har bare ~7 gjeldende siffer, så UTM-verdier som Y ≈ 6.000.000
 * ville blitt avrundet til 0,5 m. Differansen til første punkt regnes derfor i double
 * FØR lagring. Absolutt koordinat = positions[i] + origin.
 */
export class PointBuilder {
  /** @param {number} capacity - Antall punkter det allokeres plass til (kan økes med reserve) */
  constructor(capacity = 1024) {
    this.positions = new Float32Array(Math.max(capacity, 1) * 3);
    this.pIndex = 0;
    this.skipped = 0;
    this.hasOrigin = false;
    this.ox = 0; this.oy = 0; this.oz = 0;
    this.minX = Infinity; this.maxX = -Infinity;
    this.minY = Infinity; this.maxY = -Infinity;
    this.minZ = Infinity; this.maxZ = -Infinity;
  }

  /** Antall punkter det er plass til uten ny allokering */
  get capacity() {
    return this.positions.length / 3;
  }

  /**
   * Sørger for plass til minst `points` punkter totalt. Ny allokering kopierer de
   * eksisterende punktene: minnetoppen er da gammel + ny array.
   */
  reserve(points) {
    if (points * 3 <= this.positions.length) return;
    const grown = new Float32Array(Math.ceil(points) * 3);
    grown.set(this.positions.subarray(0, this.pIndex));
    this.positions = grown;
  }

  add(x, y, z) {
    if (!(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z))) {
      this.skipped++;
      return;
    }
    if (!this.hasOrigin) {
      this.ox = x; this.oy = y; this.oz = z;
      this.hasOrigin = true;
    }
    let p = this.positions;
    const i = this.pIndex;
    if (i + 3 > p.length) {
      const grown = new Float32Array(p.length * 2);
      grown.set(p);
      this.positions = p = grown;
    }
    p[i] = x - this.ox;
    p[i + 1] = y - this.oy;
    p[i + 2] = z - this.oz;
    this.pIndex = i + 3;

    if (x < this.minX) this.minX = x;
    if (x > this.maxX) this.maxX = x;
    if (y < this.minY) this.minY = y;
    if (y > this.maxY) this.maxY = y;
    if (z < this.minZ) this.minZ = z;
    if (z > this.maxZ) this.maxZ = z;
  }

  finish(format) {
    if (this.skipped > 0) console.log(`Skipped ${this.skipped} points with NaN/Inf coordinates`);
    return finishPoints(
      this.positions, this.pIndex,
      { x: this.ox, y: this.oy, z: this.oz },
      { minX: this.minX, maxX: this.maxX, minY: this.minY, maxY: this.maxY, minZ: this.minZ, maxZ: this.maxZ },
      format
    );
  }
}

// --- Filer uten header (.xyz/.txt/.csv), i biter (issue #5) ---

// Antall datalinjer detectFormat undersøker. Bit-parseren venter til så mange
// komplette datalinjer er lest, slik at formatet blir det samme som for hele filen.
const FORMAT_LINES = 50;
// ... men venter ikke lenger enn hit (tegn) hvis filen har få datalinjer i starten
const FORMAT_MAX_BUFFER = 1 << 20;
// Margin på estimert antall punkter ved forhåndsallokering
const ESTIMATE_MARGIN = 1.03;

/** Antall '\n' i text[0..end) */
function countNewlines(text, end) {
  let n = 0;
  for (let i = text.indexOf('\n'); i !== -1 && i < end; i = text.indexOf('\n', i + 1)) n++;
  return n;
}

/**
 * Parser for filer uten header som tar imot teksten i biter (push), f.eks. fra en
 * strøm. Leser de tre FØRSTE tallene på hver linje (X Y Z), se buildLineRegex.
 * Ekstra kolonner ignoreres, og linjer som ikke starter med tre tall hoppes over.
 *
 * Biter kan deles hvor som helst (midt i et tall, mellom \r og \n): bare komplette
 * linjer (til og med siste '\n') parses, resten tas vare på til neste bit. Resultatet
 * er identisk med å parse hele teksten på én gang.
 *
 * Minne: positions forhåndsallokeres. Med `totalSize` (filstørrelse i byte) estimeres
 * antall punkter fra linjetettheten i det som er lest så langt (+3 %), så det normalt
 * blir én allokering. Bommer estimatet, allokeres et nytt estimat (gammel + ny array
 * i minnet samtidig under kopieringen, maks ca. 2× posisjonene).
 */
export class XYZChunkParser {
  /**
   * @param {Object} [options]
   * @param {number} [options.totalSize] - Total størrelse (byte) for estimat av antall punkter
   */
  constructor({ totalSize = 0 } = {}) {
    this.totalSize = totalSize;
    this.pending = '';
    this.format = null;
    this.lineRegex = null;
    this.builder = new PointBuilder(1);
    this.linesSeen = 0;
  }

  /**
   * Tar imot neste bit av teksten.
   * @param {string} chunk
   * @param {number} [consumed] - Antall byte av filen lest så langt (inkl. denne biten), for estimatet
   */
  push(chunk, consumed = 0) {
    const text = this.pending ? this.pending + chunk : chunk;
    const end = text.lastIndexOf('\n') + 1; // Starten av den ufullstendige siste linjen
    if (end === 0) {
      this.pending = text;
      return;
    }
    if (!this.format) {
      // Vent til de første datalinjene er komplette, så formatet blir som for hele filen
      if (formatVotes(text, FORMAT_LINES, end).checked < FORMAT_LINES && end < FORMAT_MAX_BUFFER) {
        this.pending = text;
        return;
      }
      this._setFormat(detectFormat(text.slice(0, end)));
    }
    this._parse(text, end, consumed);
    this.pending = end < text.length ? text.slice(end) : '';
  }

  /** Parser det som er igjen (siste linje uten '\n') og returnerer resultatet. */
  finish() {
    const text = this.pending;
    this.pending = '';
    if (!this.format) this._setFormat(detectFormat(text));
    if (text.length > 0) this._parse(text, text.length, 0, true);
    return this.builder.finish(this.format);
  }

  _setFormat(format) {
    this.format = format;
    this.lineRegex = buildLineRegex(format);
    console.log(`Format: delimiter=${format.delimiter}, decimal=${format.decimalComma ? 'comma' : 'dot'}`);
  }

  /** Parser linjene i text[0..end). end er rett etter en '\n', eller text.length for siste bit. */
  _parse(text, end, consumed, final = false) {
    const builder = this.builder;

    // Plass til minst én ny linje per '\n' (pluss siste linje uten linjeskift)
    const lines = countNewlines(text, end) + (final ? 1 : 0);
    this.linesSeen += lines;
    const needed = builder.pIndex / 3 + lines;
    if (needed > builder.capacity) {
      let target = needed;
      if (this.totalSize > 0 && consumed > 0) {
        target = Math.max(needed, Math.ceil(this.linesSeen * (this.totalSize / consumed) * ESTIMATE_MARGIN));
      }
      builder.reserve(target);
    }

    // regex.exec() gir neste match uten å lage en stor array. En match går aldri over
    // et linjeskift, så alle matcher som starter før `end` ligger på komplette linjer.
    const re = this.lineRegex;
    const decimalComma = this.format.decimalComma;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null && m.index < end) {
      const x = parseFloat(decimalComma ? m[1].replace(',', '.') : m[1]);
      const y = parseFloat(decimalComma ? m[2].replace(',', '.') : m[2]);
      const z = parseFloat(decimalComma ? m[3].replace(',', '.') : m[3]);
      builder.add(x, y, z);
    }
  }
}

/**
 * Parser en hel fil uten header gitt som én streng (tester, små filer).
 * Bruker samme bit-parser som strømmingen, med hele teksten som én bit.
 *
 * Posisjonene lagres RELATIVT til første punkt (origin, double), se PointBuilder.
 * Bounds er i absolutte koordinater.
 */
export function parseXYZFile(content) {
  const parser = new XYZChunkParser();
  parser.push(content);
  return parser.finish();
}

/**
 * Felles avslutning for alle parsere: trimmer positions og lager høydefarger.
 * @param {Float32Array} positions - Posisjoner RELATIVT til origin (kan være overallokert)
 * @param {number} pIndex - Antall brukte verdier (3 per punkt)
 * @param {{x,y,z}} origin - Origo i full presisjon (double)
 * @param {Object} bounds - Absolutte bounds
 * @param {Object} format - Formatbeskrivelse som returneres uendret
 */
export function finishPoints(positions, pIndex, origin, bounds, format) {
  const count = pIndex / 3;

  // Trim ned til faktisk størrelse. Arrayet brukes direkte i geometrien (ingen kopi),
  // så kopier bare hvis mye plass er ubrukt; ellers holder det med et view (<5 % ekstra).
  // 5 % dekker marginen på estimatet ved strømming (XYZChunkParser), slik at den vanlige
  // situasjonen ikke gir en ekstra kopi (minnetopp 2× posisjonene) helt til slutt.
  if (pIndex < positions.length) {
    positions = (positions.length - pIndex > positions.length * 0.05)
      ? positions.slice(0, pIndex)
      : positions.subarray(0, pIndex);
  }
  const colors = new Float32Array(pIndex);
  const { minZ, maxZ } = bounds;
  const originZ = origin.z;

  console.log(`Parsed ${count} points. Z-Range: ${minZ} to ${maxZ}`);

  // --- PASS 2: Fargelegging (Lynraskt siden vi jobber med tall) ---
  const tempColor = new THREE.Color(); // Gjenbruk objektet for å spare GC

  for (let i = 0; i < pIndex; i += 3) {
    const z = positions[i + 2] + originZ;

    // Blå (lav) til rød (høy), strukket over datasettets Z-område
    heightToColor(z, tempColor, minZ, maxZ);

    colors[i] = tempColor.r;
    colors[i + 1] = tempColor.g;
    colors[i + 2] = tempColor.b;
  }

  return {
    positions, // Float32Array, RELATIVT til origin
    colors,    // Float32Array
    count,
    format,
    bounds,    // Absolutte koordinater
    origin     // Full presisjon
  };
}

/**
 * Sentrerer posisjoner rundt origo.
 * @param {Float32Array|number[]} positions - Posisjoner relativt til `origin`
 * @param {Object} bounds - Absolutte bounds
 * @param {Object} origin - Origo som posisjonene er relative til (default 0,0,0 = absolutte posisjoner)
 * @returns {{centeredPositions: Float32Array, offset: {x,y,z}}} offset er i absolutte koordinater.
 *   Er `positions` en Float32Array, endres den in-place og returneres som `centeredPositions`.
 */
export function centerPositions(positions, bounds, origin = { x: 0, y: 0, z: 0 }) {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;

  // Forskyvning fra origin til senter (regnes i double)
  const shiftX = centerX - origin.x;
  const shiftY = centerY - origin.y;
  const shiftZ = centerZ - origin.z;

  console.log(`Centering offset: ${centerX}, ${centerY}, ${centerZ}`);

  // Float32Array sentreres in-place (ingen ekstra kopi av punktene, se issue #6).
  // Kalleren får tilbake samme array og skal ikke bruke de usentrerte verdiene etterpå.
  // Vanlige arrays (default-skyen, absolutte UTM-verdier i double) skrives til en ny
  // Float32Array; differansen regnes i double FØR lagring, ellers tapes presisjon.
  const centeredPositions = positions instanceof Float32Array
    ? positions
    : new Float32Array(positions.length);

  for (let i = 0; i < positions.length; i += 3) {
    centeredPositions[i] = positions[i] - shiftX;
    centeredPositions[i + 1] = positions[i + 1] - shiftY;
    centeredPositions[i + 2] = positions[i + 2] - shiftZ;
  }

  return {
    centeredPositions,
    offset: { x: centerX, y: centerY, z: centerZ }
  };
}

/**
 * Genererer en syntetisk default punktsky for testing
 * - 100x100 meter terreng
 * - Ca. 10 000 punkter
 * - Høydevariasjoner mellom 0 og 10 meter
 * - Realistiske UTM-koordinater (500.000 / 6.000.000 område)
 */
export function generateDefaultCloud() {
  console.log('🏔️ Genererer random default terreng...');

  const positions = [];
  const colors = [];
  const tempColor = new THREE.Color();

  // UTM-koordinater i 500.000 / 6.000.000 området
  const baseX = 500000;
  const baseY = 6000000;
  const baseZ = -20;

  // Terrengstørrelse: 100x100 meter
  const sizeX = 100;
  const sizeY = 100;

  // Ca. 10 000 punkter (100x100 = 10 000)
  const gridResX = 100;
  const gridResY = 100;

  const stepX = sizeX / (gridResX - 1);
  const stepY = sizeY / (gridResY - 1);

  // Randomiserte parametere for variert terreng
  const amp1 = 2 + Math.random() * 2;      // 2-4m (store bølger)
  const amp2 = 1.5 + Math.random() * 1;  // 1.5-3m (medium bølger)
  const amp3 = 1 + Math.random() * 1;      // 1-2m (små bølger)
  const amp4 = 2 + Math.random() * 1;    // 2-3.5m (diagonale bølger)

  const phase1 = Math.random() * Math.PI * 1;
  const phase2 = Math.random() * Math.PI * 2;
  const phase3 = Math.random() * Math.PI * 1;
  const phase4 = Math.random() * Math.PI * 2;

  console.log(`📊 Amplituder: ${amp1.toFixed(1)}m, ${amp2.toFixed(1)}m, ${amp3.toFixed(1)}m, ${amp4.toFixed(1)}m`);

  let minZ = Infinity;
  let maxZ = -Infinity;

  // Generer punkter med variert terreng - direkte til positions array
  for (let i = 0; i < gridResX; i++) {
    for (let j = 0; j < gridResY; j++) {
      const x = baseX + (i * stepX);
      const y = baseY + (j * stepY);

      // Bruk flere sinus-bølger for å lage et interessant terreng
      // Kombinerer store bølger med små bølger for naturlig utseende
      const wave1 = Math.sin(i / 10 + phase1) * amp1;  // Store bølger
      const wave2 = Math.sin(j / 8 + phase2) * amp2;   // Medium bølger
      const wave3 = Math.sin(i / 3 + phase3) * Math.cos(j / 4) * amp3;  // Små bølger
      const wave4 = Math.sin((i + j) / 15 + phase4) * amp4;  // Diagonale bølger

      // Legg til litt "støy" for mer naturlig variasjon
      const noise = (Math.sin(i * 0.5) * Math.cos(j * 0.7) +
                     Math.sin(i * 1.3) * Math.cos(j * 1.1)) * 0.5;

      // Kombiner alle bølger og skaler til 0-10 meter
      let z = baseZ + 5 + wave1 + wave2 + wave3 + wave4 + noise;

      // Sikre at z er innenfor baseZ til baseZ+10 meter
      z = Math.max(baseZ, Math.min(baseZ + 10, z));

      positions.push(x, y, z);

      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }

  const count = positions.length / 3;
  console.log(`✓ ${count} punkter generert`);
  console.log(`📍 Høydespenn: ${(maxZ - minZ).toFixed(2)}m (${minZ.toFixed(2)} til ${maxZ.toFixed(2)}m)`);

  // Fargelegging i samme loop siden vi vet Z-range på forhånd (baseZ til baseZ+10)

  for (let i = 0; i < positions.length; i += 3) {
    const z = positions[i + 2];

    // Fargelegg basert på Z-verdi (samme gradient som i parseXYZFile)
    heightToColor(z, tempColor, minZ, maxZ);
    colors.push(tempColor.r, tempColor.g, tempColor.b);
  }

  return {
    positions,
    colors,
    count,
    bounds: {
      minX: baseX,
      maxX: baseX + sizeX,
      minY: baseY,
      maxY: baseY + sizeY,
      minZ: minZ,
      maxZ: maxZ
    }
  };
}

/**
 * Genererer en 3D punktsky fra bedriftens logo
 * - Laster inn RENElogo.png
 * - Konverterer hver piksel til et 3D-punkt
 * - Beholder originalfargene fra logoen
 * - Plasserer logoen svevende over terrenget
 * 
 * @returns {Promise} Promise som resolves til punktsky-data
 */
export function generateLogoCloud() {
  return new Promise((resolve, reject) => {
    console.log('Genererer logo punktsky...');
    
    // Opprett et usynlig canvas-element
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Logo-dimensjoner
    const logoWidth = 1067;
    const logoHeight = 400;
    canvas.width = logoWidth;
    canvas.height = logoHeight;
    
    // Last inn logo-bildet
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Tillat CORS hvis nødvendig
    
    img.onload = () => {
      // Tegn logoen på canvas
      ctx.drawImage(img, 0, 0, logoWidth, logoHeight);

      // Hent pixel-data
      const imageData = ctx.getImageData(0, 0, logoWidth, logoHeight);
      const pixels = imageData.data;

      const positions = [];
      const colors = [];
      const velocities = []; // For eksplosjon-animasjon

      // UTM-koordinater (samme som default cloud)
      const baseX = 500000;
      const baseY = 6000000;
      const baseZ = -15; // Svevende over terrenget (som er på -70 til -60)

      // Skalering: Logo skal være ca. 50 meter bred
      const targetWidth = 50;
      const scaleX = targetWidth / logoWidth;
      const scaleY = scaleX; // Behold aspect ratio

      // Sentrer logoen over terrenget (terreng er 100x100m, starter på baseX/baseY)
      const centerOffsetX = baseX + 25; // Midt i terrenget (100m / 2 - 50m / 2 = 25m offset)
      const centerOffsetY = baseY + 50;

      // Beregn sentrum for logo (for eksplosjon-retninger)
      const logoCenterX = centerOffsetX + (logoWidth * scaleX) / 2;
      const logoCenterY = centerOffsetY + 1; // Midt i tykkelsen
      const logoCenterZ = baseZ + (logoHeight * scaleY) / 2;

      let minZ = Infinity;
      let maxZ = -Infinity;

      // Sample-rate: For å ikke få for mange punkter, kan vi sample hver N'te piksel
      const sampleRate = 2; // Sample hver 2. piksel (justér for tetthet)

      // PASS 1: Samle punkter og beregn bounds
      for (let y = 0; y < logoHeight; y += sampleRate) {
        for (let x = 0; x < logoWidth; x += sampleRate) {
          const index = (y * logoWidth + x) * 4;

          const r = pixels[index];
          const g = pixels[index + 1];
          const b = pixels[index + 2];
          const a = pixels[index + 3];

          // Kun punkter for synlige piksler (alpha > threshold)
          if (a > 50) { // Threshold for transparens
            // Konverter piksel-koordinater til 3D-koordinater
            // Logo skal stå OPPREIST (vertikal):
            const pointX = centerOffsetX + (x * scaleX);  // Bredde (venstre-høyre)
            const pointY = centerOffsetY + Math.random() * 2;  // Tykkelse (dybde)
            const pointZ = baseZ + ((logoHeight - y) * scaleY);  // Høyde (opp-ned)

            positions.push(pointX, pointY, pointZ);
            colors.push(r / 255, g / 255, b / 255); // Logo beholder originalfarger

            minZ = Math.min(minZ, pointZ);
            maxZ = Math.max(maxZ, pointZ);
          }
        }
      }

      const count = positions.length / 3;
      console.log(`Logo punktsky generert: ${count} punkter`);
      console.log(`Z range: ${minZ.toFixed(2)} til ${maxZ.toFixed(2)}`);

      // Finn X/Y bounds fra positions array
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;

      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];

        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }

      // PASS 2: Beregn velocities for eksplosjon
      for (let i = 0; i < positions.length; i += 3) {
        const pointX = positions[i];
        const pointY = positions[i + 1];
        const pointZ = positions[i + 2];

        // Beregn retningsvektor fra sentrum til punktet (for eksplosjon)
        const dx = pointX - logoCenterX;
        const dy = pointY - logoCenterY;
        const dz = pointZ - logoCenterZ;

        // Normaliser retningen og multipliser med tilfeldig hastighet
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const speed = 15 + Math.random() * 25; // Tilfeldig hastighet 15-40 m/s

        if (distance > 0) {
          velocities.push(
            (dx / distance) * speed,
            (dy / distance) * speed,
            (dz / distance) * speed
          );
        } else {
          // Hvis punktet er akkurat i sentrum, gi tilfeldig retning
          const randomAngle = Math.random() * Math.PI * 2;
          const randomElevation = (Math.random() - 0.5) * Math.PI;
          velocities.push(
            Math.cos(randomAngle) * Math.cos(randomElevation) * speed,
            Math.sin(randomAngle) * Math.cos(randomElevation) * speed,
            Math.sin(randomElevation) * speed
          );
        }
      }
      
      console.log(`X range: ${minX.toFixed(2)} til ${maxX.toFixed(2)}`);
      console.log(`Y range: ${minY.toFixed(2)} til ${maxY.toFixed(2)}`);

      resolve({
        positions,
        colors,
        velocities, // Legg til velocities for eksplosjon
        count,
        bounds: {
          minX,
          maxX,
          minY,
          maxY,
          minZ,
          maxZ
        }
      });
    };
    
    img.onerror = (error) => {
      console.error('Feil ved lasting av logo:', error);
      reject(new Error('Kunne ikke laste logo-bilde'));
    };
    
    // Start lasting av bilde
    // Bruk full path med Vite base (satt i vite.config.js)
    img.src = '/RENE-CloudStream3D/RENElogo.png';
  });
}