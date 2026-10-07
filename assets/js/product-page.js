/* ==========================================================================
   /product/: fetch a barcode, score it, render it.

   The page previously rendered a hardcoded mock. It now renders whatever
   Open Pet Food Facts actually holds, which is usually less, and the job of
   this file is mostly to be honest about the difference.

   docs/PRD.md section 12 is the reason for most of the shape here: roughly a
   fifth of products carry a full analysis, and a quarter of published protein
   figures are wrong. So every section has a "not published" state that says
   so plainly, rather than a zero or a blank that reads as a finding.
   ========================================================================== */
import { SITE } from './site.js';
import { fetchProduct } from './opff.js';
import { isProvisional } from './catalogue.js';
import { scoreProduct, loadKnowledgeBase, toDryMatter, explainIngredient } from './scoring.js';
import { recordView } from './history.js';

/* `color` is the fill: the rule above the score, where it is a block of colour
   and nothing is read off it. `ink` is for the label and its glyph, which are
   text. In the light theme --good and --poor are around 2.6:1 and cannot carry
   a word; see the note in assets/cfc-tokens.css. */
const BAND = {
  excellent: { color: 'var(--excellent)', ink: 'var(--excellent-ink)', label: 'Excellent', glyph: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  good: { color: 'var(--good)', ink: 'var(--good-ink)', label: 'Good', glyph: 'M5 13l4 4L19 7' },
  poor: { color: 'var(--poor)', ink: 'var(--poor-ink)', label: 'Poor', glyph: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.539-1.333-3.11 0L3.268 16c-.77 1.333.192 3 1.732 3z' },
  bad: { color: 'var(--bad)', ink: 'var(--bad-ink)', label: 'Bad', glyph: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z' },
};

const TIER = {
  3: { label: 'Tier 3, High risk', color: 'var(--bad)', ink: 'var(--chip-bad-ink)', bg: 'var(--chip-bad-bg)' },
  2: { label: 'Tier 2, Moderate risk', color: 'var(--poor)', ink: 'var(--chip-poor-ink)', bg: 'var(--chip-poor-bg)' },
};

const CONFIDENCE = {
  high: { label: 'High confidence', detail: 'Scored from a published guaranteed analysis and a full ingredient list.' },
  medium: { label: 'Medium confidence', detail: 'Some figures come from fields intended for human food, which are often mis-entered.' },
  low: { label: 'Low confidence', detail: 'No usable analysis was published, so nutrition was judged from the ingredient list alone.' },
};

const FORMAT_LABEL = {
  wet: 'Wet', dry: 'Dry', 'semi-moist': 'Semi-moist', treat: 'Treat', unknown: 'Format unknown',
};
const STAGE_LABEL = {
  growth: 'Kitten / growth', adult: 'Adult', all: 'All life stages', unknown: 'Life stage unstated',
};

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function icon(pathD, color, size = 6) {
  const px = size * 4;
  return `<svg aria-hidden="true" style="width:${px}px;height:${px}px;flex-shrink:0" fill="none" stroke="${color}" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="${pathD}"/></svg>`;
}

function section(id, heading, body) {
  return `<section aria-labelledby="${id}"><h2 id="${id}" class="font-display text-h2 text-ink mb-4">${esc(heading)}</h2>${body}</section>`;
}

/** A card that says a figure is missing, rather than showing a misleading zero. */
function unknownCard(text) {
  return `<div class="bg-surface border border-hairline rounded-card p-4"><p class="text-small text-ink-soft" style="margin:0">${esc(text)}</p></div>`;
}

/* ── Sections ── */

function renderNotice(messages, tone = 'warn') {
  if (!messages.length) return '';
  const bg = tone === 'warn' ? 'var(--warn-bg)' : 'var(--accent-sub)';
  const ink = tone === 'warn' ? 'var(--warn-ink)' : 'var(--accent)';
  const edge = tone === 'warn' ? 'var(--poor)' : 'var(--accent)';
  const glyph = icon('M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.539-1.333-3.11 0L3.268 16c-.77 1.333.192 3 1.732 3z', ink, 5);
  const items = messages.map((m) => `<p class="text-small" style="color:${ink};margin:0 0 4px">${esc(m)}</p>`).join('');
  return `<div role="status" style="background:${bg};border-left:4px solid ${edge};border-radius:8px;padding:12px 16px;display:flex;gap:10px;align-items:flex-start">${glyph}<div>${items}</div></div>`;
}

function renderHeader(product, result) {
  const band = result.scorable ? BAND[result.band] : null;
  const image = product.imageUrl
    ? `<img src="${esc(product.imageUrl)}" alt="" class="w-20 h-20 rounded-card shrink-0" style="object-fit:cover" loading="lazy">`
    : '<div class="w-20 h-20 rounded-card bg-hairline flex items-center justify-center shrink-0" aria-label="Product image not available"><span class="text-ink-soft text-micro text-center leading-tight px-1">No<br>image</span></div>';

  const scoreBlock = result.scorable
    ? `<div class="flex items-end gap-3">
         <span class="font-display text-display text-ink leading-none" style="font-variant-numeric:tabular-nums">${result.score}</span>
         <div class="flex items-center gap-1.5 pb-1">${icon(band.glyph, band.ink, 6)}<span class="font-medium text-small" style="color:${band.ink}">${band.label}</span></div>
       </div>`
    : `<div class="flex items-end gap-3"><span class="font-display text-h1 text-ink-soft leading-none">Not scored</span></div>`;

  const meta = [
    product.brand, FORMAT_LABEL[product.format] || 'Format unknown',
    STAGE_LABEL[product.lifeStage] || 'Life stage unstated', product.quantity,
  ].filter(Boolean)
    .map((v) => `<span>${esc(v)}</span>`)
    .join('<span aria-hidden="true">&middot;</span>');

  return `<div class="bg-surface rounded-card shadow-sm overflow-hidden">
    <div style="height:6px;background:${result.scorable ? band.color : 'var(--hairline)'}" aria-hidden="true"></div>
    <div class="p-5">
      <div class="flex items-start justify-between gap-4 mb-4">${scoreBlock}${image}</div>
      <h1 class="font-display text-h1 text-ink mb-2">${esc(product.name)}</h1>
      <div class="flex flex-wrap gap-x-3 gap-y-1 items-center text-small text-ink-soft">${meta}</div>
    </div>
  </div>`;
}

function renderVerdict(result) {
  if (!result.scorable) {
    return section('verdict-heading', 'Why there is no score',
      `<p class="text-small text-ink">${esc(result.reason)}</p>
       <p class="text-small text-ink-soft mt-3">A score built on an absent ingredient list would be a guess wearing the costume of a measurement, so we do not publish one.</p>`);
  }

  const gates = result.hardGates.length
    ? `<ul class="flex flex-col gap-2 mb-4" style="list-style:none;padding:0">${result.hardGates
      .map((g) => `<li class="text-small" style="color:var(--bad-ink);font-weight:500">${esc(g)}</li>`).join('')}</ul>`
    : '';

  const reasons = result.reasons
    .map((r) => `<li class="text-small text-ink" style="padding-left:16px;position:relative"><span aria-hidden="true" style="position:absolute;left:0;color:var(--ink-soft)">&bull;</span>${esc(r)}</li>`)
    .join('');

  const conf = CONFIDENCE[result.confidence];
  const confidence = conf
    ? `<p class="text-micro text-ink-soft mt-4" style="border-top:1px solid var(--hairline);padding-top:12px">
         <strong style="color:var(--ink)">${esc(conf.label)}.</strong> ${esc(conf.detail)}
         Pillars used: ${result.pillarsUsed.join(', ')}.
       </p>`
    : '';

  return section('verdict-heading', 'How this score was reached',
    `${gates}<ul class="flex flex-col gap-2" style="list-style:none;padding:0">${reasons}</ul>${confidence}`);
}

function renderPillars(result) {
  if (!result.scorable) return '';
  const names = { nutrition: 'Nutrition', additives: 'Additives & safety', transparency: 'Transparency' };
  const weights = { nutrition: '55%', additives: '35%', transparency: '10%' };

  const rows = Object.entries(result.pillars).map(([key, pillar]) => {
    const value = pillar.available ? `${pillar.score}` : ', ';
    const bar = pillar.available
      ? `<div style="height:6px;border-radius:3px;background:var(--hairline);overflow:hidden"><div style="height:100%;width:${pillar.score}%;background:var(--accent)"></div></div>`
      : '<div style="height:6px;border-radius:3px;background:var(--hairline)"></div>';
    const note = pillar.available ? '' : ' <span class="text-micro text-ink-soft">not assessable</span>';
    return `<div class="nutrition-card">
      <p class="nutrition-label">${names[key]} &middot; ${weights[key]}${note}</p>
      <p class="nutrition-value" style="font-size:1.5rem">${value}</p>
      ${bar}
    </div>`;
  }).join('');

  return section('pillars-heading', 'Pillar breakdown',
    `<div class="nutrition-grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">${rows}</div>
     <p class="text-micro text-ink-soft mt-2">Each pillar is scored 0&ndash;100, then weighted. Where a pillar cannot be assessed its weight is redistributed across the others rather than counted as zero. <a href="${SITE}methodology/">Full methodology</a>.</p>`);
}

/* ── Ingredient explanations ──

   An ingredient row opens only where the additive knowledge base has something
   to say about it. Everything else stays a plain row: there is nothing true
   this project can add to the word "chicken", and padding every row with
   filler would bury the rows that matter.

   Native <details>, not a hand-rolled disclosure. It is keyboard-accessible,
   announced correctly by screen readers, works with JavaScript already run and
   nothing further bound, and survives being redrawn by innerHTML. An earlier
   version of the documentation described a chevron with a click handler here;
   the chevron was never built, which is recorded in PRD section 24. */

function tierChip(info) {
  const tier = TIER[info.tier];
  if (tier) {
    return `<span class="ingredient-tier" style="background:${tier.bg};color:${tier.ink}">${esc(tier.label)}</span>`;
  }
  if (info.kind === 'vague') {
    return '<span class="ingredient-tier" style="border:1px solid var(--hairline);color:var(--ink-soft)">Unnamed source</span>';
  }
  // Tier 0, the beneficial entries. Named, because a row that opens with no
  // label on it looks like a warning the reader has not read yet.
  return '<span class="ingredient-tier" style="border:1px solid var(--hairline);color:var(--good-ink)">Beneficial</span>';
}

function explanation(info) {
  const parts = [];
  if (info.function) {
    parts.push(`<p class="ingredient-detail-row"><span class="ingredient-detail-key">Function</span>${esc(info.function)}</p>`);
  }
  if (info.healthImpact) {
    parts.push(`<p class="ingredient-detail-row"><span class="ingredient-detail-key">Health impact</span>${esc(info.healthImpact)}</p>`);
  }
  if (info.regulatory) {
    parts.push(`<p class="ingredient-detail-row"><span class="ingredient-detail-key">Regulatory</span>${esc(info.regulatory)}</p>`);
  }
  const sources = (info.sources || [])
    .map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a>`)
    .join(', ');
  if (sources) {
    parts.push(`<p class="ingredient-detail-row"><span class="ingredient-detail-key">Sources</span>${sources}</p>`);
  }
  /* The alias that fired is shown because the match is a judgement the reader
     is entitled to check: an entry can be flagged on a phrase buried inside a
     longer one, and "matched on: bha" is the difference between a finding and
     an assertion. */
  parts.push(`<p class="ingredient-detail-row"><span class="ingredient-detail-key">Matched on</span>&ldquo;${esc(info.matchedOn)}&rdquo;, against the reference in <a href="${SITE}learn/additives/">the additive guide</a></p>`);
  return `<div class="ingredient-detail">${parts.join('')}</div>`;
}

function renderIngredients(product, kb) {
  if (!product.ingredients.length) {
    return section('ingredients-heading', 'Ingredients',
      unknownCard('No ingredient list has been recorded for this product. Open Pet Food Facts is community-maintained; anyone can add one.'));
  }
  let explained = 0;
  const rows = product.ingredients
    .map((ing, i) => {
      const num = `<span class="ingredient-num">${i + 1}.</span>`;
      const name = `<span class="ingredient-name">${esc(ing)}</span>`;
      const info = explainIngredient(ing, kb);
      if (!info) return `<li class="ingredient-row">${num}${name}</li>`;
      explained += 1;
      return `<li><details class="ingredient-row ingredient-row-open">
        <summary>${num}${name}${tierChip(info)}</summary>
        ${explanation(info)}
      </details></li>`;
    })
    .join('');
  /* Only claim the rows expand when some of them do. */
  const hint = explained
    ? `<p class="text-micro text-ink-soft mt-2">Listed by weight before processing, as printed on the label. `
      + `${explained === 1 ? 'One entry is' : `${explained} entries are`} in our additive reference and `
      + `${explained === 1 ? 'opens' : 'open'} for an explanation.</p>`
    : '<p class="text-micro text-ink-soft mt-2">Listed by weight before processing, as printed on the label.</p>';
  return section('ingredients-heading', 'Ingredients',
    `<ol class="ingredient-list">${rows}</ol>${hint}`);
}

function renderAdditives(result) {
  if (!result.scorable) return '';
  const flagged = result.flaggedAdditives;

  if (!flagged.length) {
    const beneficial = result.beneficialAdditives.length
      ? `<p class="text-small text-ink-soft mt-3">Positive signals found: ${esc(result.beneficialAdditives.map((b) => b.name.toLowerCase()).join(', '))}.</p>`
      : '';
    return section('additives-heading', 'Additive flags',
      `<div class="bg-surface border border-hairline rounded-card p-4" style="display:flex;align-items:center;gap:12px">
         ${icon('M5 13l4 4L19 7', 'var(--excellent)', 5)}
         <p class="text-small text-ink" style="margin:0">No Tier 2 or Tier 3 additives were found in this ingredient list.</p>
       </div>${beneficial}`);
  }

  const tiers = [...new Set(flagged.map((f) => f.tier))].sort((a, b) => b - a);
  const body = tiers.map((tier) => {
    const config = TIER[tier];
    const cards = flagged.filter((f) => f.tier === tier).map((a) => {
      const sources = (a.sources || [])
        .map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" class="source-link text-small">Source: ${esc(s.label)} &#8599;</a>`)
        .join(' ');
      const regulatory = a.regulatory
        ? `<p class="text-micro text-ink-soft" style="margin:6px 0 0">${esc(a.regulatory)}</p>` : '';
      return `<div class="additive-card">
        <div class="additive-header"><span class="additive-name">${esc(a.name)}</span><span class="additive-fn">${esc(a.function)}</span></div>
        <p class="additive-impact">${esc(a.healthImpact)}</p>
        ${regulatory}${sources}
      </div>`;
    }).join('');
    return `<div style="display:flex;align-items:center;gap:8px;margin:16px 0 12px">
        <span style="width:8px;height:8px;border-radius:50%;background:${config.color};display:inline-block;flex-shrink:0" aria-hidden="true"></span>
        <span class="text-small font-medium" style="color:${config.color}">${config.label}</span>
      </div>${cards}`;
  }).join('');

  return section('additives-heading', 'Additive flags', body);
}

function renderNutrition(product) {
  const n = product.nutrition || {};
  const proteinDM = toDryMatter(n.crudeProteinPct, n.moisturePct);
  const fatDM = toDryMatter(n.crudeFatPct, n.moisturePct);

  const card = (label, value, unit, note) => {
    if (value === undefined || value === null) {
      return `<div class="nutrition-card"><p class="nutrition-label">${label}</p><p class="text-small text-ink-soft" style="margin:8px 0 0">Not published</p></div>`;
    }
    return `<div class="nutrition-card">
      <p class="nutrition-label">${label}</p>
      <p class="nutrition-value">${value}<span class="nutrition-unit">${unit}</span></p>
      ${note ? `<p class="text-micro text-ink-soft" style="margin:4px 0 0">${esc(note)}</p>` : ''}
    </div>`;
  };

  const taurine = n.taurinePresent
    ? `<div class="nutrition-card"><p class="nutrition-label">Taurine</p><div style="display:flex;align-items:center;gap:8px;margin-top:8px">${icon('M5 13l4 4L19 7', 'var(--excellent)', 5)}<span class="text-small font-medium" style="color:var(--excellent-ink)">Declared</span></div></div>`
    // Not "absent": 4% of records carry a taurine figure at all, so its absence
    // says something about the database, not about the food.
    : '<div class="nutrition-card"><p class="nutrition-label">Taurine</p><p class="text-small text-ink-soft" style="margin:8px 0 0">Not recorded; this does not mean it is absent from the food</p></div>';

  const anyFigure = [n.crudeProteinPct, n.crudeFatPct, n.moisturePct, n.kcalPer100g]
    .some((v) => typeof v === 'number');
  if (!anyFigure) {
    return section('nutrition-heading', 'Nutrition snapshot',
      unknownCard('No guaranteed analysis has been recorded for this product, and any figures that were published failed a plausibility check. Read the panel on the packaging instead.'));
  }

  const dmNote = typeof n.moisturePct === 'number'
    ? `<p class="text-micro text-ink-soft mt-2">DM = dry-matter basis, which is the only way to compare a wet food with a dry one. See <a href="${SITE}learn/labels/#dry-matter">the conversion</a>.</p>`
    : `<p class="text-micro text-ink-soft mt-2">No moisture figure was published, so these are as-fed values and cannot be compared across wet and dry foods. See <a href="${SITE}learn/labels/#dry-matter">why that matters</a>.</p>`;

  return section('nutrition-heading', 'Nutrition snapshot',
    `<div class="nutrition-grid">
      ${card(proteinDM !== undefined ? 'Crude protein (DM)' : 'Crude protein (as fed)',
    proteinDM !== undefined ? proteinDM.toFixed(1) : n.crudeProteinPct, '%')}
      ${card(fatDM !== undefined ? 'Crude fat (DM)' : 'Crude fat (as fed)',
    fatDM !== undefined ? fatDM.toFixed(1) : n.crudeFatPct, '%')}
      ${card('Moisture (as fed)', n.moisturePct, '%')}
      ${card('Energy', n.kcalPer100g, ' kcal/100g', n.energyCorrected ? 'Read as a per-kilogram value; the published figure was implausible per 100 g' : '')}
      ${taurine}
    </div>${dmNote}${renderAlsoPublished(n)}`);
}

/* Figures the panel publishes that nothing here scores.
 *
 * They are shown in their own block rather than mixed into the grid above,
 * because every card in that grid feeds the score and these do not, and a
 * reader has no way to tell which is which if they sit side by side. Section
 * 24.1 carried their absence as a defect from 2026-09-26 to 2026-10-07: the
 * panels were captured with the figures in them and the catalogue had no field
 * to hold them, so they were dropped rather than misfiled, which was the right
 * call at the time and not a resting place.
 *
 * The block renders only when a figure exists. An empty "also published"
 * heading over four "Not published" cards would imply the project had looked
 * and found nothing, when for almost every product it has not yet looked. */
function renderAlsoPublished(n) {
  const rows = [
    ['Omega-3 (min)', n.omega3Pct, '%'],
    ['EPA (min)', n.epaPct, '%'],
    ['DHA (min)', n.dhaPct, '%'],
    ['Vitamin E (min)', n.vitaminEIuPerKg, ' IU/kg'],
  ].filter(([, value]) => typeof value === 'number');
  if (!rows.length) return '';

  const cells = rows.map(([label, value, unit]) => `<div class="nutrition-card">
      <p class="nutrition-label">${label}</p>
      <p class="nutrition-value">${value}<span class="nutrition-unit">${unit}</span></p>
    </div>`).join('');
  return `<h3 class="text-small font-medium text-ink mt-4" style="margin-bottom:8px">Also published on the panel</h3>
    <div class="nutrition-grid">${cells}</div>
    <p class="text-micro text-ink-soft mt-2">Transcribed from the panel and shown because it is published, not because it is scored: nothing in the score on this page uses these figures.</p>`;
}

function renderAdequacy(product) {
  return section('aafco-heading', 'AAFCO adequacy',
    `<div class="bg-surface border border-hairline rounded-card p-4">
      <p class="text-small text-ink" style="margin:0 0 8px">Not recorded.</p>
      <p class="text-small text-ink-soft" style="margin:0">Open Pet Food Facts does not capture the AAFCO complete-and-balanced statement, so we cannot report it here, and its absence from this page is not evidence that the food lacks one. It is the single most important sentence on a cat food label: <a href="${SITE}learn/labels/#aafco">what to look for and why</a>.</p>
    </div>`);
}

/* The curated disclosure (PRD 16.5a).
 *
 * It sits directly under the score rather than in the footer, and it names the
 * fields rather than saying something vague about "additional sources",
 * because the whole justification for keeping a local data file is that a
 * reader can see which numbers came from where. A disclosure nobody reads in a
 * place nobody looks would leave this project quietly presenting transcribed
 * data as database data, which is the one thing section 16.5a forbids. */
const FIELD_LABELS = {
  ingredientsText: 'the ingredient list',
  crudeProteinPct: 'crude protein',
  crudeFatPct: 'crude fat',
  crudeFibrePct: 'crude fibre',
  ashPct: 'ash',
  moisturePct: 'moisture',
  kcalPer100g: 'energy',
  taurinePresent: 'the taurine declaration',
  omega3Pct: 'the omega-3 minimum',
  epaPct: 'EPA',
  dhaPct: 'DHA',
  vitaminEIuPerKg: 'vitamin E',
  name: 'the product name',
  brand: 'the brand',
  quantity: 'the pack size',
  format: 'the wet or dry format',
  lifeStage: 'the life stage',
  aafcoComplete: 'the AAFCO adequacy statement',
};

function renderCurated(product) {
  const curated = product.curated;
  if (!curated || !curated.fields || !curated.fields.length) return '';

  const names = curated.fields.map((f) => FIELD_LABELS[f] || f);
  const list = names.length === 1 ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const kind = curated.sourceKind === 'manufacturer'
    ? 'the manufacturer’s own published information'
    : 'a retailer listing, not the manufacturer';
  // overflow-wrap:anywhere on the paragraph below, because a source is often a
  // long unbroken URL and a 320px viewport has nowhere to put one. It pushed
  // the whole article to 454px wide the first time this shipped, which the
  // accessibility gate caught and a desktop browser never would have.
  const link = /^https?:/.test(curated.source || '')
    ? `<a href="${esc(curated.source)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">${esc(curated.source)}</a>`
    : esc(curated.source || 'an unrecorded source');

  return `<div class="bg-surface border border-hairline rounded-card p-4 mb-6">
    <p class="text-small text-ink" style="margin:0 0 6px"><strong>Not everything here came from Open Pet Food Facts.</strong> On this page, ${esc(list)} ${names.length === 1 ? 'was' : 'were'} recorded by Cat Food Center from ${esc(kind)}${curated.checked ? `, checked on ${esc(curated.checked)}` : ''}.</p>
    <p class="text-micro text-ink-soft" style="margin:0;overflow-wrap:anywhere">Source: ${link}. ${curated.only ? 'Open Pet Food Facts holds no record for this product, so everything on this page was recorded by Cat Food Center.' : 'Everything else on this page is from the Open Pet Food Facts record.'} The score is worked out the same way either way; see the methodology.</p>
  </div>`;
}

function renderMeta(product) {
  const completeness = { full: 'Full data', partial: 'Partial data', minimal: 'Minimal data' }[product.dataCompleteness];
  const glyph = product.dataCompleteness === 'full'
    ? icon('M5 13l4 4L19 7', 'var(--excellent)', 4)
    : icon('M12 9v2m0 4h.01', 'var(--poor)', 4);
  const source = product.sourceUrl
    ? `<a href="${esc(product.sourceUrl)}" target="_blank" rel="noopener noreferrer" class="text-micro" style="color:var(--accent)">View or improve this record on Open Pet Food Facts &#8599;</a>`
    : '';
  return `<div class="border-t border-hairline pt-4" style="display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:center">
    <div style="display:flex;align-items:center;gap:6px">${glyph}<span class="text-micro text-ink-soft">${completeness}</span></div>
    ${product.lastModified ? `<span class="text-micro text-ink-soft">Record updated: ${esc(product.lastModified)}</span>` : ''}
    ${isProvisional(product.barcode)
      ? `<span class="text-micro text-ink-soft">No published barcode, so this product cannot be scanned yet</span>`
      : `<span class="text-micro text-ink-soft">Barcode: ${esc(product.barcode)}</span>`}
  </div>
  <p style="margin:12px 0 0">${source}</p>`;
}

/* ── Page states ── */

function renderNotFound(barcode, error) {
  return `<div class="text-center py-16">
    <p class="font-display text-h2 text-ink mb-3">${error ? 'Could not load this product' : 'Product not found'}</p>
    <p class="text-small text-ink-soft mb-6" style="max-width:46ch;margin-left:auto;margin-right:auto">${
  error
    ? esc(error)
    : `Open Pet Food Facts has no record for barcode <code>${esc(barcode)}</code>. The catalogue is community-maintained and far from complete, so a miss is common and does not say anything about the product.`}</p>
    <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
      <a href="${SITE}search/" class="btn-link rounded-pill bg-accent text-on-accent text-small font-medium px-6 py-3" style="display:inline-block">Search by name instead</a>
      <a href="${SITE}submit/?barcode=${esc(barcode)}" class="btn-link rounded-pill text-small font-medium px-6 py-3" style="display:inline-block;border:1px solid var(--hairline);color:var(--ink)">Add it to the database</a>
    </div>
  </div>`;
}

/* ── Boot ── */

const article = document.getElementById('product-article');

/* Every draw of the article goes through here, because the "On this page" rail
   is built from the headings this function writes. cfc-docs.js ships the rail
   empty on this page (the generator has nothing to index at build time: the
   headings do not exist until the fetch returns) and listens for this event to
   fill it. A "not found" draw carries no sections, and the rail hides itself
   again rather than keeping the last product's list. */
function paint(html) {
  article.innerHTML = html;
  document.dispatchEvent(new CustomEvent('cfc:content'));
}
const barcode = new URLSearchParams(window.location.search).get('barcode') || '';

async function main() {
  if (!barcode) {
    paint(renderNotFound('', 'No barcode was given. Try searching for a product by name.'));
    return;
  }

  const [{ found, product, error, servedFromCache }, kb] = await Promise.all([
    fetchProduct(barcode),
    loadKnowledgeBase(),
  ]);

  if (!found || !product) {
    document.title = 'Product not found: Cat Food Center';
    paint(renderNotFound(barcode, error));
    return;
  }

  const result = scoreProduct(product, kb);
  document.title = `${product.name}: Cat Food Center`;

  // Stored on this device only (see history.js).
  recordView({
    barcode: product.barcode,
    name: product.name,
    brand: product.brand,
    thumbUrl: product.thumbUrl,
    score: result.scorable ? result.score : undefined,
    band: result.scorable ? result.band : undefined,
    bandLabel: result.scorable ? result.bandLabel : undefined,
    // Stored with the score, because the home page prints the score and a
    // number without its confidence is a claim this engine never made.
    confidence: result.scorable ? result.confidence : undefined,
  });

  // A saved copy is labelled as one. The scoring engine and the database both
  // move, so a score computed from cached data is not the same claim as one
  // computed from a live fetch, and must not look identical to it.
  const cacheNotice = servedFromCache
    ? [`You are offline, so this is a saved copy${servedFromCache !== 'yes' ? ` from ${new Date(servedFromCache).toLocaleString()}` : ''}. `
       + 'The score was worked out from that saved data and may not reflect the current record.']
    : [];

  paint([
    renderHeader(product, result),
    renderCurated(product),
    renderNotice(cacheNotice, 'info'),
    renderNotice(result.warnings),
    renderVerdict(result),
    renderPillars(result),
    renderIngredients(product, kb),
    renderAdditives(result),
    renderNutrition(product),
    renderAdequacy(product),
    renderMeta(product),
  ].filter(Boolean).join(''));
}

main().catch((err) => {
  paint(renderNotFound(barcode, 'Something went wrong loading this product. ' + err.message));
});
