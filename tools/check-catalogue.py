# -*- coding: utf-8 -*-
"""Gate: the curated catalogue is well formed and says where its data came from.

    python tools/check-catalogue.py

assets/data/catalogue.json carries product data transcribed by hand where Open
Pet Food Facts has none. That data is published under this site's name and
feeds the same scoring engine as everything else, so it is held to the same
standard as an upstream record and to one the upstream is not: every entry has
to say where it was read and when.

This is a gate rather than a review checklist because the failure it prevents
is quiet. A mistyped key is ignored by the merge and the figure simply never
appears; an implausible transcription produces a wrong score that looks exactly
like a right one. Neither shows up in a diff as anything but a number.

It also checks the raw panel captures in tools/data/panels/, which hold what
the label printed rather than what this site scores. See PRD section 12.11 for
why they exist and why they are not part of an entry.

The bands and the reasoning behind them are docs/PRD.md sections 12.5 and 16.5a.
"""
import datetime
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, 'assets', 'data', 'catalogue.json')

# Mirrors DATA_FIELDS in assets/js/catalogue.js. A key outside this set is
# rejected rather than ignored: the merge would skip it in silence, and a
# curated figure that never reaches the page is indistinguishable from one
# nobody transcribed.
DATA_FIELDS = {
    'ingredientsText',
    'crudeProteinPct', 'crudeFatPct', 'crudeFibrePct', 'ashPct', 'moisturePct',
    'kcalPer100g', 'taurinePresent',
    # Published by many panels and scored by nothing. See the note beside them
    # in assets/js/catalogue.js: recorded and shown, deliberately not scored.
    'omega3Pct', 'epaPct', 'dhaPct', 'vitaminEIuPerKg',
    'name', 'brand', 'quantity', 'format', 'lifeStage', 'aafcoComplete',
}
META_FIELDS = {'barcode', 'source', 'sourceKind', 'checked', 'note'}
# Not data in its own right: it says what language the list beside it is in.
# An entry carrying only this carries nothing.
MODIFIER_FIELDS = {'ingredientsLang'}
SOURCE_KINDS = {'manufacturer', 'retailer-listing'}

# Mirrors PROVISIONAL_KEY in assets/js/catalogue.js. An entry may be filed
# under one of these while its panel is published and its barcode is not.
#
# It can never be all digits, and that is the safety property rather than a
# naming convention: every 6 to 14 digit string is somebody's real barcode, so
# a numeric placeholder could be scanned into by a visitor holding an unrelated
# product, who would be shown this product's score with nothing indicating a
# mistake. A scanner emits digits only, so a key with letters in it cannot be
# produced by one.
PROVISIONAL = re.compile(r'^CFC-[a-z0-9]+(?:-[a-z0-9]+)+$')

# The same plausibility gate the normaliser applies to upstream figures
# (PRD 12.5 item 2). Ours are not exempt: a transcription error is as wrong as
# a data-entry error, and being ours does not make it truer.
BANDS = {
    # 65, not 50, since 2026-09-09. See the note beside PLAUSIBLE in
    # assets/js/opff.js: a manufacturer's published 59% was rejected as
    # impossible by a band drawn from supermarket food.
    'crudeProteinPct': (3, 65),
    'crudeFatPct': (0.5, 40),
    'crudeFibrePct': (0, 15),
    'ashPct': (0, 15),
    'moisturePct': (0, 92),
    'kcalPer100g': (15, 600),
    # Read off the panels this project has captured, where omega-3 minimums run
    # 0.02% to 1.6% and vitamin E runs 100 to 150 IU/kg. The bands are wider
    # than that on purpose: a band drawn tight around twenty-nine panels would
    # reject the thirtieth for being unusual rather than for being wrong, which
    # is the mistake the protein band already made once at 50%.
    'omega3Pct': (0, 8),
    'epaPct': (0, 5),
    'dhaPct': (0, 5),
    'vitaminEIuPerKg': (10, 2000),
}

# PRD 12.11: everything the panel prints is captured, including the figures
# nothing scores. It lives here rather than on the catalogue entry because
# catalogue.json is fetched by every visitor and precached by the service
# worker, and a hundred verbatim panels would be most of a megabyte of data no
# page reads. Nothing under tools/ is served, so the capture costs a visitor
# nothing and costs a future field nothing to backfill from.
PANELS = os.path.join(ROOT, 'tools', 'data', 'panels')
PANEL_REQUIRED = {'barcode', 'source', 'sourceKind', 'checked', 'text'}
PANEL_OPTIONAL = {'capturedFrom', 'analysis', 'statements'}
CAPTURE_KINDS = {'html', 'pdf', 'photo', 'manual'}

# A capture is a second reading of the panel the entry was read from, so the
# two can be compared, and a transcription error shows up as a disagreement
# between them. This is not the plausible bands by another name: the bands
# judge the label, and ask whether 59% protein can be true. This judges the
# transcription, and asks whether the entry says what the panel said. It is the
# only check in this project that can catch a right-looking wrong number.
# What each entry field is called on a printed panel. More than one spelling
# per field, because more than one spelling exists: Purina's older decks print
# "Crude Protein (Min)" and its newer table decks print "Protein (Min)" in a
# grid headed "Nutrients / Guaranteed / per cup". The fallbacks are ordered
# after the specific ones and matched the same way.
#
# **A field whose printed label is not listed here is not cross-checked, and
# that failure is silent.** It does not fail the gate, it does not warn, and
# the entry looks exactly as verified as one that passed. That is the argument
# for keeping this list honest: the cross-check is the only thing in the
# project that catches a wrong number which looks right, and a label it cannot
# recognise switches it off for that figure without saying so.
CROSS_CHECK = {
    'crudeProteinPct': ('crude protein', 'protein'),
    'crudeFatPct': ('crude fat', 'fat'),
    'crudeFibrePct': ('crude fib', 'dietary fib', 'fib'),
    'moisturePct': ('moisture',),
    'ashPct': ('crude ash', 'ash'),
    # The panel prints these inside a parenthesised gloss, as "Omega-3 Fatty
    # Acids* (Min) 0.40%" and "Eicosapentaenoic Acid (EPA) (Min) 0.06%", so the
    # chemical name is the reliable half of the label and the abbreviation is
    # the one a reader recognises. Both are listed.
    'omega3Pct': ('omega-3', 'omega 3'),
    'epaPct': ('eicosapentaenoic', 'epa'),
    'dhaPct': ('docosahexaenoic', 'dha'),
    'vitaminEIuPerKg': ('vitamin e',),
}

FORMATS = {'wet', 'dry', 'unknown'}
LIFE_STAGES = {'growth', 'adult', 'all', 'unknown'}


def check(entry, key, problems):
    def bad(message):
        problems.append('%s: %s' % (key, message))

    if not isinstance(entry, dict):
        bad('entry is not an object')
        return

    unknown = set(entry) - DATA_FIELDS - META_FIELDS - MODIFIER_FIELDS
    if unknown:
        bad('unknown key(s): %s' % ', '.join(sorted(unknown)))

    if entry.get('barcode') != key:
        bad('barcode field %r does not match its key' % entry.get('barcode'))
    if not re.match(r'^\d{6,14}$', str(key)) and not PROVISIONAL.match(str(key)):
        bad('key is neither a 6 to 14 digit barcode nor a provisional CFC-... key')

    if PROVISIONAL.match(str(key)):
        # The point of a provisional key is that it is temporary, and the thing
        # that makes a temporary key permanent is nobody being able to see why
        # it was needed. So the entry has to say.
        if 'note' not in entry or 'barcode' not in (entry.get('note') or '').lower():
            bad('a provisional key needs a note saying what was searched and what '
                'came back, or it will still be here in a year')
        if entry.get('sourceKind') != 'manufacturer':
            bad('a provisional key is only for a manufacturer panel. A retailer '
                'listing that cannot be tied to a barcode is not evidence of a product')

    source = (entry.get('source') or '').strip()
    if not source:
        bad('no source. Every entry says where it was read')
    if entry.get('sourceKind') not in SOURCE_KINDS:
        bad('sourceKind must be one of %s' % ', '.join(sorted(SOURCE_KINDS)))

    checked = entry.get('checked')
    try:
        when = datetime.date.fromisoformat(str(checked))
    except (TypeError, ValueError):
        bad('checked must be an ISO date, got %r' % checked)
    else:
        if when > datetime.date.today():
            bad('checked date %s is in the future' % checked)

    data = set(entry) & DATA_FIELDS
    if not data:
        bad('carries no data. An entry that overrides nothing has no reason to exist')

    for field, (low, high) in BANDS.items():
        if field not in entry:
            continue
        value = entry[field]
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            bad('%s must be a number, got %r' % (field, value))
        elif not low <= value <= high:
            bad('%s is %s, outside the plausible band %s to %s' % (field, value, low, high))

    if 'ingredientsText' in entry:
        text = (entry['ingredientsText'] or '').strip()
        if len(text) < 20:
            bad('ingredientsText is too short to be a real list')
        # An entry that supplies a list without naming its language would be
        # read as unknown and treated as unreadable. That is the safe default,
        # but here it is almost certainly an omission, so it is refused.
        if not (entry.get('ingredientsLang') or '').strip():
            bad('ingredientsText without ingredientsLang. Say what language it is in')

    if 'ingredientsLang' in entry and 'ingredientsText' not in entry:
        bad('ingredientsLang without an ingredientsText for it to describe')

    if 'format' in entry and entry['format'] not in FORMATS:
        bad('format must be one of %s' % ', '.join(sorted(FORMATS)))
    if 'lifeStage' in entry and entry['lifeStage'] not in LIFE_STAGES:
        bad('lifeStage must be one of %s' % ', '.join(sorted(LIFE_STAGES)))
    if 'aafcoComplete' in entry and not isinstance(entry['aafcoComplete'], bool):
        bad('aafcoComplete must be true or false, or absent where it is unknown')
    if 'taurinePresent' in entry and entry['taurinePresent'] is not True:
        bad('taurinePresent records only a positive declaration, so it is true or absent')


def check_panel(panel, key, entry, problems):
    """Shape, not meaning.

    PRD 12.11 rule 3: the plausible bands exist to protect scores, and nothing
    in here is scored, so a figure this file holds is checked for being a
    string and not for being believable. The one thing that is enforced beyond
    shape is that a capture and its entry were the same reading of the same
    panel, because a record whose parsed fields are current and whose raw text
    is two years stale is worse than no record.
    """
    def bad(message):
        problems.append('panels/%s.json: %s' % (key, message))

    if not isinstance(panel, dict):
        bad('capture is not an object')
        return

    missing = PANEL_REQUIRED - set(panel)
    if missing:
        bad('missing %s' % ', '.join(sorted(missing)))
    unknown = set(panel) - PANEL_REQUIRED - PANEL_OPTIONAL
    if unknown:
        bad('unknown key(s): %s' % ', '.join(sorted(unknown)))

    if panel.get('barcode') != key:
        bad('barcode field %r does not match its filename' % panel.get('barcode'))

    text = panel.get('text')
    if not isinstance(text, str):
        bad('text must be a string')
    elif len(text.strip()) < 40:
        bad('text is too short to be a captured panel')

    if entry is None:
        bad('no catalogue entry for this barcode. A capture records the panel an '
            'entry was read from, so it does not stand alone')
    else:
        for field in ('source', 'sourceKind', 'checked'):
            if panel.get(field) != entry.get(field):
                bad('%s is %r and the catalogue entry says %r. One reading, one date'
                    % (field, panel.get(field), entry.get(field)))

    kind = panel.get('capturedFrom')
    if kind is not None and kind not in CAPTURE_KINDS:
        bad('capturedFrom must be one of %s' % ', '.join(sorted(CAPTURE_KINDS)))

    analysis = panel.get('analysis')
    if analysis is not None:
        if not isinstance(analysis, dict):
            bad('analysis must be an object of label to printed value')
        else:
            for label, value in analysis.items():
                if not isinstance(value, str) or not str(value).strip():
                    bad('analysis[%r] must be the value as printed, got %r' % (label, value))

    statements = panel.get('statements')
    if statements is not None:
        if not isinstance(statements, list):
            bad('statements must be a list of sentences as printed')
        elif not all(isinstance(s, str) and s.strip() for s in statements):
            bad('every statement is a non-empty string, as printed')




def cross_check(entry, panel, key, problems):
    """What the entry claims against what the capture recorded.

    Only where both hold the figure. A capture whose reader missed a line is a
    thinner record, not a contradiction, and failing the gate for it would
    punish the entry for the reader's gap. A disagreement is different: one of
    the two readings of one panel is wrong, and neither the score nor the
    record can be trusted until somebody says which.
    """
    def bad(message):
        problems.append('%s: %s' % (key, message))

    analysis = panel.get('analysis') or {}
    if not isinstance(analysis, dict):
        return
    for field, needles in CROSS_CHECK.items():
        if field not in entry:
            continue
        printed = []
        for needle in needles:
            # Most specific spelling first, and the first one that matches
            # wins: "fat" would otherwise pick up "Crude Fat" and "Total Fat"
            # indifferently, and the specific spelling is the one the panel
            # actually used.
            printed = [v for label, v in analysis.items()
                       if isinstance(label, str) and needle in label.lower()]
            if printed:
                break
        if not printed:
            continue
        number = re.match(r'([\d.]+)', str(printed[0]).strip())
        if not number:
            continue
        if abs(float(number.group(1)) - entry[field]) > 0.001:
            bad('%s is %s and the captured panel prints %r. One of the two readings is wrong'
                % (field, entry[field], printed[0]))

    kcal = [v for v in analysis.values() if isinstance(v, str) and 'kcal/kg' in v]
    if kcal and 'kcalPer100g' in entry:
        number = re.match(r'([\d,]+)', kcal[0].strip())
        if number:
            perkg = float(number.group(1).replace(',', ''))
            if abs(entry['kcalPer100g'] - perkg / 10.0) > 0.05:
                bad('kcalPer100g is %s and the captured panel prints %r'
                    % (entry['kcalPer100g'], kcal[0]))


def read_panels(problems):
    """Every capture on disk, keyed by barcode."""
    found = {}
    if not os.path.isdir(PANELS):
        return found
    for name in sorted(os.listdir(PANELS)):
        if not name.endswith('.json'):
            continue
        key = name[:-len('.json')]
        try:
            found[key] = json.loads(io.open(os.path.join(PANELS, name), encoding='utf-8').read())
        except ValueError as exc:
            problems.append('panels/%s: not valid JSON: %s' % (name, exc))
    return found


def main():
    if not os.path.exists(PATH):
        print('No catalogue at %s.' % os.path.relpath(PATH, ROOT))
        return 1
    try:
        data = json.loads(io.open(PATH, encoding='utf-8').read())
    except ValueError as exc:
        print('FAIL  catalogue.json is not valid JSON: %s' % exc)
        return 1

    products = data.get('products')
    if not isinstance(products, dict):
        print('FAIL  no "products" object')
        return 1

    problems = []
    for key in sorted(products):
        check(products[key], key, problems)

    provisional = sorted(k for k in products if PROVISIONAL.match(str(k)))

    panels = read_panels(problems)
    for key in sorted(panels):
        check_panel(panels[key], key, products.get(key), problems)
        if isinstance(panels[key], dict) and key in products:
            cross_check(products[key], panels[key], key, problems)

    for key in sorted(products):
        entry = products[key]
        name = (entry.get('name') or entry.get('ingredientsText') or '')[:38]
        fields = sorted(set(entry) & DATA_FIELDS)
        print('  %-14s %-12s %-10s %s' % (key, entry.get('sourceKind', '?'),
                                          entry.get('checked', '?'), ', '.join(fields)))
        if name:
            print('  %-14s %s' % ('', name))
        panel = panels.get(key)
        if panel:
            print('  %-14s panel captured, %d characters%s' % (
                '', len(panel.get('text') or ''),
                ', %d figures' % len(panel['analysis']) if panel.get('analysis') else ''))

    if provisional:
        print('')
        print('  %d entr%s awaiting a real barcode. Each is searchable and scorable,'
              % (len(provisional), 'y' if len(provisional) == 1 else 'ies'))
        print('  and none of them can be scanned. See PRD section 12.12.')
        for key in provisional:
            print('    %-46s %s' % (key, (products[key].get('name') or '')[:30]))

    print('')
    if problems:
        for p in problems:
            print('FAIL  %s' % p)
        print('\n%d entr%s, %d problem(s).'
              % (len(products), 'y' if len(products) == 1 else 'ies', len(problems)))
        return 1
    # Not a failure. Captures are backfilled as products are revisited, and an
    # entry written before PRD 12.11 existed is not wrong, only thinner.
    print('%d entr%s, all sourced, within the plausible bands, and agreeing with '
          'the %d raw panel(s) captured.'
          % (len(products), 'y' if len(products) == 1 else 'ies', len(panels)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
