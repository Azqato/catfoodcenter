/* ==========================================================================
   The curated catalogue.

   Product data transcribed by hand where Open Pet Food Facts has none. The
   design is docs/PRD.md section 16.5a; the rule the whole thing is built
   around is one sentence:

     A curated figure is never presented as an Open Pet Food Facts figure, and
     neither is silently preferred over the other.

   This project's only real claim is that a number can be traced back to where
   it came from. A local file that quietly overwrote upstream data would break
   that claim in the least visible way available, which is the same shape of
   failure as the English-only additive matcher in section 12.4: confidently
   wrong, with nothing about it looking wrong. So every merge records what it
   changed, and the page says so next to the data.

   Pure, and deliberately so: mergeCurated takes a product and an entry and
   returns a new product. Nothing here fetches, and nothing here scores.
   ========================================================================== */

import { expandGroups } from './ingredients.js';

const CATALOGUE_URL = new URL('../data/catalogue.json', import.meta.url).href;

/* Fields an entry may carry. Anything else is a typo or a misunderstanding,
   and tools/check-catalogue.py rejects the file rather than letting a
   misspelled key be silently ignored, which is how a curated figure would go
   missing without anybody noticing. */
/* `ingredientsLang` is deliberately absent: it is not data in its own right,
   it says what language the list beside it is in, and it travels with that
   list below. Listing it here made it a curated "field" of its own, so an
   entry that changed nothing still announced a curated origin on the page. */
export const DATA_FIELDS = [
  'ingredientsText',
  'crudeProteinPct', 'crudeFatPct', 'crudeFibrePct', 'ashPct', 'moisturePct',
  'kcalPer100g', 'taurinePresent',
  /* Published by many panels, scored by nothing, and dropped on the floor
     until 2026-10-07 because there was no key to put them under. Section 24.1
     carried that as a defect and this is its fix. **They are recorded and
     shown, and they are deliberately not scored**: adding a field is cheap and
     deciding what a score should do with an omega-3 minimum is not, so that
     decision stays with the scoring work rather than arriving by the back door
     of a transcription. `vitaminEIuPerKg` is IU per kilogram of food, which is
     the unit the panel prints; the other three are percentages by weight. */
  'omega3Pct', 'epaPct', 'dhaPct', 'vitaminEIuPerKg',
  'name', 'brand', 'quantity', 'format', 'lifeStage', 'aafcoComplete',
];

/* Where an entry's data was read.

   'manufacturer' is the maker's own published panel. 'retailer-listing' is a
   shop or aggregator repeating it.

   The distinction is not pedantry, it was forced by the first product tried.
   For UPC 050000102068, one retailer listing gave an ingredient list
   containing soy protein concentrate, added colour and Red 3; another gave one
   containing soy flour and glycine and no colours at all. Both claimed to
   describe the same tin. One of them is out of date and there is no way to
   tell which from the outside, so that product got no entry.

   Hence the rule in mergeCurated: a retailer listing may fill a gap, because a
   list of unknown vintage is still better than no list when the page says
   where it came from. It may never overwrite a figure the database already
   has, because then two sources disagree and the weaker one would win in
   silence. Only a manufacturer entry outranks upstream data. */
export const SOURCE_KINDS = ['manufacturer', 'retailer-listing'];

/* A key for a product whose panel is published and whose barcode is not.

   Transcription kept stalling on the same thing: the manufacturer prints the
   full guaranteed analysis and no UPC, aggregators either have no row for the
   product or have one that fails its own check, and the catalogue is keyed by
   barcode, so a perfectly readable panel could not be recorded at all. Fifteen
   Dr. Elsey's products sat in exactly that state.

   So an entry may be filed under a provisional key until a real barcode is
   found. The product becomes searchable and scorable; it does not become
   scannable, and that is the entire safety property.

   **The shape is not cosmetic.** A provisional key can never be all digits.
   Every string of 6 to 14 digits is somebody's real barcode, so a numeric
   placeholder could one day be scanned into by a visitor holding an unrelated
   product, who would be shown this product's panel and this product's score
   with nothing anywhere indicating a mistake. A scanner emits digits and only
   digits, so a key with letters and hyphens in it cannot be produced by one.
   The scan path is closed by construction rather than by a check somebody has
   to remember to write. */
export const PROVISIONAL_KEY = /^CFC-[a-z0-9]+(?:-[a-z0-9]+)+$/;

/** @param {string} key @returns {boolean} */
export function isProvisional(key) {
  return PROVISIONAL_KEY.test(String(key || ''));
}

let pending = null;

/**
 * The catalogue, fetched once.
 *
 * A missing or malformed file is not an error the visitor should ever see: it
 * means the site behaves exactly as it did before the catalogue existed, which
 * is a working site. So this resolves to an empty catalogue rather than
 * throwing, and the gate is what stops a bad file being deployed.
 *
 * What is cached is the promise, not the value it settles to. Caching the value
 * only helps callers that arrive after the fetch has finished; the callers that
 * matter here all arrive in the same tick. A filtered search fans out into five
 * concurrent page requests, every one of them awaits this, and with a value
 * cache every one of them found `null`, so catalogue.json was fetched five
 * times on the critical path. Handing each of them the same in-flight promise
 * makes it one fetch, which is what "fetched once" was always meant to say.
 *
 * @returns {Promise<object>} barcode-keyed entries, possibly empty
 */
export function loadCatalogue(url = CATALOGUE_URL) {
  if (pending) return pending;
  pending = (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      return (data && typeof data === 'object' && data.products) || {};
    } catch {
      return {};
    }
  })();
  return pending;
}

/** Test seam. */
export function _resetCatalogue() {
  pending = null;
}

function isPresent(value) {
  return value !== undefined && value !== null && value !== '';
}

/**
 * Merge one curated entry over a normalised product.
 *
 * Returns a new product carrying `curated`, which names every field this
 * changed and where it came from. A merge that changes nothing sets no
 * `curated` at all, so the page cannot end up announcing a provenance for data
 * that is entirely upstream.
 *
 * @param {object} product a Product per section 16.5, or null if the API had none
 * @param {object} entry a catalogue entry
 * @returns {object} a new Product
 */
export function mergeCurated(product, entry) {
  if (!entry) return product;
  const base = product || {};
  const fromApi = base.nutrition || {};
  const merged = { ...base, nutrition: { ...fromApi } };
  const changed = [];

  // A retailer listing fills gaps only; a manufacturer panel outranks the
  // database. See SOURCE_KINDS for the product that forced this.
  const mayOverwrite = entry.sourceKind === 'manufacturer';

  for (const field of DATA_FIELDS) {
    if (!isPresent(entry[field])) continue;
    const target = field in fromApi || NUTRITION_FIELDS.includes(field) ? merged.nutrition : merged;
    if (isPresent(target[field]) && !mayOverwrite) continue;
    if (isPresent(target[field]) && target[field] === entry[field]) continue;
    target[field] = entry[field];
    changed.push(field);
  }

  if (changed.includes('ingredientsText')) {
    merged.ingredients = splitList(entry.ingredientsText);
    // An entry that supplies a list without saying what language it is in is
    // treated as unreadable rather than as English. Assuming English is how
    // section 12.4 happened.
    merged.ingredientsLang = entry.ingredientsLang || 'unknown';
  }

  if (!changed.length) return product;

  // A transcribed guaranteed analysis is a guaranteed analysis: it was read off
  // the panel, which is the distinction `confidence` exists to draw. It only
  // earns that because `curated` below makes the provenance visible on the
  // page; without the disclosure this line would be laundering.
  if (changed.some((f) => NUTRITION_FIELDS.includes(f))) {
    merged.nutrition.confidence = merged.nutrition.confidence === 'high' ? 'high'
      : entry.sourceKind === 'manufacturer' ? 'high' : 'low';
  }

  const knownFigures = Object.values(merged.nutrition)
    .filter((v) => typeof v === 'number').length;
  merged.dataCompleteness =
    (merged.ingredients || []).length > 0 && knownFigures >= 3 ? 'full'
      : (merged.ingredients || []).length > 0 || knownFigures > 0 ? 'partial'
        : 'minimal';

  merged.barcode = merged.barcode || entry.barcode;
  merged.name = merged.name || 'Unnamed product';
  merged.curated = {
    fields: changed,
    source: entry.source,
    sourceKind: entry.sourceKind,
    checked: entry.checked,
    // Whether there was an upstream record at all. The disclosure on the
    // product page used to end "everything else on this page is from the Open
    // Pet Food Facts record", which is true of an entry that fills gaps in a
    // record and false of a product the database has never heard of. The first
    // Dr. Elsey's transcription was the first of the second kind, and it said
    // its data came from a record that does not exist.
    only: !product,
  };
  return merged;
}

/* ──────────────────────────────────────────────────────────────────────────
   Reaching a curated product (PRD 16.5b, M25).

   Until M25 the three functions below did not exist, and the catalogue was
   consulted in exactly one place: fetchProduct. Two things followed, and the
   second is worse than the first.

   A product the database has never heard of resolved on its own page and could
   not be found by searching or by browsing brands, so it was reachable only by
   scanning its barcode. And a product the database *does* hold showed one thing
   in search and another on its page: a search for "Cat Chow Complete" returned
   a card reading "No ingredient list on record. Not scored", above a count line
   saying "0 of these can be scored", while the product page for the same
   barcode scored it 49 and listed every ingredient. The catalogue had the list;
   the card never asked.

   So the merge rules in section 16.5a are unchanged here. What changes is how
   many places consult them.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Merge the catalogue over a list of products already fetched from the API.
 *
 * The fix for a card and a page disagreeing. Every product keeps its position;
 * this only fills in what the catalogue knows.
 *
 * @param {object[]} products normalised products
 * @param {object} catalogue barcode-keyed entries
 * @returns {object[]} a new array
 */
export function applyCurated(products, catalogue) {
  if (!catalogue) return products || [];
  return (products || []).map((product) => {
    const entry = catalogue[product && product.barcode];
    if (!entry) return product;
    const merged = mergeCurated(product, entry);
    return merged && merged.curated ? merged : product;
  });
}

function haystack(entry) {
  return [entry.name, entry.brand, entry.quantity].filter(Boolean).join(' ').toLowerCase();
}

/**
 * Curated products matching a search, for the ones the API cannot return.
 *
 * Only entries carrying a `name` can be found this way, and that is the design
 * rather than a limitation. An entry that fills a gap in a record the database
 * already holds has no name of its own, does not need one, and is already
 * findable through the API; adding it here would put the same product on the
 * page twice.
 *
 * Matching is a plain substring over the name, brand and pack size. It is not
 * a ranking, because with a handful of entries a ranking would be theatre, and
 * it deliberately does not read the ingredient list: somebody searching
 * "chicken" means the food, not every food containing chicken.
 *
 * @param {object} catalogue barcode-keyed entries
 * @param {{query?: string, brandTags?: string, exclude?: Set<string>}} options
 * @returns {object[]} products, shaped exactly like an API result
 */
export function searchCatalogue(catalogue, { query = '', brandTags = '', exclude } = {}) {
  const q = String(query || '').trim().toLowerCase();
  const brands = String(brandTags || '')
    .split('|').map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (!q && !brands.length) return [];

  const out = [];
  for (const [code, entry] of Object.entries(catalogue || {})) {
    if (!entry || !entry.name) continue;
    if (exclude && exclude.has(code)) continue;
    const hay = haystack(entry);
    if (q && !hay.includes(q)) continue;
    if (brands.length && !brands.some((b) => String(entry.brand || '').toLowerCase() === b)) continue;
    const product = mergeCurated(null, entry);
    if (product) out.push(product);
  }
  return out;
}

/**
 * Catalogue brands, shaped like entries in the API's own brand facet.
 *
 * `curated: true` travels with them so `fetchBrands` can exempt them from the
 * minimum-product threshold. That threshold exists to hide the database's long
 * tail of one-product transcription noise, and a brand this project entered by
 * hand is the opposite of noise: it is there because somebody decided it was
 * worth covering.
 *
 * @param {object} catalogue barcode-keyed entries
 * @returns {{name: string, products: number, curated: boolean}[]}
 */
export function catalogueBrands(catalogue) {
  const counts = new Map();
  for (const entry of Object.values(catalogue || {})) {
    const brand = entry && String(entry.brand || '').trim();
    if (!brand || !entry.name) continue;
    counts.set(brand, (counts.get(brand) || 0) + 1);
  }
  return [...counts].map(([name, products]) => ({ name, products, curated: true }));
}

const NUTRITION_FIELDS = [
  'crudeProteinPct', 'crudeFatPct', 'crudeFibrePct', 'ashPct',
  'moisturePct', 'kcalPer100g', 'taurinePresent',
  'omega3Pct', 'epaPct', 'dhaPct', 'vitaminEIuPerKg',
];

/* The same splitting rule opff.js applies to an upstream list. Duplicated
   rather than imported because opff.js imports this file, and a cycle between
   the two would be a worse problem than eight lines. */
function splitList(text) {
  const out = [];
  let depth = 0;
  let current = '';
  for (const ch of String(text || '')) {
    if ('(['.includes(ch)) depth += 1;
    if (')]'.includes(ch)) depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === ';') && depth === 0) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return expandGroups(out
    .map((s) => s.replace(/\s+/g, ' ').trim().replace(/[.;]+$/, '').trim())
    .filter(Boolean));
}

export const _internal = { splitList };
