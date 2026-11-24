/**
 * PLY- og PCD-støtte (issue #8), LAS-støtte (issue #15) og innlesing av filer i biter (issue #5).
 *
 * Todelt oppbygning:
 *   1. parseHeader(text)  – tolker bare headeren og beskriver dataene
 *                           (type, encoding, antall punkter, kolonner/offsets, dataStart).
 *   2. AsciiBodyParser / readBinaryRows – leser selve dataene ut fra header-beskrivelsen
 *      og fyller en PointBuilder.
 *
 * Innlesing i nettleseren (readPointFile + parsePointFile) leser aldri hele filen til
 * én streng eller én ArrayBuffer (Chrome/Edge tillater maks ca. 512 MB per streng):
 *   - Tekst (.xyz/.txt/.csv, ASCII PLY/PCD): file.stream() dekodes med TextDecoder
 *     (stream: true) og parses bit for bit (XYZChunkParser / AsciiBodyParser).
 *   - Binær PLY/PCD og LAS: leses i vinduer på BINARY_WINDOW_BYTES med file.slice().
 *
 * Presisjon: som i parseXYZFile lagres posisjonene relativt til første punkt (origin,
 * double). Differansen regnes i double før lagring i Float32Array. three sine
 * PLYLoader/PCDLoader brukes IKKE, siden de lagrer absolutte verdier i Float32Array.
 */
import { PointBuilder, XYZChunkParser, parseXYZFile } from './parser.js';

export { PointBuilder };

// Hvor mye av starten av filen som leses for å finne headeren
export const HEADER_PROBE_BYTES = 64 * 1024;
// Tekst samles til biter på minst så mange tegn før parsing (færre, større regex-kjøringer)
export const TEXT_BATCH_CHARS = 4 * 1024 * 1024;
// Størrelse på hvert vindu (file.slice) ved lesing av binære filer
export const BINARY_WINDOW_BYTES = 16 * 1024 * 1024;
// Hvor ofte (ms) innlesingen gir nettleseren tid til å tegne (fremdrift, animasjon)
const YIELD_INTERVAL_MS = 100;

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
 *   { type: 'las', encoding: 'binary', version, pointFormat, count, dataStart, stride, scale, offset }
 * Kaster Error med engelsk melding for formater som ikke støttes.
 */
export function parseHeader(text) {
  // LAS starter alltid med signaturen "LASF" (binær header)
  if (text.startsWith('LASF')) return parseLasHeader(text);

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

// --- LAS (issue #15) ---

// Minste postlengde (bytes) per punktformat 0–10 (ASPRS LAS 1.4 R15)
const LAS_MIN_RECORD_LENGTH = [20, 28, 26, 34, 57, 63, 30, 36, 38, 59, 67];
// Minste headerlengde: alle felt til og med min Z (LAS 1.0–1.2)
const LAS_MIN_HEADER_SIZE = 227;
// LAS 1.4-header (med 64-bits antall punkter fra offset 247)
const LAS14_HEADER_SIZE = 375;

/**
 * Tolker public header block i en LAS-fil. `text` er bytes gjort om med
 * bytesToString (ett tegn per byte), så headeren kan leses med en DataView.
 *
 * X/Y/Z ligger som int32 først i hver post i alle punktformater (0–10).
 * Absolutt koordinat = heltall × skala + offset (regnes i double i readBinaryRows).
 * `stride` er postlengden fra headeren, siden ekstra bytes kan gjøre posten lengre
 * enn standarden.
 */
function parseLasHeader(text) {
  const n = Math.min(text.length, LAS14_HEADER_SIZE);
  if (n < LAS_MIN_HEADER_SIZE) {
    throw new Error(`LAS header is truncated: ${n} bytes, expected at least ${LAS_MIN_HEADER_SIZE}`);
  }
  const bytes = new Uint8Array(n);
  for (let i = 0; i < n; i++) bytes[i] = text.charCodeAt(i);
  const dv = new DataView(bytes.buffer);

  const major = dv.getUint8(24);
  const minor = dv.getUint8(25);
  if (major !== 1 || minor > 4) throw new Error(`Unsupported LAS version ${major}.${minor}`);

  const headerSize = dv.getUint16(94, true);
  const dataStart = dv.getUint32(96, true);
  const formatByte = dv.getUint8(104);
  const stride = dv.getUint16(105, true);

  // LASzip setter bit 7 (og 6) i punktformatet for komprimerte filer
  if (formatByte & 0xC0) {
    throw new Error('Compressed LAS (LAZ) is not supported yet. Decompress the file to LAS first (e.g. with LAStools or CloudCompare).');
  }
  const pointFormat = formatByte;
  if (pointFormat >= LAS_MIN_RECORD_LENGTH.length) {
    throw new Error(`Unsupported LAS point data format: ${pointFormat}`);
  }
  if (stride < LAS_MIN_RECORD_LENGTH[pointFormat]) {
    throw new Error(`Invalid LAS header: point record length ${stride} is too short for point format ${pointFormat} (minimum ${LAS_MIN_RECORD_LENGTH[pointFormat]})`);
  }
  if (headerSize < LAS_MIN_HEADER_SIZE || dataStart < headerSize) {
    throw new Error(`Invalid LAS header: header size ${headerSize}, offset to point data ${dataStart}`);
  }

  // Antall punkter: legacy-feltet (uint32) for LAS 1.0–1.3. LAS 1.4 har et 64-bits
  // felt; legacy-feltet er da 0 for punktformat 6–10 og for over 2^32 - 1 punkter.
  let count = dv.getUint32(107, true);
  if (minor >= 4 && headerSize >= LAS14_HEADER_SIZE && n >= LAS14_HEADER_SIZE) {
    const count64 = Number(dv.getBigUint64(247, true));
    if (count64 > 0) count = count64;
  }

  const scale = [dv.getFloat64(131, true), dv.getFloat64(139, true), dv.getFloat64(147, true)];
  const offset = [dv.getFloat64(155, true), dv.getFloat64(163, true), dv.getFloat64(171, true)];
  if (!scale.every((s) => Number.isFinite(s) && s !== 0) || !offset.every(Number.isFinite)) {
    throw new Error('Invalid LAS header: scale factors must be non-zero and offsets finite');
  }

  return {
    type: 'las',
    encoding: 'binary',
    version: `${major}.${minor}`,
    pointFormat,
    count,
    dataStart,
    stride,
    scale,
    offset
  };
}

// --- Innlesing av fil ---

/**
 * Leser headeren fra de første 64 KB av en fil i nettleseren. Selve dataene leses
 * først av parsePointFile, i biter. Kaster Error (engelsk melding) for formater som
 * ikke støttes, før noe annet leses (og før eksplosjonsanimasjonen).
 * @param {File|Blob} file
 * @returns {Promise<{file: File|Blob, header: Object}>}
 */
export async function readPointFile(file) {
  const probe = new Uint8Array(await file.slice(0, HEADER_PROBE_BYTES).arrayBuffer());
  const header = parseHeader(bytesToString(probe));
  return { file, header };
}

/**
 * Parser punktene. Returnerer samme struktur som parseXYZFile.
 *
 * Med `file` (fra readPointFile) leses filen i biter, se toppen av filen. `text`
 * (hele filen som streng) og `buffer` (hele filen som ArrayBuffer) støttes også,
 * for tester og små filer.
 *
 * @param {{header: Object, file?: Blob, text?: string, buffer?: ArrayBuffer}} data
 * @param {Object} [options]
 * @param {(fraction: number) => void} [options.onProgress] - Andel av filen lest (0–1)
 * @param {number} [options.chunkChars] - Bitstørrelse for tekst (tegn), default TEXT_BATCH_CHARS
 * @param {number} [options.windowBytes] - Vindusstørrelse for binære filer, default BINARY_WINDOW_BYTES
 * @returns {Promise<Object>}
 */
export async function parsePointFile({ header, file, text, buffer }, options = {}) {
  if (text !== undefined) {
    return header.type === 'none' ? parseXYZFile(text) : parseAsciiBody(text, header);
  }
  if (buffer !== undefined) return parseBinaryBody(buffer, header);
  if (header.encoding === 'binary') return parseBinaryFile(file, header, options);

  const parser = header.type === 'none'
    ? new XYZChunkParser({ totalSize: file.size })
    : new AsciiBodyParser(header.type, file.size);
  await streamText(file, parser, options);
  return parser.finish();
}

/** Gir nettleseren tid til å tegne (fremdrift i spinneren, render-løkken). */
function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Lager en funksjon som melder fremdrift og gir fra seg kontrollen maks hvert
 * YIELD_INTERVAL_MS. Kalles etter hver bit; venter bare når intervallet er gått.
 */
function progressReporter(total, onProgress) {
  let last = performance.now();
  return async (loaded) => {
    const now = performance.now();
    if (now - last < YIELD_INTERVAL_MS) return;
    if (onProgress) onProgress(total > 0 ? Math.min(loaded / total, 1) : 0);
    await yieldToBrowser();
    last = performance.now();
  };
}

/**
 * Leser en tekstfil med file.stream() og sender den dekodet (UTF-8) til
 * parser.push(text, bytesRead) i biter på minst `chunkChars` tegn.
 * TextDecoder med { stream: true } håndterer UTF-8-tegn som deles mellom to byte-biter.
 * Stopper lesingen tidlig når parseren melder at den er ferdig (parser.done).
 */
async function streamText(file, parser, { onProgress, chunkChars = TEXT_BATCH_CHARS } = {}) {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder('utf-8');
  const report = progressReporter(file.size, onProgress);
  let batch = '';
  let loaded = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      loaded += value.byteLength;
      batch += decoder.decode(value, { stream: true });
      if (batch.length < chunkChars) continue;

      parser.push(batch, loaded);
      batch = '';
      if (parser.done) {
        await reader.cancel();
        return;
      }
      await report(loaded);
    }
    batch += decoder.decode();
    if (batch) parser.push(batch, loaded);
  } finally {
    reader.releaseLock();
  }
}

// --- ASCII-data ---

/**
 * Leser `rowCount` ikke-tomme linjer fra `start` til `end` (default text.length).
 * For hver linje hentes kolonnene `columns` = [xi, yi, zi] uten split()
 * (tokenisering på mellomrom/tab). Med builder = null hoppes linjene bare over.
 * @returns {{pos: number, rows: number}} Posisjon etter siste leste linje og antall rader lest
 */
export function readAsciiRows(text, start, rowCount, columns, builder, end = text.length) {
  const [xi, yi, zi] = columns || [0, 1, 2];
  const maxCol = Math.max(xi, yi, zi);
  let pos = start;
  let rows = 0;

  while (rows < rowCount && pos < end) {
    let lineEnd = text.indexOf('\n', pos);
    if (lineEnd === -1 || lineEnd > end) lineEnd = end;

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
  return { pos: Math.min(pos, end), rows };
}

/**
 * Parser for ASCII PLY/PCD som tar imot hele filen (inkl. header) i biter (push).
 *
 * Headeren tolkes på nytt i den dekodede teksten når den er komplett, så dataStart
 * blir en tegn-offset (UTF-8-tegn i kommentarer gjør byte- og tegn-offset ulike).
 * For PLY leses bare de N vertex-radene; elementer før vertex hoppes over, og alt
 * etter vertex (f.eks. face-linjer) ignoreres. Da settes `done`, og resten av filen
 * trenger ikke leses. Bare komplette linjer parses; resten tas vare på til neste bit.
 */
export class AsciiBodyParser {
  /**
   * @param {'ply'|'pcd'} type - Type fra header-proben (en ufullstendig header kan se ut som 'none')
   * @param {number} [totalSize] - Størrelse på dataene, begrenser forhåndsallokeringen
   */
  constructor(type, totalSize = Infinity) {
    this.type = type;
    this.totalSize = totalSize;
    this.pending = '';
    this.header = null;
    this.builder = null;
    this.element = 0;   // Gjeldende PLY-element (vertex-elementet = header.vertexIndex)
    this.remaining = 0; // Rader igjen i gjeldende element
    this.done = false;
  }

  push(chunk) {
    if (this.done) return;
    const text = this.pending ? this.pending + chunk : chunk;
    const end = text.lastIndexOf('\n') + 1;
    this.pending = this._consume(text, end);
  }

  finish() {
    if (!this.done) {
      const text = this.pending;
      this.pending = '';
      if (!this.header) {
        // Headeren ble ikke komplett før slutten: tolk den på hele teksten
        // (kaster riktig feilmelding hvis den mangler end_header/DATA)
        const header = parseHeader(text);
        this._start(header);
        this._consume(text, text.length, header.dataStart);
      } else {
        this._consume(text, text.length);
      }
    }
    return this.builder.finish({ type: this.header.type, encoding: 'ascii' });
  }

  /** Parser text[0..end) og returnerer teksten som ikke er brukt (fra end). */
  _consume(text, end, pos = 0) {
    if (!this.header) {
      if (end === 0) return text;
      // Tolk bare komplette linjer. Mangler slutten på headeren, kaster parseHeader
      // (eller gir 'none' for PCD) – da venter vi på mer tekst.
      let header;
      try {
        header = parseHeader(text.slice(0, end));
      } catch {
        return text;
      }
      if (header.type !== this.type) return text;
      this._start(header);
      pos = header.dataStart;
    }

    const h = this.header;
    while (!this.done && pos < end) {
      const isVertex = h.type === 'pcd' || this.element === h.vertexIndex;
      const r = readAsciiRows(text, pos, this.remaining,
        isVertex ? h.columns : null, isVertex ? this.builder : null, end);
      pos = r.pos;
      this.remaining -= r.rows;
      if (this.remaining === 0) this._nextElement();
    }
    return this.done || end >= text.length ? '' : text.slice(end);
  }

  _start(header) {
    if (header.type === 'none' || header.encoding !== 'ascii') {
      throw new Error('Invalid ASCII PLY/PCD header');
    }
    this.header = header;
    // Minste mulige linje er "0 0 0\n" (6 tegn): begrenser allokeringen ved feil POINTS/vertex-antall
    this.builder = new PointBuilder(Math.min(header.count, Math.ceil(this.totalSize / 6) + 1));
    this.element = header.type === 'ply' ? 0 : -1;
    this.remaining = header.type === 'ply' ? header.elements[0].count : header.count;
    if (this.remaining === 0) this._nextElement();
  }

  /** Går til neste PLY-element; ferdig etter vertex-elementet (eller for PCD). */
  _nextElement() {
    const h = this.header;
    if (h.type === 'pcd' || this.element >= h.vertexIndex) {
      this.done = true;
      return;
    }
    this.element++;
    this.remaining = h.elements[this.element].count;
    if (this.remaining === 0) this._nextElement();
  }
}

/**
 * Leser punktene i en ASCII PLY/PCD gitt som én streng. `text` er hele filen.
 * Bruker samme bit-parser som strømmingen, med hele teksten som én bit.
 * @param {string} text
 * @param {Object} header - Fra parseHeader (avgjør bare typen; headeren tolkes på nytt i `text`)
 */
export function parseAsciiBody(text, header) {
  const parser = new AsciiBodyParser(header.type, text.length);
  parser.push(text);
  return parser.finish();
}

// --- Binære data ---

/**
 * Leser `n` binære vertex-poster fra `pos` i en DataView og legger dem i builder.
 * Felles for hele-buffer-lesing (parseBinaryBody) og vindusvis lesing (parseBinaryFile).
 */
function readBinaryRows(dv, pos, n, header, builder) {
  const { stride } = header;

  // LAS: int32 X/Y/Z først i posten, heltall × skala + offset regnes i double
  if (header.type === 'las') {
    const [sx, sy, sz] = header.scale;
    const [ox, oy, oz] = header.offset;
    for (let i = 0, o = pos; i < n; i++, o += stride) {
      builder.add(dv.getInt32(o, true) * sx + ox, dv.getInt32(o + 4, true) * sy + oy, dv.getInt32(o + 8, true) * sz + oz);
    }
    return;
  }

  const [px, py, pz] = header.props;

  // Spesialisert løkke for de vanligste tilfellene (alle float eller alle double)
  if (px.kind === py.kind && py.kind === pz.kind && (px.kind === 'f32' || px.kind === 'f64')) {
    const f64 = px.kind === 'f64';
    for (let i = 0, o = pos; i < n; i++, o += stride) {
      if (f64) {
        builder.add(dv.getFloat64(o + px.offset, true), dv.getFloat64(o + py.offset, true), dv.getFloat64(o + pz.offset, true));
      } else {
        builder.add(dv.getFloat32(o + px.offset, true), dv.getFloat32(o + py.offset, true), dv.getFloat32(o + pz.offset, true));
      }
    }
  } else {
    for (let i = 0, o = pos; i < n; i++, o += stride) {
      builder.add(readValue(dv, o + px.offset, px.kind), readValue(dv, o + py.offset, py.kind), readValue(dv, o + pz.offset, pz.kind));
    }
  }
}

function truncatedError(count, needed, size) {
  return new Error(`File is truncated: expected ${count.toLocaleString('nb-NO')} points (${needed.toLocaleString('nb-NO')} bytes), file has ${size.toLocaleString('nb-NO')} bytes`);
}

/**
 * Leser punktene i binær little-endian PLY, binær PCD eller LAS fra én ArrayBuffer.
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
  if (needed > buffer.byteLength) throw truncatedError(count, needed, buffer.byteLength);

  const builder = new PointBuilder(count);
  readBinaryRows(dv, pos, count, header, builder);
  return builder.finish({ type: header.type, encoding: 'binary' });
}

/**
 * Leser punktene i binær PLY/PCD eller LAS fra en fil i vinduer (file.slice), så hele filen
 * aldri ligger i én ArrayBuffer. Minne: ett vindu + posisjonene.
 * @param {Blob} file
 * @param {Object} header - Fra parseHeader (dataStart er byte-offset)
 */
export async function parseBinaryFile(file, header, { onProgress, windowBytes = BINARY_WINDOW_BYTES } = {}) {
  let pos = header.dataStart;

  if (header.type === 'ply') {
    for (let e = 0; e < header.vertexIndex; e++) {
      pos = await skipBinaryElementInFile(file, pos, header.elements[e], windowBytes);
    }
  }

  const { count, stride } = header;
  const needed = pos + count * stride;
  if (needed > file.size) throw truncatedError(count, needed, file.size);

  const builder = new PointBuilder(count);
  const rowsPerWindow = Math.max(1, Math.floor(windowBytes / stride));
  const report = progressReporter(file.size, onProgress);

  for (let done = 0; done < count;) {
    const n = Math.min(rowsPerWindow, count - done);
    const buf = await file.slice(pos, pos + n * stride).arrayBuffer();
    readBinaryRows(new DataView(buf), 0, n, header, builder);
    done += n;
    pos += n * stride;
    await report(pos);
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

/**
 * Som skipBinaryElement, men leser fra fil i vinduer. Uten list-properties regnes
 * posisjonen ut direkte; med list-properties (f.eks. faces før vertex) må hver
 * liste-lengde leses, og nytt vindu hentes når en lengde ligger utenfor gjeldende vindu.
 */
async function skipBinaryElementInFile(file, pos, element, windowBytes) {
  if (!element.props.some((p) => p.list)) return skipBinaryElement(null, pos, element);

  let dv = null;
  let winStart = 0, winEnd = 0;
  for (let i = 0; i < element.count; i++) {
    for (const p of element.props) {
      if (!p.list) {
        pos += p.size;
        continue;
      }
      if (pos < winStart || pos + p.countSize > winEnd) {
        if (pos + p.countSize > file.size) throw new Error('File is truncated: PLY element before vertex data is incomplete');
        dv = new DataView(await file.slice(pos, pos + windowBytes).arrayBuffer());
        winStart = pos;
        winEnd = pos + dv.byteLength;
      }
      const n = readValue(dv, pos - winStart, p.countKind);
      pos += p.countSize + n * p.size;
    }
  }
  return pos;
}
