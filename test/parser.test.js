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
