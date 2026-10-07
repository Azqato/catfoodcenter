/* Tests for premix expansion (M24).
 *
 * Written before the change, because the change moves scores and a test
 * written afterwards only records what the code does.
 *
 * The test that matters most is the one that does NOT expand: a bracketed note
 * after a real ingredient ("chicken fat [preserved with mixed tocopherols,
 * rosemary extract]") must keep its entry whole, because expanding it would
 * delete chicken fat from the list. A rule that is right about Purina's two
 * prints and wrong about that one would be a silent deletion of the first
 * ingredient of a food. */
import { expandGroups, _internal } from './ingredients.js';
import { scoreProduct } from './scoring.js';
import { suite } from './test-runner.js';

const PURINA = [
  'poultry by-product meal',
  'taurine',
  'MINERALS [zinc sulfate, ferrous sulfate, manganese sulfate, copper sulfate]',
  'VITAMINS [Vitamin E supplement, niacin (Vitamin B-3), menadione sodium bisulfite complex]',
];

suite('premix: a group becomes its members', (t) => {
  const out = expandGroups(PURINA);

  t.equal(out.length, 9, 'four entries become nine, because two of them were seven');
  t.equal(out[0], 'poultry by-product meal', 'the list keeps its order');
  t.equal(out[1], 'taurine', 'and everything that was not a group is untouched');
  t.equal(out[2], 'zinc sulfate', 'the first mineral takes the group position');
  t.equal(out.includes('MINERALS [zinc sulfate, ferrous sulfate, manganese sulfate, copper sulfate]'),
    false, 'the heading does not survive as an ingredient, because it is not one');
  t.equal(out[out.length - 1], 'menadione sodium bisulfite complex',
    'and the additive that earns the Tier 3 flag is now an entry of its own, which is '
    + 'the whole point: the flag belongs on it and not on the eleven vitamins beside it');
});

suite('premix: nesting inside a member survives', (t) => {
  const out = expandGroups(['VITAMINS [niacin (Vitamin B-3), pyridoxine hydrochloride (Vitamin B-6)]']);

  t.equal(out.length, 2, 'two members, not four');
  t.equal(out[0], 'niacin (Vitamin B-3)', 'a parenthesised gloss travels with its member');
});

suite('premix: what must never be expanded', (t) => {
  const note = ['chicken fat [preserved with mixed tocopherols, rosemary extract]'];
  t.equal(expandGroups(note)[0], note[0],
    'a bracketed note after a real ingredient stays whole: expanding it would delete '
    + 'chicken fat from the ingredient list');

  const single = ['MINERALS [zinc sulfate]'];
  t.equal(expandGroups(single)[0], single[0],
    'one member is not a list, so nothing is gained by unwrapping it and the heading '
    + 'would be lost for no reason');

  const round = ['meat and animal derivatives (including chicken, 4%)'];
  t.equal(expandGroups(round)[0], round[0],
    'round brackets usually qualify an ingredient, and the heading test is what keeps '
    + 'this whole now that bracket shape no longer does: splitting it would invent two '
    + 'ingredients that are not on the label');

  const preservative = ['Mixed Tocopherols (Preservative)'];
  t.equal(expandGroups(preservative)[0], preservative[0],
    'one member is not a list whichever bracket it arrives in');

  t.equal(expandGroups(['chicken', 'rice']).length, 2, 'a list with no group comes back as it was');
  t.equal(expandGroups([]).length, 0, 'an empty list is not an error');
  t.equal(expandGroups(null).length, 0, 'and neither is no list at all');
});

suite('premix: parentheses are a premix too', (t) => {
  // Dr. Elsey's cleanprotein prints the same premix Purina prints, in round
  // brackets. Until 2026-10-07 it arrived as one ingredient, which was the
  // exact condition M24 shipped to fix, met again in different punctuation.
  const elseys = expandGroups([
    'chicken',
    'Vitamins (Niacin Supplement, Vitamin E Supplement, Menadione Sodium Bisulfite Complex)',
  ]);
  t.equal(elseys.length, 4, 'two entries become four, because one of them was three');
  t.equal(elseys[0], 'chicken', 'and the real ingredient is untouched and in place');
  t.equal(elseys[3], 'Menadione Sodium Bisulfite Complex',
    'the additive is now an entry of its own, so the Tier 3 flag lands on it rather '
    + 'than on the two vitamins beside it');

  const nested = expandGroups(['MINERALS (zinc proteinate, pyridoxine hydrochloride (Vitamin B-6))']);
  t.equal(nested.length, 2, 'a member may carry its own parentheses');
  t.equal(nested[1], 'pyridoxine hydrochloride (Vitamin B-6)', 'and keeps its gloss');
});

suite('premix: which headings count', (t) => {
  const { isGroupHeading } = _internal;
  t.equal(isGroupHeading('VITAMINS'), true, 'the printed form');
  t.equal(isGroupHeading('vitamins'), true, 'and any case of it');
  t.equal(isGroupHeading('Added Vitamins:'), true, 'trailing punctuation is not part of the word');
  t.equal(isGroupHeading('trace minerals'), true, 'a two-word heading');
  t.equal(isGroupHeading('chicken meal'), false, 'an ingredient is not a heading');
  t.equal(isGroupHeading('vitamin E supplement'), false,
    'and neither is a single vitamin, which is the near-miss this list has to survive: '
    + 'it starts with a heading word and is an ingredient');
  t.equal(isGroupHeading(''), false, 'nothing is not a heading');
});

/* ── What expansion does to a score ──

   The claim in ingredients.js is that expansion never lowers a score, because
   tier matching runs against the joined text of the whole list and only the
   Tier 0 credit is per entry. That is reasoning, and reasoning is what this
   project keeps catching itself being wrong about, so here it is as an
   arithmetic fact on a product that is not capped. ── */

const SCORE_KB = {
  additives: [
    { id: 'taurine', name: 'Supplemental taurine', tier: 0, aliases: ['taurine'], sources: [] },
    { id: 'carrageenan', name: 'Carrageenan', tier: 2, aliases: ['carrageenan'], sources: [] },
  ],
  vagueTerms: [],
};

suite('premix: expansion cannot cost a product points', (t) => {
  const base = {
    barcode: '1', name: 'Test', format: 'dry', ingredientsLang: 'en',
    nutrition: { crudeProteinPct: 34, crudeFatPct: 14, crudeFibrePct: 3, moisturePct: 10, confidence: 'high' },
    dataCompleteness: 'full',
  };
  const collapsed = ['chicken', 'rice', 'chicken fat', 'carrageenan',
    'VITAMINS [Vitamin E supplement, taurine, niacin]'];
  const before = scoreProduct({ ...base, ingredients: collapsed }, SCORE_KB);
  const after = scoreProduct({ ...base, ingredients: expandGroups(collapsed) }, SCORE_KB);

  t.equal(before.scorable && after.scorable, true, 'both are scorable, so the comparison means something');
  t.equal(after.score >= before.score, true,
    `expanding a premix did not lower the score (${before.score} then ${after.score})`);
  t.equal(after.flaggedAdditives.length, before.flaggedAdditives.length,
    'and it neither adds nor removes a Tier 2 or Tier 3 flag, because those are matched '
    + 'against the whole list and never against one entry');
});
