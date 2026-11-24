// Tester for parseren. Kjør med: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFormat, parseXYZFile, centerPositions } from '../src/parser.js';

// Absolutte koordinater for punkt i (positions er relative til origin)
function point(r, i) {
  return [
    r.positions[i * 3] + r.origin.x,
    r.positions[i * 3 + 1] + r.origin.y,
    r.positions[i * 3 + 2] + r.origin.z
  ];
}

function assertPoints(content, expected, tol = 1e-3) {
  const r = parseXYZFile(content);
  assert.equal(r.count, expected.length, 'antall punkter');
  expected.forEach((p, i) => {
    point(r, i).forEach((v, k) => assert.ok(Math.abs(v - p[k]) < tol, `punkt ${i}[${k}]: ${v} != ${p[k]}`));
  });
  return r;
}

const P = [[500000.123, 6000000.456, 12.5], [500001.5, 6000002.25, -3.75]];

test('mellomrom, desimalpunktum', () => {
  assertPoints('500000.123 6000000.456 12.5\n500001.5 6000002.25 -3.75\n', P);
  assert.deepEqual(detectFormat('1.5 2.5 3.5'), { delimiter: 'whitespace', decimalComma: false });
});

test('tab, desimalpunktum, ekstra kolonner ignoreres', () => {
  assertPoints('500000.123\t6000000.456\t12.5\t255\t0\t0\n500001.5\t6000002.25\t-3.75\t1\t2\t3\n', P);
});

test('komma som skilletegn', () => {
  assertPoints('500000.123,6000000.456,12.5\n500001.5,6000002.25,-3.75\n', P);
  assert.deepEqual(detectFormat('1.5,2.5,3.5'), { delimiter: ',', decimalComma: false });
});

test('komma + mellomrom som skilletegn', () => {
  assertPoints('500000.123, 6000000.456, 12.5\n500001.5, 6000002.25, -3.75\n', P);
});

test('komma som skilletegn med heltall', () => {
  const r = assertPoints('1,2,3\n4,5,6\n', [[1, 2, 3], [4, 5, 6]]);
  assert.deepEqual(r.format, { delimiter: ',', decimalComma: false });
});

test('semikolon, desimalpunktum', () => {
  assertPoints('500000.123;6000000.456;12.5\n500001.5;6000002.25;-3.75\n', P);
});

test('semikolon, desimalkomma (norsk Excel)', () => {
  const r = assertPoints('500000,123;6000000,456;12,5\n500001,5;6000002,25;-3,75\n', P);
  assert.deepEqual(r.format, { delimiter: ';', decimalComma: true });
});

test('mellomrom, desimalkomma', () => {
  const r = assertPoints('500000,123 6000000,456 12,5\n500001,5 6000002,25 -3,75\n', P);
  assert.deepEqual(r.format, { delimiter: 'whitespace', decimalComma: true });
});

test('tab, desimalkomma', () => {
  assertPoints('500000,123\t6000000,456\t12,5\n500001,5\t6000002,25\t-3,75\n', P);
});

test('desimalkomma på få linjer, resten heltall', () => {
  const lines = [];
  for (let i = 0; i < 10; i++) lines.push(`${500000 + i} 6000000 12`);
  lines.push('500010 6000000 12,5');
  const r = parseXYZFile(lines.join('\n'));
  assert.equal(r.count, 11);
  assert.ok(Math.abs(point(r, 10)[2] - 12.5) < 1e-6);
});

test('header og kommentarer hoppes over, CRLF', () => {
  assertPoints('X;Y;Z\r\n# kommentar\r\n500000,123;6000000,456;12,5\r\n500001,5;6000002,25;-3,75\r\n', P);
  assertPoints('"x","y","z"\n500000.123,6000000.456,12.5\n500001.5,6000002.25,-3.75\n', P);
});

test('ingen gyldige punkter', () => {
  assert.equal(parseXYZFile('bare tekst\nher\n').count, 0);
});

test('centerPositions: in-place for Float32Array, presisjon for UTM', () => {
  const r = parseXYZFile('500000.123 6000000.456 12.5\n500010.789 6000020.111 2\n');
  const { centeredPositions: c, offset } = centerPositions(r.positions, r.bounds, r.origin);
  assert.equal(c, r.positions);
  assert.ok(Math.abs(c[1] + offset.y - 6000000.456) < 1e-4);
  assert.ok(Math.abs(c[4] + offset.y - 6000020.111) < 1e-4);

  const arr = [500000.123, 6000000.456, 1, 500010.789, 6000020.111, 2];
  const b = { minX: 500000.123, maxX: 500010.789, minY: 6000000.456, maxY: 6000020.111, minZ: 1, maxZ: 2 };
  const d = centerPositions(arr, b);
  assert.ok(d.centeredPositions instanceof Float32Array);
  assert.ok(Math.abs(d.centeredPositions[4] + d.offset.y - 6000020.111) < 1e-4);
});

// --- PLY / PCD (issue #8) ---
import { parseHeader, parseAsciiBody, parseBinaryBody, parsePointFile, readPointFile, bytesToString } from '../src/pointFormats.js';

// Parser en fil i minnet slik nettleseren gjør (header fra de første bytene, så tekst/ArrayBuffer)
async function parseBytes(bytes) {
  const data = await readPointFile(new Blob([bytes]));
  return parsePointFile(data);
}

function absPoints(r) {
  return Array.from({ length: r.count }, (_, i) => point(r, i));
}

function assertClose(actual, expected, tol = 1e-3) {
  assert.equal(actual.length, expected.length, 'antall punkter');
  expected.forEach((p, i) => p.forEach((v, k) =>
    assert.ok(Math.abs(actual[i][k] - v) < tol, `punkt ${i}[${k}]: ${actual[i][k]} != ${v}`)));
}

/** Bygger binær fil: ASCII-header + poster skrevet med DataView. */
function binaryFile(header, rows, fields, littleEndian = true) {
  const sizes = { f32: 4, f64: 8, u8: 1, i32: 4, u32: 4, i16: 2 };
  const stride = fields.reduce((s, f) => s + sizes[f], 0);
  const head = new TextEncoder().encode(header);
  const buf = new ArrayBuffer(head.length + rows.length * stride);
  new Uint8Array(buf).set(head);
  const dv = new DataView(buf);
  let o = head.length;
  for (const row of rows) {
    fields.forEach((f, k) => {
      const v = row[k];
      if (f === 'f32') dv.setFloat32(o, v, littleEndian);
      else if (f === 'f64') dv.setFloat64(o, v, littleEndian);
      else if (f === 'u8') dv.setUint8(o, v);
      else if (f === 'i32') dv.setInt32(o, v, littleEndian);
      else if (f === 'u32') dv.setUint32(o, v, littleEndian);
      else if (f === 'i16') dv.setInt16(o, v, littleEndian);
      o += sizes[f];
    });
  }
  return new Uint8Array(buf);
}

const PLY_ASCII_FACES = `ply
format ascii 1.0
comment laget for test – med ÆØÅ i kommentaren
element vertex 4
property float x
property float y
property float z
element face 2
property list uchar int vertex_indices
end_header
500000.123 6000000.456 12.5
500001.5 6000002.25 -3.75
500002 6000001 1
500003 6000003 2
3 0 1 2
3 1 2 3
`;

test('ASCII PLY: face-linjer leses ikke som punkter', async () => {
  const r = await parseBytes(new TextEncoder().encode(PLY_ASCII_FACES));
  assert.equal(r.count, 4);
  assert.deepEqual(r.format, { type: 'ply', encoding: 'ascii' });
  assertClose(absPoints(r), [P[0], P[1], [500002, 6000001, 1], [500003, 6000003, 2]]);
  assert.equal(r.bounds.minZ, -3.75);
  assert.equal(r.bounds.maxZ, 12.5);
});

test('ASCII PLY: x/y/z står ikke først, ekstra properties, CRLF', () => {
  const text = [
    'ply', 'format ascii 1.0', 'element vertex 2',
    'property uchar red', 'property float nx', 'property double z', 'property uchar green',
    'property double x', 'property double y', 'end_header',
    '255 0.5 12.5 7 500000.123 6000000.456', '1 0.1 -3.75 8 500001.5 6000002.25', ''
  ].join('\r\n');
  const h = parseHeader(text);
  assert.deepEqual(h.columns, [4, 5, 2]);
  assertClose(absPoints(parseAsciiBody(text, h)), P);
});

test('ASCII PLY: element før vertex hoppes over', async () => {
  const text = 'ply\nformat ascii 1.0\nelement camera 1\nproperty float a\nproperty float b\n' +
    'element vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\n9 9\n1 2 3\n';
  assertClose(absPoints(await parsePointFile({ header: parseHeader(text), text })), [[1, 2, 3]]);
});

test('ASCII PCD med FIELDS, COUNT og nan', async () => {
  const text = `# .PCD v0.7 - Point Cloud Data file format
VERSION 0.7
FIELDS rgb x y z normal
SIZE 4 4 4 4 4
TYPE F F F F F
COUNT 1 1 1 1 3
WIDTH 3
HEIGHT 1
VIEWPOINT 0 0 0 1 0 0 0
POINTS 3
DATA ascii
4.2e6 500000.123 6000000.456 12.5 0 0 1
4.2e6 nan nan nan 0 0 1
4.2e6 500001.5 6000002.25 -3.75 0 0 1
`;
  const r = await parseBytes(new TextEncoder().encode(text));
  assert.deepEqual(r.format, { type: 'pcd', encoding: 'ascii' });
  assertClose(absPoints(r), P); // NaN-punktet hoppes over
});

const PLY_BIN_HEADER = (type) => `ply
format binary_little_endian 1.0
element vertex 2
property ${type} x
property ${type} y
property ${type} z
property uchar red
element face 1
property list uchar int vertex_indices
end_header
`;

test('binær PLY, float', async () => {
  const bytes = binaryFile(PLY_BIN_HEADER('float'), [[1.5, 2.5, 3.5, 255], [-4, 5.25, -6.125, 0]], ['f32', 'f32', 'f32', 'u8']);
  const r = await parseBytes(bytes);
  assert.deepEqual(r.format, { type: 'ply', encoding: 'binary' });
  assertClose(absPoints(r), [[1.5, 2.5, 3.5], [-4, 5.25, -6.125]], 1e-6);
});

test('binær PLY, double: UTM-presisjon bedre enn 0,1 mm', async () => {
  const rows = [[500000.1234, 6000000.4567, 12.3456, 1], [500123.9876, 6001234.5432, -45.6789, 2], [499999.0001, 5999999.0009, 0.0001, 3]];
  const r = await parseBytes(binaryFile(PLY_BIN_HEADER('double').replace('vertex 2', 'vertex 3'), rows, ['f64', 'f64', 'f64', 'u8']));
  assertClose(absPoints(r), rows.map((p) => p.slice(0, 3)), 1e-4);
  assert.equal(r.bounds.maxY, 6001234.5432); // bounds er i double
  assert.equal(r.origin.y, 6000000.4567);
  // Etter sentrering skal også originale koordinater gjenskapes innenfor 0,1 mm
  const { centeredPositions: c, offset } = centerPositions(r.positions, r.bounds, r.origin);
  rows.forEach((p, i) => {
    assert.ok(Math.abs(c[i * 3] + offset.x - p[0]) < 1e-4);
    assert.ok(Math.abs(c[i * 3 + 1] + offset.y - p[1]) < 1e-4);
  });
});

test('binær PLY: face-element før vertex og x/y/z ikke først', () => {
  const header = 'ply\nformat binary_little_endian 1.0\nelement face 2\nproperty list uchar int vertex_indices\n' +
    'element vertex 1\nproperty int id\nproperty float z\nproperty double x\nproperty double y\nend_header\n';
  const head = new TextEncoder().encode(header);
  // 2 faces: (3 × int) og (4 × int), deretter vertex: int, float, double, double
  const faceBytes = (1 + 12) + (1 + 16);
  const buf = new ArrayBuffer(head.length + faceBytes + 4 + 4 + 8 + 8);
  new Uint8Array(buf).set(head);
  const dv = new DataView(buf);
  let o = head.length;
  dv.setUint8(o, 3); o += 13;
  dv.setUint8(o, 4); o += 17;
  dv.setInt32(o, 7, true); dv.setFloat32(o + 4, 12.5, true);
  dv.setFloat64(o + 8, 500000.123, true); dv.setFloat64(o + 16, 6000000.456, true);
  const h = parseHeader(bytesToString(new Uint8Array(buf)));
  assertClose(absPoints(parseBinaryBody(buf, h)), [P[0]]);
});

test('binær PCD (float og double)', async () => {
  const header = (t, s) => `# .PCD v0.7\nVERSION 0.7\nFIELDS intensity x y z\nSIZE 2 ${s} ${s} ${s}\nTYPE I ${t} ${t} ${t}\nCOUNT 1 1 1 1\nWIDTH 2\nHEIGHT 1\nPOINTS 2\nDATA binary\n`;
  const rows = [[10, 500000.1234, 6000000.4567, 12.5], [20, 500001.5, 6000002.25, NaN]];
  let r = await parseBytes(binaryFile(header('F', 8), rows, ['i16', 'f64', 'f64', 'f64']));
  assert.deepEqual(r.format, { type: 'pcd', encoding: 'binary' });
  assertClose(absPoints(r), [rows[0].slice(1)], 1e-4); // NaN-punktet hoppes over

  r = await parseBytes(binaryFile(header('F', 4), [[1, 1.5, 2.5, 3.5], [2, 4, 5, 6]], ['i16', 'f32', 'f32', 'f32']));
  assertClose(absPoints(r), [[1.5, 2.5, 3.5], [4, 5, 6]], 1e-6);
});

test('ikke-støttede formater gir tydelig feilmelding', async () => {
  const be = binaryFile(PLY_BIN_HEADER('float').replace('little', 'big'), [[1, 2, 3, 0]], ['f32', 'f32', 'f32', 'u8'], false);
  await assert.rejects(parseBytes(be), /big-endian PLY is not supported/);
  const pcd = new TextEncoder().encode('VERSION 0.7\nFIELDS x y z\nSIZE 4 4 4\nTYPE F F F\nCOUNT 1 1 1\nPOINTS 1\nDATA binary_compressed\n\0\0\0');
  await assert.rejects(parseBytes(pcd), /Compressed PCD .* not supported/);
  assert.throws(() => parseHeader('ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\n'), /end_header/);
  assert.throws(() => parseHeader('ply\nformat ascii 1.0\nelement vertex 1\nproperty float a\nend_header\n'), /no x\/y\/z/);
  const trunc = binaryFile(PLY_BIN_HEADER('float').replace('vertex 2', 'vertex 5'), [[1, 2, 3, 0]], ['f32', 'f32', 'f32', 'u8']);
  await assert.rejects(parseBytes(trunc), /truncated/);
});

test('filer uten header går uendret til parseXYZFile', async () => {
  const text = '# kommentar\n500000,123;6000000,456;12,5\n500001,5;6000002,25;-3,75\n';
  assert.deepEqual(parseHeader(text), { type: 'none' });
  const r = await parseBytes(new TextEncoder().encode(text));
  assert.deepEqual(r.format, { delimiter: ';', decimalComma: true });
  assertClose(absPoints(r), P);
});

// --- Lesing i biter (issue #5) ---
import { XYZChunkParser } from '../src/parser.js';
import { AsciiBodyParser, parseBinaryFile } from '../src/pointFormats.js';

/** Resultatet som sammenlignbart objekt (positions/colors som vanlige arrays). */
function snapshot(r) {
  return {
    count: r.count,
    positions: Array.from(r.positions),
    colors: Array.from(r.colors),
    bounds: r.bounds,
    origin: r.origin,
    format: r.format
  };
}

/** Parser `text` delt i bitene `pieces` med en ny parser fra `make()`. */
function parsePieces(make, pieces) {
  const p = make();
  for (const piece of pieces) p.push(piece);
  return p.finish();
}

/** Deler text i biter ved posisjonene i `cuts` (sortert). */
function cutAt(text, cuts) {
  const pieces = [];
  let prev = 0;
  for (const c of cuts) { pieces.push(text.slice(prev, c)); prev = c; }
  pieces.push(text.slice(prev));
  return pieces;
}

/**
 * Sjekker at parsing i biter gir identisk resultat som hele strengen:
 * alle delinger i 2 biter (hver mulig posisjon), alle delinger i 3 biter for korte
 * tekster (ellers et utvalg), faste bitstørrelser 1–64 tegn og tilfeldige delinger.
 */
function assertChunkInvariant(make, text, expected) {
  const want = snapshot(expected);
  const check = (pieces, label) => assert.deepEqual(snapshot(parsePieces(make, pieces)), want, label);

  for (let i = 0; i <= text.length; i++) check(cutAt(text, [i]), `delt ved ${i}`);

  const step = text.length <= 250 ? 1 : Math.ceil(text.length / 60);
  for (let i = 0; i <= text.length; i += step) {
    for (let j = i; j <= text.length; j += step) check(cutAt(text, [i, j]), `delt ved ${i} og ${j}`);
  }

  for (let size = 1; size <= 64; size++) {
    const cuts = [];
    for (let c = size; c < text.length; c += size) cuts.push(c);
    check(cutAt(text, cuts), `biter på ${size} tegn`);
  }

  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let k = 0; k < 200; k++) {
    const cuts = Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => Math.floor(rnd() * (text.length + 1)));
    check(cutAt(text, cuts.sort((a, b) => a - b)), `tilfeldig deling ${cuts}`);
  }
}

/** Fil uten header med > 50 datalinjer, så formatet bestemmes midt i strømmen. */
function xyzText({ sep = ' ', comma = false, eol = '\n', lines = 60 } = {}) {
  const out = ['X Y Z', '# kommentar'];
  for (let i = 0; i < lines; i++) {
    const v = [500000.123 + i * 1.5, 6000000.456 + i * 0.25, -3.75 + (i % 7) * 2.125].map((n) => n.toFixed(3));
    out.push((comma ? v.map((s) => s.replace('.', ',')) : v).join(sep) + (i % 5 === 0 ? `${sep}255` : ''));
    if (i === 30) out.push('', '   ', 'tekst midt i');
  }
  return out.join(eol) + (lines % 2 ? '' : eol); // med og uten linjeskift til slutt
}

test('XYZ i biter: identisk med hele strengen (mellomrom, punktum, LF)', () => {
  const text = xyzText();
  const whole = parseXYZFile(text);
  assert.equal(whole.count, 60);
  assertChunkInvariant(() => new XYZChunkParser(), text, whole);
});

test('XYZ i biter: CRLF delt mellom \\r og \\n, desimalkomma med semikolon', () => {
  const text = xyzText({ sep: ';', comma: true, eol: '\r\n', lines: 61 });
  const whole = parseXYZFile(text);
  assert.equal(whole.count, 61);
  assert.deepEqual(whole.format, { delimiter: ';', decimalComma: true });
  // Eksplisitt: delt mellom \r og \n
  const cr = text.indexOf('\r\n', 100) + 1;
  assert.deepEqual(snapshot(parsePieces(() => new XYZChunkParser(), [text.slice(0, cr), text.slice(cr)])), snapshot(whole));
  assertChunkInvariant(() => new XYZChunkParser(), text, whole);
});

test('XYZ i biter: desimalkomma med mellomrom og tab, komma som skilletegn', () => {
  for (const opts of [{ sep: ' ', comma: true }, { sep: '\t', comma: true }, { sep: ',' }, { sep: ', ' }]) {
    const text = xyzText(opts);
    const whole = parseXYZFile(text);
    assert.equal(whole.count, 60, JSON.stringify(opts));
    assertChunkInvariant(() => new XYZChunkParser(), text, whole);
  }
});

test('XYZ i biter: under 50 datalinjer og tom fil', () => {
  for (const text of ['500000,123;6000000,456;12,5\r\n500001,5;6000002,25;-3,75', '', '\n', 'bare tekst\n']) {
    assertChunkInvariant(() => new XYZChunkParser(), text, parseXYZFile(text));
  }
});

test('XYZ i biter: for lavt og for høyt estimat av antall punkter gir samme resultat', () => {
  const text = xyzText({ lines: 3000 });
  const want = snapshot(parseXYZFile(text));
  for (const totalSize of [10, text.length, text.length * 50]) {
    const p = new XYZChunkParser({ totalSize });
    let consumed = 0;
    for (let i = 0; i < text.length; i += 997) {
      const piece = text.slice(i, i + 997);
      consumed += piece.length;
      p.push(piece, consumed);
    }
    assert.deepEqual(snapshot(p.finish()), want, `totalSize ${totalSize}`);
  }
});

test('ASCII PLY i biter: faces, delt i header og data', () => {
  const whole = parseAsciiBody(PLY_ASCII_FACES, parseHeader(PLY_ASCII_FACES));
  assert.equal(whole.count, 4);
  assertChunkInvariant(() => new AsciiBodyParser('ply'), PLY_ASCII_FACES, whole);

  // Element før vertex, CRLF, ingen linjeskift til slutt
  const text = ['ply', 'format ascii 1.0', 'element camera 2', 'property float a', 'property float b',
    'element vertex 3', 'property float x', 'property float y', 'property float z',
    'element face 1', 'property list uchar int vertex_indices', 'end_header',
    '9 9', '', '8 8', '500000.123 6000000.456 12.5', '500001.5 6000002.25 -3.75', '500002 6000001 1', '3 0 1 2'].join('\r\n');
  const w2 = parseAsciiBody(text, parseHeader(text));
  assertClose(absPoints(w2), [P[0], P[1], [500002, 6000001, 1]]);
  assertChunkInvariant(() => new AsciiBodyParser('ply'), text, w2);
});

test('ASCII PCD i biter', () => {
  const text = `# .PCD v0.7\nVERSION 0.7\nFIELDS x y z\nSIZE 4 4 4\nTYPE F F F\nCOUNT 1 1 1\nWIDTH 3\nHEIGHT 1\nPOINTS 3\nDATA ascii\n` +
    '500000.123 6000000.456 12.5\nnan nan nan\n500001.5 6000002.25 -3.75';
  const whole = parseAsciiBody(text, parseHeader(text));
  assertClose(absPoints(whole), P);
  assertChunkInvariant(() => new AsciiBodyParser('pcd'), text, whole);
});

test('ASCII PLY i biter: ufullstendig header gir feilmelding', () => {
  const p = new AsciiBodyParser('ply');
  p.push('ply\nformat ascii 1.0\nelement vertex 1\n');
  p.push('property float x\n');
  assert.throws(() => p.finish(), /end_header/);
});

/**
 * Fil-lignende objekt der stream() gir små byte-biter (så UTF-8-tegn og linjeskift
 * deles mellom bitene), og slice() fungerer som for Blob.
 */
function chunkedFile(bytes, chunkBytes) {
  const blob = new Blob([bytes]);
  return {
    size: bytes.length,
    slice: (a, b) => blob.slice(a, b),
    stream() {
      let pos = 0;
      return new ReadableStream({
        pull(controller) {
          if (pos >= bytes.length) { controller.close(); return; }
          controller.enqueue(bytes.slice(pos, pos + chunkBytes));
          pos += chunkBytes;
        }
      });
    }
  };
}

async function parseFileChunked(bytes, chunkBytes, options) {
  const file = chunkedFile(bytes, chunkBytes);
  return parsePointFile(await readPointFile(file), options);
}

test('strømming fra fil: små byte-biter (UTF-8 delt) gir samme resultat som hele teksten', async () => {
  const enc = new TextEncoder();
  const cases = [
    [enc.encode(PLY_ASCII_FACES), parseAsciiBody(PLY_ASCII_FACES, parseHeader(PLY_ASCII_FACES))],
    [enc.encode('# æøå\n' + xyzText({ sep: ';', comma: true, eol: '\r\n' })), parseXYZFile('# æøå\n' + xyzText({ sep: ';', comma: true, eol: '\r\n' }))],
    [enc.encode(xyzText({ lines: 2000 })), parseXYZFile(xyzText({ lines: 2000 }))]
  ];
  for (const [bytes, whole] of cases) {
    for (const [chunkBytes, chunkChars] of [[1, 1], [3, 5], [7, 100], [4096, 1 << 20]]) {
      const r = await parseFileChunked(bytes, chunkBytes, { chunkChars });
      assert.deepEqual(snapshot(r), snapshot(whole), `byte-biter ${chunkBytes}, tegn-biter ${chunkChars}`);
    }
  }
});

test('strømming fra fil: lesingen stopper etter vertex-dataene i ASCII PLY', async () => {
  // Mange face-linjer etter vertex: skal ikke leses
  let reads = 0;
  const text = PLY_ASCII_FACES + '3 0 1 2\n'.repeat(10000);
  const file = chunkedFile(new TextEncoder().encode(text), 64);
  const stream = file.stream.bind(file);
  file.stream = () => stream().pipeThrough(new TransformStream({ transform(c, ctl) { reads++; ctl.enqueue(c); } }));
  const r = await parsePointFile(await readPointFile(file), { chunkChars: 256 });
  assert.equal(r.count, 4);
  assert.ok(reads < 20, `leste ${reads} biter`);
});

test('binær fil i vinduer: identisk med hele bufferen, også med faces før vertex', async () => {
  const rows = [];
  for (let i = 0; i < 50; i++) rows.push([500000.1234 + i, 6000000.4567 + i * 2, -12.5 + i * 0.25, i]);
  const bytes = binaryFile(PLY_BIN_HEADER('double').replace('vertex 2', 'vertex 50').replace('element face 1', 'element face 0'),
    rows, ['f64', 'f64', 'f64', 'u8']);
  const header = parseHeader(bytesToString(bytes));
  const whole = parseBinaryBody(bytes.buffer, header);
  for (const windowBytes of [1, 25, 50, 1000, 1 << 20]) {
    const r = await parseBinaryFile(new Blob([bytes]), header, { windowBytes });
    assert.deepEqual(snapshot(r), snapshot(whole), `vindu ${windowBytes}`);
  }

  // Faces (list-properties) før vertex, med vinduer som deler listene
  const hdr = 'ply\nformat binary_little_endian 1.0\nelement face 3\nproperty list uchar int vertex_indices\nproperty uchar flag\n' +
    'element vertex 2\nproperty float z\nproperty double x\nproperty double y\nend_header\n';
  const head = new TextEncoder().encode(hdr);
  const faces = [3, 4, 0];
  const faceBytes = faces.reduce((s, n) => s + 1 + n * 4 + 1, 0);
  const buf = new ArrayBuffer(head.length + faceBytes + 2 * 20);
  new Uint8Array(buf).set(head);
  const dv = new DataView(buf);
  let o = head.length;
  for (const n of faces) { dv.setUint8(o, n); o += 1 + n * 4 + 1; }
  for (const p of P) { dv.setFloat32(o, p[2], true); dv.setFloat64(o + 4, p[0], true); dv.setFloat64(o + 12, p[1], true); o += 20; }
  const h2 = parseHeader(bytesToString(new Uint8Array(buf)));
  const w2 = parseBinaryBody(buf, h2);
  assertClose(absPoints(w2), P);
  for (const windowBytes of [1, 2, 5, 13, 1 << 20]) {
    const r = await parseBinaryFile(new Blob([buf]), h2, { windowBytes });
    assert.deepEqual(snapshot(r), snapshot(w2), `vindu ${windowBytes}`);
  }

  // Avkortet fil gir feil også ved vindusvis lesing
  await assert.rejects(parseBinaryFile(new Blob([buf.slice(0, buf.byteLength - 1)]), h2, { windowBytes: 7 }), /truncated/);
});

// --- LAS (issue #15) ---

const LAS_RECORD_LENGTH = [20, 28, 26, 34, 57, 63, 30, 36, 38, 59, 67];

/**
 * Bygger en LAS-fil med DataView. Punktene gis som absolutte koordinater og lagres
 * som int32 = round((v - offset) / skala). Resten av posten (og VLR-området) er nuller.
 */
function lasFile(points, {
  minor = 2, pointFormat = 0, recordLength = LAS_RECORD_LENGTH[pointFormat],
  scale = [0.001, 0.001, 0.001], offset = [500000, 6000000, 0],
  vlrBytes = 0, legacyCount = points.length, count64 = points.length, formatByte = pointFormat
} = {}) {
  const headerSize = minor >= 4 ? 375 : minor === 3 ? 235 : 227;
  const dataStart = headerSize + vlrBytes;
  const buf = new ArrayBuffer(dataStart + points.length * recordLength);
  const dv = new DataView(buf);
  new Uint8Array(buf).set(new TextEncoder().encode('LASF'), 0);
  dv.setUint8(24, 1);
  dv.setUint8(25, minor);
  dv.setUint16(94, headerSize, true);
  dv.setUint32(96, dataStart, true);
  dv.setUint32(100, vlrBytes > 0 ? 1 : 0, true);
  dv.setUint8(104, formatByte);
  dv.setUint16(105, recordLength, true);
  dv.setUint32(107, legacyCount, true);
  for (let k = 0; k < 3; k++) {
    dv.setFloat64(131 + k * 8, scale[k], true);
    dv.setFloat64(155 + k * 8, offset[k], true);
  }
  if (minor >= 4) dv.setBigUint64(247, BigInt(count64), true);
  points.forEach((p, i) => {
    const o = dataStart + i * recordLength;
    for (let k = 0; k < 3; k++) dv.setInt32(o + k * 4, Math.round((p[k] - offset[k]) / scale[k]), true);
  });
  return new Uint8Array(buf);
}

const LAS_POINTS = [[500000.123, 6000000.456, 12.5], [500123.987, 6001234.543, -45.679], [499999.001, 5999999.009, 0.001]];

test('LAS 1.2, punktformat 0: gjenkjennes fra innholdet, UTM-presisjon bedre enn 0,1 mm', async () => {
  const bytes = lasFile(LAS_POINTS);
  const h = parseHeader(bytesToString(bytes));
  assert.equal(h.type, 'las');
  assert.equal(h.version, '1.2');
  assert.equal(h.count, 3);
  const r = await parseBytes(bytes);
  assert.deepEqual(r.format, { type: 'las', encoding: 'binary' });
  assertClose(absPoints(r), LAS_POINTS, 1e-4);
  assert.equal(r.bounds.maxY, 6001234.543); // bounds i double
  const { centeredPositions: c, offset } = centerPositions(r.positions, r.bounds, r.origin);
  LAS_POINTS.forEach((p, i) => {
    for (let k = 0; k < 3; k++) {
      assert.ok(Math.abs(c[i * 3 + k] + [offset.x, offset.y, offset.z][k] - p[k]) < 1e-4, `punkt ${i}[${k}]`);
    }
  });
});

test('LAS 1.2, punktformat 1 med VLR før punktene', async () => {
  const r = await parseBytes(lasFile(LAS_POINTS, { pointFormat: 1, vlrBytes: 54 + 100 }));
  assertClose(absPoints(r), LAS_POINTS, 1e-4);
});

test('LAS 1.4, punktformat 6: antall fra 64-bits feltet (legacy-feltet er 0)', async () => {
  const r = await parseBytes(lasFile(LAS_POINTS, { minor: 4, pointFormat: 6, legacyCount: 0 }));
  assertClose(absPoints(r), LAS_POINTS, 1e-4);
});

test('LAS 1.4: legacy-antall brukes når 64-bits feltet er 0', async () => {
  const r = await parseBytes(lasFile(LAS_POINTS, { minor: 4, pointFormat: 1, count64: 0 }));
  assert.equal(r.count, 3);
});

test('LAS: poster med ekstra bytes, annen skala og offset', async () => {
  const r = await parseBytes(lasFile(LAS_POINTS, { pointFormat: 0, recordLength: 20 + 7, scale: [0.01, 0.01, 0.0001], offset: [0, 0, -100] }));
  assertClose(absPoints(r), LAS_POINTS, 0.005 + 1e-9);
});

test('LAS i vinduer: identisk med hele bufferen', async () => {
  const pts = Array.from({ length: 50 }, (_, i) => [500000.1 + i, 6000000.2 + i * 2, -12.5 + i * 0.25]);
  const bytes = lasFile(pts, { minor: 4, pointFormat: 7, recordLength: 40, vlrBytes: 30 });
  const header = parseHeader(bytesToString(bytes));
  const whole = parseBinaryBody(bytes.buffer, header);
  assertClose(absPoints(whole), pts, 1e-4);
  for (const windowBytes of [1, 39, 40, 41, 1000, 1 << 20]) {
    const r = await parseBinaryFile(new Blob([bytes]), header, { windowBytes });
    assert.deepEqual(snapshot(r), snapshot(whole), `vindu ${windowBytes}`);
  }
});

test('LAS: ikke-støttede og ugyldige filer gir tydelig feilmelding', async () => {
  // Avkortet fil (både hele bufferen og vindusvis lesing)
  const bytes = lasFile(LAS_POINTS);
  const trunc = bytes.slice(0, bytes.length - 1);
  await assert.rejects(parseBytes(trunc), /truncated/);
  assert.throws(() => parseBinaryBody(trunc.buffer, parseHeader(bytesToString(trunc))), /truncated/);
  // Avkortet header
  assert.throws(() => parseHeader(bytesToString(bytes.slice(0, 200))), /LAS header is truncated/);
  // LAZ med waveform-punktformat (bit 7 = komprimert) støttes ikke av laz-perf
  assert.throws(() => parseHeader(bytesToString(lasFile(LAS_POINTS, { formatByte: 0x80 | 4, pointFormat: 4 }))), /LAZ with point format 4/);
  // Ukjent punktformat, for kort post, ukjent versjon
  await assert.rejects(parseBytes(lasFile(LAS_POINTS, { formatByte: 11, recordLength: 70 })), /point data format: 11/);
  await assert.rejects(parseBytes(lasFile(LAS_POINTS, { pointFormat: 6, recordLength: 28 })), /too short/);
  const v2 = lasFile(LAS_POINTS);
  v2[24] = 2;
  await assert.rejects(parseBytes(v2), /Unsupported LAS version 2\.2/);
  // Skala 0
  await assert.rejects(parseBytes(lasFile([], { scale: [0, 0.001, 0.001] })), /scale factors/);
});

// --- LAZ (issue #15, del 2) ---
// Testfilene i test/data er laget med laspy + lazrs (uavhengig LAZ-koder), se
// test/data/make_las_fixtures.py. Samme punkter finnes som LAS og LAZ.
import { readFileSync } from 'node:fs';
import { createLazPerf } from 'laz-perf';
import { parseLazFile } from '../src/pointFormats.js';

const fixture = (name) => new Uint8Array(readFileSync(new URL(`./data/${name}`, import.meta.url)));
const LAZ_OPTIONS = { createLazPerf: () => createLazPerf() };

async function parseFixture(name, options = LAZ_OPTIONS) {
  return parsePointFile(await readPointFile(new Blob([fixture(name)])), options);
}

/** Punktene i testfilene: samme formel som make_las_fixtures.py (lagret med 1 mm skala). */
function gridPoints(n, step = 0.5, cols = 100) {
  return Array.from({ length: n }, (_, i) => {
    const x = 500000 + (i % cols) * step + 0.123;
    const y = 6650000 + Math.floor(i / cols) * step + 0.456;
    return [x, y, 50 + 10 * Math.sin(x / 7) * Math.cos(y / 11)];
  });
}

test('LAS fra laspy: punktformat 1 (1.2) og 7 med ekstra bytes (1.4)', async () => {
  for (const [name, fmt, version] of [['pf1_v12.las', 1, '1.2'], ['pf7_v14_extra.las', 7, '1.4']]) {
    const h = parseHeader(bytesToString(fixture(name)));
    assert.equal(h.type, 'las');
    assert.equal(h.pointFormat, fmt);
    assert.equal(h.version, version);
    const r = await parseFixture(name);
    assert.deepEqual(r.format, { type: 'las', encoding: 'binary' });
    assertClose(absPoints(r), gridPoints(1000), 0.0005 + 1e-6); // Z avrundet til 1 mm
  }
});

test('LAZ: identisk resultat som samme fil som LAS', async () => {
  for (const base of ['pf1_v12', 'pf7_v14_extra']) {
    const h = parseHeader(bytesToString(fixture(`${base}.laz`)));
    assert.equal(h.type, 'laz');
    const las = await parseFixture(`${base}.las`);
    const laz = await parseFixture(`${base}.laz`);
    assert.deepEqual(laz.format, { type: 'laz', encoding: 'binary' });
    assert.deepEqual({ ...snapshot(laz), format: null }, { ...snapshot(las), format: null }, base);
  }
});

test('LAZ med flere chunks, i små vinduer, med fremdrift', async () => {
  const bytes = fixture('pf0_v12_chunks.laz');
  const header = parseHeader(bytesToString(bytes));
  const fractions = [];
  const whole = await parseLazFile(new Blob([bytes]), header, LAZ_OPTIONS);
  assert.equal(whole.count, 60000);
  assertClose(absPoints(whole), gridPoints(60000), 0.0005 + 1e-6);
  const r = await parseLazFile(new Blob([bytes]), header, { ...LAZ_OPTIONS, windowBytes: 4099, onProgress: (f) => fractions.push(f) });
  assert.deepEqual(snapshot(r), snapshot(whole));
  assert.ok(fractions.every((f, i) => f >= 0 && f <= 1 && (i === 0 || f >= fractions[i - 1])), 'fremdrift 0–1, stigende');
});

test('LAZ: avkortet fil gir feilmelding', async () => {
  const bytes = fixture('pf0_v12_chunks.laz');
  for (const cut of [bytes.length - 1, Math.floor(bytes.length / 2)]) {
    await assert.rejects(parseBytesWith(bytes.slice(0, cut), LAZ_OPTIONS), /Could not open the LAZ file|LAZ decompression failed/, `kuttet ved ${cut}`);
  }
});

async function parseBytesWith(bytes, options) {
  return parsePointFile(await readPointFile(new Blob([bytes])), options);
}
