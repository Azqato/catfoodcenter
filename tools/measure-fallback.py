# -*- coding: utf-8 -*-
"""What a visitor would lose if the live upstream read went away.

    python tools/measure-fallback.py
    python tools/measure-fallback.py --report

This answers open question 14, which gates M32. The question is not how many
records each source holds, it is how many **scorable results a visitor would
stop seeing**, and those are different numbers for two reasons the raw counts
hide. M26 hides unscored products by default, so an upstream record with no
ingredient list is already invisible and losing it costs nothing. And section
12.1 puts a full ingredient list at 38.2% of the database and a scorable record
at roughly one in five, so most of upstream is already in that invisible part.

**The catalogue is matched exactly the way the site matches it**, which is a
plain substring over name, brand and pack size, replicating `searchCatalogue`
in assets/js/catalogue.js. That is much narrower than the tokenised search
upstream runs, and using a generous matcher here would flatter the catalogue
and under-report the loss. The site's matcher is the one that decides what a
visitor actually sees, so it is the one used.

**There is no query log and there will not be one.** Section 14 says this site
has no analytics, and that is a decision rather than a gap, so the queries
below are chosen rather than sampled. They come in two kinds and are reported
separately, because they answer different halves of the question: purchase
intent, where somebody types the name of a product they are holding or buying,
and browsing, where somebody types a word. **A chosen query set is evidence
about the shape of the loss and not a measurement of visitor behaviour**, and
the report says so rather than implying a precision it cannot have.
"""
import argparse
import importlib.util
import io
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOGUE = os.path.join(ROOT, 'assets', 'data', 'catalogue.json')
OUT = os.path.join(ROOT, 'tools', 'data', 'fallback.json')


def _load_coverage():
    """Reuse the coverage tool rather than restating what scorable means.

    `scorable` is the definition the coverage number already rests on, and a
    second copy here would be free to drift from it. A measurement whose
    definitions disagree with the measurement it is compared against is worse
    than no measurement.
    """
    spec = importlib.util.spec_from_file_location(
        'coverage', os.path.join(ROOT, 'tools', 'measure-coverage.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


mc = _load_coverage()

# Words a search box actually receives: a protein, a life stage, a format, a
# texture, a brand. Chosen on 2026-10-07 by reading the Cat Care Guide's own
# vocabulary and the brand names present in the top 100, so they are at least
# the words this site itself uses rather than words that sounded plausible.
BROWSE = [
    'chicken', 'salmon', 'tuna', 'turkey', 'beef', 'whitefish',
    'kitten', 'senior', 'adult', 'indoor',
    'dry', 'wet', 'pate', 'gravy', 'grain free', 'high protein',
    'fancy feast', 'friskies', 'purina one', 'cat chow', 'pro plan',
    'hill’s', 'blue buffalo', 'sheba', 'meow mix',
]


def catalogue_hits(catalogue, query):
    """Exactly `searchCatalogue`: substring over name, brand and quantity."""
    q = (query or '').strip().lower()
    if not q:
        return []
    out = []
    for code, entry in (catalogue or {}).items():
        if not entry or not entry.get('name'):
            continue
        hay = ' '.join(
            str(entry.get(k) or '') for k in ('name', 'brand', 'quantity')).lower()
        if q in hay:
            out.append((code, entry))
    return out


def catalogue_token_hits(catalogue, query):
    """The same entries under a tokenised match instead of a substring.

    Not what the site does. The gap between this and `catalogue_hits` separates
    two causes that look identical in the result: a product this project has
    not transcribed, and a product it holds that the matcher cannot find. The
    first costs weeks of transcription and the second is an afternoon in
    assets/js/catalogue.js, so a number that blends them is a number that
    cannot be acted on.
    """
    wanted = mc.significant(query or '')
    if not wanted:
        return []
    out = []
    for code, entry in (catalogue or {}).items():
        if not entry or not entry.get('name'):
            continue
        hay = ' '.join(
            str(entry.get(k) or '') for k in ('name', 'brand', 'quantity'))
        if wanted <= mc.significant(hay):
            out.append((code, entry))
    return out


def upstream_scorable(query):
    """Scorable products upstream returns for this query, keyed by barcode."""
    data = mc.shelf(query)
    if 'error' in data:
        return None
    found = {}
    for product in (data.get('products') or []):
        if mc.scorable(product):
            code = str(product.get('code') or '')
            if code:
                found[code] = product.get('product_name') or ''
    return found


def run(queries, catalogue, label, verbose):
    rows = []
    for query in queries:
        up = upstream_scorable(query)
        if up is None:
            print('  ! %s: upstream did not answer, row dropped' % query[:46])
            continue
        local = catalogue_hits(catalogue, query)
        token = catalogue_token_hits(catalogue, query)
        local_codes = set(code for code, _ in local)
        # A curated entry whose barcode upstream also returned is not a loss:
        # the visitor keeps seeing it. Only the codes upstream alone can serve
        # are at risk, which is what the question asks for.
        only_upstream = set(up) - local_codes
        rows.append({
            'query': query,
            'kind': label,
            'upstreamScorable': len(up),
            'catalogueHits': len(local),
            'catalogueTokenHits': len(token),
            'onlyUpstream': len(only_upstream),
            'goesEmpty': bool(up) and not local,
            'goesEmptyOnlyBecauseOfTheMatcher': bool(up) and not local and bool(token),
        })
        if verbose:
            print('  %-42s upstream %3d  catalogue %2d  lost %3d%s'
                  % (query[:42], len(up), len(local), len(only_upstream),
                     '   EMPTY' if rows[-1]['goesEmpty'] else ''))
    return rows


def summarise(rows, label):
    if not rows:
        return {'kind': label, 'queries': 0}
    empty = [r for r in rows if r['goesEmpty']]
    matcher = [r for r in rows if r['goesEmptyOnlyBecauseOfTheMatcher']]
    served = [r for r in rows if r['catalogueHits']]
    return {
        'kind': label,
        'queries': len(rows),
        'queriesUpstreamAnswers': sum(1 for r in rows if r['upstreamScorable']),
        'queriesCatalogueAnswers': len(served),
        'queriesThatGoEmpty': len(empty),
        'emptyOnlyBecauseOfTheMatcher': len(matcher),
        'scorableResultsLost': sum(r['onlyUpstream'] for r in rows),
        'emptyQueries': [r['query'] for r in empty],
    }


def main(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument('--report', action='store_true',
                        help='print every query as it is measured')
    parser.add_argument('--limit', type=int, default=0,
                        help='cap the purchase-intent queries, for a quick run')
    args = parser.parse_args(argv)

    catalogue = json.loads(io.open(CATALOGUE, encoding='utf-8').read())['products']
    skus = json.loads(
        io.open(os.path.join(ROOT, 'tools', 'data', 'top-skus.json'),
                encoding='utf-8').read())['captures'][0]['items']
    if args.limit:
        skus = skus[:args.limit]
    intent = [mc.query_for(item) for item in skus]

    print('Measuring what the live upstream read is worth. Open question 14.')
    print('%d purchase-intent queries, %d browse queries, no query log (section 14).'
          % (len(intent), len(BROWSE)))
    print('')
    print('Purchase intent, somebody naming a product:')
    intent_rows = run(intent, catalogue, 'intent', args.report)
    print('')
    print('Browsing, somebody typing a word:')
    browse_rows = run(BROWSE, catalogue, 'browse', args.report)

    parts = [summarise(intent_rows, 'intent'), summarise(browse_rows, 'browse')]
    rows = intent_rows + browse_rows
    total = summarise(rows, 'all')

    print('')
    print('=' * 72)
    for part in parts + [total]:
        if not part.get('queries'):
            continue
        print('%-9s %3d queries | upstream answers %3d | catalogue answers %3d | '
              'goes empty %3d (%d of those only because of the matcher) | '
              'scorable results lost %4d'
              % (part['kind'], part['queries'], part['queriesUpstreamAnswers'],
                 part['queriesCatalogueAnswers'], part['queriesThatGoEmpty'],
                 part['emptyOnlyBecauseOfTheMatcher'], part['scorableResultsLost']))
    print('')
    print('"Goes empty" is the number that matters: queries where upstream returns')
    print('something scorable and the catalogue returns nothing at all. A visitor')
    print('there sees an empty page rather than a shorter one.')

    io.open(OUT, 'w', encoding='utf-8', newline='\n').write(json.dumps({
        '_readme': ('What a visitor would stop seeing if the live upstream read '
                    'went away. Open question 14, which gates M32. Queries are '
                    'chosen rather than sampled: this site has no analytics and '
                    'section 14 says that is a decision. Evidence about the shape '
                    'of the loss, not a measurement of visitor behaviour.'),
        'measured': time.strftime('%Y-%m-%d'),
        'catalogueEntries': len(catalogue),
        'summary': parts + [total],
        'rows': rows,
    }, ensure_ascii=False, indent=1) + '\n')
    print('Written to %s' % os.path.relpath(OUT, ROOT))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
