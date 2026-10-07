# -*- coding: utf-8 -*-
"""Measure top-100 SKU coverage: how many best-sellers can this site score?

    python tools/measure-coverage.py              measure and write the report
    python tools/measure-coverage.py --limit 20   a shorter run, for a change
                                                  to the matcher
    python tools/measure-coverage.py --review     print the borderline calls
                                                  and nothing else

M12 has required "top-100 SKU coverage at 80%" since the roadmap was written.
Section 12.7 decided which hundred SKUs: the Amazon cat-food best-seller list,
captured into tools/data/top-skus.json. This is the other half, and it was the
milestone's open half for a day, because a captured row is a product name and
the catalogue is keyed by barcode. No storefront publishes a UPC.

**The barcode was never the question the criterion asks.** "Coverage" is not
"is this SKU in the local catalogue"; it is "can a visitor who wants this
product get a score for it here". A visitor does not know the barcode either.
They type the name into the search box, and the site answers or it does not.
So this measures exactly that: it runs each SKU's name through the same search
endpoint and the same fields the site's own search uses, and asks whether what
comes back is the same product and whether it carries an ingredient list.

That reframing is the whole of the fix, and it is worth being clear that it is
a reframing rather than a workaround. Measuring by barcode would have answered
a question about the catalogue's internals. This answers the question the
criterion was written to ask, and it needs nothing nobody publishes.

**What it can get wrong, in both directions.**

*Too generous.* A search for "Fancy Feast Gravy Lovers" can return a different
Fancy Feast that shares most of its words. Guarded by requiring the brand to
match and a majority of the SKU's distinguishing words to appear in the
candidate, and by writing every decision out with its evidence, so a claim of
coverage is auditable rather than a number to be trusted. Anything close to the
line is marked `review` and counted as **not** covered until a person says
otherwise, because a coverage figure that rounds in its own favour is worse
than no figure.

*Too mean.* A product genuinely in the database under a spelling the matcher
does not recognise counts as a miss. That is the direction to err in.

**Not a gate.** It reads a third-party database that moves under it, so the
number is a measurement with a date on it, like `probe-opff.py` and unlike
`check-catalogue.py`. Section 12.7 step 3 is what schedules it.

**On being a well-behaved client.** One search per SKU, paced, on a quarterly
cadence: a hundred requests where a hundred visitors would make a hundred
requests. It writes nothing anywhere but this repository.
"""
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKUS = os.path.join(ROOT, 'tools', 'data', 'top-skus.json')
REPORT = os.path.join(ROOT, 'tools', 'data', 'coverage.json')
CATALOGUE = os.path.join(ROOT, 'assets', 'data', 'catalogue.json')

SEARCH_CGI = 'https://world.openpetfoodfacts.org/cgi/search.pl'
UA = 'CatFoodCenter/0.8 (https://catfoodcenter.com/)'
FIELDS = 'code,product_name,brands,quantity,ingredients_text,ingredients_text_en,lang'

# The list section 12.7 names. The other two captures are the dry and wet
# sub-lists, which overlap it and are not the hundred the criterion is about.
TOP_LIST = 'cat-food'

# Words that appear in almost every cat food name and therefore distinguish
# nothing. Matching on these is how a matcher decides that every product is
# every other product.
NOISE = set("""
cat cats food foods feed canned can cans pack packs count ct oz lb lbs
pound pounds ounce ounces bag bags box tub tubs tray trays pouch pouches case
multipack twin with and for the of in a an made real natural premium
recipe recipes flavor flavors flavour flavours formula complete balanced
nutrition value delicious tasty new size sizes
""".split())

# Deliberately NOT noise: seafood, gravy, pate, cuts, shreds, grilled, chunks,
# kitten, indoor, adult, variety. They read like marketing and they are the
# words that tell two products of the same brand apart, which is the only
# distinction this measurement has to make. The first version of this set
# discarded them, which left "Purina Fancy Feast Grilled Seafood" with the
# words "fancy" and "feast" to be matched on, and every Fancy Feast in the
# database duly matched every other one at an overlap of 1.0. A matcher whose
# vocabulary is all brand cannot see products at all.

# Amazon titles run a product name, a size, a pack count and a marketing
# sentence together. Everything after the first pipe is the sentence.
SIZE_RE = re.compile(r'\b\d+(\.\d+)?\s*(oz|lb|lbs|g|kg|ml|l|ct|count|pack|pk)\b', re.I)
WORD_RE = re.compile(r"[a-z0-9']+")


def words(text):
    return [w for w in WORD_RE.findall((text or '').lower()) if w]


def significant(text):
    """The words in a name that could tell two products apart."""
    return {w for w in words(text) if w not in NOISE and not w.isdigit() and len(w) > 2}


def clean_title(title):
    head = (title or '').split('|')[0]
    head = SIZE_RE.sub(' ', head)
    return re.sub(r'[,;]+', ' ', head).strip()


def query_for(item):
    """One query per brand, not one per product.

    The first version of this asked for the brand plus four distinguishing
    words, on the theory that it was typing what a visitor would type. Every
    term is a further constraint on this endpoint, so "Fancy Feast purina gravy
    lovers wet" matched nothing, and eleven of the first twelve best-sellers
    were recorded as absent from a database that holds thirteen Fancy Feasts.
    A measurement that strict is not conservative, it is broken: it would have
    reported a coverage figure of zero and been believed.

    A brand name alone returns the brand's whole shelf, which is small enough
    to match against locally: 13 for Fancy Feast, 32 for Friskies, 27 for
    Sheba. So the request is per brand and cached, matching happens here, and a
    hundred SKUs cost about twenty requests rather than a hundred.
    """
    brand = item.get('brand') or ''
    if brand:
        return brand.lower()
    # 34 captured rows carry no brand of their own. Two words is the widest net
    # that still means something.
    rest = [w for w in words(clean_title(item['title'])) if w not in NOISE and len(w) > 2]
    return ' '.join(rest[:2]).strip()


_shelves = {}


def shelf(query, in_category=True, attempts=3):
    """Every product the database holds under this query, fetched once."""
    key = (query, in_category)
    if key not in _shelves:
        _shelves[key] = fetch(query, in_category, attempts)
        time.sleep(1.0)
    return _shelves[key]


def fetch(query, in_category=True, attempts=3):
    """One search.

    `in_category` is the site's own filter, and running the same query with it
    switched off is the second measurement here. A product the database holds
    but has not tagged `cat-food` is invisible to this site's search, so it is
    honestly uncovered; it is also a different problem from a product nobody
    has entered, and one somebody could fix upstream. Reporting the two as one
    number would hide which of them the site is actually up against.
    """
    url = (SEARCH_CGI + '?action=process&json=1'
           + ('&tagtype_0=categories&tag_contains_0=contains&tag_0=cat-food'
              if in_category else '')
           + '&search_terms=' + urllib.parse.quote(query)
           + '&page_size=100&fields=' + FIELDS)
    request = urllib.request.Request(url, headers={'User-Agent': UA})
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.loads(response.read().decode('utf-8'))
        except (urllib.error.URLError, ValueError, TimeoutError) as err:
            if attempt == attempts - 1:
                return {'error': str(err)}
            time.sleep(2 + attempt * 3)
    return {'products': []}


def brand_matches(item, product):
    """Does the candidate carry the SKU's brand?

    Both sides are reduced to words, because the database spells a brand every
    way its contributors have ever typed it: "Purina Fancy Feast", "Fancy
    Feast", "fancy-feast". Requiring every word of the shorter side to appear in
    the longer one accepts all three and rejects Friskies.
    """
    wanted = {w for w in words(item.get('brand') or '') if w not in ('purina',)}
    if not wanted:
        return None  # 34 captured rows carry no brand; say so rather than guess
    have = set(words(product.get('brands') or '')) | set(words(product.get('product_name') or ''))
    return wanted.issubset(have)


def scorable(product):
    """The site's own test: is there an ingredient list to read?

    This is what the search page means by "can be scored" and what the product
    page needs before it will show a number. A record with nutrition and no
    ingredients is a record this site will not score, however complete it looks.
    """
    return bool((product.get('ingredients_text') or '').strip()
                or (product.get('ingredients_text_en') or '').strip())


# Assorted recipes in one box. PRD section 12.15: a variety pack has no
# guaranteed analysis of its own, so no entry can be written for it and no
# search can return a score for it. Counting it in the denominator measures
# this site against something it has decided not to hold, which makes the
# coverage figure permanently and misleadingly low. Mirrors VARIETY in
# tools/purina-index.py.
VARIETY = re.compile(
    r'\bvariet(?:y|ies)\b|\bmultipack\b|\bsampler\b|\bassort\w*\b|'
    r'\bcollection\b|\bmixed\s+(?:flavou?rs?|recipes?|pack)\b',
    re.I)


def is_variety(title):
    return bool(VARIETY.search(title or ''))


def as_products(catalogue):
    """The local catalogue, shaped like the records `assess` compares against.

    **The measurement asked only the upstream database, and that was wrong.**
    This file's own definition of coverage is whether a visitor who searches
    for a best-seller by name gets a scored product back, and the site's search
    reads the curated catalogue alongside the upstream records: a curated entry
    is returned, named, and scored, verified in a browser against the running
    site. Asking only upstream measured a database rather than this site, and
    it would have reported every product transcribed under section 12.10 as
    uncovered, which makes the whole transcription programme look like it
    changes nothing.

    A provisional key (section 12.12) counts here. It cannot be scanned, and
    scanning is not what this measures: a visitor types a name.
    """
    shaped = []
    for key, entry in catalogue.items():
        name = entry.get('name')
        if not name:
            continue
        shaped.append({
            'code': key,
            'product_name': name,
            'brands': entry.get('brand') or '',
            'ingredients_text': entry.get('ingredientsText') or '',
        })
    return shaped


def assess(item, products):
    """The best candidate for one SKU, and what it is worth.

    The brand is checked separately and then removed from the words being
    compared. Leaving it in makes every product of a big brand look like a
    half-match of every other one, and a threshold set high enough to survive
    that would reject genuine matches.
    """
    brand_words = set(words(item.get('brand') or '')) | {'purina'}
    wanted = significant(clean_title(item['title'])) - brand_words
    best = None
    for product in products:
        matched_brand = brand_matches(item, product)
        if matched_brand is False:
            continue
        have = significant(product.get('product_name') or '') - brand_words
        overlap = len(wanted & have) / float(len(wanted)) if wanted else 0.0
        shared = sorted(wanted & have)
        row = {
            'barcode': product.get('code'),
            'name': product.get('product_name') or '',
            'brands': product.get('brands') or '',
            'overlap': round(overlap, 2),
            'shared': shared,
            'brandConfirmed': bool(matched_brand),
            'scorable': scorable(product),
        }
        # Closest name first, and only then the tie-break toward a record
        # that can be scored. The other order reads as helpful and is not: it
        # picks whichever product of the right brand happens to have an
        # ingredient list, which is how a coverage figure ends up measuring the
        # database's completeness rather than this site's coverage.
        key = (overlap, row['scorable'], row['brandConfirmed'])
        if best is None or key > best[0]:
            best = (key, row)
    return best[1] if best else None


# Two non-noise words in common, and half the SKU's distinguishing words. Below
# this it is a guess; between this and `SURE` it is a call for a person.
MATCH = 0.5
SURE = 0.67


def verdict(candidate):
    if candidate is None:
        return 'unmatched'
    if len(candidate['shared']) < 2 or candidate['overlap'] < MATCH:
        return 'unmatched'
    if not candidate['brandConfirmed'] or candidate['overlap'] < SURE:
        return 'review'
    return 'scorable' if candidate['scorable'] else 'no-ingredients'


def load_top(limit):
    data = json.load(io.open(SKUS, encoding='utf-8'))
    captures = [c for c in data['captures'] if c['list'] == TOP_LIST]
    if not captures:
        raise SystemExit('No %s capture in %s. Run capture-rankings.py first.'
                         % (TOP_LIST, SKUS))
    latest = sorted(captures, key=lambda c: c['captured'])[-1]
    items = sorted(latest['items'], key=lambda i: i['position'])
    return latest, items[:limit] if limit else items


def main(argv):
    limit = 0
    if '--limit' in argv:
        limit = int(argv[argv.index('--limit') + 1])
    if '--review' in argv:
        report = json.load(io.open(REPORT, encoding='utf-8'))
        for row in report['skus']:
            if row['verdict'] == 'review':
                print('%3d  %s' % (row['position'], row['title'][:70]))
                print('     -> %s %s (%s, overlap %.2f, brand %s)' % (
                    row['match']['barcode'], row['match']['name'][:50],
                    row['match']['brands'][:24], row['match']['overlap'],
                    'confirmed' if row['match']['brandConfirmed'] else 'unconfirmed'))
        return 0

    capture, items = load_top(limit)
    catalogue = json.load(io.open(CATALOGUE, encoding='utf-8'))['products']
    local = as_products(catalogue)

    print('Top %d of the %s list captured %s, measured against Open Pet Food '
          'Facts.\n' % (len(items), capture['source'], capture['captured']))
    rows = []
    for item in items:
        if is_variety(item['title']):
            # Out of the denominator entirely, not counted as a failure.
            rows.append({
                'position': item['position'],
                'title': item['title'],
                'brand': item.get('brand'),
                'query': None,
                'verdict': 'assortment',
                'match': None,
            })
            print('%3d %-14s %-46s %s'
                  % (item['position'], 'assortment', item['title'][:46], ''))
            continue
        query = query_for(item)
        # The catalogue first, because a curated entry is the stronger answer:
        # its panel came from the manufacturer and its figures were checked
        # against a capture of that panel.
        candidate = assess(item, local)
        call = verdict(candidate)
        served = 'catalogue'
        if call != 'scorable':
            # The catalogue cannot serve this row, so the row is an upstream
            # question and upstream's answer is the one to report. Keeping the
            # catalogue's near-miss here instead would put a curated product's
            # name against a best-seller it is not, in the review list and in
            # coverage.json, which is the same wrong-product-attached-to-the
            # -right-name error section 12.10 exists to prevent, arriving in a
            # report rather than an entry.
            data = shelf(query)
            if 'error' in data:
                print('  ! %s: %s' % (query[:40], data['error']))
            candidate = assess(item, data.get('products') or [])
            call = verdict(candidate)
            served = 'upstream'
        if candidate and candidate['barcode'] in catalogue:
            candidate['inCatalogue'] = True
        row = {
            'position': item['position'],
            'title': item['title'],
            'brand': item.get('brand'),
            'query': query,
            'verdict': call,
            'servedBy': served if call == 'scorable' else None,
            'match': candidate,
        }
        # Only for the SKUs the site cannot serve: is the product in the
        # database at all, and merely outside the category the search filters
        # on?
        if call != 'scorable':
            wider = assess(item, shelf(query, False).get('products') or [])
            row['outsideCategory'] = {'verdict': verdict(wider), 'match': wider}
        rows.append(row)
        print('%3d %-14s %-46s %s' % (
            item['position'], call, item['title'][:46],
            (candidate['name'][:34] if candidate else '')))

    counts = {}
    for row in rows:
        counts[row['verdict']] = counts.get(row['verdict'], 0) + 1
    scored = counts.get('scorable', 0)
    # Section 12.15: assortments are not products this catalogue can hold, so
    # they leave the denominator rather than counting as misses.
    denominator = len(rows) - counts.get('assortment', 0)
    coverage = 100.0 * scored / denominator if denominator else 0.0
    from_catalogue = sum(1 for row in rows if row.get('servedBy') == 'catalogue')
    untagged = sum(1 for row in rows
                   if row.get('outsideCategory', {}).get('verdict') == 'scorable')

    print('\n%d of %d can be scored: %.0f%% coverage. Target is 80%%.'
          % (scored, denominator, coverage))
    print('  %d of those come from the curated catalogue, %d from upstream.'
          % (from_catalogue, scored - from_catalogue))
    if counts.get('assortment'):
        print('  %d assorted-recipe listings are outside the denominator (12.15),'
              % counts['assortment'])
        print('  so this is measured against %d of the %d ranked rows.'
              % (denominator, len(rows)))
    for name in ('no-ingredients', 'review', 'unmatched'):
        if counts.get(name):
            print('  %-15s %d' % (name, counts[name]))
    print('\n%d more carry an ingredient list in the database but sit outside the'
          ' cat-food category,' % untagged)
    print('so this site can neither find nor score them.')
    print('\n"review" is counted as not covered. `--review` lists them.')

    payload = {
        '_readme': [
            'Top-100 SKU coverage, written by tools/measure-coverage.py.',
            'The reasoning, and what this number can get wrong, is in that file '
            'and in docs/PRD.md section 12.9.',
            '',
            'Coverage means: a visitor who searches for this best-seller by name '
            'gets a scored product back. Not: this barcode is in the local '
            'catalogue. No storefront publishes a UPC, and a visitor does not '
            'know one either.',
            '',
            '"review" rows are counted as not covered until a person confirms '
            'them, so the headline figure is the pessimistic reading.',
            '',
            'The denominator is NOT the hundred ranked rows. PRD section 12.15 '
            'took assorted-recipe listings out of it: a variety pack has no '
            'guaranteed analysis, so no entry can exist for it and no score can '
            'be returned. A figure measured this way is not comparable to the '
            '0 of 100 recorded on 2026-09-09, which counted them.',
        ],
        'measured': time.strftime('%Y-%m-%d'),
        'capture': {'source': capture['source'], 'list': capture['list'],
                    'captured': capture['captured']},
        'target': 80,
        'coverage': round(coverage, 1),
        'denominator': denominator,
        'rankedRows': len(rows),
        'fromCatalogue': from_catalogue,
        'reachableIfTagged': untagged,
        'counts': counts,
        'skus': rows,
    }
    io.open(REPORT, 'w', encoding='utf-8', newline='\n').write(
        json.dumps(payload, indent=1, ensure_ascii=False) + '\n')
    print('Written to %s' % os.path.relpath(REPORT, ROOT))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
