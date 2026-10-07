/* ==========================================================================
   Service worker.

   Written by hand rather than generated, because there is no build step
   (docs/PRD.md section 16.2) and because a cache that behaves in ways
   nobody can read is worse than no cache. Every decision here is one of three
   strategies, chosen per resource for a stated reason.

   The point of caching is not speed. It is that the phone in a supermarket
   aisle (exactly where this app is used) has the worst connectivity in the
   building, and a product someone has already looked at should still be
   readable when the signal goes.

   ── The rule that governs everything below ──

   A cached score must never be presented as a current one. The scoring engine
   changes, the database changes, and a stale answer rendered as fresh is the
   same failure as the English-only matcher: confidently wrong, with nothing
   about it looking wrong. So cached API responses are served *and labelled*,
   and the page says what it is showing.
   ========================================================================== */

/* Bump this to retire every old cache at once. It is the only lever that
   reliably clears a bad deploy from a device we cannot reach.

   v3: M16a rewrote cfc.css and cfc-app.css to fix accessibility defects. The
   shell is served stale-while-revalidate, so a returning device would have
   shown the old stylesheet once more before picking up the new one. A contrast
   fix that arrives on the second visit has not really been deployed.

   Not bumped for M19a, which changed how navigations are cached but left
   every v4 entry correct. The lever retires wrong content; it is not a
   changelog, and pulling it re-downloads the shell on every device for
   nothing.

   v5: M20 added assets/js/catalogue.js, which opff.js imports, and
   assets/data/catalogue.json, which it reads. A v4 device has neither in its
   shell, so offline it would fail to load a module the product page cannot
   run without. This is the case the lever is for.

   v4: M19 moved every page. A device holding a v3 cache has nine documents
   precached under addresses that no longer exist, and would serve them from
   the shell cache indefinitely. Every one of those entries has to go, and
   bumping the version is the only lever that reaches a device we cannot. */
const VERSION = 'v15';
const SHELL = `cfc-shell-${VERSION}`;
const API = `cfc-api-${VERSION}`;
const IMAGES = `cfc-images-${VERSION}`;

/* The app shell: everything needed to render a page with no network at all.
   Relative paths, because the site is served from a repository subpath on
   GitHub Pages and absolute ones would point at the domain root. */
const SHELL_ASSETS = [
  './',
  './index.html',
  './search/',
  './brands/',
  './product/',
  './scan/',
  './submit/',
  './compare/',
  './methodology/',
  './offline/',
  './favicon.svg',
  './assets/cfc-tokens.css',
  './assets/cfc-theme.js',
  './assets/cfc.css',
  './assets/cfc-app.css',
  './assets/cfc-docs.js',
  './assets/js/site.js',
  './assets/js/catalogue.js',
  './assets/js/ingredients.js',
  './assets/js/opff.js',
  './assets/js/scoring.js',
  './assets/js/scanner.js',
  './assets/js/history.js',
  './assets/js/thumb.js',
  './assets/js/product-page.js',
  './assets/js/search-page.js',
  './assets/js/brands-page.js',
  './assets/js/scan-page.js',
  './assets/js/submit-page.js',
  './assets/js/compare-page.js',
  './assets/js/home-page.js',
  './assets/js/pwa.js',
  './assets/data/additives.json',
  './assets/data/catalogue.json',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // addAll is atomic: one 404 fails the whole install and the old worker
    // stays. That is the behaviour we want, a half-populated shell would
    // break pages offline in ways that are very hard to diagnose.
    await cache.addAll(SHELL_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [SHELL, API, IMAGES];
    const names = await caches.keys();
    await Promise.all(names.filter((n) => !keep.includes(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

/* Product photos live on images.openpetfoodfacts.org, which is inside the
   catalogue's own domain, so this test matches them too. The fetch handler
   therefore has to ask about images first. See the note there. */
const isApi = (url) => url.hostname.endsWith('openpetfoodfacts.org');
const isImage = (request) => request.destination === 'image';

/**
 * Network-first, falling back to cache.
 *
 * For HTML and for API data, where being current matters more than being fast.
 * A stale product page is acceptable when the alternative is no page; a stale
 * one served in preference to a fresh one is not.
 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    // Only successful responses are cached. A 404 from the API is meaningful, 
    // it is how an unknown barcode is detected, but caching it would keep
    // reporting "not found" after the product is added to the database.
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (!cached) throw err;
    // Stamp it, so the page can say it is showing a saved copy. A Response's
    // headers are immutable, so this is a rebuild rather than a mutation.
    // Without the stamp the page has no way to tell a cached answer from a
    // fresh one, and would present an old score as current, the same class of
    // failure as reporting an unreadable label as clean.
    const headers = new Headers(cached.headers);
    headers.set('x-cfc-cached', String(cached.headers.get('date') || 'yes'));
    return new Response(await cached.blob(), {
      status: cached.status,
      statusText: cached.statusText,
      headers,
    });
  }
}

/** Cache-first. For images, which are large and never change under a URL. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

/**
 * Stale-while-revalidate. For the shell: instant from cache, updated in the
 * background, so a deploy reaches the device on the visit after next rather
 * than blocking this one.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetching = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await fetching) || Promise.reject(new Error('offline'));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  /* Images before the API, and the order is load-bearing. Product photos are
     served from images.openpetfoodfacts.org, so `isApi` matches them as well.
     Asked in the other order every thumbnail would take the network-first
     path into the API cache: revalidated on every view when the bytes never
     change, and counted against the wrong cache. It went unnoticed while one
     photo existed on one page; M15b put one on every card. */
  if (isImage(request)) {
    event.respondWith(cacheFirst(request, IMAGES).catch(() => Response.error()));
    return;
  }

  if (isApi(url)) {
    event.respondWith(networkFirst(request, API));
    return;
  }

  /* Navigations: straight to the network, so a deploy is picked up
     immediately, falling back to the cached page and then to the offline page.

     A successful navigation is kept, but only when the address carries no
     query string. That condition is the whole design. Every product is the
     same document under a different query, product/?barcode=X, so caching
     those would add one byte-identical entry per product viewed and grow the
     shell cache without bound; the document itself is precached, and
     `ignoreSearch` below finds it whatever the query. Without that flag an
     offline product page would fall through to the offline page even though it
     was cached.

     What this reaches, and the reason for it (M19a): the eleven guide pages.
     They are not in SHELL_ASSETS, and until now nothing ever put them in a
     cache, so a guide someone had read was unavailable the moment the signal
     went. They are also the pages least in need of a network and most likely
     to be wanted without one. Precaching all eleven at install would have cost
     roughly 290 kB on a connection this project assumes is bad; keeping the
     ones actually read costs nothing until they are read, and is the same
     promise the product pages already make. It generalises too: a page added
     later is covered without editing a list. */
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      try {
        const response = await fetch(request);
        if (response.ok && url.origin === self.location.origin && !url.search) {
          // Not awaited: the visitor should not wait on a cache write for a
          // page the network already delivered.
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        return (await cache.match(request, { ignoreSearch: true }))
          || (await cache.match('./offline/'))
          || Response.error();
      }
    })());
    return;
  }

  // Same-origin sub-resources: CSS, JS, JSON.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, SHELL));
  }

  // Everything else (fonts, ZXing) goes to the network untouched.
  // Third-party CDNs set their own cache headers, and second-guessing them
  // from here would mean owning their invalidation too.
});
