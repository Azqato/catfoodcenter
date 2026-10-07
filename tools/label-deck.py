# -*- coding: utf-8 -*-
"""Read a manufacturer label deck and print a catalogue entry for it.

    python tools/label-deck.py <pdf-url> [barcode]

Nestle Purina publishes a PDF per product under purina.com/sites/default/files
carrying the printed label verbatim: the guaranteed analysis, the ingredient
list in order, and the AAFCO adequacy statement. That is the manufacturer's own
published panel, which is what `sourceKind: "manufacturer"` means in
assets/data/catalogue.json, and it is the best source this project has found.

**Why this exists rather than reading the PDF by eye.** Section 16.5a holds a
curated figure to the same standard as an upstream record, and
tools/check-catalogue.py gates the shape of it. Neither catches a digit typed
wrong. A transcription that goes straight from the published panel to JSON
without passing through anybody's short-term memory removes the error the gate
cannot see. What this prints is a proposal, not an entry: read it against the
PDF before pasting it in, because the parser below can misread a layout it has
not met and the reviewer is the last check there is.

**This is a maintenance aid, not part of the site.** Nothing the visitor loads
runs it, and the site does not depend on it. It needs PyMuPDF (`pip install
pymupdf`), the only dependency any tool in this repository has, and it says so
rather than failing obscurely if it is absent. ADR-001 forbids a build step and
an npm toolchain; a Python library used once per transcribed product, offline,
by the maintainer, is neither.

**purina.com serves the file store but refuses the site.** A plain request for
a page under /cats/ returns 403, while the PDFs under /sites/default/files
serve normally to a browser user-agent. So this fetches the PDF directly, and
finding the URL is a search rather than a crawl. Do not point this at the pages.
"""
import io
import json
import os
import re
import sys
import urllib.request

# The label deck states percentages as they are printed: a minimum for protein
# and fat, a maximum for fibre, moisture and ash. The scoring engine reads them
# as as-fed percentages, which is what section 12.5 says an upstream figure is
# too. A guaranteed minimum is not the assayed value, and neither is the
# database's number; treating them alike is the honest option, and the
# alternative, inventing a midpoint, would be a figure nobody published.
# Each field is tried in order of specificity, most specific first.
#
# **The second pattern in each pair is a different label layout, and it was
# found the hard way.** Kitten Chow Year One Essentials prints a table headed
# "Nutrients / Guaranteed / per cup" with rows reading "Protein (Min) 40.0%",
# where every other deck this tool had met prints "Crude Protein (Min) 40.0%".
# The parser found moisture, which is spelled the same either way, and quietly
# reported no protein, fat or fibre. A product that states no protein and a
# product whose protein this tool cannot read are indistinguishable in the
# output, which is what made this worth fixing rather than working around.
#
# The fallbacks require the printed "(Min)" or "(Max)" and that is not
# decoration: a bare search for "protein" finds "corn protein meal" in the
# ingredient list, and a bare search for "fat" finds "animal fat preserved
# with mixed tocopherols". The guarantee always qualifies its figures and an
# ingredient list never does.
GA_FIELDS = [
    ('crudeProteinPct', [r'crude\s+protein', r'\bprotein\s*\((?:min|max)']),
    ('crudeFatPct', [r'crude\s+fat', r'\bfat\s*\((?:min|max)']),
    ('crudeFibrePct', [r'crude\s+fib(?:er|re)',
                       r'\b(?:dietary\s+)?fib(?:er|re)\s*\((?:min|max)']),
    ('moisturePct', [r'moisture']),
    ('ashPct', [r'(?:crude\s+)?ash']),
    # No bare fallback for any of these four, and that is the same argument the
    # comment above makes: "vitamin e" without the "(Min)" finds "Vitamin E
    # Supplement" in the ingredient list on nearly every dry food, and "dha"
    # without it finds the gloss in "Docosahexaenoic Acid (DHA)" rather than a
    # figure. The guarantee always qualifies its numbers.
    ('omega3Pct', [r'omega[\s-]*3[^\n]{0,24}?\((?:min|max)']),
    ('epaPct', [r'eicosapentaenoic[^\n]{0,24}?\((?:min|max)',
                r'\(epa\)\s*\((?:min|max)']),
    ('dhaPct', [r'docosahexaenoic[^\n]{0,24}?\((?:min|max)',
                r'\(dha\)\s*\((?:min|max)']),
    ('vitaminEIuPerKg', [r'vitamin\s+e\s*\((?:min|max)']),
]
TAURINE = r'taurine'

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/140.0 Safari/537.36')


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/pdf,*/*'})
    return urllib.request.urlopen(request, timeout=60).read()


def text_of(pdf_bytes):
    try:
        import fitz
    except ImportError:
        print('This tool needs PyMuPDF. Install it with:  pip install pymupdf')
        print('It is a maintenance dependency only. Nothing the site loads uses it.')
        raise SystemExit(2)
    document = fitz.open(stream=pdf_bytes, filetype='pdf')
    return '\n'.join(page.get_text() for page in document)


def flatten(text):
    """One space-separated line, so a value that wrapped still follows its label."""
    return re.sub(r'\s+', ' ', text)


def find_percent(flat, label):
    """The first percentage after `label`, or None.

    Bounded deliberately: a label whose value is missing must not silently
    capture the next row's number, which is how a fibre maximum ends up
    recorded as an ash maximum. 60 characters covers "Crude Protein (Min)
    32.0%" and every wrapped variant seen, and not the row after it.
    """
    match = re.search(label + r'[^%\n]{0,60}?([0-9]+(?:\.[0-9]+)?)\s*%', flat, re.I)
    return float(match.group(1)) if match else None


def find_ingredients(text):
    match = re.search(r'INGREDIENTS?\s*:\s*(.+?)(?:\n\s*\n|GUARANTEED|CALORIE|FEEDING|Manufactured by|$)',
                      text, re.I | re.S)
    if not match:
        return None
    listing = flatten(match.group(1)).strip()
    # Purina prints the label's own revision code after the last ingredient
    # ("... taurine, salt. D662122"), and left alone it is split on the comma
    # before it and rendered on the product page as an ingredient nobody can
    # look up. It is the printer's reference, not a component of the food.
    listing = re.sub(r'[\s.]*\b[A-Z]{1,2}[0-9]{5,}\b[\s.]*$', '', listing)
    return listing.rstrip('.').strip() or None


def find_aafco(text):
    """The adequacy statement, from the start of its own sentence.

    Matched line by line rather than over the flattened text. The statement
    follows the manufacturer's address, which contains "St. Louis", so a match
    anchored on the preceding full stop starts at "Louis, MO 63164 USA ...".
    The line break is the reliable boundary; the deck puts the statement on its
    own paragraph.
    """
    lines = [flatten(block).strip() for block in text.split('\n')]
    joined = []
    for index, line in enumerate(lines):
        joined.append(' '.join(lines[index:index + 3]).strip())
    for claim in (r'is formulated to meet the nutritional levels', r'Animal feeding tests'):
        for candidate in joined:
            # Find the claim, then walk back to the start of its sentence
            # rather than requiring it near the start of the block. A PDF puts
            # the statement in a paragraph of its own; a web page buries the
            # same sentence at the end of three paragraphs about transitioning
            # your cat's food, and a window measured from the block's start
            # finds it in one source and not the other.
            found = re.search(claim, candidate, re.I)
            if not found:
                continue
            head = candidate[:found.start()]
            begin = max(head.rfind('. '), head.rfind('\u2022'))
            sentence = candidate[begin + 1:] if begin >= 0 else candidate
            match = re.search(r'^(\s*.*?' + claim + r'[^.]*\.)', sentence, re.I)
            if match:
                # The address often shares the paragraph. Drop it: the
                # statement begins after the country, and what matters to the
                # reviewer is the claim, not who printed it.
                return re.sub(r'^.*\bUSA\b\s*', '', match.group(1)).strip()
    return None


# Words that state the format outright, and words that only imply it.
#
# **The distinction exists because "Gravy Swirlers" is a dry food.** The first
# version of this tested the implying words first and labelled Friskies Gravy
# Swirlers wet, from a title and a file name that both say "dry", because
# "gravy" appeared earlier in the list. A texture word names what the food is
# like; only "wet", "dry", "canned" and "kibble" name what it is.
FORMAT_STATED = [
    ('dry', r'\b(?:dry|kibble)\b'),
    ('wet', r'\b(?:wet|canned)\b'),
]
FORMAT_IMPLIED = [
    ('wet', r'\b(?:pat[eé]|gravy|in sauce|chunks|entr[eé]e|mousse|broth)\b'),
    ('dry', r'\b(?:crunchy|crisps)\b'),
]


def product_format(title, url, moisture=None):
    """Wet or dry, from the deck title and the file name, or nothing.

    Guessing here is cheap to get wrong and the entry is better without it: an
    unknown format costs a filter facet, while a wrong one puts the product in
    the wrong comparison and changes how its moisture reads.

    Moisture settles a disagreement when it is known, and it settles it the
    right way round: no wet food is 12% water and no dry food is 78%. It is
    passed in rather than read here because this decides the label's claim and
    the caller is what holds the label's figures.
    """
    hay = '%s %s' % (title or '', url or '')
    for words in (FORMAT_STATED, FORMAT_IMPLIED):
        for value, pattern in words:
            if re.search(pattern, hay, re.I):
                if moisture is None:
                    return value
                # A stated format that contradicts the guarantee is a reading
                # error somewhere, and the guarantee is the harder evidence.
                if value == 'wet' and moisture <= 20:
                    return 'dry'
                if value == 'dry' and moisture >= 60:
                    return 'wet'
                return value
    if moisture is not None:
        return 'dry' if moisture <= 20 else 'wet' if moisture >= 60 else None
    return None


def life_stage(aafco, title):
    """Which life stage the adequacy statement claims.

    Order matters and the reason is a bug this tool had. Friskies Sea
    Captain's Choice is formulated "for growth of kittens and maintenance of
    adult cats", and a rule that tested for "growth" first labelled an
    all-life-stages food as kitten food. A statement naming both stages means
    both, so both are tested for before either is tested for alone.
    """
    hay = '%s %s' % (aafco or '', title or '')
    growth = re.search(r'\b(?:kitten|growth)\b', hay, re.I)
    adult = re.search(r'\b(?:adult|maintenance)\b', hay, re.I)
    if re.search(r'all life stages', hay, re.I) or (growth and adult):
        return 'all'
    if growth:
        return 'growth'
    if adult:
        return 'adult'
    return None


def main(argv):
    if not argv:
        print(__doc__.strip().split('\n\n')[1])
        return 2
    url = argv[0]
    barcode = argv[1] if len(argv) > 1 else 'PUT-THE-BARCODE-HERE'

    raw = text_of(fetch(url))
    flat = flatten(raw)
    title = raw.strip().split('\n')[0].strip()

    entry = {'barcode': barcode, 'source': url, 'sourceKind': 'manufacturer'}

    for field, labels in GA_FIELDS:
        for label in labels:
            value = find_percent(flat, label)
            if value is not None:
                entry[field] = value
                break

    # Only a positive declaration is recorded. Silence about taurine is not a
    # statement that there is none, and section 16.5a keeps `taurinePresent`
    # true-or-absent for exactly that reason.
    if find_percent(flat, TAURINE) is not None or re.search(r'\btaurine\b', raw, re.I):
        entry['taurinePresent'] = True

    listing = find_ingredients(raw)
    if listing:
        entry['ingredientsText'] = listing
        # Every label deck here is a US package, printed in English. Stated
        # rather than assumed: an unnamed language is treated as unreadable,
        # which is section 12.4's lesson and the one place a default would undo
        # it.
        entry['ingredientsLang'] = 'en'

    fmt = product_format(title, url, entry.get('moisturePct'))
    if fmt:
        entry['format'] = fmt

    aafco = find_aafco(raw)
    if aafco:
        entry['aafcoComplete'] = True
        stage = life_stage(aafco, title)
        if stage:
            entry['lifeStage'] = stage

    print('# %s' % title)
    print('# AAFCO: %s' % (aafco or 'not found in this deck'))
    print('# Check every figure below against the PDF before pasting it in.')
    print(json.dumps({barcode: entry}, ensure_ascii=False, indent=2))
    missing = [f for f, _ in GA_FIELDS if f not in entry]
    if missing:
        print('# Not found, which may be correct for this product: %s' % ', '.join(missing))
    return 0


if __name__ == '__main__':
    if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    raise SystemExit(main(sys.argv[1:]))
