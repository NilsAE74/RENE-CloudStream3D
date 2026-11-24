/**
 * PLY- og PCD-støtte (issue #8).
 *
 * Todelt oppbygning, slik at den kan gjenbrukes ved strømming i biter (#5):
 *   1. parseHeader(text)  – tolker bare headeren og beskriver dataene
 *                           (type, encoding, antall punkter, kolonner/offsets, dataStart).
 *   2. parseAsciiBody / parseBinaryBody – leser selve dataene ut fra header-beskrivelsen
 *      og fyller en PointBuilder.
 *
 * Presisjon: som i parseXYZFile lagres posisjonene relativt til første punkt (origin,
 * double). Differansen regnes i double før lagring i Float32Array. three sine
 * PLYLoader/PCDLoader brukes IKKE, siden de lagrer absolutte verdier i Float32Array.
 */
import { finishPoints, parseXYZFile } from './parser.js';

// Hvor mye av starten av filen som leses for å finne headeren
export const HEADER_PROBE_BYTES = 64 * 1024;

// --- Datatyper ---

// PLY-typenavn → { size, kind } (kind brukes til å velge DataView-metode)
const PLY_TYPES = {
  char: { size: 1, kind: 'i8' }, int8: { size: 1, kind: 'i8' },
  uchar: { size: 1, kind: 'u8' }, uint8: { size: 1, kind: 'u8' },
  short: { size: 2, kind: 'i16' }, int16: { size: 2, kind: 'i16' },
  ushort: { size: 2, kind: 'u16' }, uint16: { size: 2, kind: 'u16' },
  int: { size: 4, kind: 'i32' }, int32: { size: 4, kind: 'i32' },
  uint: { size: 4, kind: 'u32' }, uint32: { size: 4, kind: 'u32' },
  float: { size: 4, kind: 'f32' }, float32: { size: 4, kind: 'f32' },
  double: { size: 8, kind: 'f64' }, float64: { size: 8, kind: 'f64' }
};

// PCD TYPE (F/I/U) + SIZE → kind
function pcdKind(type, size) {
  const kinds = {
    F4: 'f32', F8: 'f64',
    I1: 'i8', I2: 'i16', I4: 'i32', I8: 'i64',
    U1: 'u8', U2: 'u16', U4: 'u32', U8: 'u64'
  };
  const kind = kinds[`${type}${size}`];
  if (!kind) throw new Error(`Unsupported PCD field type: TYPE ${type}, SIZE ${size}`);
  return kind;
}

/** Leser én verdi av gitt type (little endian) fra en DataView. */
function readValue(dv, offset, kind) {
  switch (kind) {
    case 'f32': return dv.getFloat32(offset, true);
    case 'f64': return dv.getFloat64(offset, true);
    case 'i8': return dv.getInt8(offset);
    case 'u8': return dv.getUint8(offset);
    case 'i16': return dv.getInt16(offset, true);
    case 'u16': return dv.getUint16(offset, true);
    case 'i32': return dv.getInt32(offset, true);
    case 'u32': return dv.getUint32(offset, true);
    case 'i64': return Number(dv.getBigInt64(offset, true));
    case 'u64': return Number(dv.getBigUint64(offset, true));
    default: throw new Error(`Unknown data type: ${kind}`);
  }
}

// --- Felles punktsamler ---

/**
 * Samler punkter i en Float32Array relativt til første punkt (origin, double),
 * oppdaterer bounds og hopper over ikke-endelige punkter (NaN i organiserte PCD-skyer).
 * Kan fylles i flere omganger (biter), og avsluttes med finish().
 */
export class PointBuilder {
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

// --- Header ---

/** Gjør bytes om til en streng med ett tegn per byte (indekser = byte-offsets). */
export function bytesToString(bytes) {
  let s = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return s;
}

/** Itererer header-linjer: gir { line (uten \r), next (offset etter \n) }. */
function* headerLines(text, start = 0) {
  let pos = start;
  while (pos < text.length) {
    let end = text.indexOf('\n', pos);
    const hasNewline = end !== -1;
    if (!hasNewline) end = text.length;
    let line = text.slice(pos, end);
    if (line.endsWith('\r')) line = line.slice(0, -1);
    yield { line, next: hasNewline ? end + 1 : text.length, complete: hasNewline };
    pos = end + 1;
  }
}

/**
 * Tolker headeren i starten av en fil.
 *
 * `text` er enten hele filen som tekst (ASCII-sti), eller de første bytene gjort om
 * med bytesToString (binær sti) – da er `dataStart` en byte-offset.
 *
 * @returns {Object} En av:
 *   { type: 'none' }                                  – ingen PLY/PCD-header (.xyz/.txt/.csv)
 *   { type: 'ply', encoding, count, dataStart, elements, vertexIndex, columns, props, stride }
 *   { type: 'pcd', encoding, count, dataStart, columns, props, stride }
 * Kaster Error med engelsk melding for formater som ikke støttes.
 */
export function parseHeader(text) {
  // PLY starter alltid med magisk linje "ply"
  if (/^ply[ \t]*\r?\n/.test(text)) return parsePlyHeader(text);

  // PCD: første linje som ikke er kommentar/tom starter med et PCD-nøkkelord
  for (const { line } of headerLines(text)) {
    const t = line.trim();
    if (t === '' || t.startsWith('#')) continue;
    if (/^(VERSION|FIELDS)\b/i.test(t)) return parsePcdHeader(text);
    break;
  }
  return { type: 'none' };
}

function parsePlyHeader(text) {
  let encoding = null;
  const elements = [];
  let dataStart = -1;

  for (const { line, next, complete } of headerLines(text)) {
    const parts = line.trim().split(/\s+/);
    const key = parts[0];
    if (key === 'format') {
      encoding = parts[1];
    } else if (key === 'element') {
      elements.push({ name: parts[1], count: parseInt(parts[2], 10), props: [] });
    } else if (key === 'property') {
      const el = elements[elements.length - 1];
      if (!el) throw new Error('Invalid PLY header: property before element');
      if (parts[1] === 'list') {
        const countType = PLY_TYPES[parts[2]];
        const itemType = PLY_TYPES[parts[3]];
        if (!countType || !itemType) throw new Error(`Unsupported PLY property type: ${line.trim()}`);
        el.props.push({ name: parts[4], list: true, countKind: countType.kind, countSize: countType.size, kind: itemType.kind, size: itemType.size });
      } else {
        const type = PLY_TYPES[parts[1]];
        if (!type) throw new Error(`Unsupported PLY property type: ${line.trim()}`);
        el.props.push({ name: parts[2], list: false, kind: type.kind, size: type.size });
      }
    } else if (key === 'end_header') {
      if (!complete) break;
      dataStart = next;
      break;
    }
  }

  if (dataStart === -1) {
    throw new Error(`PLY header not found: no "end_header" in the first ${HEADER_PROBE_BYTES / 1024} KB`);
  }
  if (encoding === 'binary_big_endian') {
    throw new Error('Binary big-endian PLY is not supported. Convert the file to ASCII or binary little-endian PLY.');
  }
  if (encoding !== 'ascii' && encoding !== 'binary_little_endian') {
    throw new Error(`Unsupported PLY format: ${encoding || '(missing)'}`);
  }

  const vertexIndex = elements.findIndex((e) => e.name === 'vertex');
  if (vertexIndex === -1) throw new Error('PLY file has no "element vertex"');
  const vertex = elements[vertexIndex];
  if (vertex.props.some((p) => p.list)) throw new Error('PLY vertex element with list properties is not supported');

  // Kolonne (ASCII) og byte-offset (binær) for x, y, z
  const columns = [];
  const props = [];
  for (const name of ['x', 'y', 'z']) {
    const idx = vertex.props.findIndex((p) => p.name.toLowerCase() === name);
    if (idx === -1) throw new Error('PLY file has no x/y/z vertex properties');
    let offset = 0;
    for (let i = 0; i < idx; i++) offset += vertex.props[i].size;
    columns.push(idx);
    props.push({ offset, kind: vertex.props[idx].kind });
  }
  const stride = vertex.props.reduce((s, p) => s + p.size, 0);

  return {
    type: 'ply',
    encoding: encoding === 'ascii' ? 'ascii' : 'binary',
    count: vertex.count,
    dataStart,
    elements,
    vertexIndex,
    columns,
    props,
    stride
  };
}

function parsePcdHeader(text) {
  const h = {};
  let dataStart = -1;

  for (const { line, next } of headerLines(text)) {
    const t = line.trim();
    if (t === '' || t.startsWith('#')) continue;
    const parts = t.split(/\s+/);
    const key = parts[0].toUpperCase();
    h[key] = parts.slice(1);
    if (key === 'DATA') {
      dataStart = next;
      break;
    }
  }

  if (dataStart === -1) {
    throw new Error(`PCD header not found: no "DATA" line in the first ${HEADER_PROBE_BYTES / 1024} KB`);
  }
  const data = (h.DATA[0] || '').toLowerCase();
  if (data === 'binary_compressed') {
    throw new Error('Compressed PCD (DATA binary_compressed) is not supported. Save the file as ASCII or binary PCD.');
  }
  if (data !== 'ascii' && data !== 'binary') {
    throw new Error(`Unsupported PCD data format: ${h.DATA[0] || '(missing)'}`);
  }

  const fields = h.FIELDS;
  if (!fields) throw new Error('Invalid PCD header: missing FIELDS');
  const n = fields.length;
  const sizes = h.SIZE ? h.SIZE.map(Number) : new Array(n).fill(4);
  const types = h.TYPE ? h.TYPE.map((t) => t.toUpperCase()) : new Array(n).fill('F');
  const counts = h.COUNT ? h.COUNT.map(Number) : new Array(n).fill(1);

  let count;
  if (h.POINTS) count = parseInt(h.POINTS[0], 10);
  else if (h.WIDTH) count = parseInt(h.WIDTH[0], 10) * (h.HEIGHT ? parseInt(h.HEIGHT[0], 10) : 1);
  else throw new Error('Invalid PCD header: missing POINTS');

  // Kolonne (ASCII) og byte-offset (binær). Felt med COUNT > 1 tar flere kolonner.
  const columns = [];
  const props = [];
  for (const name of ['x', 'y', 'z']) {
    const idx = fields.findIndex((f) => f.toLowerCase() === name);
    if (idx === -1) throw new Error('PCD file has no x/y/z fields');
    let col = 0, offset = 0;
    for (let i = 0; i < idx; i++) {
      col += counts[i];
      offset += sizes[i] * counts[i];
    }
    columns.push(col);
    props.push({ offset, kind: data === 'binary' ? pcdKind(types[idx], sizes[idx]) : null });
  }
  let stride = 0;
  for (let i = 0; i < n; i++) stride += sizes[i] * counts[i];

  return { type: 'pcd', encoding: data, count, dataStart, columns, props, stride };
}

// --- Innlesing av fil ---

/**
 * Leser en fil i nettleseren: først de første 64 KB for å finne headeren, deretter
 * hele filen ÉN gang, som ArrayBuffer (binær PLY/PCD) eller tekst (alt annet).
 * Kaster Error (engelsk melding) for formater som ikke støttes, før hele filen leses.
 * @param {File|Blob} file
 * @returns {Promise<{header: Object, text?: string, buffer?: ArrayBuffer}>}
 */
export async function readPointFile(file) {
  const probe = new Uint8Array(await file.slice(0, HEADER_PROBE_BYTES).arrayBuffer());
  const header = parseHeader(bytesToString(probe));
  if (header.encoding === 'binary') {
    return { header, buffer: await file.arrayBuffer() };
  }
  return { header, text: await file.text() };
}

/**
 * Parser data fra readPointFile. Returnerer samme struktur som parseXYZFile.
 * Filer uten PLY/PCD-header går uendret til parseXYZFile.
 */
export function parsePointFile({ header, text, buffer }) {
  if (header.type === 'none') return parseXYZFile(text);
  if (header.encoding === 'binary') return parseBinaryBody(buffer, header);
  // ASCII: tolk headeren på nytt i den dekodede teksten, så dataStart er en
  // tegn-offset (UTF-8-tegn i kommentarer gjør byte- og tegn-offset ulike)
  return parseAsciiBody(text, parseHeader(text));
}

// --- ASCII-data ---

/**
 * Leser `rowCount` ikke-tomme linjer fra `start`. For hver linje hentes kolonnene
 * `columns` = [xi, yi, zi] uten split() (tokenisering på mellomrom/tab).
 * Med builder = null hoppes linjene bare over.
 * @returns {number} Posisjon etter siste leste linje
 */
export function readAsciiRows(text, start, rowCount, columns, builder) {
  const [xi, yi, zi] = columns || [0, 1, 2];
  const maxCol = Math.max(xi, yi, zi);
  const len = text.length;
  let pos = start;
  let rows = 0;

  while (rows < rowCount && pos < len) {
    let lineEnd = text.indexOf('\n', pos);
    if (lineEnd === -1) lineEnd = len;

    let i = pos;
    let col = 0;
    let x = NaN, y = NaN, z = NaN;
    let hasToken = false;

    while (i < lineEnd) {
      // Hopp over mellomrom, tab og \r
      let c = text.charCodeAt(i);
      while (i < lineEnd && (c === 32 || c === 9 || c === 13)) c = text.charCodeAt(++i);
      if (i >= lineEnd) break;

      const s = i;
      while (i < lineEnd && c !== 32 && c !== 9 && c !== 13) c = text.charCodeAt(++i);
      hasToken = true;
      if (!builder) break; // Bare telling av linjer

      if (col === xi) x = parseFloat(text.slice(s, i));
      if (col === yi) y = parseFloat(text.slice(s, i));
      if (col === zi) z = parseFloat(text.slice(s, i));
      if (++col > maxCol) break;
    }

    pos = lineEnd + 1;
    if (!hasToken) continue; // Tomme linjer teller ikke
    rows++;
    if (builder) builder.add(x, y, z);
  }
  return pos;
}

/**
 * Leser punktene i en ASCII PLY/PCD. `text` er hele filen, `header` fra parseHeader(text).
 * For PLY leses bare de N vertex-linjene; andre elementer (f.eks. face-linjer) ignoreres.
 */
export function parseAsciiBody(text, header) {
  let pos = header.dataStart;

  // PLY: hopp over elementer som står før vertex (én linje per element)
  if (header.type === 'ply') {
    for (let e = 0; e < header.vertexIndex; e++) {
      pos = readAsciiRows(text, pos, header.elements[e].count, null, null);
    }
  }

  // Minste mulige linje er "0 0 0\n" (6 tegn): begrenser allokeringen ved feil POINTS/vertex-antall
  const builder = new PointBuilder(Math.min(header.count, Math.ceil((text.length - pos) / 6) + 1));
  readAsciiRows(text, pos, header.count, header.columns, builder);
  return builder.finish({ type: header.type, encoding: 'ascii' });
}

// --- Binære data ---

/**
 * Leser punktene i binær little-endian PLY eller binær PCD.
 * @param {ArrayBuffer} buffer - Hele filen
 * @param {Object} header - Fra parseHeader (dataStart er byte-offset)
 */
export function parseBinaryBody(buffer, header) {
  const dv = new DataView(buffer);
  let pos = header.dataStart;

  // PLY: gå forbi elementer som står før vertex
  if (header.type === 'ply') {
    for (let e = 0; e < header.vertexIndex; e++) {
      pos = skipBinaryElement(dv, pos, header.elements[e]);
    }
  }

  const { count, stride } = header;
  const needed = pos + count * stride;
  if (needed > buffer.byteLength) {
    throw new Error(`File is truncated: expected ${count.toLocaleString('nb-NO')} points (${needed.toLocaleString('nb-NO')} bytes), file has ${buffer.byteLength.toLocaleString('nb-NO')} bytes`);
  }

  const [px, py, pz] = header.props;
  const builder = new PointBuilder(count);

  // Spesialisert løkke for de vanligste tilfellene (alle float eller alle double)
  if (px.kind === py.kind && py.kind === pz.kind && (px.kind === 'f32' || px.kind === 'f64')) {
    const f64 = px.kind === 'f64';
    for (let i = 0, o = pos; i < count; i++, o += stride) {
      if (f64) {
        builder.add(dv.getFloat64(o + px.offset, true), dv.getFloat64(o + py.offset, true), dv.getFloat64(o + pz.offset, true));
      } else {
        builder.add(dv.getFloat32(o + px.offset, true), dv.getFloat32(o + py.offset, true), dv.getFloat32(o + pz.offset, true));
      }
    }
  } else {
    for (let i = 0, o = pos; i < count; i++, o += stride) {
      builder.add(readValue(dv, o + px.offset, px.kind), readValue(dv, o + py.offset, py.kind), readValue(dv, o + pz.offset, pz.kind));
    }
  }

  return builder.finish({ type: header.type, encoding: 'binary' });
}

/** Returnerer byte-offset etter et binært PLY-element (håndterer list-properties). */
function skipBinaryElement(dv, pos, element) {
  if (!element.props.some((p) => p.list)) {
    return pos + element.count * element.props.reduce((s, p) => s + p.size, 0);
  }
  for (let i = 0; i < element.count; i++) {
    for (const p of element.props) {
      if (p.list) {
        const n = readValue(dv, pos, p.countKind);
        pos += p.countSize + n * p.size;
      } else {
        pos += p.size;
      }
    }
  }
  return pos;
}
