# Cat Food Center

**Trustworthy reviews for your purrfect companion.**

Scan the barcode on a tin of cat food, or search by brand, and get a plain
explanation of what is in it: the ingredients, any additives linked to health
concerns in cats, the nutrition on a comparable basis, and a single score from
0 to 100 with a verdict.

**[Open the site](https://catfoodcenter.com/)**

Free. No account, nothing to install, no advertising, and no relationship with
any pet food manufacturer.

---

## What it does

**Scan a barcode.** Point your phone's camera at the packaging and the product
page opens. If your browser cannot use the camera, type the number instead.

**Search or browse.** Look up a product by name, or work through an A to Z
index of every cat food brand in the database.

**Read the verdict.** Score and band first (Excellent, Good, Poor or Bad), then
the reasoning: which ingredients drove it, which additives were flagged and
why, and how the nutrition compares once moisture is accounted for.

**Compare two foods.** Side by side, converted to a dry-matter basis, so a wet
food and a dry food can be read on the same scale rather than the wetter one
looking worse for containing water.

**Learn the subject.** [The Cat Care Guide](/learn/) is eleven free, sourced
pages on feeding a cat, and is useful without looking up a single product.

**Use it in a shop.** It works on a phone one-handed, installs to a home
screen, and keeps any product you have already opened readable with no signal.
A saved answer always says it is a saved copy, with the date.

---

## How the score works

Three things, weighted:

| | | |
|---|---|---|
| **Nutrition for a cat** | 55% | Cats are obligate carnivores. They cannot make taurine, arginine or arachidonic acid the way other animals can, so the score is built around animal protein rather than protein in general |
| **Additives** | 35% | Each ingredient is checked against a knowledge base of additives with documented concerns. Every flag carries what the additive does, how strong the evidence is, and where that evidence comes from |
| **Honest labelling** | 10% | Whether the label names what is actually in the food, or hides it behind terms like "meat and animal derivatives" |

Some things override the arithmetic. Propylene glycol is prohibited in cat food
in the United States, so a food containing it lands in the Bad band whatever
else it does well.

The full method is on the
[methodology page](https://catfoodcenter.com/methodology/),
and the score is calculated in your own browser, so anyone who wants to check
it can watch it happen.

---

## What it will not do

**It refuses to guess.** The product information comes from
[Open Pet Food Facts](https://world.openpetfoodfacts.org/), an open database
maintained by volunteers, and coverage varies a lot. Around one product in five
carries enough detail to score fully. Where the information is not there, the
site says exactly what is missing instead of producing a number that looks like
all the others.

**It tells you when it could not read the label.** Only about one record in ten
has an English ingredient list. The additive checker covers English, French,
German, Spanish, Italian and Dutch, and outside those it says the label was not
checked. Finding nothing in a language you cannot read is not the same as
finding nothing.

**It is not veterinary advice.** It compares products and flags concerns. It
does not know your cat. If your cat has a diagnosis, follow your vet.

**It does not do dog food**, personalised diet plans, user reviews, shopping or
price comparison. Those are decisions rather than gaps, and the reasons are in
the [PRD](docs/PRD.md).

---

## Your privacy

There is no account, no login, no analytics and no tracking of any kind.

Recently viewed products are stored in your own browser and never leave your
device. The camera runs entirely on your device and no image is ever uploaded.
The barcodes and search terms you look up are sent to Open Pet Food Facts,
because that is how the lookup works.

---

## A product is missing. What now?

The site checks first whether the barcode was mistyped, which is the most
common cause. If it really is missing, it links you to Open Pet Food Facts with
the barcode already filled in and tells you which two panels to photograph.

Adding it there rather than here means it works on this site, in every other
tool built on the same data, and for the next person who scans the same tin.

---

## Questions, corrections and permission requests

Open an issue: **https://github.com/Azqato/catfoodcenter/issues**

For a wrong product fact rather than a wrong score, correcting it at
[Open Pet Food Facts](https://world.openpetfoodfacts.org/) fixes it everywhere.

---

## For developers

Everything about how this is built, run, tested and deployed lives in three
documents. There is nothing to install to read the site's source: it is plain
HTML, CSS and JavaScript with no build step.

| Document | What is in it |
|---|---|
| **[docs/PRD.md](docs/PRD.md)** | The single source of truth. Product, tenets, the scoring model, what the data actually contains, the roadmap, metrics, the full runbook, architecture, conventions, style and testing rules, security, licensing, and a record of every place the documentation and the code disagree |
| **[docs/DESIGN.md](docs/DESIGN.md)** | The design system: tokens, typography, components, accessibility, and how the two page families are being merged into one |
| **[docs/PATCHNOTES.md](docs/PATCHNOTES.md)** | The changelog |

Start at PRD section 26, "Working practice", which is written for whoever picks
this up next.

---

## Licence

Copyright 2026 Azqato. All rights reserved. Source-available, not open source:
see [LICENSE.md](LICENSE.md).

Search engines and AI assistants are explicitly welcome to crawl, index, quote,
summarise and cite this site. That permission is in the licence and does not
need to be asked for.

The product data belongs to
[Open Pet Food Facts](https://world.openpetfoodfacts.org/) and its
contributors, not to this project.
