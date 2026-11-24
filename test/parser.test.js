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

test('ASCII PLY: element før vertex hoppes over', () => {
  const text = 'ply\nformat ascii 1.0\nelement camera 1\nproperty float a\nproperty float b\n' +
    'element vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\n9 9\n1 2 3\n';
  assertClose(absPoints(parsePointFile({ header: parseHeader(text), text })), [[1, 2, 3]]);
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
