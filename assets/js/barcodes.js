/**
 * The barcode index (M28).
 *
 * `catalogue.json` is keyed by barcode, which sounds like it already is an
 * index and is the reason this file took until M28 to exist. It is not one,
 * because section 12.10 takes two inputs that fail independently: the panel
 * and the barcode. Twenty entries in the catalogue prove it, each a fully
 * transcribed panel filed under a provisional key because no barcode for it
 * could be found, and a provisional key is not a number on a package. So a
 * product this site can score cannot be scanned, and the two facts live in the
 * same field and cannot be fixed separately.
 *
 * **This file is the second input given a life of its own.** A barcode maps to
 * a product rather than being the product's identity, so a barcode can be
 * added, corrected or withdrawn without touching the entry it points at, and
 * an entry can exist before anybody knows its barcode.
 *
 * Two kinds of row, and the second is the one worth explaining:
 *
 * 1. **`entry`**, naming a key in `catalogue.json`. A scan of this barcode
 *    resolves to that entry, so the twenty unscannable products become
 *    scannable one number at a time.
 * 2. **`name` with no `entry`**, meaning this site knows the product and has
 *    not read its label. A scan resolves to "we know this one and have not
 *    transcribed it yet", which is a different answer from "nothing found" and
 *    a more honest one. It also turns the scanner into a demand signal, which
 *    is reason 3 in the M28 entry of PRD section 13.
 *
 * **Nothing here is resolved automatically and that is the design.** Section
 * 12.10's rule is that the tool proposes and a person decides, every time, and
 * open question 15 is why: a valid barcode attached to the wrong product
 * passes every gate in this project, because the check digit validates and the
 * entry is well formed and both halves are individually correct. The index
 * ships empty. `tools/resolve-barcodes.py --review` prints candidates for a
 * person to read, and that reading is step 6 of the working order.
 */

const INDEX_URL = new URL('../data/barcodes.json', import.meta.url).href;

let pending = null;

/**
 * Fetch the index once per page.
 *
 * The promise is cached rather than the value it settles to, for the reason
 * `loadCatalogue` gives at length: callers that matter arrive in the same tick,
 * so a value cache turns one fetch into several.
 *
 * A missing or malformed file resolves to an empty index rather than throwing.
 * The site then behaves exactly as it did before this file existed, which is a
 * working site, and the gate is what stops a bad file being deployed.
 *
 * @returns {Promise<object>} barcode-keyed rows, possibly empty
 */
export function loadBarcodeIndex(url = INDEX_URL) {
  if (pending) return pending;
  pending = (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      return (data && typeof data === 'object' && data.barcodes) || {};
    } catch {
      return {};
    }
  })();
  return pending;
}

/**
 * What this site knows about a scanned barcode, before asking anybody else.
 *
 * @param {object} index as returned by `loadBarcodeIndex`
 * @param {string} code the scanned digits
 * @returns {?{entry?: string, name?: string, brand?: string, row: object}}
 *   null when the index has never heard of it, which is the common case
 */
export function resolveBarcode(index, code) {
  const row = (index || {})[String(code || '').trim()];
  if (!row || typeof row !== 'object') return null;
  // A row naming an entry resolves to a product. A row naming only a product
  // resolves to an admission. Both are answers; neither is a miss.
  return {
    entry: typeof row.entry === 'string' ? row.entry : undefined,
    name: typeof row.name === 'string' ? row.name : undefined,
    brand: typeof row.brand === 'string' ? row.brand : undefined,
    row,
  };
}

/** Test seam. */
export function _resetBarcodeIndex() {
  pending = null;
}
