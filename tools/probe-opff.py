# -*- coding: utf-8 -*-
"""Measure what Open Pet Food Facts actually contains for cat food.

Regenerates the numbers in docs/PRD.md section 12:

    python tools/probe-opff.py [pages]

Hits the public API (no key needed) and prints field coverage, the split
between the two competing nutriment schemas, how many figures are implausible,
and which languages the ingredient lists are written in. Re-run before relying
on any coverage claim; the database is crowd-sourced and moves.

The language table exists to answer open question 9, which asks whether the six
languages in MATCHED_LANGUAGES are the right stopping point. That question was
left open on 2026-09-07 with the reason attached: the cost of being wrong is
invisible. An uncovered label is never scored wrongly, only capped at low
confidence, denied the clean-additives bonus and warned about, so a badly
chosen seventh language costs nothing and a badly chosen sixth silently
under-serves a whole market. Nothing is added to MATCHED_LANGUAGES until this
table says how many products the next language would actually reach.
"""
import collections
import json
import sys
import time
import urllib.error
import urllib.request

BASE = 'https://world.openpetfoodfacts.org/api/v2/search'
UA = 'CatFoodCenter/0.8 (https://catfoodcenter.com/)'
FIELDS = ('code,product_name,brands,quantity,ingredients_text,ingredients_text_en,'
          'nutriments,categories_tags,labels_tags,countries_tags,lang,image_front_url')

# What assets/js/scoring.js can read. Kept here as a copy on purpose: this
# script measures the site rather than importing from it, and there is no
# runtime that could share the constant anyway (no Node, ADR-001). If the two
# ever disagree the JavaScript is authoritative and this line is stale.
MATCHED_LANGUAGES = ('en', 'fr', 'de', 'es', 'it', 'nl')

# A cat food as fed. Anything outside these ranges is a data-entry error, not an
# unusual product. See docs/PRD.md section 12.
PLAUSIBLE = {'protein': (3, 65), 'fat': (0.5, 40), 'moisture': (0, 90), 'kcal': (15, 600)}


# The endpoint stops serving anonymous requests past page 10. Page 10 returns
# its hundred products; page 11 returns 401 with an HTML login page in the body,
# which reads as a credentials problem and is really a paging limit: this
# endpoint takes no key and there is no key that would help.
#
# So the largest sample obtainable here is 1000 products of the roughly 1580 in
# the category, and it is the first 1000 in the API's own order rather than a
# random draw. Every share this script prints is a share of that sample. It is
# reported alongside the numbers rather than left for a reader to discover,
# because a percentage whose denominator is unstated is the kind of figure that
# ends up quoted as a fact about the database.
MAX_PAGE = 10


def fetch(page, attempts=4):
    """One page of the category, with a pause and a retry for transient errors.

    The pause is not required by anything observed; it is a second per page
    against a volunteer-run API this project depends on and pays nothing for.
    """
    url = '%s?categories_tags_en=cat-food&page_size=100&page=%d&fields=%s' % (BASE, page, FIELDS)
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    for attempt in range(attempts):
        time.sleep(1.0 if attempt == 0 else 5.0 * attempt)
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as exc:
            # 401 past MAX_PAGE is the paging limit above, not a hiccup, and
            # retrying it only wastes the upstream's time.
            transient = exc.code in (429, 500, 502, 503)
            if not transient or attempt == attempts - 1:
                raise
            print('  page %d: HTTP %d, waiting' % (page, exc.code), file=sys.stderr)
    raise SystemExit('unreachable')


def value(nutriments, *keys):
    """First present value among keys, preferring the _100g variant."""
    for k in keys:
        v = nutriments.get(k + '_100g', nutriments.get(k))
        if v is not None:
            try:
                return float(v), k
            except (TypeError, ValueError):
                pass
    return None, None


def ingredients_lang(product):
    """The language the site would decide this list is in, by the site's rule.

    assets/js/opff.js, line for line: an English list wins outright, because the
    API supplies ingredients_text_en for a product whose own language is
    something else, and that is the text the site would then score. Otherwise
    the product's own `lang` stands in.

    That substitution is the honest weakness of this measurement, and it is
    reported rather than smoothed over. `lang` is the language of the *record*,
    not a detection run on the ingredient string, so a German record carrying a
    French list counts as German here. The site would match it as German too,
    which is the point: this measures what the site believes, and the site's
    belief is what the decision turns on. It is not ground truth about labels.
    """
    if (product.get('ingredients_text_en') or '').strip():
        return 'en'
    return (product.get('lang') or 'unknown').strip().lower() or 'unknown'


def report_languages(ps):
    """Which languages the ingredient lists are in, and what the next one buys.

    Only products that have an ingredient list are counted. A product without
    one is not an argument for or against any language: it is already
    unscorable on Pillar B for an unrelated reason, and including it would
    dilute every share below toward a number about missing data instead.
    """
    with_list = [p for p in ps if len(
        (p.get('ingredients_text_en') or p.get('ingredients_text') or '').strip()) > 60]
    total = len(with_list)
    print('\nIngredient-list languages, by the rule in assets/js/opff.js.')
    if not total:
        print('  No product in this sample has an ingredient list.')
        return
    counts = collections.Counter(ingredients_lang(p) for p in with_list)
    covered = sum(c for lang, c in counts.items() if lang in MATCHED_LANGUAGES)
    print('  %d of %d sampled products carry an ingredient list over 60 characters.'
          % (total, len(ps)))
    print('  MATCHED_LANGUAGES reads %d of those, %.1f%%.\n'
          % (covered, 100.0 * covered / total))
    print('  %-10s %6s %8s   %s' % ('language', 'lists', 'share', 'status'))
    for lang, c in counts.most_common():
        print('  %-10s %6d %7.1f%%   %s' % (lang, c, 100.0 * c / total,
                                            'covered' if lang in MATCHED_LANGUAGES else ''))

    missing = sorted(((c, lang) for lang, c in counts.items()
                      if lang not in MATCHED_LANGUAGES), reverse=True)
    print('\n  What the next language would reach, in order:')
    if not missing:
        print('    Nothing. Every ingredient list in this sample is already readable.')
        return
    running = covered
    for c, lang in missing[:8]:
        running += c
        print('    +%-8s %4d %-5s %4.1f%% of the total, taking coverage to %.1f%%'
              % (lang, c, 'list' if c == 1 else 'lists',
                 100.0 * c / total, 100.0 * running / total))
    print('\n  The existing rule stands: aliases first, the constant after, never'
          '\n  ahead of them. See docs/PRD.md open question 9.')


def main(pages=6):
    if pages > MAX_PAGE:
        print('Asked for %d pages; the API serves %d to an anonymous client. '
              'Sampling %d.' % (pages, MAX_PAGE, MAX_PAGE))
        pages = MAX_PAGE
    products = {}
    category = None
    for page in range(1, pages + 1):
        payload = fetch(page)
        category = payload.get('count') or category
        for p in payload.get('products', []):
            products[p.get('code')] = p

    ps = list(products.values())
    n = len(ps)
    if not n:
        print('No products returned.')
        return 1
    if category:
        print('The category holds %d products; this sample is %d of them, %.1f%%.'
              % (category, n, 100.0 * n / category))

    have = collections.Counter()
    schema = collections.Counter()
    plausible = implausible = 0

    for p in ps:
        nm = p.get('nutriments') or {}
        ing = (p.get('ingredients_text_en') or p.get('ingredients_text') or '').strip()

        if (p.get('product_name') or '').strip():
            have['product_name'] += 1
        if (p.get('brands') or '').strip():
            have['brands'] += 1
        if p.get('image_front_url'):
            have['image'] += 1
        if len(ing) > 60:
            have['ingredients (>60ch)'] += 1
        if (p.get('ingredients_text_en') or '').strip():
            have['ingredients in English'] += 1
        if any(t in (p.get('categories_tags') or []) for t in ('en:wet-cat-food', 'en:dry-cat-food')):
            have['wet/dry known'] += 1
        for label, keys in (('moisture', ('moisture',)), ('fibre', ('crude-fibre', 'fiber')),
                            ('ash', ('crude-ash',)), ('taurine', ('taurine',))):
            if value(nm, *keys)[0] is not None:
                have[label] += 1

        crude = nm.get('crude-protein_100g') is not None
        human = nm.get('proteins_100g') is not None
        schema['both' if (crude and human) else 'crude only' if crude
               else 'human only' if human else 'neither'] += 1

        protein, _ = value(nm, 'crude-protein', 'proteins')
        if protein is None:
            continue
        have['any protein'] += 1
        fat, _ = value(nm, 'crude-fat', 'fat')
        kcal, _ = value(nm, 'energy-kcal')

        def ok(v, band):
            return v is None or PLAUSIBLE[band][0] <= v <= PLAUSIBLE[band][1]

        if ok(protein, 'protein') and ok(fat, 'fat') and ok(kcal, 'kcal'):
            plausible += 1
            have['plausible protein'] += 1
        else:
            implausible += 1
        if len(ing) > 60 and protein is not None and fat is not None:
            have['ingredients AND protein AND fat'] += 1

    print('Sampled %d unique cat food products\n' % n)
    for k in ('product_name', 'brands', 'image', 'wet/dry known', 'ingredients (>60ch)',
              'ingredients in English', 'any protein', 'plausible protein', 'moisture',
              'fibre', 'ash', 'taurine', 'ingredients AND protein AND fat'):
        print('  %-34s %4d  %5.1f%%' % (k, have[k], 100.0 * have[k] / n))

    print('\nNutriment schema split:')
    for k in ('crude only', 'human only', 'both', 'neither'):
        print('  %-34s %4d  %5.1f%%' % (k, schema[k], 100.0 * schema[k] / n))

    total = plausible + implausible
    if total:
        print('\nOf the %d products with a protein figure, %d (%.1f%%) are implausible.'
              % (total, implausible, 100.0 * implausible / total))

    report_languages(ps)
    return 0


if __name__ == '__main__':
    sys.exit(main(int(sys.argv[1]) if len(sys.argv) > 1 else 6))
