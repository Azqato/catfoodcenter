/* Tests for the barcode index (M28).
 *
 * The test that matters most is the one asserting a malformed index resolves to
 * an empty one rather than throwing. The index sits in front of the network on
 * every scan, so a bad deploy of this file would not degrade the scanner, it
 * would break it, and "the site behaves exactly as it did before this file
 * existed" is only a true claim if it is a tested one.
 *
 * The distinction between a row with an `entry` and a row with only a `name` is
 * the second: they are different page states, and a row that collapsed into
 * "known" when it should have resolved to a product would show somebody an
 * apology instead of the score this site already holds for the thing in their
 * hand. */
import { loadBarcodeIndex, resolveBarcode, _resetBarcodeIndex } from './barcodes.js';
import { suite } from './test-runner.js';

const json = (value) => 'data:application/json,' + encodeURIComponent(JSON.stringify(value));

const INDEX = {
  '0070230110725': { entry: 'CFC-brand-product', source: 'https://example.com/a', sourceKind: 'aggregator', checked: '2026-10-07' },
  '1234567890128': { name: 'Some Food', brand: 'Some Brand', source: 'https://example.com/b', sourceKind: 'retailer-listing', checked: '2026-10-07' },
};

suite('barcode index: resolving a row', (t) => {
  const hit = resolveBarcode(INDEX, '0070230110725');
  t.equal(hit.entry, 'CFC-brand-product', 'a row naming an entry resolves to that entry');
  t.equal(hit.name, undefined, 'and does not also claim to be an untranscribed product');
  t.equal(hit.row.source, 'https://example.com/a',
    'the whole row travels, because the page has to disclose where the barcode came from');

  const known = resolveBarcode(INDEX, '1234567890128');
  t.equal(known.entry, undefined, 'a row with no entry resolves to no entry');
  t.equal(known.name, 'Some Food', 'and carries the product it names');
  t.equal(known.brand, 'Some Brand', 'with its brand');
});

suite('barcode index: a miss is the common case', (t) => {
  t.equal(resolveBarcode(INDEX, '0000000000000'), null, 'a barcode not in the index is null');
  t.equal(resolveBarcode(INDEX, ''), null, 'and so is no barcode at all');
  t.equal(resolveBarcode(INDEX, null), null, 'and so is null');
  t.equal(resolveBarcode(null, '0070230110725'), null, 'an absent index is not an error');
  t.equal(resolveBarcode({}, '0070230110725'), null, 'nor is an empty one');

  t.equal(resolveBarcode(INDEX, ' 0070230110725 ').entry, 'CFC-brand-product',
    'surrounding whitespace is trimmed, because a pasted barcode often carries it');
});

suite('barcode index: a row has to resolve to something', (t) => {
  // The gate in check-catalogue.py rejects these, so they should never ship.
  // This is the second line: if one did ship, it must read as a miss rather
  // than as a product, because the scanner reports anything non-null as known.
  t.equal(resolveBarcode({ '1': 'not an object' }, '1'), null, 'a row that is not an object is a miss');
  const empty = resolveBarcode({ 1: {} }, '1');
  t.equal(empty.entry, undefined, 'a row with neither field names no entry');
  t.equal(empty.name, undefined, 'and names no product, so the caller treats it as a miss');

  const wrongTypes = resolveBarcode({ 1: { entry: 42, name: ['a'] } }, '1');
  t.equal(wrongTypes.entry, undefined, 'a non-string entry is discarded rather than used as a key');
  t.equal(wrongTypes.name, undefined, 'and so is a non-string name');
});

suite('barcode index: loading', async (t) => {
  _resetBarcodeIndex();
  const loaded = await loadBarcodeIndex(json({ barcodes: INDEX }));
  t.equal(Object.keys(loaded).length, 2, 'the barcodes object is what loads');

  _resetBarcodeIndex();
  t.equal(Object.keys(await loadBarcodeIndex(json({ nothing: true }))).length, 0,
    'a file with no barcodes object loads as an empty index rather than throwing');

  _resetBarcodeIndex();
  t.equal(Object.keys(await loadBarcodeIndex('data:application/json,{{{')).length, 0,
    'and so does a file that is not JSON: the index sits in front of every scan, so a '
    + 'bad deploy of it must degrade the scanner rather than break it');

  /* The `!response.ok` branch is deliberately not tested here, and that is a
     real gap rather than an oversight. Provoking it needs a fetch that 404s,
     `run-tests.py` fails the gate on any console error, and a browser logs a
     404 whatever the code does with it. So the choice was between a test for
     that one branch and a gate that notices every unexpected console error on
     every page, and the gate is worth more: it has caught real defects and this
     branch is three lines sharing a `catch` with the two branches above. */

  _resetBarcodeIndex();
});

suite('barcode index: the file this site actually ships', async (t) => {
  _resetBarcodeIndex();
  const live = await loadBarcodeIndex(new URL('../data/barcodes.json', import.meta.url).href);
  t.equal(typeof live, 'object', 'parses, and parses to an object');
  for (const [code, row] of Object.entries(live)) {
    t.ok(/^\d{6,14}$/.test(code), `${code} is digits, because a provisional key is not a barcode`);
    t.ok(Boolean(row.entry || row.name), `${code} resolves to an entry or to a named product`);
    t.ok(Boolean(row.source), `${code} says where the barcode came from`);
  }
  _resetBarcodeIndex();
});
