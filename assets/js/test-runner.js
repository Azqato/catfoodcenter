/* ==========================================================================
   A test runner small enough to justify not having one.

   There is no Node.js in this project and no build step (docs/PRD.md section 16.2), so the
   tests run where the code runs: in a browser, on tests.html. That page is
   also what CI-less verification uses: Playwright loads it and reads
   window.__testResults.

   Usage:

       import { suite, run } from './test-runner.js';
       suite('splitIngredients', (t) => {
         t.equal(actual, expected, 'nested commas stay together');
         t.ok(condition, 'description');
         t.throws(() => fn(), 'description');
       });
       run();                      // renders into #results
   ========================================================================== */

const suites = [];

/** Register a suite. The body runs later, inside run(). */
export function suite(name, body) {
  suites.push({ name, body });
}

function stringify(v) {
  if (v === undefined) return 'undefined';
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function makeContext(results) {
  const record = (pass, message, detail) => results.push({ pass, message, detail });
  return {
    /** Deep equality by JSON shape: enough for the plain data this project moves. */
    equal(actual, expected, message) {
      const a = stringify(actual);
      const b = stringify(expected);
      record(a === b, message, a === b ? '' : `got ${a}\n     want ${b}`);
    },
    ok(value, message) {
      record(Boolean(value), message, value ? '' : `got ${stringify(value)}`);
    },
    /** Assert a number is within tolerance, for anything that divides. */
    close(actual, expected, tolerance, message) {
      const pass = Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
      record(pass, message, pass ? '' : `got ${stringify(actual)}\n     want ${expected} ±${tolerance}`);
    },
    throws(fn, message) {
      let threw = false;
      try { fn(); } catch { threw = true; }
      record(threw, message, threw ? '' : 'did not throw');
    },
  };
}

/**
 * Run every registered suite, render the outcome, and publish
 * window.__testResults for a headless caller.
 *
 * **Each body is awaited, which it was not until 2026-10-07.** Before that the
 * call was `body(ctx)`, so an `async` suite returned a promise nobody held: its
 * assertions landed in `results` after the report had been built from it, and
 * the suite was counted as having passed with nothing in it. **A test that
 * cannot fail is worse than a missing test**, because the missing one is
 * visible in the count. Nothing in the suite was async when this was written,
 * so the trap was set for whoever first wrote one, which happened to be M28.
 *
 * `await` on a value that is not a promise is a no-op, so every existing
 * synchronous suite is unaffected. `run()` now returns a promise; the caller in
 * tools/tests.html does not await it and does not need to, because the headless
 * runner polls for `window.__testResults` rather than racing it.
 */
export async function run(mount = document.getElementById('results')) {
  const report = [];
  let passed = 0;
  let failed = 0;

  for (const { name, body } of suites) {
    const results = [];
    try {
      await body(makeContext(results));
    } catch (err) {
      results.push({ pass: false, message: 'suite threw', detail: String(err && err.stack || err) });
    }
    for (const r of results) (r.pass ? passed++ : failed++);
    report.push({ name, results });
  }

  window.__testResults = {
    passed,
    failed,
    failures: report.flatMap((s) =>
      s.results.filter((r) => !r.pass).map((r) => `${s.name}: ${r.message}, ${r.detail}`)),
  };

  if (!mount) return window.__testResults;

  const summary = document.createElement('p');
  summary.className = failed ? 'summary is-fail' : 'summary is-pass';
  summary.textContent = failed
    ? `${failed} failing, ${passed} passing`
    : `All ${passed} assertions passing`;
  mount.appendChild(summary);

  for (const { name, results } of report) {
    const section = document.createElement('section');
    const heading = document.createElement('h2');
    heading.textContent = name;
    section.appendChild(heading);

    const list = document.createElement('ul');
    list.className = 'assertions';
    for (const r of results) {
      const li = document.createElement('li');
      li.className = r.pass ? 'is-pass' : 'is-fail';
      li.textContent = r.message;
      if (!r.pass && r.detail) {
        const pre = document.createElement('pre');
        pre.textContent = r.detail;
        li.appendChild(pre);
      }
      list.appendChild(li);
    }
    section.appendChild(list);
    mount.appendChild(section);
  }

  return window.__testResults;
}
