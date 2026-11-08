# Efficiency changes, November 2026

These changes preserve the existing customer checkout and transaction rules.
No new package, database migration, hosting plan, or provider configuration is required.

## Public images

Catalog lists, detail pages and selection responses optionally include `photoUrls` for ready public derivatives. A batched read checks the current publication index and published/non-deleted product gate; it never generates an image during a catalog read. Only validated public Blob derivative URLs enter this map. Missing, disabled, invalid or unavailable derivatives use the existing image route. Original zoom, Story canvas, private photos and proofs retain their existing paths. Existing revocation and Blob deletion still apply when unpublishing or removing photos/colors.

The extra catalog read replaces image-function redirects only where a derivative already exists. New derivatives still warm through the existing route. Actual quota/cost savings require observation after release.

## Admin reports

Analytics accepts `view=overview|products|search|traffic`; an omitted view retains the complete legacy API response. Each explicit tab reads only its own aggregates. Aggregates are cached in process for 30 seconds after completion, with in-flight deduplication and a bounded number of entries. Every request authenticates before cache access; cache keys include the authorized user, date range and view. Product reports also check the catalog revision/time stamp.

Sales push, weekly preview and diagnostics have a separate 30-second cache, keyed by owner, view and catalog stamp. Successful Sales POSTs invalidate it. The weekly apply/cron, price mutations and checkout paths do not use this cache. Logs record only the view and compute milliseconds. Cold requests still depend on database/network latency; the cache is not a guarantee against every timeout.

Analytics distinguishes current available inventory from drafts, deleted products, scheduled releases, inactive colors, sold and reserved stock. The activity table does not describe direct-buy activity as a mandatory cart funnel. The existing linked checkout cohort report remains authoritative for that progression. Positive percentages below 0.1% display `<0,1%`.

## Customer flow

Search adds explicit PRL and cap/hat/topi aliases without changing brand grouping or feature inference. Customer overview reuses the customer already authenticated inside that request for promotion and reward reads; there is no cross-request customer cache.

A catalog checkout starts with its existing loading summary in server HTML. It no longer briefly shows manual item entry before hydration. Manual checkout keeps manual entry. Selection tokens, existing-invoice recovery, server price/stock checks, rewards, shipping, protection, payment choice, Reserve/DP, proof, invoice and notification logic remain unchanged.

## Verification

Run the existing full test suite, TypeScript and production build. New fixture tests cover tab query separation, aggregate-cache expiry/deduplication/failure recovery, accurate inventory status, CDN fallback/publication revocation, explicit search aliases and one session read per customer overview with account isolation. Browser checks must use isolated local fixtures for checkout; do not create production orders/payments/proofs or Telegram messages as tests.
