/* ==========================================================================
   Open Pet Food Facts client and normaliser.

   Turns a raw API record into the `Product` shape in docs/PRD.md section 16.5, or says
   clearly why it cannot. Everything here runs in the browser: the API is
   public, keyless, and CORS-enabled, so there is no server in the path.
   See docs/PRD.md section 16.2.

   The design of this module is driven by docs/PRD.md section 12, which measured
   what the database actually holds. Three findings shape the code:

     1. Two nutriment schemas coexist and mostly do not overlap. The pet-food
        guaranteed analysis (crude-protein, crude-fat, crude-fibre, crude-ash,
        moisture) is reliable, because it is transcribed from the packaging
        panel. Open Food Facts' human-food keys (proteins, fat, fiber) are not.
        We prefer the former and record which one we used.

     2. A quarter of the products carrying a protein figure carry an
        implausible one: per-serving or per-kilogram values mislabelled as
        per-100g. So every figure passes a plausibility gate before it is
        allowed near a score. Discarding a number is better than scoring on it.

     3. Most products are missing most fields. Partial data is the normal case,
        not an error, and `normalize` never throws for it; it returns a
        Product with absent fields and an honest `dataCompleteness`.

   One browser constraint worth knowing: `User-Agent` is a forbidden header, so
   the descriptive UA the API documentation asks for cannot be sent from
   client-side fetch. It is sent by tools/probe-opff.py, which is not a browser.
   ========================================================================== */

import {
  loadCatalogue, mergeCurated, applyCurated, searchCatalogue, catalogueBrands, isProvisional,
} from './catalogue.js';
import { expandGroups } from './ingredients.js';
import { loadBarcodeIndex, resolveBarcode } from './barcodes.js';

const API = 'https://world.openpetfoodfacts.org/api/v2';

/* The legacy CGI search endpoint, and the only one on this database that
   actually searches text.

   `/api/v2/search` accepts `search_terms` and ignores it. Verified 2026-09-07:
   `search_terms=chicken`, `search_terms=salmon`, `search_terms=zzzzqqq` and no
   search terms at all return the same count (1578, the whole cat-food
   category) and the same first page of products, in the same order. It is not
   that the ranking is poor. There is no matching happening at all.

   This site had been asking v2 for text searches since M6, which means every
   text search ever run here returned the same twenty-four products with a
   label claiming they matched the query. `/cgi/search.pl` returns 32 for
   salmon and 22 for tuna, all of them actually salmon and tuna, sends
   `Access-Control-Allow-Origin: *`, and honours `fields`, `page` and
   `page_size` exactly as v2 does.

   Tag filtering on v2 was never affected: `brands_tags` is a tag lookup rather
   than a text match, and it works. So a brand-only browse still goes to v2,
   where the `|` OR syntax that merges a brand's several spellings is verified
   (see brandTagExpression), and only a text query goes to CGI. */
const SEARCH_CGI = 'https://world.openpetfoodfacts.org/cgi/search.pl';

/* Only ask for what we use. A full record is 103 keys, most of them editorial
   metadata, and the search endpoint is markedly slower without this. */
const FIELDS = [
  'code', 'product_name', 'product_name_en', 'brands', 'quantity',
  'image_front_url', 'image_front_small_url',
  'ingredients_text', 'ingredients_text_en',
  'nutriments', 'categories_tags', 'labels_tags', 'last_modified_t', 'lang',
].join(',');

/* A cat food as fed. A value outside its band is a data-entry error rather
   than an unusual product (see docs/PRD.md section 12 for the evidence).

   The protein ceiling was 50 until 2026-09-09, when the first transcription
   from outside the supermarket shelf hit it: Dr. Elsey's cleanprotein kibble
   states 59% crude protein on the manufacturer's own panel, and the gate
   rejected the published figure as impossible. The band was drawn from a
   database of ordinary food and quietly encoded "ordinary" as "real". 65
   admits the high-protein shelf and still catches what the band exists to
   catch: a per-kilogram figure lands in the hundreds, a dry-matter figure for
   wet food in the eighties. */
const PLAUSIBLE = {
  protein: [3, 65],
  fat: [0.5, 40],
  fibre: [0, 15],
  ash: [0, 15],
  moisture: [0, 92],
  kcalPer100g: [15, 600],
};

/* ── Reading nutriments ── */

/**
 * First usable value among the given keys, preferring the _100g variant.
 * Returns the key it came from so provenance can be reported.
 * @returns {{value: number, key: string} | null}
 */
function readNutriment(nutriments, keys) {
  for (const key of keys) {
    const raw = nutriments[key + '_100g'] !== undefined
      ? nutriments[key + '_100g']
      : nutriments[key];
    if (raw === undefined || raw === null || raw === '') continue;
    const value = typeof raw === 'number' ? raw : parseFloat(raw);
    if (Number.isFinite(value)) return { value, key };
  }
  return null;
}

function inBand(value, band) {
  const [lo, hi] = PLAUSIBLE[band];
  return value >= lo && value <= hi;
}

/**
 * Read one guaranteed-analysis figure, preferring the pet-food key over the
 * human-food one, and reject anything outside the plausible band.
 * @returns {{value: number, source: 'guaranteed-analysis'|'human-schema'} | null}
 */
function readAnalysis(nutriments, crudeKeys, humanKeys, band) {
  const crude = readNutriment(nutriments, crudeKeys);
  if (crude && inBand(crude.value, band)) {
    return { value: crude.value, source: 'guaranteed-analysis' };
  }
  const human = readNutriment(nutriments, humanKeys);
  if (human && inBand(human.value, band)) {
    return { value: human.value, source: 'human-schema' };
  }
  return null;
}

/**
 * Energy in kcal per 100 g.
 *
 * Values above the plausible ceiling are almost always per kilogram, Hill's
 * publishes 1774, which is 177.4 kcal/100 g. We correct by a factor of ten
 * when that lands in range, and otherwise discard rather than guess.
 */
function readEnergy(nutriments) {
  const found = readNutriment(nutriments, ['energy-kcal']);
  if (!found) return null;
  const v = found.value;
  if (inBand(v, 'kcalPer100g')) return { value: v, corrected: false };
  if (inBand(v / 10, 'kcalPer100g')) return { value: v / 10, corrected: true };
  return null;
}

/* ── Ingredients ── */

/**
 * Split a label ingredient string into an ordered list.
 *
 * Commas inside parentheses belong to the parent ingredient, "meat and animal
 * derivatives (including chicken, 4%)" is one entry, not three, so we track
 * nesting depth rather than calling split(',').
 */
function splitIngredients(text) {
  if (!text) return [];
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === ';') && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);

  // Premix groups are expanded here rather than in the loop above, because the
  // loop's job is bracket-aware splitting and expansion is a separate rule with
  // its own reasons. See ingredients.js and PRD 16.11.
  return expandGroups(parts
    .map((s) => s.replace(/\s+/g, ' ').trim().replace(/^[.·•\-–—]+/, '').replace(/\.+$/, '').trim())
    .filter((s) => s.length > 1));
}

/* ── Category interpretation ── */

function readFormat(tags, moisturePct) {
  if (tags.includes('en:wet-cat-food') || tags.includes('en:wet-pet-food')) return 'wet';
  if (tags.includes('en:dry-cat-food') || tags.includes('en:dry-pet-food')) return 'dry';
  if (tags.includes('en:cat-treats') || tags.includes('en:pet-treats')) return 'treat';
  // Only a third of products carry a wet/dry tag, but moisture settles it
  // decisively when present: no dry food is 60% water.
  if (typeof moisturePct === 'number') {
    if (moisturePct >= 60) return 'wet';
    if (moisturePct <= 20) return 'dry';
    return 'semi-moist';
  }
  return 'unknown';
}

function readLifeStage(tags, labels, text) {
  const all = (tags.join(' ') + ' ' + labels.join(' ') + ' ' + text).toLowerCase();
  if (/all life stages|all-life-stages/.test(all)) return 'all';
  const kitten = /kitten|junior|growth/.test(all);
  const senior = /senior|mature|7\+|11\+/.test(all);
  if (kitten && !senior) return 'growth';
  if (senior || /adult/.test(all)) return 'adult';
  return 'unknown';
}

/* ── Normalisation ── */

/**
 * Convert a raw Open Pet Food Facts record into a Product (docs/PRD.md section 16.5).
 *
 * Never throws on missing data. A product with nothing but a barcode still
 * normalises: it simply reports dataCompleteness 'minimal'.
 *
 * @param {object} raw
 * @returns {object} Product
 */
export function normalize(raw) {
  const nutriments = raw.nutriments || {};
  const tags = raw.categories_tags || [];
  const labels = raw.labels_tags || [];

  const protein = readAnalysis(nutriments, ['crude-protein'], ['proteins'], 'protein');
  const fat = readAnalysis(nutriments, ['crude-fat'], ['fat'], 'fat');
  const fibre = readAnalysis(nutriments, ['crude-fibre'], ['fiber', 'fibre'], 'fibre');
  const ash = readAnalysis(nutriments, ['crude-ash'], ['ash'], 'ash');
  const moisture = readAnalysis(nutriments, ['moisture'], [], 'moisture');
  const energy = readEnergy(nutriments);
  const taurine = readNutriment(nutriments, ['taurine']);

  const englishText = (raw.ingredients_text_en || '').trim();
  const ingredientsText = englishText || (raw.ingredients_text || '').trim();
  const ingredients = splitIngredients(ingredientsText);
  // Which language the ingredient list is actually in. The additive matcher
  // only covers a handful of languages, so a score computed against a label it
  // cannot read must not be presented as a clean bill of health.
  const ingredientsLang = englishText ? 'en' : (raw.lang || 'unknown');

  // A guaranteed-analysis figure came off the packaging panel; a human-schema
  // one was entered against a field meant for human food. The distinction
  // decides whether a score can be presented with confidence.
  const provenance = [protein, fat, fibre, ash, moisture]
    .filter(Boolean).map((f) => f.source);
  const confidence = provenance.length === 0 ? 'none'
    : provenance.every((s) => s === 'guaranteed-analysis') ? 'high'
      : 'low';

  const nutrition = {
    crudeProteinPct: protein ? protein.value : undefined,
    crudeFatPct: fat ? fat.value : undefined,
    crudeFibrePct: fibre ? fibre.value : undefined,
    ashPct: ash ? ash.value : undefined,
    moisturePct: moisture ? moisture.value : undefined,
    kcalPer100g: energy ? energy.value : undefined,
    // Absence of a taurine figure means nobody entered one, not that the food
    // lacks taurine. Only a positive value is informative.
    taurinePresent: taurine && taurine.value > 0 ? true : undefined,
    confidence,
    energyCorrected: energy ? energy.corrected : false,
  };

  const knownFigures = Object.values(nutrition)
    .filter((v) => typeof v === 'number').length;
  const dataCompleteness =
    ingredients.length > 0 && knownFigures >= 3 ? 'full'
      : ingredients.length > 0 || knownFigures > 0 ? 'partial'
        : 'minimal';

  const name = (raw.product_name_en || raw.product_name || '').trim();

  return {
    barcode: raw.code || '',
    name: name || 'Unnamed product',
    brand: (raw.brands || '').split(',')[0].trim() || undefined,
    quantity: (raw.quantity || '').trim() || undefined,
    imageUrl: raw.image_front_url || raw.image_front_small_url || undefined,
    // The 200px rendition, for the 56px boxes on cards. Falling back to the
    // 400px one costs bytes but never a missing picture; falling back the
    // other way on `imageUrl` would put a 200px image in an 80px box.
    thumbUrl: raw.image_front_small_url || raw.image_front_url || undefined,
    format: readFormat(tags, nutrition.moisturePct),
    lifeStage: readLifeStage(tags, labels, name),
    // Open Pet Food Facts records no AAFCO adequacy statement, so this is not
    // "false": it is unknown, and the UI must not imply otherwise.
    aafcoComplete: undefined,
    substantiation: 'unknown',
    ingredients,
    ingredientsText,
    ingredientsLang,
    nutrition,
    dataCompleteness,
    lastModified: raw.last_modified_t
      ? new Date(raw.last_modified_t * 1000).toISOString().slice(0, 10)
      : undefined,
    sourceUrl: raw.code
      ? 'https://world.openpetfoodfacts.org/product/' + raw.code
      : undefined,
  };
}

/* ── Network ── */

/* Session cache. Deliberately not localStorage: product data goes stale, and a
   tab-lifetime cache is enough to stop back-navigation refetching. */
const cache = new Map();

async function getJSON(url, signal) {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (response.status === 404) return { status: 0 };
  if (!response.ok) throw new Error('Open Pet Food Facts returned ' + response.status);
  const body = await response.json();
  // The service worker stamps a response it served from its cache because the
  // network was unreachable (see sw.js). Carrying that through to the page is
  // the whole point of the stamp: a score derived from a saved copy has to say
  // so, rather than looking exactly like a fresh one.
  const cachedAt = response.headers.get('x-cfc-cached');
  if (cachedAt) body._servedFromCache = cachedAt;
  return body;
}

/**
 * Look up one product by barcode.
 *
 * A miss is an ordinary outcome, not an error: most barcodes are not in the
 * database. Callers get {found:false} rather than an exception.
 *
 * **The barcode index is consulted before the network (M28).** A barcode this
 * project has resolved to a product is a better answer than whatever upstream
 * says about it, for the same reason a manufacturer panel outranks a database
 * record in 16.5a: somebody read it off the package deliberately. And a
 * barcode the index knows without an entry behind it returns `known`, which is
 * neither a hit nor a miss and the product page renders as its own state.
 *
 * @returns {Promise<{found: boolean, product?: object, error?: string,
 *                    known?: {name?: string, brand?: string},
 *                    indexed?: object}>}
 */
export async function fetchProduct(barcode, { signal } = {}) {
  const code = String(barcode || '').trim();
  const provisional = isProvisional(code);
  if (!provisional && !/^\d{6,14}$/.test(code)) {
    return { found: false, error: 'That does not look like a barcode.' };
  }
  if (cache.has(code)) return cache.get(code);

  /* The index first, because it is the only source here that was filled by a
     person on purpose. A row naming an entry resolves to that entry, which is
     how a product filed under a provisional key becomes scannable without
     changing its key: the product keeps its identity and the barcode merely
     points at it. The entry having gone missing is treated as the index being
     wrong rather than as a product not existing, and falls through. */
  if (!provisional) {
    const indexed = resolveBarcode(await loadBarcodeIndex(), code);
    if (indexed && indexed.entry) {
      const catalogue = await loadCatalogue();
      const entry = catalogue[indexed.entry];
      const merged = entry ? mergeCurated(null, entry) : null;
      if (merged && merged.curated) {
        /* The product keeps the identity it is filed under and gains the number
           it was scanned as. Both have to travel, because the page's footer
           would otherwise print "no published barcode, so this product cannot
           be scanned yet" about a product the visitor had just scanned, and
           16.5a means a barcode this project asserts says where it came from
           like any other curated figure. */
        merged.scannedAs = code;
        merged.barcodeSource = indexed.row.source;
        merged.barcodeSourceKind = indexed.row.sourceKind;
        const answer = { found: true, product: merged, indexed: indexed.row };
        cache.set(code, answer);
        return answer;
      }
    } else if (indexed && indexed.name) {
      /* Known and not transcribed. This deliberately does not go on to ask
         upstream: the index says a person has already identified this package,
         and a database record for it would be a second opinion about identity
         that nobody asked for. It is also the case M31 exists to collect. */
      const answer = { found: false, known: { name: indexed.name, brand: indexed.brand } };
      cache.set(code, answer);
      return answer;
    }
  }

  /* A provisional key means "this site holds a panel for this product and
     nobody publishes its barcode". Open Pet Food Facts is keyed by barcode and
     has never heard of this string, so asking it is a request that can only
     fail, and one that would put an identifier of ours into somebody else's
     logs for no purpose. The catalogue below is the whole answer. */
  if (provisional) {
    const catalogue = await loadCatalogue();
    const entry = catalogue[code];
    const merged = entry ? mergeCurated(null, entry) : null;
    const answer = merged && merged.curated
      ? { found: true, product: merged }
      : { found: false };
    cache.set(code, answer);
    return answer;
  }

  let result;
  try {
    const data = await getJSON(API + '/product/' + code + '.json?fields=' + FIELDS, signal);
    result = data.status === 1 && data.product
      ? { found: true, product: normalize(data.product), servedFromCache: data._servedFromCache }
      : { found: false };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    // Do not cache a network failure; the next attempt may well succeed.
    return { found: false, error: 'Could not reach Open Pet Food Facts.' };
  }

  /* The curated catalogue, merged over whatever the API returned (PRD 16.5a).
     A catalogue entry can also rescue a barcode the database does not have at
     all, which is the case that raises coverage: `found` becomes true on the
     strength of the local file, and `product.curated` says every field came
     from there. A failure to load the catalogue leaves this untouched, so the
     site behaves exactly as it did before the file existed. */
  const catalogue = await loadCatalogue();
  const entry = catalogue[code];
  if (entry) {
    const merged = mergeCurated(result.found ? result.product : null, entry);
    if (merged && merged.curated) {
      result = { ...result, found: true, product: merged };
    }
  }
  cache.set(code, result);
  return result;
}

/**
 * Text search across cat food, optionally narrowed to a brand.
 *
 * Scoped to the cat-food category rather than the whole pet-food database, so
 * a query like "chicken" does not return dog food.
 *
 * Either `query` or `brand` may be empty, but not both: a bare category listing
 * of every cat food in the database is not a useful page, and asking for one is
 * a bug in the caller rather than an empty search.
 *
 * `brand` is a tag expression as built by `brandTagExpression`, one or more
 * raw brand tags joined by `|`, which the API reads as OR.
 *
 * @returns {Promise<{products: object[], total: number, page: number,
 *                    pageSize: number, error?: string}>}
 */
export async function searchProducts(query, { page = 1, pageSize = 24, brand = '', signal } = {}) {
  const q = String(query || '').trim();
  const b = String(brand || '').trim();
  if (!q && !b) return { products: [], total: 0, page: 1, pageSize };

  /* Two endpoints, chosen by what is being asked for rather than by
     preference. A text query has to go to CGI because v2 does not search text
     at all (see SEARCH_CGI). A brand-only browse stays on v2, where the `|` OR
     expression that merges a brand's spellings is verified and where the
     counts match the ones /brands/ shows. */
  const url = q
    ? SEARCH_CGI + '?action=process&json=1'
      + '&tagtype_0=categories&tag_contains_0=contains&tag_0=cat-food'
      + (b ? '&tagtype_1=brands&tag_contains_1=contains&tag_1='
             + encodeURIComponent(b.split('|')[0]) : '')
      + '&search_terms=' + encodeURIComponent(q)
      + '&page=' + page + '&page_size=' + pageSize + '&fields=' + FIELDS
    : API + '/search?categories_tags_en=cat-food'
      + '&brands_tags=' + encodeURIComponent(b)
      + '&page=' + page + '&page_size=' + pageSize + '&fields=' + FIELDS;

  /* The catalogue is consulted here as well as in fetchProduct, which is the
     whole of M25 (PRD 16.5b). It does two separate jobs.

     `applyCurated` stops a card and a page disagreeing. Before this, a search
     for a curated product returned a card reading "No ingredient list on
     record. Not scored" while its own page scored it from the catalogue.

     `searchCatalogue` finds products the API cannot return at all, and they are
     put first: there are few of them, they are the records this project
     vouches for by name, and the alternative is burying them under an API
     ranking that has never heard of them.

     Curated-only matches are added on the first page only. Interleaving a local
     list into a remote pagination would either repeat them on every page or
     silently drop them, and both are worse than saying they are here. */
  /* The request goes out before the catalogue is read, not after. Waiting on a
     local file to decide what to ask a remote API is a dependency that does not
     exist: the URL above is built entirely from the query. Measured on a
     throttled search, awaiting the catalogue first put the whole of the local
     data load, and every module that had to arrive before it, in front of the
     first byte the site asked anybody for. Both are needed before results can
     be rendered; only one of them has to happen first. */
  const request = getJSON(url, signal);
  /* Marks the rejection handled for the platform's unhandled-rejection check
     while leaving `request` itself to be awaited and caught below. Without it,
     a request that fails during the catalogue await is a rejection nobody has
     claimed yet, and the console says so. */
  request.catch(() => {});

  let curatedMatches = [];
  try {
    const catalogue = await loadCatalogue();
    /* Counted on every page, shown only on the first. The count has to be
       page-independent or the result line contradicts itself between pages:
       1579 results on page one and 1578 on page two, for the same search. */
    curatedMatches = searchCatalogue(catalogue, { query: q, brandTags: b });
    const data = await request;
    const fromApi = applyCurated((data.products || []).map(normalize), catalogue);
    const seen = new Set(fromApi.map((p) => p.barcode));
    const curatedOnly = page === 1
      ? curatedMatches.filter((p) => !seen.has(p.barcode))
      : [];
    return {
      products: [...curatedOnly, ...fromApi],
      total: (data.count || 0) + curatedMatches.length,
      curated: curatedMatches.length,
      page: data.page || page,
      pageSize: data.page_size || pageSize,
    };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    /* The API being unreachable is not a reason to withhold what is held
       locally. A curated match is still a real answer, and this is the one
       path where the catalogue is the only source there is. */
    const offline = page === 1 ? curatedMatches : [];
    /* `error` empties the page; `warning` sits above results that are real but
       incomplete. A curated match found while the database is down is a real
       answer, and throwing it away to show a failure message would be the page
       hiding data it is holding. */
    return offline.length
      ? {
        products: offline,
        total: offline.length,
        curated: offline.length,
        page,
        pageSize,
        warning: 'Open Pet Food Facts could not be reached, so this is only what Cat Food Center holds locally.',
      }
      : {
        products: [],
        total: 0,
        curated: 0,
        page,
        pageSize,
        error: 'Could not reach Open Pet Food Facts.',
      };
  }
}

/* ── Brands ──

   The brand facet is the one browse axis the database supports well, and it is
   the answer to a problem free-text search cannot fix: the records are thin and
   inconsistently named (docs/PRD.md section 12), so typing a product name is the
   hardest way to find something. Picking a brand from a list is the easiest.

   This endpoint is outside the v2 API (a facet listing rather than a search)
   but it is CORS-enabled like the rest, so it still needs no server. The URL is
   spelled with the display form of the category ("Cat food") because the
   canonical slug redirects to it, and following two redirects on every visit is
   a waste when the destination is known. */
const BRANDS_URL = 'https://world.openpetfoodfacts.org/facets/categories/Cat%20food/brands.json';

/**
 * Merge brand tags that differ only in case or spacing.
 *
 * The facet treats `purina` and `Purina` as two brands, with 110 and 15
 * products. They are one brand, and showing them as two is the same failure as
 * any other place this project renders the database's inconsistencies as if
 * they were facts about cat food. Nine such collisions exist in the cat-food
 * facet as measured.
 *
 * The merged entry keeps every raw tag, because the API filter needs all of
 * them, and `brands_tags=purina|Purina` is the only way to ask for both.
 *
 * @param {{name: string, products: number}[]} tags Raw facet entries.
 * @returns {{name: string, tags: string[], count: number}[]} Merged, biggest first.
 */
export function mergeBrandTags(tags) {
  const byKey = new Map();
  for (const tag of tags || []) {
    const raw = String(tag.name || '').trim();
    if (!raw) continue;
    const key = raw.toLowerCase().replace(/\s+/g, ' ');
    const entry = byKey.get(key)
      || { name: raw, tags: [], count: 0, _best: -1 };
    entry.tags.push(raw);
    entry.count += tag.products || 0;
    // Display the spelling used by the most products: the majority form is the
    // one a reader is most likely to recognise from a packet.
    if ((tag.products || 0) > entry._best) {
      entry._best = tag.products || 0;
      entry.name = raw;
    }
    byKey.set(key, entry);
  }
  return [...byKey.values()]
    .map(({ name, tags: t, count }) => ({ name, tags: t, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * The filter expression for a merged brand. `|` is OR in the v2 tag filters,
 * which is what lets one request cover every spelling of a brand.
 */
export function brandTagExpression(brand) {
  return (brand && brand.tags ? brand.tags : []).join('|');
}

/**
 * A brand tag expression rendered back as something to put in a heading.
 * `purina|Purina` reads as "Purina": the longest variant wins, on the theory
 * that a capitalised spelling is a deliberate one and an all-lowercase tag is
 * a transcription.
 */
export function brandDisplayName(expression) {
  const parts = String(expression || '').split('|').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return '';
  const best = parts.slice().sort((a, b) => {
    const caps = (s) => (/[A-Z]/.test(s) ? 1 : 0);
    return caps(b) - caps(a) || b.length - a.length;
  })[0];
  return best;
}

/**
 * Every brand in the cat-food category, merged and ordered by product count.
 *
 * @param {{minProducts?: number}} options Brands below the threshold are
 *   dropped. The default of 2 removes the long tail of one-product brands,
 *   which is 379 of 439 entries and is mostly transcription noise.
 * @returns {Promise<{brands: object[], error?: string}>}
 */
export async function fetchBrands({ minProducts = 2, signal } = {}) {
  /* Catalogue brands join the facet (PRD 16.5b). Without this, a brand the
     database does not carry cannot appear in the brand index however many
     curated products it has, which is how Dr. Elsey's came to be missing from
     a list of cat food brands while being a cat food brand.

     They are exempt from `minProducts`. That threshold hides the database's
     long tail of one-product transcription noise; a brand somebody entered by
     hand is the opposite of noise, because entering it was a decision. */
  /* Started before the catalogue is read, for the reason given in
     searchProducts: BRANDS_URL is a constant, so nothing about the request
     depends on the local file, and asking first costs nothing. */
  const request = getJSON(BRANDS_URL, signal);
  request.catch(() => {});

  const catalogue = await loadCatalogue();
  const curated = catalogueBrands(catalogue);
  const curatedNames = new Set(curated.map((c) => c.name.toLowerCase()));

  try {
    const data = await request;
    const brands = mergeBrandTags([...(data.tags || []), ...curated])
      .filter((b) => b.count >= minProducts || curatedNames.has(b.name.toLowerCase()));
    return { brands };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    return {
      brands: mergeBrandTags(curated),
      error: 'Could not reach Open Pet Food Facts.',
    };
  }
}

/* Exported for the test suite only. */
export const _internal = {
  splitIngredients, readAnalysis, readEnergy, readFormat, readLifeStage, PLAUSIBLE,
  BRANDS_URL,
};
