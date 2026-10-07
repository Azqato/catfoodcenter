# Patch Notes

Running changelog for Cat Food Center. Add an entry to the top for every
meaningful change, and keep [PRD.md](PRD.md) in sync whenever product
behaviour, architecture or a stated rule changes.

Format: newest first, `major.minor.patch`. Pre-launch work lives under `0.x`.

**Entries are historical records and are never rewritten to match the present.**
An entry saying the offline shell held 23 files stays as it is even though it
holds 29 today. See PRD section 23.6.

**This file has been swept twice, and both sweeps are named here rather than
left for a reader to notice.** A sweep changes how something is spelled across
every entry at once; it never changes what an entry claimed. The em-dash
removal of 2026-09-06 is described in `[0.13.0]`. **The milestone renumbering
of 2026-09-27 is described in `[0.48.0]`**: unshipped milestones were renumbered
into working order, so entries below say M29 where they said M27b, M30 where
they said M12, and M34 where they said M27c. Shipped milestones were not
touched. **The concordance in PRD section 13 is authoritative** and should be
read before any entry dated earlier than 2026-09-27.

**Two changelogs were merged here on 2026-09-06.** This file and one at the
repository root had been kept in parallel, numbering the same work
differently: the compare page is `[0.11.0]` in one history and `v0.10.0`
in the other. They could not be interleaved without inventing a reconciliation
that never happened, so the fuller history is the spine below and the second is
preserved in the appendix. Neither history was rewritten; the only change made
to either was the project-wide em-dash sweep described in `[0.13.0]`, which is
punctuation rather than content.

---

## [0.40.0] - 2026-09-10

**A dropped connection walked the crawler through 354 pages in seconds, recorded nothing, and
exited 0 with a summary that read like a real result.**

Fixed
* **`tools/purina-index.py` now stops after eight consecutive page-load failures** and returns a
  non-zero status saying the run did not finish. The first full deck run met a network drop partway
  through, and because each failure was caught and skipped individually it worked through every
  remaining product in seconds, learned nothing from any of them, and printed "45 of 456 read pages
  carried exactly one deck". That is indistinguishable from a genuine low yield. **A run that cannot
  tell "this page has no deck" from "there is no network" reports damage as data**, and the fix is
  for the tool to know the difference rather than for a person to notice afterwards.
* **The work queue was keyed off a missing deck URL, so the 57 products that genuinely have no deck
  would have been re-read on every future run**, forever, and never recorded as answered. It now
  keys off whether the page was read at all. A page with no deck is an answer.

Notes
* The network drop also interrupted `tools/resolve-barcodes.py`, which handled it correctly: it
  saved the seven rows it had, slept, and carried on. That tool was built to be resumable and this
  is the first unplanned test of it.
* No site code changed, so no gate behaviour changed.

## [0.54.2] - 2026-10-07

**A second live check flaked in the same session, and that it was a different check is the point.**
No code change; this entry exists because the observation says something the previous one could not.

Notes
* **"a query that cannot match returns nothing" failed once, reading "0 cards".** The card count was
  correct and the assertion needs two things: zero cards and the words "No matches" on the page. The
  panel had not rendered inside the wait window. Confirmed against upstream rather than assumed:
  **the nonsense query answered 200 in 0.45s.** Two further runs returned 29 of 29.
* **0.54.1 recorded this class of failure in one check and could not distinguish a flaky assertion
  from a flaky dependency. Two different checks in one session distinguishes them.** The timing
  sensitivity is not a property of how either assertion is written; it is a property of waiting on a
  third party inside a fixed window. That is the same shape as the visitor experience the live read
  produces, which is what makes it evidence for open question 12 rather than merely an annoyance.
* **Both failures passed on retry and neither was reported as a pass.** Section 13's runbook calls
  `check-live.py` a smoke check rather than a gate for exactly this reason, and the discipline it
  asks for is confirming against the live API before calling a failure a regression. Done both times.

## [0.54.1] - 2026-10-07

**Live verification of M28 returned 28 of 29, and the two findings were different kinds of thing.**
Recorded separately because collapsing them would have hidden the real one.

Fixed
* **Five pages were not regenerated after `opff.js` gained an import.** `check-live.py` reported
  "module graph preloaded, not discovered" and named search, brands and product as missing
  `barcodes.js`. The `modulepreload` list in the head is computed from the imports rather than
  written down, exactly so it cannot be forgotten, and it was not forgotten: it was not rebuilt.
  **A computed list closes the route where somebody forgets to add an entry and leaves open the
  route where the page holding it is stale**, which is the one that happened. 16.10 measured the
  cost of the serial waterfall this preload collapses at 1794ms of the 2271ms before the first API
  request left the browser, so this was a real regression and not a cosmetic one.
* **The PRD claimed this check "also catches a page that was not rebuilt after an import changed"
  and had never been tested by a failure.** It has now, and the section says so.

Notes
* **The second failure was the documented non-determinism and was confirmed rather than assumed.**
  "unqualified search filters, and discloses it" failed once, reading `filtered=False
  discloses=False`, which means the results label never populated. The runbook says to confirm
  against the live API before treating a live-check failure as a regression, so the upstream search
  endpoint was queried directly: **HTTP 200 in 1.56s, 5 products of 553 matched.** Upstream was
  healthy and fast. Three further runs of the full suite returned 29 of 29. Reported as the flake
  it is, not as a pass and not as a regression.
* **That is the third observed instance of this class and it accumulates against open question 12**,
  which asks whether the live read goes entirely or stays as a fallback. A check that depends on a
  third party is a check that fails for reasons the project did not cause, and the visitor-facing
  version of the same dependency fails in the same way at the moment the visitor is least patient.
  It is weak evidence and it is evidence, so it is written down rather than shrugged off.

## [0.54.0] - 2026-10-07

**Step 5, and M28 is complete. A barcode now points at a product instead of being one.** That is one
sentence and it undoes a constraint that had stood since the catalogue was created: twenty fully
transcribed products that this site can score and could not scan.

Added
* **`assets/data/barcodes.json`**, the barcode index. `catalogue.json` is keyed by barcode, which
  sounds like an index already and is why this took until M28 to exist. It is not one, because
  section 12.10 takes two inputs that fail independently, the panel and the barcode, and making the
  barcode the identity meant **a product with a readable panel and no published UPC could not be
  recorded as scannable at all**. Now the barcode points at the entry, so either can be fixed
  without disturbing the other.
* **`assets/js/barcodes.js`**, and `fetchProduct` consults the index **before the network**. A
  barcode this project resolved to a product is a better answer than whatever upstream says about
  it, for the same reason a manufacturer panel outranks a database record in 16.5a: somebody read it
  off the package deliberately.
* **A third product page state.** A row with a name and no entry means this site knows the product
  and has not read its label, which renders as that rather than as "product not found". **"Not
  found" for a barcode held in a file we maintain would be a false statement about our own data**,
  and the visitor is standing in front of the package, which makes them the cheapest possible source
  for what is missing. It also turns the scanner into a demand signal: what to transcribe next, from
  real visitors rather than from a best-seller list.
* **Eleven checks in `check-catalogue.py`**, which holds them rather than a new tool because every
  one is a check against the catalogue and a separate tool would have to load it anyway and could
  then disagree about what it contains. A key that is not 6 to 14 digits, a key failing its own GTIN
  check digit, a key that is already a catalogue key, a row pointing at an entry that does not
  exist, a second barcode for a product without a note saying why, a row resolving to neither an
  entry nor a name, a missing source, a `sourceKind` outside the three permitted, and a `checked`
  date absent, malformed or in the future. **Verified by writing a file that breaks all of them and
  watching every one fire**, then deleting it.
* **PRD section 12.16**, which is the record of the artefact rather than of the milestone.

Changed
* **The index ships empty, and that is the design rather than an unfinished job.** Section 12.10's
  rule is that the tool proposes and a person decides, every time, and open question 15 is the
  reason: **a valid barcode attached to the wrong product passes every gate in this project**,
  because the check digit validates and the entry is well formed and both halves are individually
  correct. So no tool writes to this file. 60 rows of candidates are on file from step 2 and reading
  them is step 6, which is the owner's time.
* `sourceKind` accepts `manufacturer`, `retailer-listing` and `aggregator`. **`submitted` is
  deliberately absent**: that is M31 and it waits for question 15.
* **A product reached through the index says so.** The footer prints "matched to this product by
  us", with a link to where the barcode came from. It would otherwise have said "no published
  barcode, so this product cannot be scanned yet" about a scan that had just succeeded, and printing
  the number without naming it as ours would pass off a match this project made as one the
  manufacturer published. 16.5a applies to a barcode exactly as it applies to a protein figure.
* `check-catalogue.py` now prints two numbers where it printed one. "20 awaiting a barcode" and "20
  that cannot be scanned" were the same statement until the index existed and are not any more, and
  the second is the one tenet 7 cares about.
* Service worker `v16`. Both new files are needed by the product page, so a `v15` device would fail
  to load a module offline. Same case as `v5`.

Fixed
* **The test runner did not await a suite body, so an `async` suite silently passed with no
  assertions.** `run()` called `body(ctx)` and built its report immediately; an async body's
  assertions landed in the results array afterwards, counted by nobody. **A test that cannot fail is
  worse than a missing test, because the missing one shows up in the count.** Nothing in the suite
  was async when the runner was written, so the trap was set for whoever wrote the first one, which
  was this milestone. `run()` is now `async` and awaits each body; `await` on a non-promise is a
  no-op, so every existing suite is unaffected.
* **Three stale assertion counts in the PRD**, which said 257. The suite is 284.

Notes
* **284 assertions, up from 263.** Among them: a malformed index must load as an empty one rather
  than throw, because the index sits in front of every scan and a bad deploy of it has to degrade
  the scanner rather than break it. The file this site actually ships is loaded and checked too, not
  just a fixture.
* **One branch is knowingly untested and the test file says so.** Provoking `!response.ok` needs a
  fetch that 404s, `run-tests.py` fails the gate on any console error, and a browser logs a 404
  whatever the code does with it. **The choice was between covering three lines and keeping a gate
  that notices every unexpected console error on every page.** The gate is worth more and has caught
  real defects.
* **The second row type shipped as an unresolved judgement and 12.16 says so.** M26 hides unscored
  products on the finding that a column of grey "Not scored" tiles is an honest view of the database
  and a useless view of cat food, and a scan resolving to a named but unscored product is arguably
  that noise in a different hat. The argument against: the visitor pointed a camera at one specific
  package, so it was asked for by name rather than returned in a list. That is still a judgement and
  not a measurement.

## [0.53.0] - 2026-10-07

**Step 4 of the working order. Question 13 is scoped, measured and gated, and deliberately not
answered.** The measurement is the useful part: **this repository stores no upstream record at all**,
so the share-alike question does not bite on anything published today.

Added
* **PRD section 22.5**, which quotes ODbL 4.4, 4.5 and 4.6 rather than recalling them, records that
  upstream licenses its database, its individual contents and its product images under **three
  different terms**, and reports what `catalogue.json` actually contains.
* **A gate.** `check-catalogue.py` now refuses any entry whose `source` names an upstream host.
  Verified by adding one and watching it fail, then removing it.

Measured
* **29 entries, 28 from a manufacturer's published panel and 1 from a retailer listing, and 0 from
  upstream.** Upstream data is fetched by the visitor's browser when they open a product and is
  never written down here. ODbL 4.4 attaches to a Derivative Database that is Publicly Used, and
  this project publishes none, so **the question is not resolved, it is not yet reached.**
* **That property is one hurried commit away from being false, and nothing would look wrong
  afterwards.** Which is the argument for a gate instead of a paragraph: a licence position that
  depends on everybody remembering a rule is not a position.

Notes
* **It is still not answered, and an agent should not be the one to answer it.** Question 13 said
  the terms should be read by a person who does licensing. Four questions are left and 22.5 lists
  them with the clause text beside each: whether an import makes the file a Derivative Database
  under 4.4 b, what 4.4 then requires of a file that also holds records this project transcribed
  itself, whether 4.6 obliges publishing the import in machine-readable form when it is already a
  public file, and whether a product page is a Produced Work exempted by 4.5 b.
* **The fourth is the one most worth having checked**, because the entire live-read architecture
  rests on it today rather than at M33.
* M33 stays blocked and nothing on the roadmap moves. What changed is that **the project is now
  known not to be exposed while it waits**, which it was not before.

## [0.52.0] - 2026-10-07

**Step 3 of the working order. Section 24.1 no longer lists a defect in shipped code**, for the
first time since it was written.

Fixed
* **A premix printed in parentheses is now expanded like one printed in brackets.** Purina prints
  `VITAMINS [...]` and Dr. Elsey's prints `Vitamins (Niacin, ...)`, and `expandGroups` only
  understood the first, so the second arrived as a single ingredient that would wear its worst
  component's flag. **That is the exact condition M24 shipped to fix, met again in different
  punctuation.**
* **The guard was never the bracket shape and widening it proved that.** What keeps `meat and
  animal derivatives (including chicken, 4%)` whole is that its heading is not a group name and
  that a single member is a note rather than a list. Both tests were already there and both still
  do the work. `Mixed Tocopherols (Preservative)` stays whole for the same reason.
* **It was not the one-character change the diagnosis estimated.** A character class cannot see
  past a nested `niacin (Vitamin B-3)` to find the real closing bracket, so `trailingGroup` walks
  back from the end of the entry counting depth. Six assertions added, including the nested case.
* **Verified to change no score before being believed to.** Ten catalogue entries print menadione
  and every one of them prints it inside square brackets or at top level, so the defect was real
  and had never reached a visitor. The 263-assertion suite agrees.

Added
* **`omega3Pct`, `epaPct`, `dhaPct` and `vitaminEIuPerKg`.** Many panels publish these and
  `DATA_FIELDS` had no key for them, so transcription dropped them rather than misfiling them,
  which was the right call and not a resting place. They are now recorded in the catalogue, read by
  `check-catalogue.py` with plausible bands and a panel cross-check, extracted by `label-deck.py`,
  and shown on the product page.
* **They are deliberately not scored, and the page says so.** They sit under a heading of their own
  rather than in the nutrition grid, because every card in that grid feeds the score and these do
  not, and a reader looking at them side by side has no way to tell which is which. Adding a field
  is cheap; deciding what a score should do with an omega-3 minimum is not, and that decision stays
  with the scoring work rather than arriving by the back door of a transcription.
* **27 figures were backfilled across 8 entries from panels captured weeks ago.** Section 12.11
  argued for capturing the whole panel on the grounds that it would cost a future field nothing to
  backfill from. **This is that invoice, and it came to nothing.** The captures already had the
  figures under the labels the new cross-check looks for.

Notes
* **The backfill cannot be validated by the cross-check and the tool says so.** Entry and panel
  agree by construction because both are the same reading of the same capture. What the cross-check
  protects is a later edit to one of them.
* `label-deck.py` gets no bare fallback for any of the four, for the reason the existing comment
  gives about protein and fat: `vitamin e` without the printed `(Min)` finds "Vitamin E Supplement"
  in the ingredient list of nearly every dry food. A guarantee always qualifies its figures.
* Vitamin E is accepted only in IU/kg. A panel printing IU/lb is a different number and converting
  it quietly is how a unit error becomes a figure.
* Service worker `v15`. `ingredients.js` and `product-page.js` are both precached, so a returning
  visitor would have kept the old copies and seen neither fix until the version changed.

## [0.51.0] - 2026-10-07

**Step 2 of the working order. The barcode resolver has asked about everything it is ever going to
ask about.** 62 of the 100 ranked SKUs have candidates on file; the remaining 38 are the ones no
candidate can be right for.

Changed
* **The last six rows were queried**, finishing a run that has been resumed across four sessions at
  one query every three minutes. `tools/data/barcode-candidates.json` holds 62 rows with 60 of them
  carrying candidates, and 94 of the day's 100 lookups were still unspent when it finished.
* **The other 38 are not pending, they are refused.** They are the assorted-recipe and variety-pack
  rows that section 12.15 rules out: one listing covers several different recipes, so there is no
  single panel to transcribe and no single barcode to key it to. A tool that kept retrying them
  would look busy and never finish.

Notes
* **The remaining number was misread as 40 before the output was read.** 100 minus 62 is 38, and
  38 unqueried rows at three minutes each is two hours, so the run looked unfinished when it had
  already stopped. **It had excluded them on purpose and said so in a line printed before the
  queries started.** Arithmetic over a total is not a reading of a log.
* **Nothing has been chosen and the file still proposes only.** Section 12.10's rule holds: a wrong
  barcode is individually valid on both halves and no gate can catch it, so a person reads
  `--review` and decides. That is step 6 of the queue and it is the owner's time, not the agent's.

## [0.50.0] - 2026-10-07

**Step 1 of the working order. Question 14 is answered, and it refutes the argument that came
attached to it.** Dropping the live upstream read today would turn 45% of queries into an empty
page.

Added
* **`tools/measure-fallback.py`**, which asks what a visitor would stop seeing if the live upstream
  read went away. Not how many records each source holds: **how many scorable results a visitor
  would lose**, which is a different number because M26 hides unscored products and most of upstream
  is already in that invisible part. Writes `tools/data/fallback.json`.
* It **matches the catalogue exactly the way the site matches it**, a plain substring over name,
  brand and pack size, replicating `searchCatalogue`. A more generous matcher here would flatter the
  catalogue and under-report the loss, and the site's matcher is the one that decides what a visitor
  sees.
* It **reuses `scorable` from `measure-coverage.py` rather than restating it.** A second copy would
  be free to drift, and a measurement whose definitions disagree with the one it is compared against
  is worse than no measurement.

Measured
| Over 125 queries, 100 naming a product and 25 a word | |
|---|---|
| Queries upstream answers with something scorable | 108 |
| Queries the catalogue answers at all | 52 |
| **Queries that would return nothing instead of something** | **56, which is 45%** |
| Scorable results that would stop being shown | 1016 |

* **The question was raised with an optimistic argument attached and the PRD recorded it as a guess
  the measurement might refute.** It did. The argument was that because M26 hides unscored products
  and 12.1 puts a scorable record at roughly one in five, the visible loss must be far smaller than
  the raw counts suggest. The reasoning was sound and the conclusion wrong: **upstream's breadth is
  concentrated exactly where the catalogue is narrowest**, in the generic words somebody types when
  browsing rather than holding a package. The old paragraph is left visible in section 13 rather
  than deleted, as an example of an argument that survives until somebody measures it.
* **Two causes were separated, and that was the useful part.** Of the 56, **46 are missing data** and
  only transcription fixes them; **10 are the matcher**, because the catalogue is searched by
  substring while upstream is searched by token, so a catalogue that holds grain-free food returns
  nothing for "grain free". Ten of fifty-six is an afternoon against weeks. A number that blended
  the two could not have been acted on.

Changed
* **M32 is gated on M29 harder than it was estimated to be**, and the dependency column now has
  evidence behind it rather than an intuition. It stays at step 10.
* **A matcher fix is probably worth a milestone of its own** and does not have one yet. Recorded
  rather than created, because inventing a milestone is the owner's call.

Notes
* The queries are chosen rather than sampled, because section 14 says this site has no analytics and
  means it. **This is evidence about the shape of the loss, not a measurement of visitor
  behaviour**, and `fallback.json` says so in its own header.

## [0.49.0] - 2026-10-07

**The site names its own domain. Every page served at catfoodcenter.com had been telling Google to
index a different host instead, and Google had been obeying.**

Fixed
* **Every canonical URL pointed at `azqato.github.io/catfoodcenter/`, including the ones served at
  `catfoodcenter.com`.** Google Search Console reported it as "Alternate page with proper canonical
  tag", and **the word doing the damage is "proper"**: the tag was well formed, which is the only
  thing that word claims. A canonical pointing confidently at the wrong host is not a malformed tag
  and nothing reports it as one. The effect was that the domain the project owns was not indexed at
  all, and the ranking signal consolidated onto a subdirectory of a domain it does not own.
* `sitemap.xml` listed nineteen `azqato.github.io` URLs while being served from the apex, which
  reinforced the same instruction. Regenerated, nineteen URLs, all on the apex.
* `robots.txt` advertised the old sitemap, and `check-live.py`, both API user-agent strings,
  `README.md` and `LICENSE.md` all still named the old origin.
* **The runbook advertised 198 assertions.** It is 257 and has been since well before 2026-09-11.

Changed
* **One constant did almost all of it.** `BASE` in `tools/site/chrome.py` is the single definition
  both generators use, and the comment above it already said that one definition is what makes the
  next move a one-line change. **It was, and that is a design decision paying out.** Rebuilding
  regenerated twenty pages and the sitemap.
* **`robots.txt` became authoritative, having never been so.** Its own scope note said a robots.txt
  served from a subpath does not govern the host, that the governing file was the domain owner's at
  the apex, and that this one was committed anyway because it would be correct if the site ever
  moved to its own domain. It moved. The paragraph now says so rather than describing a limitation
  that has lifted.
* **PRD section 16.12 is new**, carrying the three addresses this site has had, what the mix-up
  cost, and the three things that remain outside the repository.

Notes
* **No gate caught this, and the reason is worth keeping.** `check-live.py` has asserted since M24a
  that every page carries its own canonical, and it passed throughout, because it compared each page
  against a base URL held as a constant **inside the checking tool**. The tool and the generator
  agreed with each other and both were wrong about the world. Same shape as the headless misreading
  in 12.14 and the coverage tool querying the wrong database in 12.9: **an instrument that shares an
  assumption with the thing it measures cannot test that assumption.**
* **The github.io copy is left reachable on purpose.** It now names the apex as its canonical, so
  engines consolidate onto the domain. No `Disallow`, for the reason open question 10 settled: a
  disallowed URL can still be indexed from a link alone, described by nothing, because the crawler
  was never let in to read the `noindex`.
* **Three things were deliberately not done, because they are not in this repository.** Whether a
  `CNAME` file belongs in the root, given the domain resolves through Cloudflare rather than GitHub
  and **a blind `CNAME` could put the Pages site into a failed certificate state and take down the
  copy that currently works**; whether apex or `www` wins, since both answer 200 and neither
  redirects; and what to do about two separate Search Console properties. Section 16.12 has all
  three.

## [0.48.0] - 2026-09-27

**The roadmap is reordered by effort, the two milestones proposed today are split, and the unshipped
milestones are renumbered so the number carries the order.** Documentation only, no code.

Changed
* **The queue in PRD section 13 is now a working order of twelve steps**, sorted by effort ascending
  with absolute dependencies respected, which is the criterion the project owner set. It carries an
  effort column and a "blocked by" column, and **"blocked by" is the only thing permitted to
  override effort order.** It does so exactly once: M30, the beta, is cheap to execute and sits
  eighth because its coverage criterion depends on the longest item on the board.
* **Milestone numbers were allocation order and are now working order.** The rule in section 13 said
  they are never renumbered, and it said so for a reason this change had to pay: entries here name
  milestones by number and 23.6 says entries are never rewritten. **The owner reversed the rule
  having been shown that cost**, and directed the sweep. Only unshipped milestones moved, because a
  completed milestone's number already records when it happened. M12 becomes M30, M27b becomes M29,
  M27c becomes M34. Thirty references across two files, verified by count before and after.
* **Section 23.6 now records both sweeps and what qualifies as one.** The bar: it changes spelling
  rather than claims, it is applied to every occurrence rather than the convenient ones, and it is
  written down. **A changelog that can be edited to match the present is not evidence of anything**,
  which is why the exception is stated narrowly rather than left as precedent.

Added
* **M28 was split into M28 and M31**, and **M32 into M32 and M33**, following the M27 precedent from
  2026-09-09. Each bundled a cheap half with an expensive half, **and the blocking questions fall on
  one half only**: question 15 blocks M31 and not M28, question 13 blocks M33 and not M32. Ordered
  whole, both looked blocked. Split, half of each is free to start.
* **The reason M28 precedes M29 despite M29 being the coverage mover**, written down in three parts
  because only the third is interesting. It is cheaper. **It unblocks work already paid for**: forty
  ranked rows carry barcode candidates bought with about five hours of a rationed allowance, and not
  one can be banked today, because a barcode has nowhere to live unless a catalogue entry already
  exists to key it to. And it turns the scanner into a demand signal, which tells transcription what
  to do next from real visitors rather than from a best-seller list.
* **The tension in that third argument, recorded unresolved.** M26 hides unscored products because a
  grey column is an honest view of the database and a useless view of cat food, and a scan resolving
  to a named but unscored record may be the same noise wearing a different hat. The counter is that
  the visitor pointed a camera at one package, so it was asked for rather than returned in a list.
  **That is a judgement and not a measurement**, and it is flagged for when M28 is designed.

Notes
* Steps 1 to 4 are all XS or S, answer three of the six open questions, and end at the container
  that makes the barcode work bankable. **Two of the twelve steps are not milestones at all**:
  question 14's measurement is step 1 and question 13's licence reading is step 4, because a cheap
  thing that gates an expensive thing belongs in the order with everything else.
* Gates unchanged and re-run: 257 assertions, 29 entries against 25 captured panels, 29 live checks.

## [0.47.0] - 2026-09-27

**Both status sections brought current, and the barcode resolver's output committed.** A status
section is the one part of a document that is wrong by default: everything else records decisions
that stay made, and these describe a moment that does not stay current.

Fixed
* **PRD section 25.4, "Work in progress", described the M14 and M15 run-up to M30.** It was accurate
  on 2026-09-07 and **survived twenty days and roughly a dozen shipped milestones without being
  read.** It now carries the state measured on 2026-09-27, and it says plainly why this particular
  section went stale, because the next reader will be tempted to trust it.
* **PRD section 13, "Current phase", said coverage is what stands between here and a beta** and left
  the shape of that gap unmeasured. Coverage is 5 of 47 and all five come from the curated
  catalogue. It also now names the second gap, which is not the same one: **the catalogue holds 29
  entries and 9 of them can be scanned.** Coverage measures search and cannot see that at all, so a
  number that stays still while the scanner is nearly empty is measuring the wrong half of a product
  whose tenet 7 calls scanning the real use case.

Added
* **`tools/data/barcode-candidates.json` and `tools/data/purina-index.json`**, held back on
  2026-09-11 because the resolver was mid-run and a growing file makes a noisy commit. The run
  reached **41 of the 47 non-assorted ranked rows, 40 of them carrying at least one candidate, none
  reviewed.** That is the largest piece of unconverted work the project holds: each review turns a
  proposal into a scannable entry, and section 12.10 says only a person can do it.

Notes
* Verified rather than recalled before writing any of the above: 257 assertions, 29 entries agreeing
  with 25 captured panels, coverage 5 of 47, 29 live checks.
* Nothing in `README.md` or `docs/DESIGN.md` needed a correction. DESIGN.md dates its own last full
  audit at 2026-09-06 and makes no claim that has since become false.
* **One apparent contradiction was checked and is not one.** Section 25.1 describes a 600-product
  sample and question 9 a 1000-product one. They are two different measurements on two different
  dates, 2026-09-05 for the headline fields and 2026-09-07 for the language coverage, and both say
  so. Left alone.

## [0.46.0] - 2026-09-27

**The concerns raised against M28 and M32 become numbered open questions.** A concern nobody can
cite is a concern that gets rediscovered rather than answered. Documentation only, no code.

Added
* **PRD section 25.5 gains questions 12 to 17**, in the register that already says it is "numbered
  so they can be answered by reference". They were raised in conversation when the two milestones
  were proposed, and most of the reasoning was already in the section 13 narratives; what was
  missing is that it was prose rather than something with a number on it.
  * **12. Does the live Open Pet Food Facts read go entirely, or stay as a fallback?** The only one
    that changes the shape of the build rather than its schedule. Either answer forces a rewrite of
    16.5a's merge rules, which currently arbitrate between a live record and a local overlay.
  * **13. What does the ODbL require of a database mixing imported and transcribed records?** Not
    answered here and not answerable by an agent. The mitigation can be stated without a lawyer:
    keep imported records separable and labelled.
  * **14. How much scorable breadth is actually lost by dropping the live read?** Unrun. **Every
    claim about the cost of M32 is currently a guess, including the optimistic one made here.**
  * **15. What stops a valid barcode being attached to the wrong product, once strangers can submit
    them?** The existing cross-check only covers entries that have a captured panel, so it does not
    cover the case M28 creates.
  * **16. Where do M28 and M32 sit relative to M30 and M29?** Both rows carry "-" in the queue
    table, which means unplaced rather than last.
  * **17. Does an imported upstream record need a `sourceKind` of its own?** It is not a panel, not
    a retailer listing, and arrives in volume, which is what makes a wrong rank expensive.
* **Both milestone narratives now cross-link to their question numbers**, so the register and the
  roadmap point at each other rather than each holding half the argument.

Notes
* **Questions 13, 14 and 15 should close before either milestone is built**; 12, 16 and 17 can close
  during the design. That split is recorded rather than left to be re-derived.
* Section 25.4, "Work in progress", still describes the M30 run-up and names M14 and M15 as the
  recent work. **It is stale and was left alone**, because correcting it is not what this change was
  asked to do and a drive-by rewrite of a status section is how status sections stop being trusted.

## [0.45.0] - 2026-09-27

**M32 on the roadmap: our database becomes the spine, and Open Pet Food Facts becomes a source
feeding it rather than the source the site is served from.** Roadmap and two corrections. No code.

Added
* **PRD section 13 gains M32**, requested by the project owner. The request bundles three different
  dependencies under the word "reliance" and the entry separates them, because they do not have the
  same answer: **the live API in a visitor's critical path** should go, **primacy** should invert,
  and **Open Pet Food Facts as a source of facts** should stay, which is what the owner asked for.
* **A licence question nothing in this project had recorded.** Open Food Facts publishes its
  database under the Open Database Licence, whose share-alike terms attach to a derived database,
  and this project's `LICENSE.md` grants nothing. Those two do not obviously coexist in one
  published file. It is flagged as a question for a person who does licensing, not answered, and
  the terms should be read rather than recalled. Read the other way it argues *for* the milestone:
  **a record transcribed from a manufacturer's published panel carries no such encumbrance**, and
  the transcription programme has been producing exactly those since 2026-09-09 without anybody
  framing it as licence hygiene.
* **The measurement that should decide the schedule, named and not yet run**: across a set of real
  queries, how many scorable results come from upstream today that the catalogue could not serve.
  M26 hides unscored products by default, so the breadth a visitor sees is much smaller than the
  breadth that exists, and the cost of dropping the live read may be far smaller than the raw counts
  suggest. Guessing at it would be the wrong move twice over.

Changed
* **A standing constraint was reversed, and it is marked as reversed where it was written.** Section
  13 recorded on 2026-09-09 that M27 is built alongside the current setup rather than over it,
  explicitly as a standing constraint rather than a transitional phase. The owner reversed that half
  on 2026-09-27. The other half stands: Open Pet Food Facts stays a source indefinitely. The
  original sentence is still what the code does until M32 ships, and the entry says so.

Fixed
* **Section 22.3 claimed every product fact on the site comes from Open Pet Food Facts**, and it had
  stopped being true on 2026-09-09, when the transcription programme began producing records read
  from manufacturers' panels. Twenty-nine such entries exist. Corrected in place with the date it
  went stale, because a licence section that misdescribes what the site holds is the kind of error
  that matters outside this repository.

Notes
* **One decision left to the owner and not taken here**: whether independent means the live API is
  removed outright or kept as a fallback for a barcode the local database does not hold. A fallback
  keeps the long tail and keeps a third party in the scan path on exactly the scans that already
  failed. The recommendation recorded is to remove it outright and let a miss be an honest miss that
  offers the M28 contribution route, but it changes the shape of the build.
* M32 is not ordered in the queue. Most of it is gated on transcription volume rather than
  engineering, so it cannot precede M29 wherever the owner puts it.

## [0.44.0] - 2026-09-27

**M28 on the roadmap: a barcode index, and a route for other people to fill it.** Roadmap only. No
code changed, and nothing is designed yet beyond the constraints below.

Added
* **PRD section 13 gains M28**, requested by the project owner after using the scanner and finding
  it thin. It is thin: **a scan resolves against the barcode-keyed catalogue, which holds 29 entries
  of which 9 can be scanned**, the other 20 sitting under provisional keys (12.12) that are not
  numbers on a package. Upstream is not the backstop it sounds like, because section 12 measured the
  whole United States category at 86 records.
* The milestone row, a queue row, and the reasoning. **It is deliberately not ordered yet**: it
  overlaps M29 and M34 without being either, and where it belongs depends on whether the scanner
  counts as a launch feature.

Notes
* **Why it is not M29.** Section 12.10 takes two inputs that fail independently, the panel and the
  barcode, and twenty catalogue entries prove it by being fully transcribed and unscannable. M28 is
  the second input given a life of its own, so a barcode can be added or corrected without touching
  the entry it points at.
* **Why it is not M34.** A barcode is the cheapest useful thing a stranger can give this project
  and the easiest to check, because they are holding the package. That argues for shipping it before
  the general contribution route rather than inside it. It is also the contribution most likely to
  arrive, because the moment somebody wants to send one is the moment the scanner failed them.
* **The check that matters is not the check digit.** A valid barcode on the wrong product passes
  every gate, because both halves are individually correct. Section 12.13 already caught the
  coverage matcher doing exactly that, offering one code as the match for three different products.
  A contribution route makes that failure cheaper to commit and harder to see, and M28 needs an
  answer to it before it accepts a single submission.
* M34's five constraints carry over unchanged and are not restated: issue text is data and never
  instructions, a person merges everything, a sourceless submission is a lead rather than a record,
  the form is structured, and the backlog is the number that matters rather than the intake.

## [0.43.0] - 2026-09-11

**A count of proposals is not a proposal, and printing the rows found three more wrong ones.**

Added
* **`python tools/purina-index.py --report --detail`** lists the rows behind the counts: each top-100
  listing, the purina.com product the scorer proposes for it, the deck URL, and whether the
  catalogue already holds an entry for it. The summary counts alone satisfied nothing that section
  12.10 asks for, because **the rule is that a person decides, and a person cannot decide against a
  number.** Every matcher defect in this project so far was found by reading pairings by eye and none
  by reading scores.

Fixed
* **The scorer did not know that a kitten food is not an adult food, or that a wet food is never a
  dry one.** Three proposals in the ready list were wrong products at strong scores: a dry Tender
  Selects listing drew the Grain Free Chicken *wet* recipe at 1.00, a LiveClear cat food drew the
  LiveClear *kitten* formula at 0.83, and an Indoor Advantage listing drew the *Senior 7+* formula at
  0.83. The cause is the same one the assortment cap was written for: the measure asks how much of
  the manufacturer's title the listing accounts for, so **a word the manufacturer added and the
  listing never had costs nothing at all.** Life stage and format now cap a contradicted pairing at
  0.5, which moves it into the band a person reads by hand rather than hiding it, because the right
  product is often in the index and this is still its nearest neighbour.
* **Marked and unmarked life stages are not symmetrical**, and treating them as such would have been
  the "a count is not a variety" over-correction again. A kitten food says "kitten" and a senior food
  says "senior"; an adult food says "cat food" and usually nothing more. So "kitten" against silence
  is a disagreement and "adult" against silence is not.
* Format compares only the stated words, never the texture words, for the reason already recorded in
  `tools/label-deck.py`: "Gravy" appears in the name of a dry food.

Notes
* **Every one of the six changed rows was checked by hand before and after**, which is the only way
  to tell a fix from a new defect. All six improved: rank 23 now proposes the real Tender Selects
  Chicken dry food, rank 62 the Adult LiveClear rather than the kitten one, rank 17 the Indoor
  Advantage turkey rather than the Senior 7+, and ranks 21 and 46 stop offering Kitten Chow for Cat
  Chow listings. Rank 26 is a kitten listing whose only close proposal is a wet food, correctly
  demoted to hand-reading. Forty-one rows were untouched.
* No site code changed. This is a maintenance tool that nothing a visitor loads runs, so no gate
  behaviour changed and the catalogue is byte-identical.

### Where development stops, 2026-09-11

Picking up from here:

* **Coverage is 5 of 47 (11%)**, all five served by the curated catalogue. `python
  tools/measure-coverage.py` re-measures it.
* **M29 batch 2 is the next unit of work.** `python tools/purina-index.py --report --detail` now
  prints the candidates. After the scorer fix the ready list holds four rows not yet in the
  catalogue: ranks 9 (Purina ONE Tender Selects Salmon), 23 (Tender Selects Chicken), 42 and 55 (both
  proposing the same +Plus Sensitive Skin & Stomach deck, which **a person must confirm are one
  product before either is transcribed**), and 62 (LiveClear Adult). Section 12.10's steps, then
  `tools/transcribe.py` with a batch file like `tools/data/batch-m27b-1.json`.
* **`tools/resolve-barcodes.py --list cat-food` was still running when this stopped**, paced at twenty
  queries an hour. Thirty-six rows are resolved, twenty-one of them non-assorted and each with
  candidates. `tools/data/barcode-candidates.json` and `tools/data/purina-index.json` are
  deliberately uncommitted while the run is in flight; commit them once it finishes.
* **Twenty entries hold provisional keys** (section 12.12) and each needs a barcode chosen by a
  person, which is what the candidates file is for. `check-catalogue.py` prints the list every run.
* Still open in section 24.1: parenthesised premix groups defeat `expandGroups`, and fatty acids and
  vitamin E have no `DATA_FIELDS` home.

## [0.42.0] - 2026-09-11

**The first provisional key becomes a real barcode, chosen by the owner rather than by the tool.**

Changed
* **Friskies Gravy Swirlers is now keyed `050000168620`.** It had been filed under the provisional
  key `CFC-purina-friskies-gravy-swirlers` (section 12.12), searchable and scorable but not
  scannable; it is scannable now. Its raw panel sidecar moved with it, from
  `tools/data/panels/CFC-purina-friskies-gravy-swirlers.json` to `tools/data/panels/050000168620.json`.
  Twenty provisional keys remain, and `check-catalogue.py` keeps printing them.
* **The entry's note records where the number came from**, which section 12.10 requires and which no
  gate can supply: the project owner chose it on 2026-09-11 from the UPCitemdb candidates, where it
  is filed under "Purina Friskies Gravy Swirlers with Flavors of Chicken, Salmon & Gravy Adult Dry
  Cat Food". The ranked listing is a 3.15 lb bag and **no candidate stated a pack size, so the recipe
  is confirmed and the pack size is not**, and the note says so rather than implying a certainty that
  was not available. The two other Gravy Swirlers candidates were rejected on inspection: one an
  Indoor variant, which is a different recipe, and one an explicit 6.3 lb bag.
* **`tools/resolve-barcodes.py` skips assorted-recipe rows.** It mirrors the `VARIETY` pattern in
  `tools/purina-index.py` and it shipped one commit late: the decision in section 12.15 was recorded
  in `[0.40.0]` and taught to the indexer and the coverage measurement there, but the resolver went
  on spending a rationed twenty-an-hour allowance on rows that can never become an entry. Fifty-three
  of the hundred ranked rows are assortments, so more than half of every hour was being spent on
  answers with nothing to key. The skipped count is printed rather than passed over in silence.
* `sw.js` to `v14`. `catalogue.json` is precached, and this release changes which key a scanned code
  finds, which is exactly the kind of change a stale cache would hide.

Notes
* Gates after the re-key: 29 entries, all sourced, within the plausible bands, and agreeing with the
  25 raw panels captured; 257 tests passing.
* Coverage is unchanged at 5 of 47. A barcode makes an entry scannable; it does not make it findable,
  and the search that coverage measures was already finding this product by name.

## [0.41.0] - 2026-09-11

**Coverage is 11%. It was zero, and getting there meant fixing the transcriber, the capture, the
cross-check and the measurement, each of which was wrong in a way that did not announce itself.**

Added
* **Six entries, the first batch of M29**, all Purina brands read from the manufacturer's own label
  decks: Friskies Gravy Swirlers, Fancy Feast Classic Pate Chicken Feast, Fancy Feast dry Ocean Fish
  & Salmon, Cat Chow Gentle Sensitive Stomach and Skin, Kitten Chow Year One Essentials, and Fancy
  Feast dry Savory Farm-Raised Chicken & Turkey. Each carries a raw panel capture and each was read
  against its source. All six are filed under provisional keys (12.12): no barcode has been chosen
  for any of them, because choosing one is a person's job and the candidates for the only resolved
  row spanned two pack sizes and an Indoor variant.
* **`tools/data/batch-m27b-1.json`**, the batch file, kept so the transcription is reproducible.

Fixed
* **`product_format` called Friskies Gravy Swirlers a wet food.** It tested texture words before
  format words, so "gravy" beat "dry" in a title and a file name that both say dry. Format words now
  decide, texture words only imply, and the moisture figure settles a disagreement: no wet food is
  12% water. A wrong format puts a product in the wrong comparison and changes how its moisture
  reads.
* **A whole label layout was invisible to the guarantee reader.** Purina's newer decks print a grid
  headed "Nutrients / Guaranteed / per cup" with rows reading "Protein (Min) 40.0%", where the older
  decks say "Crude Protein". Kitten Chow Year One Essentials parsed with moisture and no protein,
  fat or fibre, and **a product that states no protein and a product whose protein cannot be read
  look identical in the output.** The fallback patterns require the printed "(Min)" or "(Max)",
  without which a search for "fat" finds "animal fat preserved with mixed tocopherols" in the
  ingredient list.
* **The panel capture read that layout as zero figures, twice over.** The figure parser wanted a
  label and its number in one segment, and the grid puts them on separate lines; and the capture
  window, which starts 300 characters before the first recognised heading, began in the middle of
  the grid because it did not know the heading. Both fixed, and the other five entries gained
  figures too: the Friskies capture went from 5 to 15.
* **The cross-check had been silently switched off for that layout.** It maps each entry field to
  its printed label and knew only "crude protein"; against a panel printing "Protein (Min)" it found
  nothing to compare and said nothing, which reads exactly like agreement. It now knows both
  spellings. **A field whose label it cannot recognise is not checked and does not warn**, which is
  worth stating plainly, because this is the only check in the project that catches a wrong number
  that looks right.
* **`measure-coverage.py` asked only the upstream database.** Its own definition of coverage is
  whether a visitor searching by name gets a scored product back, and the site's search reads the
  curated catalogue too, which was verified in a browser rather than assumed. Every product
  transcribed under 12.10 was being reported as uncovered, so the transcription programme would have
  looked like it changed nothing while it was working.

Changed
* **The coverage denominator is 47, not 100**, per section 12.15. A figure measured this way is not
  comparable to the 0 of 100 recorded on 2026-09-09, and `coverage.json` says so in its own header.
* PRD section 12.9 now carries the new table and the reason the two numbers cannot be compared.

Notes
* Gates after the batch: 29 entries agreeing with 25 captured panels, 257 tests passing.
* Step 6 of section 12.10 was done for four of the six: the product page renders the score, the
  format, the life stage and the "no published barcode, so this product cannot be scanned yet"
  provenance line.
* No site code changed, so no gate behaviour changed.

## [0.40.0] - 2026-09-11

**More than half the top 100 is a box of assorted recipes with no panel to transcribe. The matcher
did not know that, and was pairing those boxes with single recipes at scores up to 0.83.**

Added
* **PRD section 12.15**, recording the project owner's decision: a variety pack does not become an
  entry, the recipes inside it do. The coverage denominator in 12.9 changes meaning with it, from
  ranked retail listings to products a visitor can actually scan, and a number measured the new way
  is not comparable to the 0 of 100 recorded on 2026-09-09.
* **An assortment guard in `tools/purina-index.py`.** A listing that names assorted recipes can no
  longer strongly match a single-recipe page; such a pairing is capped below the confident
  threshold so it stays visible and stops being trusted.
* **`--report` now separates "matched with a deck" from "matched with no deck yet"**, because a
  strong match to a page carrying no panel is not something that can be transcribed, and counting
  the two together overstated what was reachable by roughly a factor of two.

Fixed
* **Three defects in the matcher, each of which would have put a correctly transcribed panel on the
  wrong product.** All three were found by reading the proposals rather than the scores.
  * A thirty-can variety pack matched one Turkey Feast recipe at 0.83, a seafood variety pack
    matched one Seafood Feast, and a case of broths matched a salmon pate. The packaging-word
    filter was stripping "variety" and "pack" as noise, which is exactly what made the box look
    like the can.
  * **"kitten" and "adult" were being stripped as packaging.** An adult Fancy Feast dry food
    matched the kitten food of the same flavour at 1.00. Life stage is a catalogue field.
  * **"classic" was being stripped too**, which matched a Fancy Feast Classic Pate listing to a
    Chunky recipe at 0.80. It names a product line.
* **The first assortment guard disqualified on the word "pack" and threw out five ordinary
  products.** A count is not a variety: 24 cans of one recipe has one guaranteed analysis and
  belongs in the catalogue. Only assortment disqualifies.

Notes
* Measured after all of it: of the top 100, 53 are assortments, 6 match strongly and have a deck to
  transcribe, 8 match strongly with no deck found yet, 14 are worth reading by hand, 19 have no
  match. All six of the ready ones were checked by eye against their listing titles.
* The zero-deck pages were verified rather than assumed: ten were re-read and all ten genuinely
  carry no deck. They are overwhelmingly variety packs, which is what led to 12.15.
* No site code changed, so no gate behaviour changed.

## [0.39.0] - 2026-09-10

**The crawler runs headless after all. `[0.38.0]`, published an hour ago, said it could not, and
that was wrong in a way worth reading: the experiment that proved it changed two things at once.**

Changed
* **`tools/purina-index.py` now runs headless**, with a user agent set on the browser context, and
  opens no window. It also scrolls each product page before reading it, which is cheap insurance
  against a component that renders when it comes into view.

Fixed
* **`[0.38.0]` said purina.com "refuses a headless browser and answers a headed one". It does not.**
  Entries are not rewritten, so the correction is here and PRD section 12.14 carries it. What the
  site wants is a user agent: headless with Playwright's default is refused, headless with a stated
  agent is served, and the version in the string changes nothing. The headful run that appeared to
  settle it had a different user agent too, and only one of the two changes was doing any work.
  Changing two things and crediting the interesting one is how that entry came to be written.
* **The probe scripts reported zero deck links on pages that had one, and that was the shell.** The
  heredoc that wrote them halves backslashes, which corrupted a character class into one that
  matches nothing and raises no error. It read as a fact about the browser for twenty minutes. The regular
  expression inside the tool, written to disk directly rather than through a heredoc, was correct
  the whole time and is unchanged.

Notes
* Verified after the change: five product pages read headless, five deck links found, no window.
* No site code changed, so no gate behaviour changed.

## [0.38.0] - 2026-09-10

**Nearly half the top 100 is one manufacturer, and that manufacturer's panels turned out to be
reachable. The obstacle was never the parser; it was four characters of Playwright configuration.**

Added
* **`tools/purina-index.py`**, which walks purina.com's cat-food listings, records every product
  slug and title, and reads each product page for its one label-deck PDF link. Saves after every
  page, so a crawl resumes rather than restarts. `--find` ranks a top-100 listing title against the
  index and prints candidates for a person to read; it never writes a catalogue entry.
* **PRD section 12.14**, recording the four routes tried to reach a deck URL and what each returned.

Notes
* **Forty-seven of the hundred rows in `tools/data/top-skus.json` are Nestle Purina brands**: Fancy
  Feast, Friskies, Purina ONE, Cat Chow and Pro Plan. `tools/label-deck.py` has been able to read
  those panels since it was written. What was missing was the URL, which carries an internal product
  code and a dated folder and follows from nothing in the product name.
* **purina.com refuses a headless browser and answers a headed one.** A plain urllib request gets
  403; Playwright driving Edge with `headless=True` gets the identical 403 document; the same script
  with `headless=False` gets 200 and the full page. The distinction is not program against person.
  The PDF file store under /sites/default/files is the exception and serves anything, which is why
  `tools/label-deck.py` needs no browser and the new tool does.
* **A search engine is not a way in.** Bing and DuckDuckGo return purina.com hosts and zero deck
  URLs; the file store is not indexed. Tested against three decks already in the catalogue.
  `shop.purina.com` serves `robots.txt` and refuses everything else, to a browser as well.
* **A product page carries the panel and not the barcode.** One deck link, the ingredient list, the
  feeding guide, and calorie content in kcal/kg and kcal/can. No guaranteed analysis in the page
  itself and no UPC anywhere. The two halves of an entry come from two different places, which is
  what section 12.12's provisional keys exist to hold together.
* **Some top-100 rows are variety packs and cannot become one entry.** A 30-pack of assorted recipes
  has no single guaranteed analysis. Named here rather than resolved; the catalogue has no answer
  for it yet.
* **The crawler's first stop condition was wrong and the first full crawl indexed nothing.** It
  ended a category as soon as a page added no new product, which is correct for a listing that has
  run out and wrong for a resumed run, where page 1 is all-known by definition and ending there is
  the one thing it must not do. A category now ends when a page returns no rows at all, or when four
  consecutive pages add nothing, which is repetition rather than a resume. The tool reported a clean
  exit and zero new products, which is the shape of failure worth watching for: it did not error.
* No site code changed, so no gate behaviour changed. The chain was verified end to end before any
  of this was built: product page to deck URL to `tools/label-deck.py` to a proposed entry with a
  full guaranteed analysis and ingredient list.

## [0.37.0] - 2026-09-10

**Where barcodes come from, measured. Three routes are dead, the fourth is four times cheaper than
this changelog said yesterday.**

Added
* **`tools/resolve-barcodes.py`**, which asks the aggregator for a barcode for each top-100 SKU and
  never chooses one. Candidates go to `tools/data/barcode-candidates.json` with the title each is
  filed under, for a person to read against the product. A row with no candidates is an answer, not
  a failure, and it is what provisional keys are for.
* **PRD section 12.13**, recording all four routes tried and what each returned.

Fixed
* **`[0.35.0]` said the trial endpoint "429s after about three to five queries" and that the top 100
  therefore needed a source that did not exist. That reading was wrong.** Entries are not rewritten,
  so the correction is here. Measured on 2026-09-10: **20 requests per hour and 100 per day.** Three
  to five was what a burst looked like from inside an hourly window that was already nearly spent.
  The top 100 is about five hours unattended, not twenty days, and the barcode problem is pacing
  rather than structure. The roadmap had been reshaped around the wrong number.
* **A second wrong reading, caught the same hour.** Eight queries 22 seconds apart all succeeded and
  the conclusion drawn was 100 a day at any spacing. Those eight were the tail of a window with room
  in it; the twenty-first query of that hour was refused at any gap. The endpoint reports the hourly
  meter only when refusing and the daily meter only when answering, which is what made this easy to
  get wrong twice in opposite directions.

Notes
* **The retailer specification pages the owner chose on 2026-09-09 do not work.** Chewy answers 429,
  Petco 403, PetSmart 404, and Walmart and Target answer 200 with a JavaScript shell carrying no UPC
  in the markup. It was a reasonable choice, since a UPC printed beside a pack size is exactly what
  batch 2 needed, and it failed on contact rather than on reasoning.
* **A general web search does not carry UPCs.** Tested against three products whose barcodes this
  project already holds, on two engines: none of the six attempts found the right code, and one
  returned an unrelated 12-digit number, which is worse than nothing.
* **`coverage.json`'s `match.barcode` must never be used as a barcode source.** It is a
  name-similarity guess and it offers one Hill's code for three different Hill's products, and one
  Fancy Feast code for three different Fancy Feast products. It answers which record is nearest, not
  which product this is.
* No site code changed, so no gates were affected. The meter handling is unit-checked: a spent hour
  must not read as a spent day, which is the bug that would stop a run with 80 queries left.

## [0.36.0] - 2026-09-09

**An entry may now exist before its barcode does, and M23 finishes: all 19 Dr. Elsey's food SKUs
are in.**

Added
* **Provisional keys, PRD section 12.12.** A product whose manufacturer publishes a complete panel
  and no UPC can be recorded under a key like `CFC-drelseys-pork-recipe-kibble`. It becomes
  searchable and scorable; it does not become scannable.
* **The key can never be all digits, and that is the safety property.** Every 6 to 14 digit string
  is somebody's real barcode, so a numeric placeholder could be scanned by a visitor holding an
  unrelated tin, who would be shown this product's score with nothing indicating a mistake. A
  scanner emits digits only, so a key with letters in it cannot be produced by one. **The scan path
  is closed by construction rather than by a check somebody has to remember to write.** Locked by
  tests that assert `0000000000` and `9999999999999` are not provisional keys.
* **Fifteen entries, and M23 is complete at 19 of 19.** Two kibbles, ten pates and three pouches,
  each with its panel captured. Every one cross-checks against its capture with no disagreement.
* **`check-catalogue.py` prints the debt on every run**, every provisional entry by key and name.
  Not a dismissable warning and not a number in a file somebody has to go and look at: it is in the
  output of a gate that runs constantly, and it stays there until the keys are replaced. It also
  refuses a provisional entry whose note does not say what was searched and what came back, and
  refuses one that is not a manufacturer panel.

Changed
* **`fetchProduct` never sends a provisional key to Open Pet Food Facts.** The database is keyed by
  barcode and has never heard of the string, so the request could only fail, and it would put an
  identifier of ours into somebody else's logs for nothing. Verified in a browser: zero requests.
* **Service worker to `v12`.** `catalogue.json` is precached, and it went from 13.6KB to 36.5KB
  with this batch, so an install left on `v11` would keep serving a catalogue missing 15 products.
* **The product page does not call a provisional key a barcode.** It says "No published barcode, so
  this product cannot be scanned yet" where it would otherwise print the code. Verified in a
  browser, along with the score rendering and a digit string being unable to reach the entry.

Notes
* **14 assertions added, 257 total.**
* **The tuna pate carries no guaranteed analysis and that is correct.** The product is discontinued
  and its page publishes the ingredient list without the panel; the word "protein" does not appear
  on it. The entry holds the list and nothing it cannot support, which is what partial scoring is
  for.
* The barcode source decision was taken the same day: retailer specification pages, because they
  publish a UPC next to the pack size, which is the check the pate listings failed. Not built yet.

## [0.35.0] - 2026-09-09

**M23 batch 2 was refused in full, and the milestone stalls at 4 of 19. Not on transcription: on
barcodes.**

Notes
* **Five pates parsed cleanly and none was written.** Their barcodes were already in hand from batch
  1's lookups, so the batch cost no quota. Every aggregator listing describes a 5.5 oz can, and Dr.
  Elsey's own pages name 2.75 oz and 5.3 oz. A 5.5 oz can is not a size this manufacturer appears to
  sell.
* **That is disqualifying, not a detail.** Section 12.10 accepts an aggregator's barcode on one
  condition: a title a person can check the product against. The check was run and the title failed
  it. The listing may be a retailer mistyping 5.3, or a real 5.5 oz can from an older formulation
  with a different panel, and the two are indistinguishable from here with opposite consequences.
* **M23 proved something other than what it was queued to prove.** It was the test case for the
  transcription process, and the process passed: 15 of 19 panels parse cleanly, wet and dry, and all
  four written entries agree with their captures on every figure. The barcode is the unsolved half,
  and it is the harder one. Two SKUs have no listing, five have listings that fail their own check,
  eight are unlooked-up because the resolver rations queries.
* **This lands on M29 before it starts.** The top 100 is the same procedure at twenty times the
  scale, against rows that carry no barcodes by construction. It needs a hundred good resolutions
  from a source that has returned nothing, or something wrong, for seven of the twelve products
  asked of it so far. Recorded in section 13 as the next decision on the roadmap, which belongs to
  the project owner.

Fixed
* **`find_kcal` met a decimal point and refused it.** Dry panels print "3,953 kcal/kg" and wet ones
  print "1,245.0 kcal/kg"; the pattern stopped at the comma group, so every wet product parsed with
  no calorie figure at all, which reads exactly like a label that does not state one. Found because
  five wet panels arrived at once. Dry figures are unchanged.

Notes
* **The wet pages carry no AAFCO statement**, checked directly: the word does not appear. So
  `aafcoComplete` and `lifeStage` are absent from those proposals, correctly, rather than missed.

## [0.34.0] - 2026-09-09

**M23 batch 1: three more Dr. Elsey's kibbles, and the gate now catches a wrong number that looks
right.**

Added
* **Three entries, 4 of 19 Dr. Elsey's food SKUs now in.** Salmon `000338016605`, turkey
  `000338036603`, and duck and chicken `000338056601`, each with its panel captured: 11 printed
  figures apiece, including the EPA, DHA, omega-3, vitamin E, taurine percentage and kcal/cup that
  no catalogue field can hold. The duck entry carries no `quantity`, because the aggregator's title
  states the flavour and that it is dry and states no size, and this range is sold in two. The panel
  is the same on both bags, so the entry is right either way; a pack size invented to match its
  neighbours would not be.
* **`check-catalogue.py` cross-checks every entry against its capture.** Protein, fat, fibre,
  moisture, ash and calories, wherever both hold the figure. A capture that missed a line is a
  thinner record and passes; a disagreement fails, because one of two readings of one panel is
  wrong. Verified by setting salmon's protein to 45% where the panel says 54%: inside the plausible
  band, believable as a score, ordinary in a diff, and refused. **This is the only check here that
  can catch a right-looking wrong number.**

Changed
* Section 12.10's step 4 now separates the half a machine does from the half it cannot: the figures
  are compared automatically, and what is left for a person is the ingredient list's order, the name
  and pack size, the AAFCO sentence, and whether the barcode belongs to this product at all.

Notes
* **Batch 1 was five products and landed three.** Pork and rabbit-and-chicken parsed perfectly and
  could not be written: the catalogue is keyed by barcode and neither has one that anybody
  publishes. Dr. Elsey's markup carries no `gtin`, `sku` or `upc`, checked directly.
* **The four resolved codes form an obvious family** and pork's almost certainly sits in it.
  Nothing was inferred from it. A guessed barcode attaches one product's panel to another product's
  scan, looks wrong nowhere, and no gate can catch it.
* **Two findings about the resolver, both of which matter more for M29 than for M23.** Queries
  naming the pack type return 404 where brand, line and flavour return rows. And the trial endpoint
  429s after about three to five queries, so a lookup is scarce. The top 100 needs at least a
  hundred of them, and that is a constraint transcribing faster does not touch.

## [0.33.0] - 2026-09-09

**The panel capture from section 12.11 is built, and it goes in a sidecar rather than on the entry,
because an entry is a download.**

Added
* **`tools/data/panels/<barcode>.json`,** holding the panel verbatim beside the figures it prints,
  keyed by barcode. `transcribe.py` writes one whenever it writes an entry, and the first is Dr.
  Elsey's cleanprotein Chicken Recipe Kibble: 11 printed figures including EPA, DHA, omega-3,
  vitamin E, the taurine percentage and kcal/cup, none of which the catalogue entry can hold.
* **`check-catalogue.py` checks captures.** Shape, not meaning, per rule 3: the plausible bands
  exist to protect scores and nothing here is scored. The one thing enforced beyond shape is rule 2,
  that a capture and its entry carry the same source and the same checked date, because parsed
  fields that are current beside raw text that is two years stale would be a trap. Verified by
  breaking it four ways: a drifted date, an unknown key, a text too short to be a panel, and a
  figure stored as a number instead of as printed. All four refused.

Changed
* **Section 12.11 said captures live "in their own block on the entry". That was wrong and is
  corrected there.** `assets/data/catalogue.json` is fetched by every visitor and precached by the
  service worker: five entries are 8.6KB and a captured panel is about 3KB, so a hundred of them on
  the entries would have pushed a quarter of a megabyte of data no page reads onto every device,
  offline installs included. Nothing under `tools/` is served. The rule that a capture is not a
  curated field is now enforced by the filesystem instead of by a convention, and no JavaScript
  changed, which is the sign it was the right place to put it.
* **Order.** This was scheduled first inside M29, after M23. It was built before both, for the
  reason the policy exists: entries written before the capture are exactly the entries that would
  need refetching, and M23 is about 18 more of them.

Fixed
* **The page's own character set.** `fetch_text` decoded every page as utf-8 with errors replaced.
  Dr. Elsey's serves Windows-1252, so its en dashes and trademark signs were arriving as U+FFFD:
  survivable while only numbers were being read, fatal the moment 12.11 started keeping text
  verbatim. It now honours the declared charset, then utf-8, then Windows-1252, which is what a
  browser does.
* **Three faults in the figure reader, all found on the first panel it met.** A line-wide match read
  "Eicosapentaenoic Acid (EPA) (min) 0.06%, Docosahexaenoic Acid (DHA) (min) 0.06%" as one figure
  labelled "min", losing both fatty acids this section was written about. Splitting on every comma
  turned "3,953 kcal/kg" into 953. And flattening the text before scanning ran the guarantee into
  the paragraph after it, which cost the panel its last figure, omega-3. A panel's line breaks are
  its structure.

Notes
* Backfilling the four earlier entries is not scheduled. They are not wrong, only thinner, and they
  are revisited when their products are. `check-catalogue.py` reports the count rather than
  requiring one.
* Section 24.1's open item for this is deleted, having been opened and closed the same day.

## [0.32.0] - 2026-09-09

**Documentation only. A retention decision: transcription captures everything the panel prints,
including the figures nothing scores.**

Added
* **PRD section 12.11.** Every published figure is read and kept, whether or not anything uses it,
  and the panel's text is kept verbatim beside the parsed fields. The reasoning is asymmetric cost:
  reading a figure while the panel is already open is nearly free, and going back for it later is
  the whole transcription repeated, for every product already entered.
* **The list of what is currently dropped**, from the label that prompted this: EPA, DHA, omega-3
  and omega-6 percentages, vitamin E in IU/kg, calcium, phosphorus and magnesium where a label
  prints them, the feeding guide, the AAFCO statement as a sentence rather than as two derived
  values, the manufacturer's own footnotes, and the taurine and kcal/cup figures the record
  currently reduces to a boolean and a single unit.
* **The rule that makes it safe:** a captured figure is not a curated field. It lives outside
  `DATA_FIELDS`, `mergeCurated` never puts it on the page, and the provenance box keeps listing only
  what the score stands on. Storing more must not make the site claim more.
* Section 12.10's step 3 now names the capture as part of the process, and section 24.1's open item
  is rewritten around the decision rather than around the four missing figures that prompted it.

Notes
* **Long term these figures may earn a place in the score. Today they are stored and read by
  nobody**, which is the honest state for a number nobody has reasoned about. Section 6 is
  unchanged.
* This is first in line inside M29, ahead of the batches, for the reason the policy exists: entries
  written before the raw block exists are exactly the entries that would need refetching.
* No code changed. The transcription work is `[0.30.0]`, the roadmap is `[0.31.0]`.

## [0.31.0] - 2026-09-09

**Documentation only. The roadmap the owner set after the coverage number came back, and two gaps
a photograph of a label turned up.**

Changed
* **The queue is reordered and M27 is split in three.** M27a, the transcription process, shipped
  and is section 12.10. M29, the top 100 transcribed in batches of five, is now slot 2, **ahead of
  the public beta**. M34, contributions through GitHub issues, stays after it. The order is the
  project owner's, taken on 2026-09-09 in answer to the 0-of-100 measurement: defer the launch,
  build the process, prove it on Dr. Elsey's, then transcribe.
* **M23 is no longer described as blocked.** It was unblocked the same day it was measured, by
  reading "published" less narrowly: aggregators hold the UPC the manufacturer does not print. One
  product is in and scores 90; about 19 food SKUs remain.
* **M30 is deferred rather than decided.** The 80% criterion stands until somebody restates it, and
  the batches are what move it. The old argument for launching first is left visible in section 13
  rather than deleted, with a note on which half of it survives: a beta teaches you what visitors
  want, and it does not teach you transcription volume.
* Section 12.9 now says the coverage number is re-measured at every batch. A batch that moves it by
  nothing means the transcriptions and the measurement disagree, which is worth knowing after five
  entries rather than after eighty.

Added
* **A verification step, in section 12.10: read the entry against a photograph of the printed panel
  where one exists.** The first entry was checked this way and every figure agreed, including the
  absent ash figure, which the label does not print and the entry does not carry. A website and a
  bag are two publications of the same label and they can disagree, because one is edited and the
  other is printed.
* **Two open items in section 24.1, both found by that check.** The panel states EPA, DHA, omega-3
  and vitamin E and the schema has no field for any of them, so they are read and dropped. And
  `expandGroups` requires square brackets while this label prints `Vitamins (Niacin, ...)`, which is
  the exact condition M24 shipped to fix, met again in different punctuation.

Notes
* No code changed in this entry. The transcription work it describes is `[0.30.0]`.

## [0.30.0] - 2026-09-09

**A transcription process, and the first product transcribed with it: Dr. Elsey's cleanprotein
Chicken Recipe Kibble, which scores 90.**

Added
* **`tools/transcribe.py`,** the general form of `label-deck.py`. It reads a panel from a
  manufacturer page as well as from a PDF, imports the PDF tool's parsers rather than copying
  them, proposes an entry for review, and writes it only with `--write`, running
  `check-catalogue.py` immediately and restoring the file if the gate refuses.
* **A barcode route, which unblocks M23.** The manufacturer publishes no UPC and no retailer shows
  one, but aggregators hold it: `--find-barcode` prints candidates from UPCitemdb with the titles
  they are filed under, **and never picks one**. A wrong barcode files one product's panel under
  another product's scan, both halves are individually valid, and no gate can see it.
* **PRD section 12.10, the process itself:** find the panel, resolve a barcode, propose, read every
  figure against the source, write, then load the product page and see what the visitor sees. In
  batches of five, each batch a checkpoint with the gates, a commit and a re-measured coverage
  number.
* The first entry: UPC 000338026604, 59% crude protein, no flagged additives, scored 90 and
  Excellent. The catalogue holds 5.

Fixed
* **The plausible band for protein was 50% and rejected a manufacturer's published 59%.** Dr.
  Elsey's cleanprotein kibble is a real product and that is its printed figure; the band was drawn
  from a database of supermarket food and had encoded "ordinary" as "real". It is 65 now, in
  `check-catalogue.py`, `opff.js` and `probe-opff.py`. It still catches what it exists to catch: a
  per-kilogram figure lands in the hundreds.
* **The provenance box credited a record that does not exist.** It ended "everything else on this
  page is from the Open Pet Food Facts record", which is true of an entry filling gaps in a record
  and false of a product upstream has never heard of. Every curated entry before this one was the
  first kind. `mergeCurated` now records whether there was an upstream record, the page says the
  honest sentence for each, and two tests hold both branches.
* `find_aafco` matched the adequacy statement only near the start of a block, which suits a PDF
  that gives it a paragraph and not a web page that buries the same sentence at the end of three.
  It finds the claim and walks back to the start of its sentence now.
* Service worker `v10` to `v11`.

## [0.29.0] - 2026-09-09

**M22 is finished: top-100 coverage is measurable, and it is 0%.**

Added
* **`tools/measure-coverage.py`,** which answers M30's oldest criterion. Coverage is measured
  through the site's own search path, not through the catalogue: a visitor who wants a best-seller
  types its name, so the tool runs each SKU's name through the same endpoint, category filter and
  fields the search page uses, and asks whether the same product comes back with an ingredient
  list. The barcode gap that held this milestone open turned out to be a question about the
  catalogue's internals rather than about the criterion.
* **`tools/data/coverage.json`,** every decision with its evidence: the query, the best candidate,
  the words that matched, whether the brand was confirmed. `--review` prints the borderline calls.
* PRD section 12.9, the measurement and what it can get wrong in both directions.

Notes
* **0 of 100.** Four best-sellers matched a database record that holds no ingredient list, twelve
  were close enough to need a person and were different products on inspection, and 84 had no
  candidate. Five more carry ingredients but are not tagged `cat-food`, so the site's own filter
  hides them.
* This is not an empty database. It holds 13 Fancy Feast records, 32 Friskies, 27 Sheba, and 89 of
  the 100 best-sellers found a candidate of the right brand. What it does not hold is the specific
  products people buy: "meow mix original choice" is in there, is unmistakably the number-five
  best-seller, and cannot be scored.
* **The matcher was wrong twice before it was right, and both times it printed a confident
  percentage.** The first treated flavour words as noise, so every Fancy Feast matched every other
  Fancy Feast at 1.0 and coverage looked real. The second asked for the brand plus four words, and
  since every term narrows that endpoint, it found nothing at all and reported zero for the wrong
  reason. Reading the rows caught both; reading the total would have caught neither. Seventh
  instance, and the first where the same instrument failed in both directions inside an hour.
* M30's target is 80%. The gap is not a gap, and what to do about it is the project owner's call,
  recorded as an open decision rather than settled here.

## [0.28.0] - 2026-09-09

**M24b: the search asks Open Pet Food Facts a second earlier, because it stopped waiting for
three things it did not need to wait for.**

Changed
* **`<link rel="modulepreload">` for each page's whole module graph.** Eight modules used to
  arrive in three serial waves, because the browser cannot ask for `opff.js` until
  `search-page.js` has been parsed, or for `catalogue.js` until `opff.js` has. Naming the graph in
  the head collapses that into one wave. The list is computed by reading the imports out of the
  sources, never written down, so it cannot drift the way a hand-kept list does.
* **`loadCatalogue` caches its promise instead of its result.** A filtered search fans out into
  five concurrent page requests, all five awaited the catalogue in the same tick, all five found
  an empty cache, and `catalogue.json` was fetched five times on the critical path. It is fetched
  once now.
* **`searchProducts` and `fetchBrands` issue their request before reading the catalogue.**
  Neither URL depends on it. Both still merge curated data into the results exactly as before;
  only the order changed.
* Service worker `v9` to `v10`.

Added
* **A gate for duplicate local requests,** in `check-vitals.py`: no page may fetch the same file
  from this repository twice, on any page, gated or not. Every number that file already collected
  counted requests without ever asking whether two of them were for the same thing, which is why
  five fetches of one file sat on the critical path in plain sight.
* **A gate for the preload list,** in `check-live.py`: each built page's preloads must equal the
  graph computed from the module sources. 28 live checks to 29.

Fixed
* **The first version of the preload list was silently short by one file.** The import pattern was
  line-bounded and `opff.js` imports five names from `catalogue.js` across three lines, so the
  module holding the entire curated catalogue was left out. The page worked, the preloads looked
  right, and the waterfall it left behind was the one nobody would have gone looking for again.
  This is the sixth time the instrument was the thing that was wrong, and the first time it was an
  instrument built in the same commit as the fix it was measuring.

Notes
* Measured on the same throttle as the gate, `/search/?q=chicken`: **first API request 2271ms to
  1361ms**, search LCP 3452ms to 2596ms, product page LCP to 2284ms.
* The plan recorded in `[0.27.0]` was an inline head script that starts the fetch before any
  module loads. It was not built. It duplicates URL construction in a second place, and the day
  the two copies disagree the page issues two requests and nothing says so, because two requests
  look exactly like one slow one. The three ordinary fixes above got most of the way there and
  none of them add a second source of truth.
* The API pages are still over the LCP budget and are still not gated on it. What is left is Open
  Pet Food Facts' own response time, about a second on this throttle.

## [0.27.0] - 2026-09-09

**M24a: every page says which address it lives at. And the LCP number in `[0.25.0]` was
measuring the wrong thing.**

Added
* **`rel=canonical` on all twenty pages.** A `{{canonical}}` token sits beside `{{root}}` and is
  substituted by the same writer that already knows how deep each page is, so no page ever
  contains a hand-written absolute URL. `BASE` moved into `tools/site/chrome.py`, giving both
  generators one definition of the site's address, which is what makes the next rename a one-line
  change rather than the twenty-nine-file sweep of `[0.24.1]`.
* **A gate for it,** read off disk rather than over the wire: the value is a production URL and
  `check-live.py` serves from `127.0.0.1`, so a check that compared the tag to the page it fetched
  would pass while every page pointed at the wrong site. 27 live checks to 28.
* The canonical is a page's own directory, never a query string, so `/product/?barcode=X`
  canonicalises to `/product/`. There is one product document and it renders whatever the query
  asks for; saying otherwise in a tag would not make it two pages.

Changed
* **The filtered search paints page one as soon as it lands** instead of waiting for all five scan
  pages, and says "still checking further results" until the rest arrive. About 450ms of waiting
  removed. Service worker `v8` to `v9`.

Fixed
* **`[0.25.0]` said M26 "tripled LCP on a search", from about 1.0s to 3.3s. That was a
  misreading, and the site was never three times slower.** Instrumenting the throttled page to
  name the element behind the number: on `?only=all` the largest element is the filter checkbox
  label, static chrome that paints at 1080ms; on the filtered default it is a line inside a result
  card, at 3452ms. Both paths receive their first API response at the same moment, 3.1 to 3.3
  seconds. The metric changed which element it was measuring. The page did not change speed.
* Two changes were made on the strength of the wrong diagnosis before it was checked. The first,
  painting page one early, is worth keeping on its own merits and is above. The second, issuing
  the first request alone so it would not share bandwidth, was reverted: it cost a round trip and
  bought nothing, because bandwidth was never the constraint.

Notes
* **The real number, now that something is pointed at it: 2257ms pass before the first API
  request leaves the browser.** Stylesheets, fonts, a blocking theme script, six ES modules and
  two data files all load first. Everything after is quick, the search response lands a second
  later and the four extra scan pages add 450ms between them. So more than half of a four-second
  search is spent before the site has asked anybody anything. That is M24b, which is reopened
  and now aimed at the thing that is actually slow.
* **This is the fifth time a measurement turned out to be about the instrument.** M20a, M21a,
  M22, M25, M26. The new one is worth naming precisely, because it is subtler than the others: a
  correct number, honestly gathered, describing something other than what it was read as
  describing. "LCP got worse" was true. "The page got slower" did not follow, and nothing in the
  number said so either way until somebody asked which element it belonged to.

## [0.26.0] - 2026-09-09

**M24: the flag goes on the ingredient that earned it.**

Fixed
* **A twelve-item vitamin premix no longer reads as high risk because one of the twelve is.**
  Purina prints `VITAMINS [...]` and `MINERALS [...]`, the splitters kept bracketed groups whole,
  and the product page put the Tier 3 chip menadione earns on the entire block. Cat Chow Complete
  went from 28 ingredient rows to 38, and the chip now sits on `menadione sodium bisulfite complex
  (Vitamin K)` alone.

Added
* `assets/js/ingredients.js`, and 24 assertions in `ingredients.test.js` written before the
  change rather than after it, because a test written afterwards only records what the code does.
* Both splitters, in `opff.js` and `catalogue.js`, run the expansion. Service worker `v7` to `v8`,
  with the new module precached.

Notes
* **The rule is narrow, and the narrowest part is the point.** A group expands only when it uses
  square brackets, has two or more members, and its heading names a group rather than an
  ingredient. An earlier draft dropped every heading before a bracketed list. That is correct for
  the two Purina prints in the catalogue and it silently deletes chicken fat the first time a
  label writes `chicken fat [preserved with mixed tocopherols, rosemary extract]`. That case is
  now a test, and the heading list contains words seen on labels rather than words that seemed
  likely.
* **This moved no scores, and it was measured rather than assumed.** All four catalogue products
  scored the same after as before. Tier 2 and Tier 3 matching runs against the joined text of the
  whole list, so menadione was found before and is found after, and the Tier 3 cap at 49 is
  untouched. Only the Tier 0 beneficial credit is per entry, so the one way expansion can move a
  score is upward. That is asserted in a test, not left as a paragraph.
* The milestone was queued as "it moves scores, so write the tests first". It turned out to move
  the page and not the scores, which is only knowable in that order.

## [0.25.0] - 2026-09-09

**M26: the search page hides what it cannot score, and says so every time it does.**

Changed
* **The scorable-only filter is on by default.** Two thirds of Open Pet Food Facts carries no
  ingredient list, so a search used to open on a column of grey "Not scored" tiles. That was an
  honest view of the database and a useless view of cat food.
* **The label says what is missing, wherever anything is.** "Showing 1-24 of the 51 products in
  all 83 results for "chicken" that can be scored - 32 with no ingredient list are hidden - Show
  everything". The count and the way out are in the same sentence as the results, addressed to
  somebody who never touched the control and may not know it exists. This was the condition the
  milestone shipped under, not a nicety: it was queued behind the coverage number on the grounds
  that hiding a gap before measuring it is the wrong order, and what that argument actually asks
  for is disclosure rather than delay.
* **The choice is remembered,** in `localStorage` under `cfc-only`. Fourth thing this site
  stores, and the first that is not the visitor's own history. Unreadable storage means the
  default, as everywhere else here.
* **`only` in the URL always wins over what is stored,** and `urlFor` now always writes it. A
  link whose meaning depends on the recipient's browser storage is not a link somebody can send,
  and section 16.7 says every view is one.
* The first-visit empty state and the "None of these can be scored" state both now say the page
  filters by default, rather than describing a filter the visitor is assumed to have chosen.
* Service worker `v6` to `v7`.

Added
* **Three live checks, because the existing ones could not see this.** All three search checks
  passed unchanged after the default flipped: they assert the substring "can be scored", which
  the filtered and the unfiltered label both contain, so the gate was blind to exactly the thing
  the milestone changed. The new checks assert that an unqualified search filters and discloses
  the hidden count, that `only=all` overrides the stored preference, and that turning the filter
  off survives a navigation to a different search. 24 live checks to 27.

Known cost
* **This tripled LCP on a search.** The filtered path fetches five pages of results in parallel
  and renders nothing until all five have landed, so making it the default made that the normal
  experience: `search results (API)` measured about 1.0s before and 3.3s after, repeatably, on
  the same machine and network. It is not a gate failure, because API pages sit outside the
  vitals budget on the grounds that upstream latency is not ours. That reasoning is what let a
  self-inflicted regression through, and it is worth revisiting rather than leaning on. Recorded
  in section 16.11 with the fix, which is to render the first page's results as they land instead
  of waiting for the fifth, and which should happen before the beta.

Notes
* **Fourth time a gate has been blind to the change under it,** after M20a, M21a and M25. The
  pattern is now specific enough to name: a check that asserts a substring both branches of a
  decision produce is not checking the decision. Worth a sweep of the other loose assertions
  before the next milestone that changes a default.

## [0.24.2] - 2026-09-09

**Two things `[0.24.1]` said an hour ago are not true. Corrected here rather than there,
because section 23.6 means an entry is not edited to match what was later learned.**

Fixed
* **"Canonical tags on all twenty pages" describes something this site does not have.** There is
  no `<link rel="canonical">` anywhere on it, verified by fetching the live home page and finding
  none. What each of the twenty pages actually carries is one occurrence of the absolute URL, the
  "Report a problem" link in the footer, written by `tools/site/chrome.py`. The rename was still
  applied correctly and completely; the entry described the right work with the wrong noun.
* **"GitHub redirects the old repository and Pages path" is half right.**
  `https://github.com/Azqato/Cat-Food-Center` answers 301 to the new repository.
  `https://azqato.github.io/Cat-Food-Center/` answers **404**. GitHub redirects the repository and
  not the Pages path. Every link to the old site that exists anywhere is dead, not forwarded.
* **The stale service worker is therefore a worse problem than `[0.24.1]` recorded, not a
  smaller one.** That entry said the old worker "cannot serve stale pages here", which is true
  and beside the point. A worker at the old path serves *that* path from its own cache, so a
  returning visitor who opens the old URL gets a working copy of the site as it stood in early
  September, served past a 404, with no way to notice. The site is pre-beta and has no such
  visitors, so this is still recorded rather than fixed, but it is recorded as what it is.

Notes
* **Found by checking, which is the only reason it was found.** The rename commit passed 217
  tests and 24 live checks, because no gate knows what the production URL is: `check-live.py`
  drives a local server on `127.0.0.1`. Both errors were in prose, and prose is the part of this
  repository nothing gates. The verification that caught them was three `curl` calls that could
  have been skipped, on the grounds that the deploy was obviously fine, which it was.
* **A canonical tag is worth adding and is not in this entry.** A site that has moved once and
  has no canonical tag is a site that cannot tell a crawler which address is the real one. It is
  a change to the page head on twenty pages rather than a URL correction, so it belongs in a
  milestone of its own rather than in a chore.

## [0.24.1] - 2026-09-09

**The repository was renamed, so the site moved.**

Changed
* `Cat-Food-Center` to `catfoodcenter`, everywhere the absolute URL had to be written down:
  canonical tags on all twenty pages, `sitemap.xml`, `robots.txt`, the `Sitemap:` line inside it,
  the probe user agent in `tools/probe-opff.py`, the base in `tools/site/build.py`, the "Report a
  problem" link in `tools/site/chrome.py`, `README.md`, `LICENSE.md` and the PRD. Both page
  generators were re-run rather than the output being edited by hand.
* Live site is now **https://azqato.github.io/catfoodcenter/**, repository
  **https://github.com/Azqato/catfoodcenter**. The git remote was repointed.
* **PATCHNOTES was deliberately left alone.** Every earlier entry still names the old URL, and
  section 23.6 says entries are historical records and are never rewritten to match the present.
  GitHub redirects the old repository and Pages path, so those links still resolve.

Notes
* **Twenty pages carried the old path in exactly one tag each, and no page carried it in a link.**
  That is ADR-001 working: every internal path on this site is relative, so a change of subpath
  touched only the places that are required to state an absolute URL. A site with absolute
  internal paths would have needed all twenty pages rewritten rather than one line each.
* **A visitor who used the site before today keeps a service worker registered at the old path.**
  A worker controls its own path and below, and the old scope no longer matches anything the new
  site serves, so it cannot serve stale pages here; it will sit inert against a path that now
  redirects. It is recorded rather than fixed because the site is pre-beta and has no such
  visitors to strand. If that changes before launch, the fix is a one-line unregister on the old
  path, not a cache version bump, because a bump only reaches a worker that is still in scope.

## [0.24.0] - 2026-09-08

**M25: the catalogue is consulted everywhere it is needed, not in one place.**

Added
* **Search reads the curated catalogue.** `applyCurated` merges catalogue data over every
  product a search returns, and `searchCatalogue` finds curated products the API cannot return
  at all, matching on name, brand and pack size. Curated-only matches are put first: there are
  few of them, they are the records this project vouches for by name, and the alternative is
  burying them under a ranking that has never heard of them.
* **Catalogue brands join the brand index,** exempt from the minimum-product threshold. That
  threshold hides the database's long tail of one-product transcription noise; a brand entered
  by hand is the opposite of noise, because entering it was a decision.
* **"Recorded by hand" on the search card,** and the result line now says how many of the
  results are. The card is where a score is first read, and a caveat that stays behind on the
  product page is a caveat that does not exist. Same argument M18b made for confidence.
* **A live check that a card and a page cannot disagree.** `check-live.py` reads the score off
  `/product/?barcode=0017800150149` and off that product's search card and fails unless they
  match. It asserts agreement rather than a number: pinning 49 would fail every time the engine
  legitimately moved, and would not have caught this.
* Nineteen assertions in `catalogue.test.js` covering the three new functions, including the
  two rules most likely to be simplified away later: only named entries are findable this way,
  and the ingredient list is not searched.

Fixed
* **The site contradicted itself, on production, in public.** A search for "Cat Chow Complete"
  returned a card reading "No ingredient list on record. Not scored", under a count line saying
  "0 of these can be scored", while the product page for the same barcode scored it 49 off a
  transcribed manufacturer panel and listed every ingredient. Both views came from this site,
  from the same data, in the same minute. Section 16.5b had recorded the discoverability half of
  this the day before and missed this half, which was the visible one.
* **A search no longer loses local data when the database is unreachable.** Curated matches are
  returned under a warning instead of being replaced by a failure message. The one path where
  the catalogue is the only source there is was the one path that threw it away.
* **Result numbering across pages.** Curated matches are counted on every page and shown on the
  first, so a search no longer reports 1579 results on page one and 1578 on page two, and page
  two's numbering steps over the entries page one added.

Changed
* Service worker `v5` to `v6`.
* **PRD section 16.5b** rewritten from an open defect to what was built, with the route table
  now showing before and after and the five decisions worth keeping.
* **M26 added to the roadmap:** hide unscored products by default. The scorable-only control
  already exists; what is new is the default, making it survive a navigation, and saying plainly
  that it hides most of the database. Queued behind the coverage number, because it hides the
  evidence of the gap that number measures.

## [0.23.1] - 2026-09-08

**A curated product resolves, and nothing leads anybody to it.**

Changed
* **PRD section 16.5b, new, and M25 on the roadmap.** `loadCatalogue` and `mergeCurated` are
  called from `fetchProduct` and from nowhere else, so a product the API has never heard of can
  be reached by scanning its barcode or by following a direct link, and cannot be found by
  typing its name into search or by browsing brands. Merge rule 4 in 16.5a said such a product
  "still resolves", which is true of the product page and of nothing else; the rule now says so.
* Found by being asked why Dr. Elsey's was missing from the brand index. It is missing because
  Open Pet Food Facts holds no Dr. Elsey's food, only their cat litter, and the brand index is
  the API's own facet. The question was about a brand that was never added; the answer exposed a
  gap that would have applied to one that was.
* **Why it had gone unnoticed:** all four curated entries so far fill gaps in records the
  database already holds, so every one of them is searchable and browsable for reasons that have
  nothing to do with the catalogue. The failure only appears for an API-absent product, and none
  exists yet.
* M25 is a prerequisite for M22's coverage number, not a refinement of it. "The site can score
  this product" and "a visitor can find this product" are different numbers, and M30's criterion
  means the second.

---

## [0.23.0] - 2026-09-08

**The product library, captured (M22, partial).**

Added
* `tools/capture-rankings.py` and `tools/data/top-skus.json`: 300 ranked rows from Amazon's cat
  food, dry cat food and wet cat food best-seller lists. The first written answer this project
  has had to "which products should the site cover?". Every capture is dated and appended, never
  replaced, because a product falling off a best-seller list is information about the market.

Changed
* **Section 12.7 said the capture had to be done by hand. It was wrong, and the correction is
  the interesting part.** That conclusion rested on Amazon returning HTTP 503 and Chewy 429,
  which were facts about the fetching tool rather than about the storefronts. Driven through
  Edge, the way every other tool here drives a browser, Amazon serves its best-seller pages
  normally. An instrument's failure had been read as a fact about the world, which is the same
  error section 24 has been collecting since M18.
* Storefront access, measured by pointing a real browser at each: Amazon loads with real rank
  numbers. Chewy returns 403 with a bot-detection reference, Walmart serves a "Robot or human?"
  interstitial, and Petco returns 403 to every URL tried. PetSmart loads but carries no usable
  product name in any anchor.
* Section 24.1's row is narrower: the list exists now, and what is still missing is the coverage
  number.

Removed
* Twenty-four Target rows, captured and then deleted. Target's link text runs the promotional
  line, the price, the product name and the star rating into one string. A partly cleaned name
  looks usable and is not, and the name is the only thing a person can match against a
  manufacturer's label deck.

Known and stated
* **The list is Amazon-only, so it is supermarket food.** Chewy was named in section 12.7
  precisely because a pet-specialist channel ranks premium brands that barely register
  elsewhere, and every specialist source refuses. Anything chosen purely from these rankings
  inherits that bias, which is why Dr. Elsey's is a milestone rather than a ranking row.
* **A captured row cannot become a catalogue entry.** Rows carry names; the catalogue is keyed
  by barcode; no storefront publishes a UPC. Amazon hides it, and Target's pages do not show it
  either. M30's coverage criterion is defined and still unmeasured.

---

## [0.22.0] - 2026-09-08

**The catalogue grows (M21). An additive pill that could never wrap (M21a).**

Added
* Three curated entries, transcribed from Purina label decks: Cat Chow Complete `0017800150149`,
  Fancy Feast Kitten Tender Turkey Feast `0050000575008`, and Friskies Sea Captain's Pate
  `0050000425648`. All three are `sourceKind: "manufacturer"`, all three filled records that had
  neither an ingredient list nor an analysis, and each one records in its note why that barcode
  is believed to describe that deck.
* `tools/label-deck.py`. Give it the URL of a manufacturer label deck and it prints a proposed
  catalogue entry: guaranteed analysis, ingredient list, AAFCO statement, life stage and format.
  It prints rather than writes, because the parser can misread a layout it has not met and the
  reviewer is the last check there is. It needs PyMuPDF, the only library dependency any tool in
  this repository has, and says so plainly if it is missing.
* PRD section 12.7, which for the first time says which hundred SKUs "top-100 coverage" means:
  the Amazon and Chewy rankings, merged, with a quarterly refresh procedure and a rule that a
  previous capture is kept rather than overwritten.
* PRD section 12.8, which measures where a label panel can actually be read. Purina publishes a
  PDF deck per product as text. Mars publishes the panel as an image, so Sheba, Temptations,
  Whiskas and Iams cannot be transcribed at all.
* Roadmap entries M22 (capture the list, measure coverage), M23 (Dr. Elsey's) and M24 (premix
  groups).

Changed
* **The United States cat-food category in Open Pet Food Facts is 86 records, 48 of them with no
  ingredient list.** Measured 2026-09-08. The coverage target had been written as though the
  database held the common products and merely lacked their details; it does not hold them.
  Merge rule 4 in section 16.5a, the barcode the API has never heard of, was written as an edge
  case and is the main case.
* PRD sections 13, 15.4, 16.4 and 16.11, and DESIGN section 9.

Fixed
* **`.additive-fn` could not wrap or shrink.** `white-space: nowrap` plus `flex-shrink: 0` on a
  pill whose text comes from the knowledge base. The inorganic phosphates entry reads "moisture
  retention, dental tartar control, acidifier", which took the product page to 420px at a 320px
  viewport and failed WCAG 1.4.10. Every product flagging that additive had been failing reflow
  since the additive cards shipped; none of the 25 fixed page states the accessibility gate
  audits happened to be one of them.
* Three defects in `label-deck.py`, all found by reading its first output against the PDF. It
  was about to record Purina's label revision code "D662122" as an ingredient; it began the
  AAFCO statement at "Louis, MO 63164 USA", because the address contains "St." and the sentence
  match anchored there; and it labelled Friskies Sea Captain's Choice as kitten food when the
  label says "for growth of kittens and maintenance of adult cats", because it tested for growth
  before it tested for both. A tool built to remove transcription error introduced three of its
  own within ten minutes.

Investigated, and not a defect
* All three new products score exactly 49. Three different foods landing on one number is the
  shape of a cap, and it is one: a Tier 3 additive caps a score at 49 regardless of nutrition,
  and every one of these labels lists menadione sodium bisulfite complex. Cat Chow Complete has
  32% protein and scores 49. That is section 6 working as written.

Known, recorded rather than fixed
* Purina prints premixes as `VITAMINS [...]` and `MINERALS [...]`. The splitter keeps bracketed
  groups whole so that "chicken (4%)" survives, so a twelve-item premix arrives as one
  ingredient wearing the Tier 3 flag its menadione earns. The flag is true; its placement says
  the whole premix is high risk. The fix moves ingredient counts and therefore scores, so it is
  M24 with its own tests rather than a footnote here.

---

## [0.21.0] - 2026-09-08

**The curated catalogue, built (M20). Status colours get an ink (M20a).**

Added
* `assets/data/catalogue.json`, `assets/js/catalogue.js` and the disclosure on the product page.
  Product data transcribed by hand where Open Pet Food Facts has none, merged over the
  normalised record field by field, with every curated field named in words directly under the
  score. `mergeCurated` is pure: a product and an entry in, a new product out. It neither
  fetches nor scores.
* `tools/check-catalogue.py`, the seventh gate. Schema, a source and a checked date on every
  entry, the same plausibility bands the normaliser applies to upstream figures, and no unknown
  keys. A misspelled key is rejected rather than ignored, because the merge would skip it in
  silence and a curated figure that never reaches the page looks exactly like one nobody
  transcribed.
* `sourceKind` on every entry, which was not in the design. The first product attempted forced
  it: for UPC 050000102068, two retailer listings gave incompatible ingredient lists for the
  same tin, one with soy protein concentrate, added colour and Red 3, one with soy flour and
  glycine and no colours. There is no way to tell from outside which is stale, so that product
  got no entry and the disagreement became a rule. A retailer listing may fill a gap; only a
  manufacturer panel may overwrite a figure the database already has.
* `assets/js/catalogue.test.js`, seven suites. The unit suite is 198 assertions.
* One seeded entry, `4008429158100`, supplying a Danish ingredient list to a record that has a
  guaranteed analysis and no list. The additive matcher cannot read Danish, so the page says the
  ingredients were not checked. That is section 11.5 working: an unnamed or unreadable language
  is marked unknown rather than assumed to be English, which is exactly how section 12.4
  happened.
* `--excellent-ink`, `--good-ink`, `--poor-ink` and `--bad-ink`. The band colours are fills and
  borders; the inks carry text. In dark the two are the same values, which already passed.

Changed
* **`tools/check-contrast.py` had never checked a status colour against a page background.** It
  had run green over 38 pairs for six milestones while `--good` rendered as text at 2.72:1 on
  `--bg` and 2.91:1 on `--surface`, `--poor` at 2.51:1 and 2.68:1, and `--warning-ink` at
  4.28:1. The gate is 52 pairs now, 11 of them status inks against both backgrounds. Rendering
  a band word inside the new disclosure exposed a failure that was already shipping.
* `--warning-ink` darkened from `#A9660D` to `#9D5E0C`.
* `sw.js` to `v5`, with `catalogue.js` and `catalogue.json` in `SHELL_ASSETS`. Not optional:
  `opff.js` imports `catalogue.js`, so a device holding `v4` would fail offline without it.
* `tools/check-live.py` is 23 checks, the newest loading the seeded barcode from the live API
  and requiring the disclosure to name the field and its source.
* PRD sections 13, 16.5, 16.5a, 15.4 and 26.4, and DESIGN sections 2.2, 7, 8 and 9.
* PRD section 24.1 loses the row that said none of this existed. It was written to be deleted
  the day the feature shipped, and not before.

Fixed
* A merge that changes nothing now claims no provenance. `ingredientsLang` had been counted as a
  curated field, so an entry that only restated the language of a list already present announced
  a curated origin for data that was entirely upstream. It is a modifier now, not data. Two
  tests failed on this before anybody noticed it by reading.
* The disclosure panel pushed the article to 454px at a 320px viewport, from a single unbroken
  source URL. `overflow-wrap: anywhere`. The accessibility gate caught it; a desktop browser
  never would have.

Considered and rejected
* Four gate rows requiring the band fills themselves to reach 3:1 against `--bg`. They were
  added, they failed, and the reasoning was wrong: WCAG 1.4.11 governs graphics that carry
  meaning on their own, and every chip here carries its own text while the 6px band rule is
  `aria-hidden` beside the word "Good". The rows were replaced by a comment recording the
  measurement and the condition that would require them.
* Seeding the catalogue with a hundred products. The mechanism first, deliberately. See open
  question 2.

---

## [0.20.4] - 2026-09-07

**The curated catalogue, designed (M20). Open question 2 answered.**

Added
* PRD section 16.5a: the design for `assets/data/catalogue.json`, the file that carries product
  data transcribed by hand where Open Pet Food Facts has none. The schema, the merge rules, the
  required source and checked-date on every entry, and the gate that enforces them.
* The governing rule, which shaped everything else: a curated figure is never presented as an
  Open Pet Food Facts figure, and neither is silently preferred over the other. A local file
  that quietly overwrote upstream data would break this project's one real claim, that a number
  can be traced to where it came from, in the least visible way available.
* PRD section 24.1 carries a row saying none of it is built. Section 16.5a says the same in its
  first line. A design document is exactly the kind of thing that quietly becomes a description
  of reality, and this project has a history of that, which is what section 24 exists for.

Changed
* Open question 2, whether a curated catalogue is in scope for the MVP, is answered: yes, and
  the mechanism gets built before the hundred products. A hundred hand-entered records with
  nothing to check them would publish wrong scores under this site's name, and the interesting
  case, a curated figure disagreeing with an API figure, would be met at scale rather than
  designed for.
* M20 is on the roadmap as designed and not built. M30 waits on it.

---

## [0.20.3] - 2026-09-07

**No analytics, decided rather than pending.**

Changed
* **"Analytics instrumented" is no longer a condition of public beta.** The criterion had sat in
  the M30 list since before the data in PRD section 12 was measured, and it contradicted section
  14 directly, which gave "no analytics means no visitor data to protect" as the reason for
  having none. A milestone cannot require closing a gap the same document defends. M30 now has
  three criteria, two of them met, and coverage is the only one still open.
* Section 14 says what that costs instead of leaving it implicit. Every acquisition, engagement
  and retention target, and the north star with them, is marked unmeasured permanently: not
  deferred, not pending instrumentation, but never going to be reported. Each row now names what
  would be needed to know it. They are kept because they still say what this project would count
  as success.
* Interaction to Next Paint is marked unmeasurable here rather than merely unmeasured. It needs
  a real session; Total Blocking Time is gated and stands in for it.
* The reporting cadence table stopped promising weekly and monthly reports that nothing produces.
  Performance is every push, coverage is monthly by probe and audit, and the rest is never.

Not changed
* No third-party script was added, and none will be. It would put every visitor's activity into
  the hands of a company neither this project nor its readers control, and add a pinned runtime
  dependency two milestones after M14 removed the last one.

---

## [0.20.2] - 2026-09-07

**The probe measures language, and open question 9 gets a number.**

Added
* `tools/probe-opff.py` reports which languages the ingredient lists are written in, using the
  rule from `assets/js/opff.js` rather than a rule of its own, so it measures what the site
  believes rather than something adjacent to it. It ranks the languages the engine cannot read
  by how many lists each would reach, which is the shape open question 9 asked for on
  2026-09-07: how many products the next language buys, rather than an intuition about which
  languages matter.
* The findings, in PRD section 12.4. The six languages in `MATCHED_LANGUAGES` read 90.2% of the
  ingredient lists that exist. The seventh candidate is Norwegian, 20 lists, which would take
  coverage to 96.2%; every language after that is worth four lists or fewer. French is the
  largest single language at 47.9%, nearly twice English.
* A note in section 12.6: anonymous pagination stops after page 10. `page=11` answers HTTP 401
  with an HTML login page, which reads as a credentials failure and is a paging limit, since the
  endpoint takes no key. The largest sample obtainable is therefore 1000 products of about 1580,
  in the API's own order rather than at random.

Changed
* The probe clamps to page 10 and says so, pauses a second between pages against an API this
  project pays nothing for, and retries only genuinely transient codes. It now prints the sample
  size beside the percentages it derives, because a percentage with an unstated denominator is
  the kind of figure that gets quoted later as a fact about the database.

Not changed
* `MATCHED_LANGUAGES` is still six languages. The standing rule decides the order: aliases
  first, the constant after, never ahead of them. Adding `nb` without Norwegian aliases would
  make the engine report twenty labels as read when it had read none of them, which is the exact
  failure section 12.4 exists to describe.

---

## [0.20.1] - 2026-09-07

**Offline support reaches the Cat Care Guide (M19a).**

Fixed
* **The eleven guide pages register the service worker.** They never loaded `assets/js/pwa.js`,
  because the guide generator and the application generator had drifted apart, so a visitor whose
  first page was a guide got no worker and no offline banner until they opened an application
  page. Recorded in PRD section 24.6 during M19 and closed the same day.
* **A guide page that has been read stays readable offline.** Registering the worker was only
  half of it: navigations were network-first and wrote nothing to any cache, so a guide read a
  minute ago vanished with the signal. A successful navigation is now kept when its address
  carries no query string. That condition is deliberate. Every product is the same document under
  a different query, so caching those would add a byte-identical entry per product viewed and
  grow the shell cache without bound, which is why navigations were not cached at all before.
  Guide pages have no query string, and neither will most pages added later.

Changed
* `tools/check-live.py` is 22 checks. The scope check registers from `/learn/nutrition/` now,
  the deepest page on the site, rather than from `/search/`, which was as deep as M19 could
  manage because no guide page would register anything. A new check reads a guide page, goes
  offline, and requires that page back and an unread one to fall through to the offline page.

Not changed
* `sw.js` stays at `v4`. The version lever exists to retire cached content that has become
  wrong, and nothing under `v4` is wrong. Bumping it as a changelog gesture would re-download
  the shell on every device for nothing.
* The guide pages are still not precached. Eleven documents is about 290 kB on install, on a
  connection this project assumes is bad, for pages a visitor may never open.

---

## [0.20.0] - 2026-09-07

**Every page is a directory now (M19).**

The repository root holds eight files: `index.html`, `sw.js`, `robots.txt`, `sitemap.xml`,
`manifest.webmanifest`, `favicon.svg`, `README.md` and `LICENSE.md`, plus `.nojekyll` and the
git and GitHub files. Each is there because something outside this project requires it to be,
and PRD section 16.4 says which of the four requirements applies to each one. Everything else
moved.

Changed
* **Nineteen page addresses changed.** `/search.html` is `/search/`, `/learn-nutrition.html` is
  `/learn/nutrition/`, and so on for every page but the home page. The old addresses 404. They
  were retired without tombstones, which section 23.3 normally requires, under a pre-beta
  exception written the same day: no inbound link to any of them is known, the sitemap listing
  them was a day old, and nineteen stub files at the root would have defeated the milestone that
  created them. The exception expires at public beta and is not renewable. All nineteen are
  listed in PRD section 24.6.
* `tests.html` moved to `tools/tests.html`, beside the script that drives it. Its `noindex`
  travelled with it.
* Around 140 paths were rewritten, and not one of them is a hand-written `../` prefix. The
  chrome, the content fragments and the guide modules write the token `{{root}}`; each generator
  substitutes `./`, `../` or `../../` for the depth it is writing into. Nothing upstream of that
  substitution knows how deep its output will sit, which is the property that makes this
  survivable: a wrong prefix works from one directory, 404s from another, and looks identical in
  a diff.
* Scripts measure their own location instead of assuming it. `assets/js/site.js` derives the
  site root from `import.meta.url` and `assets/js/pwa.js` derives the service worker path from
  `document.currentScript.src`, because a file in `assets/js/` is two levels below the root
  whichever page loaded it.
* The service worker is `v4`. A device holding `v3` has nine documents cached under addresses
  that no longer exist, so the caches are replaced rather than migrated.
* `sitemap.xml` is generated by `tools/site/build.py` from the same page lists that write the
  pages. It had gone stale by hand twice, and a sitemap advertising addresses the site does not
  serve is worse than none.

Fixed
* **Every score on the site.** `scoring.js` loaded its additives knowledge base from
  `./assets/data/additives.json`, resolved against the page, so from `/product/` it requested
  `/product/assets/data/additives.json` and every product read "Could not load this product".
  It now resolves against the module.
* **A gate that could not fail.** `tools/check-live.py` passed all twelve page-load checks while
  the site was in exactly that state, because it asked only whether a heading was non-empty and
  "Could not load this product" is a non-empty heading. Each page-load check now asserts a string
  the page cannot print unless it worked. This is the M18 lesson in a second place: a check that
  cannot fail is not a check.
* The first product case in that file claimed to exercise a full guaranteed analysis. Its record
  had lost its ingredient list upstream, so it had quietly become a duplicate of the case below
  it and the scored page was not being checked at all.

Added
* A twenty-first live check: a worker registered from `/search/` must have the whole site in
  scope and must control the home page. A wrongly scoped registration does not fail, it
  succeeds and narrows offline support to one directory with nothing logged anywhere.

Documented
* PRD section 16.4, the root policy, no longer carries the banner saying the repository did not
  satisfy it yet. Section 15.5 records the rule this milestone established: a change whose
  intermediate states are broken ships as one push, gated locally first, because `main` deploys
  on push.
* PRD section 24.6 gained a second row. The eleven guide pages do not load `assets/js/pwa.js`,
  so arriving on one registers no service worker. That is long-standing rather than new, it was
  found while writing the scope check above, and it is recorded rather than fixed here: adding a
  worker registration to eleven pages is a behaviour change, and this milestone is about where
  files live.

---

## [0.19.0] - 2026-09-07

**Confidence travels with the score (M18b).**

Changed
* **Every card that prints a score now prints its confidence.** The band pill reads "Good ·
  medium confidence" rather than "Good", on search results, brand-filtered results and the
  recently-viewed list, and the same text is in the score tile's accessible name. The product
  page and the compare page have stated confidence since M7 and M11; the cards printed a bare
  number, which is the surface the number actually travels on.
* Shown at every confidence level, not only the poor ones. A marker that appears selectively
  makes its absence into a claim.

Added
* Recently-viewed entries store `confidence` beside the score, because the home page redraws
  that card from `localStorage` with no network round-trip. An entry saved before this release
  has none and says "confidence not recorded" rather than guessing; opening the product again
  rewrites it.
* A twentieth check in `tools/check-live.py`: every scored card on a page of results states
  its confidence.

Noted
* Withholding the number below a threshold was considered and rejected. It is the strictest
  reading of tenet 2, but the engine already refuses outright where it knows too little
  (`scorable: false`), and a second quieter refusal on top of that would have cost usability
  without buying honesty. Closes PRD open question 1.

---

## [0.18.3] - 2026-09-07

**Six decisions recorded (no code).**

Four open questions were answered and two rules were set for M19. None of this changes what
the site does today; it changes what the next change is allowed to do.

Answered
* **Open question 1: a low-confidence score is shown, and never without its confidence.** The
  problem was never that the caveat was too quiet, it was that it did not travel: the product
  and compare pages state confidence and the search and brand cards print a bare number. M18b
  will put it on every surface that prints a score, always rather than only when it is poor.
  Not built yet.
* **Open question 3: feeding-trial substantiation is deferred to M30.** The database has no
  such field, so weighting it now would score how well a product was catalogued rather than
  the food itself.
* **Open question 8: the tombstone mechanism gets written when first used.** The first case
  arrived the same day and declined to use one, which is the answer working rather than
  dodging it.
* **Open question 9 stays open, on purpose.** `tools/probe-opff.py` will be extended to report
  the language distribution of ingredient lists first. Nothing is added to `MATCHED_LANGUAGES`
  until that number exists.

Added
* **A pre-beta exception in PRD section 23.3.** An address may be retired without a tombstone
  only when the site is pre-beta, no inbound link is known, the address is under a month old,
  and the retirement is listed in the new section 24.6. It expires at public beta and is not
  renewable, because a carve-out taken once on good grounds is exactly what gets cited a year
  later on none. Used once: the nineteen addresses M19 retires.
* **Section 24.6, deliberate departures from a written policy.** Not errors and not
  discrepancies: rules this project wrote and then knowingly did not follow in a named case,
  with the reason and the bound attached.
* **A deploy rule in section 15.5.** A change whose intermediate states are broken ships as
  one push, gated locally first. The usual rhythm here is commit-and-push per step so that
  stopping anywhere leaves a working site; that assumes each step is independently correct,
  and M19 is not divisible that way.

---

## [0.18.2] - 2026-09-07

**A policy for the repository root (M19, adopted).**

**Nothing moved in this release.** This is the rule being written down before the work,
rather than after it, so the move can be checked against something.

Added
* **PRD section 16.4 now governs the root rather than describing it.** A file may sit at
  the repository root only when something outside this project requires it there: a
  specification, the hosting platform, a GitHub repository convention, or a client that
  probes a fixed path without reading the HTML first. The section lists every permitted
  file with the requirement that earns it its place and what breaks if it moves.
* Two entries in the "Never do these" table: do not add a file to the root, and do not
  create a page as a root `.html` file.
* M19 in the milestone table, marked as adopted and not started, and a roadmap entry saying
  what it will move and why now is the moment.

Noted
* The root holds eight files that the policy permits and twenty-one that it does not. The
  gap is stated at the top of section 16.4 and in the milestone table rather than left for
  a reader to notice, because a target tree that reads as a description is exactly the
  failure section 24 exists to record.
* Moving nineteen pages changes nineteen public URLs on a host with no redirect mechanism,
  so section 23.3 applies to every one of them. That decision is not made here.

---

## [0.18.1] - 2026-09-07

**The test page asks not to be listed (M18a).**

Added
* `tests.html` carries `<meta name="robots" content="noindex, follow">`. It is a developer
  artifact, and a search result pointing at a wall of assertion output under this site's name
  is a worse answer than no result at all.

Unchanged, deliberately
* `robots.txt` is still fully open. A `Disallow` line is the wrong instrument here: it stops
  the fetch rather than the listing, and a URL a crawler may not read can still be indexed
  from a link alone, with no description because nothing was permitted to read it. `noindex`
  says what is meant, and it works only because the crawler is let in to see it. The comment
  in `robots.txt` now records that this is a decision rather than an omission. Closes PRD open
  question 10.

---

## [0.18.0] - 2026-09-07

**Search that searches, and a filter that scans (M18).**

Fixed
* **Text search never searched.** `/api/v2/search` accepts `search_terms`, answers 200 with a
  well-formed body, and ignores the parameter. `chicken`, `salmon`, `zzzzqqq` and no query at
  all returned the same `count` of 1578, the same products, in the same order: the entire
  cat-food category, every time, since M6. Text queries now go to
  `/cgi/search.pl?action=process&json=1`, which returns 32 for salmon, 22 for tuna, 83 for
  chicken and nothing at all for a string that cannot match. Brand-only browses stay on v2,
  whose tag filters were never affected: a brand browse still returns the same 126 it did.
* **The scorable-only filter no longer implies it saw everything.** It filtered the twenty-four
  results on screen, so it could show three and look like an answer. It now fetches the first
  five pages of the query in parallel, dedupes by barcode, filters, and paginates locally. This
  closes PRD open question 4.

Added
* Two checks in `tools/check-live.py`, which is 19 now. A query that cannot match anything must
  render no cards, and a majority of the cards on a `salmon` search must mention salmon. The
  first is the one that matters: an ignored parameter can fake every other answer this suite
  asks for, but it cannot fake an empty result.

Changed
* The count line states its scope. "Showing 1 to 12 of the 12 products in all 32 results for
  “salmon” that can be scored" when the scan reached the end of the query, and "the first 120
  of 1578 results" when it did not, with a note at the foot of the last page saying so again.

Noted
* Two of M15a's five diagnoses were readings of this bug from outside. Results that ignore the
  query look exactly like results ranked badly, and a category size looks exactly like a match
  count. Those entries below are left as they were written; PRD section 24.1 carries the
  correction. Nothing in six gates and 178 assertions caught this, because every check asked
  whether results came back and none asked whether they were the right ones.

---

## [0.17.0] - 2026-09-07

**The site, in all three browser engines (M17).**

Added
* **`tools/check-engines.py`.** The unit suite, all 12 page states and the
  barcode decode round-trip, in Blink (through Edge), Gecko and WebKit. It also
  prints a feature-support matrix so the differences are recorded rather than
  assumed. Playwright's own browser builds, so nothing here drives a browser
  the maintainer is using: `python -m playwright install webkit firefox` once.

Findings
* **Nothing is broken.** 178 assertions pass in all three engines, every page
  renders its expected content in all three, and nothing overflows at 1280px or
  320px anywhere. That is the whole point of the tool: before it, no evidence
  existed either way, and "works on an iPhone" was an assumption.
* **`BarcodeDetector` exists in neither Gecko nor WebKit.** `scanner.js` had
  this roughly right already, calling support "partial, Safari and Firefox
  largely not". Measured, it is not partial on those engines, it is absent, so
  on every browser on iOS ZXing is not the fallback but the whole feature. The
  comment now says the measured thing, and the decode round-trip runs in all
  three engines and passes in all three.
* **CLS can only be measured in Blink.** The Layout Instability API is
  Chromium-only, so M16b's layout reservation is taken on faith for the other
  two engines. It is a `min-height` rather than an engine trick, so the faith
  is reasonable; `check-vitals.py` now says so in as many words rather than
  implying its numbers are universal.
* **What this still cannot test:** headless WebKit exposes no `getUserMedia`,
  which is Playwright's build and not Safari. The camera path in real Safari
  is untested by anything, and no tool in this repository can change that. It
  is recorded rather than glossed.

Closes PRD open question 7, which had stood since the M13 audit.

---

## [0.16.1] - 2026-09-07

**Core Web Vitals, measured under a throttle (M16b).**

Added
* **`tools/check-vitals.py`.** LCP, CLS and Total Blocking Time for 12 pages,
  CPU slowed 4x on a slow-4G connection, 412px viewport, cold cache. Budgets
  are 2500ms, 0.1 and 200ms. Exits non-zero. `--report` names the elements
  that shifted.
* **`preconnect` for the two Open Pet Food Facts origins**, so the handshake
  overlaps with parsing on the pages that call the API. It costs nothing on the
  pages that never do.

Fixed
* **Almost every page dropped its footer when the content arrived.** Six of the
  nine application pages render their body from a fetch, so each is briefly a
  placeholder in a short page with the footer visible under it. The brand index
  measured a CLS of 0.60 against a 0.10 budget, a page of search results 0.86,
  the product page 0.64. `.shell` now has `min-height: 100vh`, which keeps the
  footer below the fold until there is content to push it there. The brand list
  also reserves a screen of height while loading and gives it back in
  `render()`, because its own list is what moves the note underneath it.
  Every gated page is now at or below 0.07, and most read 0.000.

Changed
* **`sw.js` to `v3`.** The shell is served stale-while-revalidate, so M16a's
  stylesheet fixes would have reached a returning device one visit late. A
  contrast fix that arrives on the second visit has not really been deployed.

Ten of the twelve pages are gated. `product.html` and a page of search results
are measured and printed but cannot fail the build: neither can paint until
Open Pet Food Facts answers, and no commit here controls how fast that is. The
product page reads about 2.5s LCP under this throttle, essentially all of it
the API round trip.

Worth recording why this went eleven milestones unnoticed: CLS is invisible on
a fast connection, because the placeholder and the content arrive close enough
together that nothing appears to move. It takes a throttle to see, and there
was no throttled measurement in this project until now.

---

## [0.16.0] - 2026-09-06

**WCAG 2.1 AA, enforced (M16a).**

Added
* **`tools/check-a11y.py`.** axe-core over all 25 page states, each in both
  themes, plus two checks axe does not do: reflow at a 320px viewport and the
  skip link from a cold keyboard. 100 audits, all clean, exits non-zero.
  `--report` prints every violation with its selector.
* **One site-wide focus ring.** There was none before this: the site left it to
  the browser while shipping two palettes and custom card components.
  `:focus-visible`, 2px accent, 2px offset, so it appears for the keyboard and
  not for a mouse click.
* **A blanket `prefers-reduced-motion: reduce` block.** Exactly one component
  honoured the preference before. Smooth scrolling off, every transition and
  animation reduced to nothing.

Fixed
* **Links in running text are underlined.** Colour alone identifies a link
  under WCAG 1.4.1 only at 3:1 against the surrounding text, and accent on body
  copy is 1.53:1 in light, 1.16:1 in dark. This was on all 25 pages, in prose,
  in the footer's closing sentence and on `.prose-link`. An underline that
  appears only on hover is no use to somebody reading rather than pointing.
* **The search pager's unavailable direction** carried `opacity: .45`, which
  put it at 2.11:1: the one piece of text on the site below AA. It is told
  apart from the live control by having no border and no card, which was always
  the real signal.
* **The compare page needed 490 pixels in a 320 viewport.** A bare `1fr` grid
  track has `min-width: auto` and will not shrink below its content, so
  `.cmp-row` uses `minmax(0, 1fr)`; `.cmp-cell` adds `overflow-wrap: anywhere`,
  because a product name from a community database can be one unbroken token
  wider than the cell. Below 380px the cells tighten and the thumbnail drops to
  40px.
* **The top bar's support button** pushed the bar past 320px. It hides below
  400px. It is the one thing in the bar nobody came for, and the same link is
  in every footer.

Two failures the tool reported that were not real, kept here because the next
person to add a gate will meet them: setting `data-theme` and auditing in the
same tick measures colours part-way through a 150ms transition, which reported
the entire top bar as a dark-mode contrast failure; and tabbing to the skip
link and reading its box in the same tick catches it mid-slide, which reported
it as off-screen on all 25 pages. Both were the tool. A new gate's first red is
as likely to be the gate as the code.

Documentation now says what the gate does not cover. axe finds the
machine-checkable third of WCAG; PRD section 19.1 lists what was checked by
hand alongside it, with the answers, so a green run is never read as "the site
is accessible". No screen reader has been run against this site, and that is
still true.

---

## [0.15.3] - 2026-09-06

**Stale claims swept out of the documentation and the source comments.**

Fixed
* **Four source comments still described a site with Tailwind pages in it.**
  `cfc.css` called itself the Learn section's stylesheet and said the palette
  file was loaded by "the Tailwind pages that do not load this file";
  `cfc-tokens.css` named index, search, product and methodology as Tailwind CDN
  pages; `sw.js` routed "fonts, Tailwind, ZXing" to the network; and
  `tools/learn/shell.py` said the theme toggle was hand-copied into four pages.
  M14 removed all of that four milestones ago. A comment that describes an
  architecture the reader cannot find is worse than no comment: it sends them
  looking for something that is not there.
* **The milestone table had no M15d row**, though it shipped the same day.
* **Two debt rows described shortcuts that no longer exist.** "Product page
  rail" was closed by M15d and "Per-page `<style>` blocks" by M14.
* **The dangerous-to-change table warned about Tailwind opacity modifiers**, a
  hazard that cannot be reached from any file in the tree.
* **"Eight hand-copied page chromes" was the wrong fragility to name.** M14
  ended that edit and created a different one: `chrome.py` is the only copy
  now, so a mistake in it is a mistake on all twenty pages at once. The row
  says that instead.
* **The unpinned-CDN row named Tailwind**, which is gone. ZXing is the one
  still fetched at runtime.
* **Section 25.4 read as a status section but held a snapshot** from the M13
  audit, saying M14 was unbuilt and M15b planned. Both shipped.

---

## [0.15.2] - 2026-09-06

**The product page builds its own "On this page" rail (M15d).**

Added
* **A third column on `product.html`**, listing the sections of the breakdown
  and highlighting the one in view, the same rail the guide and the methodology
  page have had since M4. It is the only chrome on the site assembled in the
  browser, and it is confined to the one page whose content is also assembled
  in the browser.
* **A third state in `build.py`'s `PAGES` table.** The rail column was a
  boolean; it now takes `False`, `True` (the generator reads the headings out
  of the fragment, and the build fails if there are none) and `'client'` (the
  column ships empty, hidden and marked `data-client-toc`). A page still cannot
  claim a rail it has nothing to put in.
* A live check that the rail has one link per heading and one active link.
  17 of 17.

Changed
* **The scroll spy in `cfc-docs.js` is re-runnable rather than one-shot.** It
  used to bail on an empty rail and never look again, which is exactly the
  state a client-rendered page is in at load. Each run now disconnects the
  observer and scroll listener the previous one installed, so a redrawn article
  cannot leave a spy watching elements that have been replaced.
* **Every draw of the product article goes through one `paint()` function**,
  which assigns the HTML and dispatches `cfc:content`. Routing all four draws
  through it is what makes the "not found" case correct: that draw has no
  sections, and the rail hides itself again rather than keeping the last
  product's list.

Closes PRD open question 11.

---

## [0.15.1] - 2026-09-06

**Ingredient rows that explain themselves (M15c).**

Added
* **An ingredient the additive knowledge base recognises now opens** to show
  its function, its health impact on a cat, the regulatory position and the
  sources, plus the alias the match fired on. Native `<details>`, so keyboard
  support, screen-reader announcement and open state all come for free and none
  of it has to be rebound when the page redraws itself.
* **`explainIngredient(entry, kb)`** in `scoring.js`, using the same
  `matchesTerm` the engine scores with. An ingredient the additive pillar
  penalised cannot fail to explain itself, and one it ignored cannot claim to
  have been counted.
* A count under the list, so the page only claims rows expand where some do.
* Eighteen assertions covering the matcher, the tier ordering, the vague-term
  fallback and the case below. 178 passing.

Fixed
* **The explanation could contradict the score.** The engine withholds Tier 0
  credit from an entry that is itself an unnamed source, because one ingredient
  cannot be both a named organ meat and an unnamed one. "Viandes et
  sous-produits animaux" matches the beneficial named-by-products entry on a
  bare stem while the transparency pillar penalises the very same words. The
  first build of this labelled that row "Beneficial" while the score was
  marking it down. It now makes the same call the engine made.

Notes
* **This is not a general ingredient dictionary and is not meant to become one
  by accident.** It answers for the 20 additives and 3 vague-term groups in
  `additives.json` and returns nothing for anything else. There is no true
  thing this project can add to the word "chicken", and padding every row with
  filler would bury the rows that matter.
* **A documentation correction.** PRD section 24.1 and DESIGN section 13 had
  both recorded, since M2, that "the chevron is rendered and does nothing". No
  chevron was ever rendered: the string appears in no commit's code. The entry
  was not stale, it was wrong, and it survived three milestones because nobody
  checks a claim that sounds like a confession. Both documents now say so.

---

## [0.15.0] - 2026-09-06

**A picture of the tin, everywhere a product is listed (M15b).**

Added
* **Photos on search results, on recently viewed, and on both sides of the
  compare page.** `opff.js` had been fetching `image_front_url` since M6 and
  only the product page rendered it, so this is rendering work rather than
  plumbing. It answers the last unaddressed half of the owner's feedback on the
  live site: "There's no photo either."
* **`assets/js/thumb.js`**, the one copy of the thumbnail. Three surfaces show
  the same 56px box and none of them should own the rules for it.
* **A placeholder for products with no photo**, a paw outline in the same box.
  Coverage is good but not complete, and a list where some rows carry an image
  and some carry nothing is visibly ragged in a way that reads as a rendering
  fault rather than as missing data. A photo that fails to load is replaced
  with the same placeholder.
* **`product.thumbUrl`**, the 200px rendition. The 56px box does not need the
  400px file; `product.imageUrl` keeps the larger one for the product page.
* `thumbUrl` is stored with a recently-viewed entry, so a card can be redrawn
  from this device with no network. It is a URL on the catalogue's own image
  host, not a copy of the picture.

Changed
* **The product row is now photo, name, score.** The score tile moved to the
  right edge and the chevron that used to sit there is gone: two glyphs on the
  same edge of the same link is one more than the row needs, and the whole row
  was always the link. The compare page keeps the photo and the tile together,
  because its column is narrow and stacks below 700px.
* `assets/js/thumb.js` joins the precached shell, so the placeholder renders
  offline.

Fixed
* **The service worker was routing product images to the wrong cache.** It
  asked `isApi(url)` before `isImage(request)`, and photos are served from
  `images.openpetfoodfacts.org`, which `isApi` matches. Every image took the
  network-first path into the API cache: revalidated on every view when the
  bytes never change, and counted against the wrong cache. It was invisible
  while one photo existed on one page. Putting a photo on every card is what
  made the ordering matter.

Notes
* 23 of 24 results in a live search for "chicken" carry a photo, and none of
  the 24 rendered a broken image.
* The failure path is one delegated listener in the capture phase, not an
  `onerror` attribute. There is no inline event handler anywhere else in this
  codebase, and the first one would be the only thing standing between the site
  and a Content-Security-Policy header.
* 160 browser assertions, 16 of 16 live checks, contrast audit clean.

---

## [0.14.0] - 2026-09-06

**One interface across the whole site, and the nine application pages stop
being hand-written (M14).**

Added
* **`tools/site/chrome.py`**, the single copy of the head, top bar, drawer and
  footer. `tools/learn/shell.py` imports it, so the guide pages and the
  application pages cannot drift apart. `NAV` is one list of seven
  destinations; adding a link is one edit rather than nine.
* **`tools/site/build.py`**, which wraps that chrome around a body fragment
  per page from `tools/site/content/`. The generated pages are committed, so
  deployment still needs no build step (ADR-001). This is the pattern the
  Cat Care Guide has used since M4.
* **`assets/cfc-app.css`**, roughly 330 lines: the utilities the page modules
  actually emit and the components they build. It replaces the Tailwind CDN
  and nine per-page `<style>` blocks.
* **`.topbar-nav`**, the inline site navigation above 900px, with
  `aria-current="page"` on the current destination.
* **A site menu in the drawer** below 900px, on every page. On a guide page the
  guide's own section list is nested beneath it: one control, two levels.
* **An "On this page" rail on `methodology.html`**, built by the generator from
  the `<h2 id="...">` elements in the fragment.

Changed
* All nine application pages are now generated. **Do not hand-edit
  `index.html`, `search.html`, `brands.html`, `product.html`, `scan.html`,
  `submit.html`, `compare.html`, `methodology.html` or `offline.html`**: edit
  the fragment in `tools/site/content/` and rerun the generator.
* `sw.js`: `SHELL_ASSETS` picks up `cfc.css`, `cfc-app.css` and `cfc-docs.js`
  and drops `cfc-tailwind.js`. `VERSION` is `v2`, so the new shell installs
  over the old one rather than being merged into it.
* `tools/check-live.py` looks the shell cache up by its `cfc-shell-` prefix
  instead of by full name. `caches.open()` creates an empty cache when the name
  is wrong, so the hard-coded `cfc-shell-v1` turned a version bump into a
  silent zero rather than into a failure. It failed loudly first, which is how
  it was found.
* The top-bar search field is hidden on `index.html` and `search.html`, which
  carry a search input in the body. Two routes to the same place inside one
  viewport is a papercut. Closes PRD open question 6.
* A page with no headings to index collapses to one column rather than showing
  an empty rail, and the generator decides that per page by reading the
  fragment. Closes PRD open question 5.

Fixed
* **`.article a` outranked every component that colours its own anchor.** The
  rule is `.article a:not([class])` now, which is prose only. The visible
  symptom was the home page's round scan button rendering as accent text on an
  accent circle, invisible until you clicked it.
* **The drawer took a grid column on `.shell-app-toc`** and pushed the article
  onto the next row, which rendered `methodology.html` as a blank screen at
  every width above 900px. Both application shells are named in the rule now.
* **`.text-display` lost its size in the port**, so a product's score rendered
  at body size instead of 3rem. It had been defined identically in nine files;
  consolidating nine copies into one is exactly where a value goes missing. The
  whole port was then re-checked by diffing every rule in the old inline blocks
  against the new stylesheet.
* `tools/learn/shell.py` emitted a `</nav>` with no opening tag while the
  drawer was being rewired, so the guide pages briefly shipped an unbalanced
  sidebar.

Removed
* `https://cdn.tailwindcss.com` and `assets/cfc-tailwind.js`, from every page
  and from the repository. It was a render-blocking third-party script,
  unpinned, whose content could change without a commit here. It was the
  project's last unpinned runtime dependency and the one item that made
  Lighthouse numbers unstable enough to be worth deferring M30's gates over.
* The nine per-page `<style>` blocks.
* `.footer-link`, which had one user left and duplicated `.prose-link`.

Notes
* 160 browser assertions pass, 16 of 16 live checks pass, and the contrast
  audit passes on both palettes.
* The product page has headings worth indexing but they are written by
  `product-page.js` after the fetch returns, so the generator cannot see them.
  It has no rail. Carried as PRD open question 11.

---

## [0.13.0] - 2026-09-06

**Search that reaches past the first page, a brand index, and a full
documentation audit.**

Added
* **Pagination on search.** `searchProducts()` already accepted a `page`
  argument and the page never passed it, so 24 of 1571 results were reachable
  and nothing led to result 25. Page state lives in `?page=`, so a position in
  a result set is a link somebody can send.
* **Brand browse** at `brands.html`: an A to Z index of every cat food brand
  with more than one product, filtered locally as you type. The list comes from
  the facet endpoint at
  `world.openpetfoodfacts.org/facets/categories/Cat%20food/brands.json`, which
  is outside the v2 API but is CORS-enabled and lists 439 brands with counts.
* **Brand-filtered results** via `?brand=`, using `brands_tags`.
* **A scorable-only filter** on search, written to the URL as `?only=scorable`.
* `mergeBrandTags()`, which folds case-variant duplicates. Nine brands in the
  facet collide on case alone: `purina` at 110 products and `Purina` at 15 are
  the same brand shown twice with split counts. The merged brand is queried in
  one request as `brands_tags=purina|Purina`, because `|` is OR in a v2 tag
  filter and a comma is AND. That was measured against the live API, not read
  in documentation: the comma form returns 0.
* Thirteen assertions covering brand merging and display names, using the real
  measured facet as fixtures. The suite is now 160 assertions.
* Four end-to-end checks: the brand index, a second page of results, a
  brand-filtered search, and the scorable filter. `tools/check-live.py` is now
  16 checks.
* `LICENSE.md`, `robots.txt` and `sitemap.xml` at the repository root. The
  project had no licence of any kind before this release.

Changed
* **Search results are ordered by relevance again.** A scorable-first re-sort
  had been discarding the API's ranking, so the closest match to what somebody
  typed could sit below a loosely related product that happened to score well.
  Scorability is now an opt-in filter rather than a hidden sort key, which
  answers the question that was asked instead of a different one.
* The scorable-only filter is honest about acting on the page you are looking
  at rather than on the query. The API cannot filter on scorability, and
  pretending otherwise would misreport the result count.
* **Eleven documents in `/docs` consolidated into three.** `docs/PRD.md`
  absorbed TRD, RUNBOOK, METRICS, TENETS, SECURITY, PRFAQ, ROADMAP, ADR-001 and
  DATA-COVERAGE, and is now the single source of truth. `docs/DESIGN.md` was
  rewritten around the guide's design system, which is what M14 ports the rest
  of the site onto. `README.md` was rewritten for a general reader, with the
  stack, prerequisites, commands and deploy steps moved into the PRD.
* **`tools/run-tests.py` and `tools/check-live.py` now drive Edge, never
  Chrome**, through Playwright's `msedge` channel. Chrome is the maintainer's
  day-to-day browser and driving it disturbs a live session. Verified against
  Edge 152 before the rule was written down, so it was true on arrival rather
  than aspirational.
* Em dashes removed across the project in all three forms: the literal
  character, the `, ` entity, and a double hyphen used as punctuation. The
  guide pages were fixed at their `tools/learn/c_*.py` sources and regenerated,
  not edited in place.

Fixed
* **The live check would have started reporting a working search page as
  broken.** It read the first heading with `querySelector`, which returns the
  first match in *document order* rather than in selector order, and the new
  `#results-heading` stays empty unless the results are a brand. It now takes
  the first non-empty match.
* Five documentation claims that a reader would have acted on, the worst being
  an instruction to run the test suite under `node --test` in a project that
  has no Node.js by decision, and a security document asserting that React's
  JSX handling escapes all rendered content. There is no React; escaping is
  hand-rolled `esc()` calls, and that is now recorded as the highest-risk area
  in the codebase.

Removed
* `docs/TRD.md`, `docs/RUNBOOK.md`, `docs/METRICS.md`, `docs/TENETS.md`,
  `docs/SECURITY.md`, `docs/PRFAQ.md`, `docs/ROADMAP.md`,
  `docs/ADR-001-static-first.md`, `docs/DATA-COVERAGE.md`, and `PATCHNOTES.md`
  at the repository root. Every one is folded into a named section of the PRD
  or into this file, and PRD section 23.5 records where each went.

Notes
* **What the search feedback actually turned out to be.** The owner's note was
  "the search doesn't really work at all; just see what catfooddb is like;
  that's a lot better; there's no photo either". Five separate causes were
  confirmed, and the most useful observation was about the reference site:
  CatFoodDB is organised brand-first, with an A to Z of over 150 brands and
  curated best-of lists, and **its own free-text search is disabled**, with a
  notice on the site saying so. The site that was preferred is better *without*
  working search, which inverted the fix from "build a better ranker" to "build
  a browse structure".
* **The missing photo is a rendering gap, not a data gap**, and is not fixed
  here. `opff.js` already requests `image_front_url` and exposes
  `product.imageUrl`, and 23 of 24 live results carry one. Only
  `product-page.js` draws it. Held until after M14 so the result card is not
  built twice.
* The offline shell is 29 entries, up from 27, having gained `brands.html` and
  its page module.
* **The em dash sweep, in numbers.** 64 files carried at least one of the three
  forms. 568 literal characters and 26 `&mdash;` entities were replaced across
  49 hand-written files, and the eleven generated guide pages picked up the
  rest when they were rebuilt from their swept sources. The replacement was
  chosen per instance rather than applied uniformly: a hyphen in titles and
  headings, a colon after a label, a semicolon between two independent clauses,
  parentheses around a short aside or a trailing citation, and a comma
  everywhere else. A blanket comma would have introduced a comma splice
  wherever the dash was joining two complete sentences.
* **Two instances were left in place because the text needs them.** A regular
  expression character class in `opff.js` strips leading punctuation, em dash
  included, from ingredient text arriving from the API: removing the character
  would stop it working. And PRD section 18 has to name `&mdash;` in order to
  prohibit it. Everything else that a naive search still reports is a `--` that
  was never punctuation: HTML comment delimiters, `var(--token)`, ASCII
  diagrams, and `--noEmit`.

---

## [0.12.2] - 2026-09-05

**Owner feedback on the live site recorded as a milestone (M15).**

Added
* `docs/ROADMAP.md` M15: make search work, and show the product. The feedback is quoted verbatim, and the entry records what was measured on the day rather than the complaint alone. Planned, not scheduled, not started.

Notes
* **The missing photo is a rendering gap, not a data gap.** `opff.js` already requests `image_front_url` and exposes it as `product.imageUrl`, and 23 of 24 results in a live "chicken" search carry one. Only `product-page.js` draws it; the search cards, the compare page and the recently-viewed list all have the URL in hand and render nothing.
* **Five confirmed causes for search.** No pagination, and the page never passes the `page` argument `searchProducts()` already accepts, so 24 of 1571 results are reachable. API relevance is discarded by a deliberate scorable-first re-sort. The match is not restricted to name or brand, so a chicken query returns ocean fish above real chicken products. The records themselves are poor, with brands stored as numeric ids and names left untranslated, and the cards render them faithfully. And there is no filter, facet, sort or brand browse to compensate.
* **The reference site inverts the request, which is the useful part.** CatFoodDB's homepage was read on the day: it is organised brand-first with an A-Z of 150-plus brands and curated best-of lists by food type, and **its own free-text search is disabled**, with a notice saying so. It is better without working search, which suggests the answer is a browse structure rather than a better ranker. Its product-entry layout was not verified: two guessed URLs returned 404, and the entry says so rather than describing a page nobody opened.

---

## [0.12.1] - 2026-09-05

**Documentation brought back in line with the code, and two milestones planned.**

Added
* `docs/ROADMAP.md` M13: a documentation consolidation audit. Collapses the eleven files in `/docs` to `PRD.md`, `DESIGN.md` and `PATCHNOTES.md` plus the root README, and adds the root-only files the project has never had (`LICENSE.md`, `robots.txt`, `sitemap.xml`). The full method, the target structure, the merge-rather-than-overwrite rule, and the defaults for writing style, browser testing, verification environment, licensing and removal policy are written out in the milestone so the scope survives the session that requested it. Planned, not scheduled, not started.
* `docs/ROADMAP.md` M14: move the whole site onto the interface built for the Cat Care Guide. The blocker is recorded as the first thing to solve rather than a detail, the guide top bar has no page navigation at all, while the app top bar has the six-link nav but neither the search affordance nor the sidebar control, so the merged bar has to carry both on a 360px phone. Four open design questions and six codebase constraints are listed. Planned, not scheduled, not started.

Fixed
* **Stale counts.** `docs/TRD.md` claimed the precached shell was 23 entries; `sw.js` has held 27 since M10 and M11 added pages. The TRD tree described `tools/check-live.py` as eight end-to-end checks; it has been twelve since M11.
* **Stale version.** `docs/TRD.md` §0 was headed "Current implementation state (v0.7.0)" five releases after v0.7.0, and its list of what is implemented omitted the compare page, the submit page and offline support.
* **"Four Tailwind pages" was wrong in five places** across `README.md` and `docs/TRD.md`. There are eight. The TRD's advice that a fifth would be the trigger to move them under the generator has been rewritten, since that threshold was crossed without anyone noticing and the duplication is now real debt rather than a hypothetical.
* **A testing instruction that could not work.** `docs/TRD.md` §12 described the scoring tests as runnable "under `node --test`". There is no Node.js in this project by decision ([ADR-001](docs/ADR-001-static-first.md)), and the suite is browser-hosted only.
* `docs/TRD.md` §8 routing table was missing `offline.html` and `tests.html`.

Notes
* Historical changelog entries were left alone. The "23 entries" in the v0.10.0 notes was accurate when written, and rewriting it would turn a record of what happened into a claim about the present. The roadmap's M9 entry now reads "23 entries at the time, 27 today" for the same reason.
* No code changed in this release.

---

## [0.12.0] - 2026-09-05

**Side-by-side comparison (M11).**

Added
* `compare.html?a=X&b=Y`: two products next to each other. The URL carries the comparison, so it can be shared and reloaded. Products already viewed are offered in a picker; anything else goes in by barcode.
* Figures converted to a **dry-matter basis**. Without that a wet food at 11% protein reads as worse than a dry food at 32%, when it is in fact the more protein-dense of the two; the wet food is mostly water.
* A `Compare` entry in the top navigation.

Notes
* **The page never declares a winner on the overall score, and that is the point of it.** A 72 worked out from three pillars and a 72 worked out from one are different claims wearing the same number. Only about a fifth of products carry enough data for all three pillars, so this is the normal case rather than an edge case. Where the two products were scored on different pillars, the page says so before showing anything else, and the comparison is pillar by pillar, only across pillars both products actually have.
* **Where only one product publishes a figure, neither cell is highlighted.** Marking the one that happens to have data would be a comment on the database rather than on the food.
* Fat is shown without a "better" direction. More fat is not simply better, and pretending a single number has an obvious direction is how a comparison tool starts lying.

---

## [0.11.0] - 2026-09-05

**A real answer for a product that is not in the database (M10).**

Added
* `submit.html?barcode=X`, reached from the not-found state on any product page.
  * **Rules out a typo first.** A mistyped digit looks exactly like a missing product, and it is the only cause the visitor can fix in five seconds. The page checks the barcode against its own check digit and re-queries the database before sending anyone off to photograph a tin. If the product turns out to be there after all, it links straight to its page.
  * **Names the two panels that matter.** The ingredient list (without it there is no score at all, not a low one) and the guaranteed analysis including moisture, without which a wet food cannot honestly be compared to a dry one.
  * **Deep-links the contribution** to Open Pet Food Facts with the barcode filled in, and says plainly that the form is hosted on Open Food Facts, the project's main site, so the hand-off is not a surprise.

Changed
* The not-found state now links here rather than dropping the visitor straight onto an unexplained external form.
* `docs/ADR-001-static-first.md` updated: the "no server-side writes" row predicted a hosted form or a GitHub issue as the workaround. Building it showed the workaround was the wrong shape, and the ADR now records why.

Notes
* **There is no submission queue of our own, by choice.** A private queue (hosted form, GitHub issue, serverless endpoint, any of them) would fork the catalogue. The product would sit in our queue and still be missing from the database every score on this site actually reads, which would make us the bottleneck for our own corrections. Sending it upstream means it works here, in the next tool built on the same database, and for the next person who scans the same tin.
* The general lesson, recorded in the ADR: not every limitation of static hosting needs a workaround. This one was better answered by not holding the data at all.

---

## [0.10.0] - 2026-09-05

**Offline support, and installability (M9). The app works in the aisle where the signal does not.**

Added
* `sw.js`: a hand-written service worker. No build step means no Workbox, and that turned out to be the better outcome: every caching decision is one of three strategies, chosen per resource, with the reason written next to it.
  * App shell precached (23 entries), so every page renders with no network at all.
  * API responses **network-first**: a cached answer is a fallback, never a preference.
  * Images cache-first; they are large and never change under a URL.
  * Third-party CDNs left alone. They set their own cache headers, and second-guessing them from here would mean owning their invalidation too.
* `offline.html`: for a page never opened on this device. It says what still works rather than showing the browser's own error page.
* `manifest.webmanifest` and generated icons at 192, 512 and 512-maskable. The app installs to a home screen and opens standalone.
* `assets/js/pwa.js`: registration (on `load`, so it never competes with rendering) and an offline banner.
* Two more checks in `tools/check-live.py`: the worker precaches and does not grow per product viewed, and an offline product still renders **and is labelled**.

Changed
* A product page served from cache now says so, with the time it was saved. The worker stamps the response, `opff.js` carries the stamp through, and the page renders a notice.

Notes
* **A cached score must never be presented as a current one.** The scoring engine changes and the database changes, so a stale score rendered as fresh is the same failure as the English-only matcher, confidently wrong, with nothing about it looking wrong. That rule is why the stamp exists, and it is written at the top of `sw.js` so the next change to that file has to reckon with it.
* **Navigations are deliberately not cached.** Every product is `product.html` under a different query string, so caching responses would add one byte-identical entry per product viewed and grow the shell cache without bound. The precached document is found with `ignoreSearch` instead, and without that flag an offline product page would fall through to `offline.html` despite the document being cached.
* **A 404 is never cached.** It is how an unknown barcode is detected, and caching it would keep reporting "not found" after the product is added to the database.
* `navigator.onLine` is trusted only in the negative direction. It reports a network interface, not reachability, so a false "you are online" shows nothing rather than a wrong reassurance.

---

## [0.9.0] - 2026-09-05

**The scanner (M8), and a home page that shows your own history instead of two invented products.**

Added
* `scan.html` and `assets/js/scanner.js`, barcode scanning, entirely client-side. Frames are decoded on the device and never uploaded; the only thing that leaves is the barcode number, to look the product up. `BarcodeDetector` is used where the platform provides it, and ZXing is downloaded only when it does not,  never speculatively.
* `assets/js/scan-page.js`: the part that has to be kind about failure. Declined permission, no camera, camera held by another app, a browser with no camera API and a page not on HTTPS each get their own sentence and their own suggested next step.
* Manual barcode entry on the same page, always visible. On a desktop browser it is the primary path, not a consolation prize. Entries are checksum-validated before navigating, so a typo is reported as a typo rather than as a gap in the database.
* `assets/js/history.js`, `assets/js/home-page.js`, "Recently viewed", kept in `localStorage` on the device and nowhere else. There is no account and no sync, which is a feature of the static architecture rather than a limitation of it: what someone feeds their cat is not information we have any reason to hold. Only barcode, name, brand and the last score are stored, and opening a product recomputes the score rather than trusting the stored one.
* A `Scan` entry in the top navigation of every page.
* `assets/js/scanner.test.js`: 17 assertions on barcode validation. The full suite is now 147.
* `tools/check-live.py` grew to 8 checks: the scan page, the home page, a recently-viewed round-trip across two page loads, and a decode round-trip that draws a known EAN-13 and reads it back.

Changed
* The home page Scan button is a real link. It was disabled with a "Coming soon" tooltip.

Removed
* The two invented "Recently viewed" products (Weruva and Friskies, with hardcoded scores). The section now hides itself until there is something real to show, an empty list on a home page reads as something broken.

Notes
* **UPC-E cannot be checksum-validated in place.** Its check digit is computed over the expanded UPC-A form, so validating an 8-digit UPC-E under the EAN-8 rule rejects it. That failure is silent: the scanner would keep scanning and simply never see small US packages. `expandUpcE` exists for this, and an 8-digit code is accepted if either reading checks out.
* **`getUserMedia` needs a secure context.** `http://<LAN-IP>` is not one, so testing from a phone on the local network gives no camera at all, with no error that says why. The page distinguishes that case from a real fault.
* QR codes are deliberately excluded from the format list. Packaging carries them, and a QR code is not the product's barcode.

---

## [0.8.0] - 2026-09-05

**The scoring engine, the API client, and the two pages that use them. The product is now real: enter a barcode and get a derived score with its reasoning.**

Added
* `assets/js/opff.js`: Open Pet Food Facts client and normaliser. Reads both nutriment schemas (preferring the pet-food guaranteed analysis over Open Food Facts' human-food keys) and records which was used; gates every figure against a plausible range for cat food; infers per-kilogram energy values and corrects them; splits ingredient strings on depth-aware commas so a parenthetical stays with its parent ingredient.
* `assets/js/scoring.js`: the CFC Score. Pure and deterministic: no network, no DOM, runs in the visitor's browser so a sceptical reader can watch a score being derived. Renormalises pillar weights across the pillars that could be computed, applies the two hard gates, and returns `scorable: false` rather than a number when too little is known.
* `assets/js/product-page.js`, `assets/js/search-page.js`, replace the mock render blocks. `product.html` went 475 → 102 lines, `search.html` 166 → 99.
* `assets/data/additives.json`: 20 additives across three tiers plus three catch-all label terms, each with function, tier, plain-language health impact, regulatory note and sources. Tiers mirror the guide.
* `tests.html`, `assets/js/test-runner.js`, `tools/run-tests.py`, 130 assertions run headlessly in a real browser. No Node, no build step, consistent with ADR-001.
* `tools/probe-opff.py`, `tools/check-live.py`, the measurement script behind `docs/DATA-COVERAGE.md`, and an end-to-end check of four page states against the live API.
* `docs/DATA-COVERAGE.md`: what the database actually contains, measured across 600 products.
* **methodology.html: "What the score cannot see."** The limits are now published alongside the method, because a score that does not state what it could not check is overclaiming.

Fixed
* **A French product scored 77 / Excellent with a perfect transparency pillar and the reason "Ingredient sources are named rather than generic." Its first ingredient was unnamed meat by-products and its last was sugar.** Only 9.5% of records carry English ingredients, and the alias matcher was English-only, so on ~90% of labels it matched nothing, and nothing matched was being reported as clean. Four distinct defects sat behind that single score, and three of them were live in English too; they had simply never fired, because the test fixtures were written in the same language as the matcher. Full write-up in `docs/DATA-COVERAGE.md`.
  * Aliases extended to French, German, Spanish, Italian and Dutch, in `additives.json` and in the animal-protein, plant-protein and starch lists.
  * `MATCHED_LANGUAGES` guard: where the label is in a language the aliases do not cover, the engine says the list could not be read, withholds the clean-formulation bonus and the "no flagged additives" finding, caps confidence at low, and warns. **Silence is not evidence.**
  * The Tier 0 "named by-products" credit had bare stems as aliases, so *"meat by-products"* earned a bonus for being a named source while the transparency pillar penalised the identical words for being unnamed. Tier 0 credit is now matched per ingredient entry and withheld where that entry is itself an unnamed source.
  * A parenthetical could rename an unnamed source: `(dont boeuf 4%)` made "viandes et sous-produits animaux" read as a named beef first ingredient, worth full marks. Such entries are now judged on the text before the parenthesis, across the whole first-three window.
  * The nutrition pillar now has an explicit branch for an unnamed leading protein, so the most important thing the list says is what gets reported, rather than whatever happened to appear second.
* Alias matching missed plurals (aliases are written singular, labels are plural) so the unnamed-source penalty never fired on a real label.
* The animal-protein check ran on the first three ingredients before the plant-protein check ran on the first, so a list led by pea protein scored as animal-protein-first the moment chicken fat appeared third.

Notes
* `docs/DATA-COVERAGE.md` overturned the M6/M7 assumption that most products carry a full guaranteed analysis. About a fifth are scoreable on all three pillars, and a quarter of the products carrying a protein figure carry an implausible one. Partial data is the normal path, not an error path, and both modules are built around that.
* The unit suite was 109 green while all four scoring defects above were live. Rendering one real product page found what the whole suite could not.

---

## [0.7.0] - 2026-09-05

**Light/dark theming across the whole site, and the end of the Next.js fork in the repository.**

Added
* `assets/cfc-tokens.css`, the palette, split out of `cfc.css` so both page families share one source of truth: the four Tailwind CDN pages and the eleven generated guide pages. Carries the light values, the dark values (twice,  once for an explicit choice, once for `prefers-color-scheme`), the theme toggle component, and the chip component.
* `assets/cfc-theme.js`, three-state theme control: system → light → dark. Persists under `localStorage` key `cfc-theme`; `system` stores nothing and lets the media query decide. Loaded as a **blocking** `<script>` in `<head>`, which is what prevents a flash of the wrong palette. A `storage` listener keeps other open tabs in step, and a blocked-site-data failure falls back to the system theme rather than throwing.
* Theme toggle in the top bar of all fifteen pages.
* `tools/check-contrast.py`: audits all 38 foreground/background pairs in both palettes against WCAG AA, and fails if the two duplicated dark blocks have drifted apart.
* `docs/ADR-001-static-first.md`: records static HTML as the target architecture rather than an interim state, with the reasoning per planned feature and, more usefully, the list of what static hosting genuinely cannot do and the escape hatch for each.

Changed
* Tailwind colour names now resolve to `var(--...)` instead of hex literals, so `bg-surface` and `text-ink` follow the theme with no `dark:` variants in the markup. **Trade-off:** Tailwind opacity modifiers (`bg-surface/50`) no longer work on those colours, add a token instead.
* Every hardcoded colour on the four Tailwind pages, including the ones generated by JavaScript in `product.html`, now goes through a token.
* The green and amber score chips previously used white text at 2.8:1 and 2.3:1. They now use dark ink. **This changes the light theme's appearance**; it was a pre-existing accessibility defect that building the second palette surfaced rather than caused.
* `README.md`, `docs/TRD.md`, `docs/RUNBOOK.md` and `docs/DESIGN.md` rewritten to describe the stack that actually ships. They previously documented Next.js, npm scripts, `next.config.ts` and a build pipeline, none of which existed in the deployed site.
* `.github/workflows/deploy.yml`: the "when transitioning to Next.js" comment replaced with a pointer to ADR-001.

Removed
* The unused Next.js 14 application: `app/`, `components/`, `public/`, `next.config.ts`, `package.json`, `postcss.config.mjs`, `tailwind.config.ts`, `tsconfig.json`, `.eslintrc.json`. It was never built and never deployed, `deploy.yml` has always uploaded the repository root,  but it was documented as the stack, which made the repository actively misleading. It remains in git history if it is ever wanted back.

Notes
* Confirmed while writing ADR-001: the planned barcode scanner needs no server. `getUserMedia` + `BarcodeDetector` (ZXing WASM fallback) + the keyless, CORS-enabled Open Pet Food Facts API all run in the browser. The only hard requirement is HTTPS, which GitHub Pages provides. One consequence worth remembering: `http://<LAN-IP>` is not a secure context, so testing the scanner on a phone means using the deployed URL or an HTTPS tunnel.

---

## [0.6.0] - 2026-09-05

**Added The Cat Care Guide: an eleven-page educational resource, built as a documentation site.**

Added
* `learn.html`: guide overview, the five rules that matter most, and the map of all topics.
* `learn-nutrition.html`: obligate carnivore metabolism, the five adaptations that define feline nutrition, protein/fat/carbohydrate/fibre, and the eight nutrients cats cannot synthesise (taurine, arginine, arachidonic acid, retinol, niacin, vitamin D3, B12, thiamine).
* `learn-daily-requirements.html`: the complete AAFCO Cat Food Nutrient Profiles table (42 nutrients, growth and adult minimums plus maximums), the RER/MER formulas with a life-stage factor table, and a full worked conversion into grams and milligrams per day for a 4.5 kg neutered indoor cat.
* `learn-labels.html`: reading order, AAFCO adequacy statements ranked by strength, the dry-matter conversion with a worked wet-vs-dry comparison, carbohydrate by difference, ingredient splitting, the 95/25/3 naming rules, and marketing terms with no regulatory meaning.
* `learn-food-types.html`: seven formats compared on moisture, carbohydrate, calorie density, cost and safety; includes the current FDA position on H5N1 in raw pet food and the evidence on home-prepared recipes failing nutrient analysis.
* `learn-hydration.html`: water requirements by body weight, a diet-by-diet water balance table, dehydration checks, and eleven ranked ways to increase intake.
* `learn-additives.html`: three-tier additive reference covering 30+ compounds (propylene glycol, ethoxyquin, BHA, BHT, artificial colours, titanium dioxide, menadione, carrageenan, gums, glutamates, inorganic phosphates and more), each with its regulatory position and evidence, plus a section on commonly criticised ingredients that are not actually a problem.
* `learn-feeding.html`: calorie tables for seven body weights, portioning, meal timing patterns, food-based enrichment, a seven-day transition schedule, the 10% treat rule, body condition scoring, and multi-cat feeding.
* `learn-life-stages.html`: weaning through geriatric, the kitten-vs-adult requirement table, the post-neutering weight-gain window, pregnancy and lactation energy factors, and why senior cats need more protein rather than less.
* `learn-toxic.html`: toxic foods, plants (lilies flagged as a same-hour emergency), medications, and household hazards, with poison-line numbers and first-ten-minutes steps at the top of the page.
* `learn-health.html`: diet in obesity, CKD, FLUTD, diabetes, hyperthyroidism, IBD, food allergy, hepatic lipidosis, dental disease and constipation.
* `assets/cfc.css`: design tokens plus the three-column documentation shell (top bar, sidebar, article, on-this-page rail), callouts, data tables, entry cards, panels, comparison grids, pagination and site footer. Responsive: the right rail drops below 1180px, the sidebar becomes a drawer below 900px.
* `assets/cfc-docs.js`: mobile navigation drawer (hamburger, backdrop, Escape to close) and the "on this page" scroll spy. Both are progressive enhancements; pages are fully readable without JavaScript.
* `assets/cfc-tailwind.js`: the Tailwind CDN theme, extracted from the inline per-page configs.
* `tools/learn/`: static generator (`build.py`, `shell.py`, `bits.py`, and one `c_*.py` content module per page) so the eleven pages share one shell and cannot drift apart. Generated HTML is committed, so deployment still needs no build step.
* Home page: a Cat Care Guide entry card above "Recently viewed".

Changed
* All pages: **Learn** link added to the header nav between Search and Methodology, linking to `./learn.html`.
* All pages: header nav now scrolls horizontally on narrow viewports instead of overflowing, now that it carries four items.
* `docs/ROADMAP.md`: milestones renumbered into chronological order; the Cat Care Guide recorded complete as M4; dark mode promoted out of the deferred list to M5, specified with a header toggle and a `localStorage`-persisted preference that falls back to `prefers-color-scheme`.
* `README.md`: documents the guide, the generator workflow, and the shared assets.

---

## [0.5.3] - 2026-06-07

**Removed Methodology from footers: now accessible via header nav.**

Changed
* All pages: removed the "· Methodology" link from the footer. Footer now contains only "Built by Azqato". Methodology remains reachable via the header nav on every page.

---

## [0.5.2] - 2026-06-07

**Added Search to header navigation.**

Changed
* All pages: **Search** link added to the nav between Home and Methodology, linking to `./search.html`. Search is highlighted (accent color, bold) when on `search.html`.

---

## [0.5.1] - 2026-06-07

**Added Home and Methodology links to the header navigation.**

Changed
* All pages (`index.html`, `search.html`, `product.html`, `methodology.html`): header now contains a `<nav>` element with three links (**Home**, **Search**, and **Methodology**) between the wordmark and the Support button.
* The link for the currently visited page is highlighted in accent color and bold via `aria-current="page"`, Home on `index.html`, Search on `search.html`, Methodology on `methodology.html`; none highlighted on `product.html`.

---

## [0.5.0] - 2026-06-07

**MVP completion: all documented sections built out.**

Added
* `methodology.html`: public scoring explanation page mirroring `PRD.md` §6, always reachable from the footer. Covers: why cats need a dedicated system, the three-pillar model and weights, Pillar A sub-factors (protein dominance, taurine, carb load, moisture, AAFCO adequacy), Pillar B additive risk tiers (Tier 1–3 with examples), Pillar C transparency factors, hard gates and caps, score bands with color swatches, a worked example, and data sources.
* All pages: "Methodology" link added to footer alongside "Built by Azqato".

Changed
* `product.html`: fully rewritten as a JS-driven page. All content is now rendered from embedded product data objects keyed by barcode, different barcodes produce different products. Changes include:
  * Three distinct products: Instinct Original Grain-Free with Real Chicken (0000000000000, 61, Good), Weruva Paw Lickin' Chicken (0000000000001, 81, Excellent), Friskies Surfin' & Turfin' Favorites (0000000000002, 28, Poor).
  * Band-appropriate glyphs per `DESIGN.md §5`: Excellent = circle-check, Good = check, Poor = exclamation-triangle, Bad = X-circle. Each rendered in the band color.
  * Warning banner (conditional): fires for products with Tier 3 additives (Friskies shows amber banner: "Tier 3 additives, score capped at 49").
  * Alternatives section (conditional): shown for Poor and Bad products; Friskies lists Weruva and Instinct as better options.
  * Additive flags grouped by tier descending (Tier 3 first, then Tier 2); Weruva shows a "No flagged additives detected" positive message.
  * Taurine "Not listed" state (red X glyph) for products that don't declare taurine (Friskies).
  * Not-found state: unknown barcodes show a friendly message and a link back to home.
  * Dynamic page title set from product name via `document.title`.
* `search.html`: updated result cards 2 and 3 to match the real product catalog, Weruva (81, Excellent, barcode 0000000000001) and Friskies (28, Poor, barcode 0000000000002). All cards now link to their correct product pages.

---

## [0.4.0] - 2026-06-07

**Rebuilt as plain HTML/CSS/JS: no build step, runs directly in any browser.**

Changed
* Replaced the Next.js build-required deliverable with three self-contained HTML pages that work by opening a file in a browser or being served on GitHub Pages with no compilation step.
* `.github/workflows/deploy.yml`: removed all build steps (`npm ci`, `npm run build`). The workflow now uploads the repo root directly as the Pages artifact. No Node.js required.

Added
* `index.html`: home page, wordmark, disabled Scan button with tooltip, search form (GET to `search.html`), two hardcoded recently-viewed product cards. Tailwind CDN + custom CSS + Google Fonts (Fraunces, Public Sans). Zero JavaScript dependencies beyond the Tailwind CDN.
* `search.html`: search results, search bar pre-filled from `?q=` URL param (vanilla JS `URLSearchParams`), three hardcoded mock result cards linking to `product.html`. No server needed.
* `product.html`: full product page, score header (61, Good band, green bar), verdict + reason chips, 24-item ingredient list, two Tier 2 additive cards (Carrageenan, Guar Gum) with cited sources, 2×2 nutrition grid, AAFCO statement, footer metadata. Barcode shown from `?barcode=` param.
* `favicon.svg`: 😻 emoji SVG at repo root (GitHub Pages serves this correctly).
* `.nojekyll`: at repo root, prevents GitHub Pages from running Jekyll on the repo.

Architecture note
* The `app/`, `components/`, `next.config.ts`, `package.json`, etc. remain in the repo as the future Next.js migration path. They do not affect GitHub Pages serving. When transitioning to the full product, scaffold the Next.js build, add build steps back to the workflow, and retire the HTML pages.

---

## [0.3.0] - 2026-06-07

**MVP complete: GitHub Pages deployment config.**

Added
* `next.config.ts`: set `basePath` and `assetPrefix` to `/Cat-Food-Center` for deployment at `https://azqato.github.io/Cat-Food-Center/`. Both values are derived from a single `REPO` constant at the top of the file, change it there if the repo name changes.

Confirmed present (from earlier prompts)
* `public/.nojekyll`: prevents GitHub Pages from running Jekyll on the `out/` directory.
* `.gitignore`: `out/` excluded from version control; the built output is deployed separately.

Deployment steps (run after `npm install` with Node.js LTS installed)
1. `npm run build` → produces `out/`
2. Push `out/` contents to the `gh-pages` branch of `https://github.com/Azqato/Cat-Food-Center.git`, or configure a GitHub Actions workflow to do so on push to `main`.
3. In repo Settings → Pages, set source to the `gh-pages` branch, root (`/`).

Build verification
* Node.js was not present on the development machine during this session; `npm run build` could not be confirmed. Run it manually after installing Node.js LTS from nodejs.org. Expected output: a clean `out/` directory with `index.html`, `search/`, `product/0000000000000/`, `product/0000000000001/`, `product/0000000000002/`, and all static assets.

---

**MVP summary (prompts 1–4, versions 0.2.0–0.3.0)**

| What | Where |
| --- | --- |
| Next.js 14 scaffold, TypeScript strict, Tailwind CSS | `package.json`, `tsconfig.json`, `tailwind.config.ts` |
| Design tokens (colors, type scale, radius, max-width) | `tailwind.config.ts`, `app/globals.css` |
| Fraunces + Public Sans via `next/font/google` | `app/layout.tsx` |
| Global header (wordmark + Support button) | `components/Header.tsx` |
| Global footer ("Built by Azqato") | `components/Footer.tsx` |
| 😻 emoji favicon | `public/favicon.svg`, `app/layout.tsx` |
| Home page (scan button, search form, recently-viewed cards) | `app/page.tsx` |
| Mock product page (full visual per `DESIGN.md` §7.3) | `app/product/[barcode]/page.tsx` |
| Search page (pre-filled input, 3 mock result cards) | `app/search/page.tsx`, `app/search/SearchView.tsx` |
| Static export + GitHub Pages config | `next.config.ts` (`basePath`, `assetPrefix`) |
| `.nojekyll`, `out/` gitignore | `public/.nojekyll`, `.gitignore` |

---

## [0.2.2] - 2026-06-07

**Prompt 3: Mock product page, search page, emoji favicon.**

Added
* `app/product/[barcode]/page.tsx`: full product page layout per `DESIGN.md` section 7.3, populated with hardcoded mock data (Instinct Original Grain-Free with Real Chicken, score 61, Good band). Sections rendered:
  * Score header: 6px band-good color bar, 3rem score number, check glyph + band label, product image placeholder, product name (h1), brand / format / life-stage meta.
  * Verdict: one-sentence summary and three reason chips as pills.
  * Ingredients: numbered ordered list of 24 ingredients with a chevron hint; expand logic deferred (TODO comment).
  * Additive flags: Tier 2 Moderate Risk section with two cards (Carrageenan, Guar Gum), each showing function badge, health impact, and a cited source link.
  * Nutrition snapshot, 2×2 grid: Crude Protein 52% DM, Crude Fat 28% DM, Moisture 78% as-fed, Taurine Present (with check glyph). Tabular figures throughout.
  * AAFCO adequacy: quoted statement + substantiation method.
  * Footer metadata: data-completeness indicator and last-reviewed date.
* `app/search/SearchView.tsx` (`'use client'`): search input pre-filled from `?q=` param; on submit navigates to `/search?q=`; displays three hardcoded result cards (Instinct Chicken / Salmon / Duck variants, all score ~60, Good band) each linking to `/product/0000000000000`.
* `app/search/page.tsx`: rewritten as a server component that wraps `SearchView` in `<Suspense>` (required by Next.js static export when `useSearchParams` is used).
* `public/favicon.svg`: 😻 emoji as an SVG favicon.
* `app/layout.tsx`: wired `favicon.svg` via `metadata.icons`.

---

## [0.2.1] - 2026-06-07

**Prompt 2: Home page.**

Added
* `app/page.tsx`: full home page layout per `DESIGN.md` section 7.1.
  * Wordmark (`<h1>`) in Fraunces display serif with tagline.
  * 128px circular Scan button in accent color: disabled state with opacity, `cursor-not-allowed`, and a CSS tooltip ("Coming soon") on hover. Accessible via `aria-disabled` and `aria-describedby`.
  * Search form (`role="search"`): text input + Submit button; on submit, navigates to `/search?q=<query>` via `useRouter`.
  * "Recently viewed" section with two hardcoded mock product cards: Weruva Paw Lickin' Chicken (score 81, Excellent) and Friskies Surfin' & Turfin' Favorites (score 28, Poor). Each card shows the score badge in band color, product name, brand, band pill, and a chevron.
* `app/product/[barcode]/page.tsx`: added mock barcodes `0000000000001` and `0000000000002` to `generateStaticParams` so the static export generates pages the recently-viewed links point to.

---

## [0.2.0] - 2026-06-07

**Prompt 1: Project scaffold, design tokens, global layout.**

Added
* `package.json`: Next.js 14, React 18, Tailwind CSS 3, TypeScript 5.
* `tsconfig.json`: strict mode, App Router moduleResolution.
* `next.config.ts`: `output: 'export'`, `trailingSlash`, `images.unoptimized`, static GitHub Pages build. `basePath`/`assetPrefix` left as TODO for Prompt 4.
* `tailwind.config.ts`: all design tokens from `DESIGN.md` wired as Tailwind theme extensions, colors (`bg`, `surface`, `ink`, `ink-soft`, `accent`, `hairline`, four band colors), font families (`font-display` → Fraunces, `font-body` → Public Sans), type scale (`text-display` through `text-micro`), border radius (`rounded-card`, `rounded-pill`), max-width (`max-w-content`).
* `postcss.config.mjs`: Tailwind + autoprefixer.
* `.eslintrc.json`: `next/core-web-vitals`.
* `.gitignore`: ignores `out/`, `.next/`, `node_modules/`, `next-env.d.ts`.
* `app/globals.css`: Tailwind directives plus `:root` CSS custom properties for all design tokens.
* `app/layout.tsx`: loads Fraunces (`--font-display`) and Public Sans (`--font-body`) via `next/font/google`; mounts `<Header>` and `<Footer>` around a flex-column `<body>`.
* `components/Header.tsx`: sticky header, wordmark in display serif linking to `/`, Support pill button linking to `https://azqato.github.io/support.html`.
* `components/Footer.tsx`: "Built by Azqato" centered footer with link to `https://azqato.github.io/index.html`.
* `app/page.tsx`, `app/search/page.tsx`, `app/product/[barcode]/page.tsx`: build-passing stubs; product route includes `generateStaticParams` required by static export.
* `public/.nojekyll`: prevents GitHub Pages Jekyll processing.

Next up
* Install Node.js (not present on dev machine), run `npm install`, verify `npm run build` produces a clean `out/`.
* Prompt 2: home page with scan button, search input, recently-viewed strip.
* Prompt 3: mock product page (full visual) and mock search results.
* Prompt 4: GitHub Pages `basePath`/`assetPrefix` config and final PATCHNOTES entry.

---

## [0.1.1] - 2026-06-07

**Documentation updates: global chrome and MVP strategy.**

Changed
* `DESIGN.md`: added section 7.0 defining a persistent header (wordmark + Support button linking to `https://azqato.github.io/support.html`) and footer ("Built by Azqato" linking to `https://azqato.github.io/index.html`) present on all screens.
* `PRD.md`: added section 4.1 capturing the header/footer as product requirements.
* `TRD.md`: added section 0 (MVP strategy), static Next.js export targeting GitHub Pages with hardcoded mock data first, real API wiring later. Updated section 8 global layout spec.
* `README.md`: updated status to reflect MVP-first approach.
* `PATCHNOTES.md`: this entry.

---

## [0.1.0] - 2026-06-07

**Project kickoff: foundational documentation.**

Added
* `README.md`: project overview, feature summary, tech stack, quick start.
* `PRD.md`: living spec, including the full CFC Score rating methodology (three pillars, additive risk tiers, hard gates, score bands, worked example).
* `TRD.md`: architecture, TypeScript data model, scoring-engine pipeline, data sources, testing strategy.
* `DESIGN.md`: editorial visual language, design tokens, typography, color and band system, screen specs, accessibility.
* `PATCHNOTES.md`: this changelog.

Decisions captured
* Cats are obligate carnivores, so the rating engine is purpose-built for feline nutrition and does not use human scoring systems such as Nutri-Score.
* Scoring weights set to Nutrition 55%, Additives 35%, Transparency 10%.
* High-risk (Tier 3) additives cap the score at 49; propylene glycol triggers an automatic Bad band because it is FDA-prohibited in cat food.
* Primary product data source is Open Pet Food Facts, supplemented by an internal additive knowledge base and an AAFCO feline nutrient reference.
* Stack: Next.js (App Router) plus TypeScript plus Tailwind CSS, delivered as a mobile-first installable PWA with browser support.

Next up
* Scaffold the Next.js PWA and Tailwind theme tokens from `DESIGN.md`.
* Build the deterministic scoring engine and its golden-file test suite.
* Seed the additive knowledge base (Tier 1 to Tier 3 entries with sources).
* Wire the barcode scanner (BarcodeDetector with ZXing fallback) and Open Pet Food Facts lookup.

---

---

# Appendix: the second history

What this file held before the merge, from 2026-06-07 to 2026-09-05, with no
change to its content. It is the shorter of the two histories and is
written in a more reader-facing voice, and it carries detail the spine does
not, notably the page-by-page contents of the Cat Care Guide. Its version
numbers are its own and do not line up with the spine above.

---

## v0.10.1 - 2026-09-05

### Fixed
- Documentation corrected against the code: the offline cache size, the number of end-to-end checks, the count of pages using Tailwind, and a testing instruction that referred to a runtime this project does not use.

### Added
- Two milestones written into the roadmap: a consolidation of the documentation set, and moving the whole site onto the interface built for the Cat Care Guide. Both are planned rather than started.

### Notes
- Nothing about the site itself changed in this release.

---

## v0.10.0 - 2026-09-05

### Added
- **Compare two foods side by side.** Figures are converted to a dry-matter basis, so a wet food and a dry food can be read on the same scale rather than the wetter one looking worse for containing water. The comparison is in the URL, so it can be shared.

### Notes
- The page compares pillar by pillar and never declares an overall winner. Two scores built from different amounts of data are not the same claim, and the page says so rather than letting the bigger number settle it.

---

## v0.9.0 - 2026-09-05

### Added
- **A page for products that are not in the database.** It checks the barcode for a typo and re-queries first (a mistyped digit looks exactly like a missing product) then explains which two panels to photograph and links the contribution straight to Open Pet Food Facts with the barcode filled in.

### Notes
- Contributions go to the open database the scores are derived from, not to a queue of ours. That way a product added once works here, in every other tool built on the same data, and for the next person who scans the same tin.

---

## v0.8.0 - 2026-09-05

### Added
- **Works offline.** A product you have already opened stays readable with no connection, and the app installs to a home screen. Pages you have never opened show a page explaining what still works, rather than the browser's error screen.
- An offline banner, and a notice on any product page that is being shown from a saved copy; including when it was saved.

### Notes
- A cached score is always labelled as one. The scoring engine and the database both change, so an old score shown as current would be wrong in exactly the way this project exists to avoid.

---

## v0.7.0 - 2026-09-05

### Added
- **Barcode scanning.** Point the camera at the packaging and the product page opens. Decoding happens on the device; only the barcode number is sent anywhere. Uses the platform's `BarcodeDetector` where available and downloads ZXing only where it is not.
- Manual barcode entry alongside the camera, always available and checksum-validated before it navigates.
- **Recently viewed**, kept on the device in `localStorage`. No account, no sync, and a Clear button.
- A `Scan` entry in the top navigation.

### Changed
- The home page Scan button now works. It was disabled with a "Coming soon" tooltip.

### Removed
- The two invented "Recently viewed" products. The section stays hidden until there is something real in it.

---

## v0.6.0 - 2026-09-05

### Added
- **Live product scoring.** `assets/js/opff.js` fetches and normalises Open Pet Food Facts records; `assets/js/scoring.js` derives the CFC Score from them. Both run in the browser, with no build step and no server.
- `assets/data/additives.json`, the additive knowledge base: 20 entries across three risk tiers, plus three catch-all label terms, each with sources.
- Real `product.html` and `search.html`, replacing the mock markup.
- A 130-assertion test suite (`tests.html`), run headlessly by `tools/run-tests.py`.
- `docs/DATA-COVERAGE.md`: a measured survey of what the database actually holds.
- A "What the score cannot see" section on the methodology page.

### Fixed
- **Non-English labels were scored as clean.** The alias matcher was English-only, and only 9.5% of records carry English ingredients, so on most labels it matched nothing, and reported that silence as an absence of problems. A French product with unnamed meat by-products and added sugar scored 77 / Excellent. Aliases now cover six languages, and a label outside that set is explicitly reported as unchecked rather than clean, with confidence capped. See `docs/DATA-COVERAGE.md`.
- The Tier 0 "named by-products" credit was awarded to *unnamed* by-products, contradicting the transparency pillar on the same words.
- A parenthetical naming 4% beef could make an unnamed meat entry score as a named animal protein.

---

## v0.5.0 - 2026-09-05

### Added
- **Dark mode with a persisted preference.** A three-state control (system, light, dark) in the top bar of every page. The choice is stored under the `localStorage` key `cfc-theme`; `system` stores nothing and defers to `prefers-color-scheme`. Open tabs stay in step via a `storage` listener.
- `assets/cfc-tokens.css`: the palette extracted from `cfc.css` so that both page families share it: the Tailwind CDN pages and the generated guide pages.
- `assets/cfc-theme.js`: theme application and persistence. Loaded synchronously in `<head>` so the stored theme applies before first paint.
- `tools/check-contrast.py`: WCAG AA audit of every foreground/background pair in both palettes.
- `docs/ADR-001-static-first.md`: the decision that the site is static HTML by design, what that enables (the barcode scanner needs no server), and what it forecloses.

### Changed
- Tailwind colour names map to CSS variables rather than hex literals, so utility classes follow the theme without `dark:` variants. Opacity modifiers cannot be used on those colours as a result.
- The green and amber score chips now use dark ink instead of white. They failed AA at 2.8:1 and 2.3:1 in the light theme; this is an accessibility fix, and it changes how the light theme looks.
- `README.md`, `TRD.md`, `RUNBOOK.md` and `DESIGN.md` now describe the static stack that actually ships rather than the Next.js application that did not.

### Removed
- The unused Next.js 14 application and its toolchain. It was never built or deployed; `deploy.yml` has always served the repository root directly.

### Verified
- All 38 token pairs pass WCAG AA in both palettes.
- Chromium check across all fifteen pages: the theme applies, the toggle cycles, the choice survives a reload with no flash, and no console errors.

---

## v0.4.0 - 2026-09-05

### Added
- **The Cat Care Guide**: an eleven-page educational resource at `/learn.html` and `/learn-*.html`, grounded in the AAFCO nutrient profiles, NRC research, FDA and EFSA guidance, WSAVA's nutrition toolkit, and the peer-reviewed veterinary literature. Every page carries a sources list.
  - `learn.html`: overview, the five rules, and the guide map
  - `learn-nutrition.html`: obligate carnivore metabolism; protein, fat, carbohydrate and fibre; the eight nutrients cats cannot synthesise
  - `learn-daily-requirements.html`: the complete AAFCO cat food nutrient profile (all 42 nutrients with growth minimums, adult minimums and maximums), the RER/MER calorie formulas, and a worked conversion into exact grams and milligrams per day for a 4.5 kg cat
  - `learn-labels.html`: AAFCO adequacy statements, the dry-matter conversion, carbohydrate by difference, ingredient splitting, the 95/25/3 naming rules, and the marketing terms with no regulatory meaning
  - `learn-food-types.html`: seven formats compared, including the current FDA position on H5N1 in raw pet food
  - `learn-hydration.html`: water requirements by body weight, dehydration checks, and eleven ways to increase intake
  - `learn-additives.html`: a three-tier additive reference covering 30+ compounds with the regulatory position and evidence for each, plus the commonly criticised ingredients that are not actually a problem
  - `learn-feeding.html`: calorie tables by body weight, portioning, meal timing, transitions, treats, weight management, and multi-cat feeding
  - `learn-life-stages.html`: weaning through geriatric, including the post-neutering weight gain window and why senior cats need more protein, not less
  - `learn-toxic.html`: toxic foods, plants (lilies flagged as a same-hour emergency), medications and household hazards, with poison-line numbers and first-ten-minutes steps
  - `learn-health.html`: diet in obesity, CKD, FLUTD, diabetes, hyperthyroidism, IBD, food allergy, hepatic lipidosis, dental disease and constipation
- Documentation-site layout for the guide: fixed top bar with product search, grouped sticky sidebar, article column, "on this page" scroll-spy rail, prev/next pagination, and a four-column site footer
- Shared front-end assets in `/assets`: `cfc.css` (design tokens and the documentation shell), `cfc-docs.js` (mobile navigation drawer and scroll spy), `cfc-tailwind.js` (Tailwind CDN theme extracted from the inline page configs)
- `tools/learn/` static generator so the eleven pages share one shell and cannot drift apart; generated output is committed, so deployment still needs no build step
- "Learn" entry in the main navigation on the home, search, product and methodology pages
- Cat Care Guide entry card on the home page

### Changed
- Main navigation now scrolls horizontally on narrow viewports rather than overflowing, since it carries a fourth item
- `docs/ROADMAP.md` renumbered into true chronological order; the Cat Care Guide recorded as complete, and dark mode promoted out of the deferred list into a planned milestone (M5) with a toggle and a `localStorage`-persisted preference
- README documents the guide, the generator workflow, and the shared assets

### Notes
- The guide is educational content and is not veterinary advice; every page says so, and the pages covering disease and toxicity say so prominently.

---

## v0.3.0 - 2026-06-08

### Added
- Full documentation suite: PRD, TRD, DESIGN, PATCHNOTES, PRFAQ, TENETS, METRICS, ROADMAP, SECURITY, RUNBOOK
- `/docs` directory consolidating all project documentation
- README.md rewritten for developer audience with install, dev, build, and deploy instructions

### Changed
- PRD.md, TRD.md, DESIGN.md moved from project root into `/docs`
- TRD.md updated to reflect actual current implementation state (mock data, deferred features catalogued in known technical debt table)
- DESIGN.md updated with precise Tailwind token references, accessibility ARIA patterns, and component implementation details

---

## v0.2.0 - 2026-06-07

### Added
- Next.js 14 App Router with TypeScript and static export configured for GitHub Pages (`basePath: /Cat-Food-Center`)
- Tailwind CSS with full design token theme: colors (`bg`, `surface`, `ink`, `ink-soft`, `accent`, `hairline`, four band colors), typography scale (`display`, `h1`, `h2`, `body`, `small`, `micro`), border radius (`card`, `pill`), max-width (`content`)
- Fraunces (display serif) and Public Sans (body sans) loaded via `next/font/google`
- Global layout (`app/layout.tsx`): sticky header with wordmark and Support pill button linking to `https://azqato.github.io/support.html`; footer with Azqato link
- Home page (`app/page.tsx`): wordmark, tagline, disabled Scan button with "coming soon" tooltip, search form routing to `/search`, recently viewed section with two mock product cards and score badges
- Search page (`app/search/`): search bar pre-filled from `?q=` param, mock result list of three products with score badges and band labels
- Product detail page (`app/product/[barcode]/page.tsx`): score header with band color bar and checkmark glyph, verdict section with reason chips, numbered ingredient list, additive flags section with tier dot and cited source links, 2×2 nutrition snapshot grid (dry-matter basis), AAFCO adequacy quote, footer metadata row with data completeness and last reviewed date
- GitHub Actions workflow (`.github/workflows/deploy.yml`): builds with `npm ci && npm run build` and deploys `out/` to GitHub Pages on every push to `main`
- `public/.nojekyll` to prevent GitHub Pages from ignoring underscore-prefixed directories

### Changed
- Replaced earlier plain HTML/CSS/JS implementation with Next.js App Router static export

---

## v0.1.0 - 2026-06-07

### Added
- Initial Next.js App Router scaffold with TypeScript, Tailwind CSS, ESLint, and PostCSS
- `next.config.ts` with `output: 'export'`, `trailingSlash: true`, `basePath`, and `assetPrefix` for GitHub Pages
- `PRD.md`, `TRD.md`, `DESIGN.md` specification documents
- `.gitattributes` and `.gitignore`
