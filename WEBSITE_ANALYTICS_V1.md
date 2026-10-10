# ELITE.VTG Website Analytics V1

Owner dashboard: `/admin/analytics`. Data API: `/api/admin/analytics` (authenticated, no-store).

## Audit and access

There was no analytics or UTM system. Existing anonymous cart/checkout IDs were not visitor IDs. Owner password sessions and team links are reused. Customers have separate sessions and no analytics access. The owner can grant **Izinkan akses Analytics** per existing team slot in Admin Katalog → Akses tim; existing team slots default to denied. Permission changes/revocation take effect on the next request. Payment/shipping credentials remain owner-only.

The completion source of truth is `orders.payment_state = payment_confirmed`, set by the existing Telegram owner confirmation. `status = submitted` means proof received, not payment verified. There is no existing payment-refund workflow; report queries defensively exclude cancelled, expired, refunded and failed orders. Shipment cancellation is separate from payment cancellation and does not alone reverse revenue.

## Schema and files

Additive migration `migrations/release_0003_website_analytics.sql` creates `analytics_config`, `analytics_sessions`, `analytics_events`, `analytics_event_products`, `analytics_checkout_context`, and `analytics_order_context`, plus indexed time/product/source/session lookups. The subsequent `release_0004_analytics_completion_safety.sql` makes completion product extraction tolerant of malformed or primitive legacy snapshots, without changing any order or stock values. It adds `team_access.analytics_allowed` with default 0. No original product, stock, order or customer values are rewritten. No historical analytics retention deletion runs.

`db/schema/analytics.ts` mirrors these tables. `modules/analytics/{common,client,server,report,errors}.ts` contains date/source rules, browser transport, collectors, reporting and safe error observation. `components/analytics-client.tsx` initializes tracking through the root layout. `/api/analytics/events` accepts bounded same-origin browser events; reporting requires owner or explicit analytics permission. `/admin/analytics/{page,ui,analytics.css}` provides the four tabs, six cards and responsive tables. Catalog/order form, successful checkout/order/proof routes and existing team access/navigation have small observation hooks.

## Event architecture

An anonymous random browser visitor ID lasts one year; a session ends after 30 minutes of inactivity. Both first-party cookies are HttpOnly, SameSite=Lax and Secure on HTTPS. They provide no authorization. No IP address, full URL/referrer, bank details, proof binary, credentials or free-form error metadata is stored. Logged-in customer events can carry the internal customer ID, not their contact data. Authenticated staff, common bot user agents and prefetches are excluded from visit capture. Queries and UTM labels are bounded and should contain product/marketing terms only.

| Event | Source and duplicate control |
|---|---|
| visit | Browser initialization; once per session per WIB day. Unique visitor metrics dedupe all matching visitor IDs. |
| product_view | Detail loaded; once per product per session, including refreshes. Public published products only. |
| search | Main catalog only; input settled 800 ms, normalized NFKC/lowercase/trim/collapsed whitespace, no repeated identical query on polling. Each action UUID makes retries idempotent. Result count reflects the active catalog filters and SOLD rules at search time. |
| add_to_cart | Positive accepted cart-state delta, excluding restored saved carts. Current backend stock/schedule eligibility is checked before recording. Action UUID bounds retries. |
| checkout_started | Catalog backend successfully creates a checkout, once per checkout ID, with distinct product links. Manual form counted once per session once available. |
| payment_reached | Payment step rendered; backend validates the current order session and awaiting-proof state. Once per order ID. |
| payment_proof_uploaded | Backend persists valid proof, before Telegram notification; once per order ID. Repeated upload retries recover a missing observation. |
| order_completed | Database trigger on the backend payment-confirmed update, atomic with confirmation and unique per order ID. Client submissions cannot create it. No success-page tracking. |

Checkout source is saved separately, then linked to the order. The confirmation trigger copies that session's source and customer ID into its completion event. This remains valid after browser cookies expire or the owner confirms from another device. Product links capture distinct products in checkout and confirmed catalog orders. Orders without a recorded session still receive truthful backend completion events, attributed to Other; their visitor identity remains unknown.

Browser events and ancillary server hooks are best-effort and errors do not fail successful shopping operations. Confirmation writes its idempotent event in the existing database transaction, without changing payment or stock rules. Error observation stores only a fixed category (checkout, proof, shipping, cart, SOLD attempt, critical image, detail 404); matching reports are deduped per session/category/product per five minutes. “All systems operational” means no recorded critical errors in the selected interval, not a live uptime probe.

## Metric formulas

All time filters use inclusive WIB calendar dates, implemented as `[start 00:00 WIB, next day after end 00:00 WIB)`. Today / 7 Days / 30 Days include today. Custom range supports up to 366 days per report; older data is retained and accessible with another range.

| Metric | Formula |
|---|---|
| Unique Visitors | Distinct anonymous visitor IDs with a visit event in the selected interval. Refresh/session changes do not add a unique visitor. |
| Completed Orders | Number of unique backend completion events in the interval whose order is still payment-confirmed and not excluded/cancelled. |
| Website Conversion Rate | Completed Orders ÷ Unique Visitors × 100. |
| Website Revenue | Sum of current backend `orders.total` for eligible completed orders. Includes discounted goods and shipping; unpaid/submitted-only/abandoned/excluded orders contribute zero. |
| Add to Cart Rate (overview) | Distinct visitor IDs with successful add_to_cart ÷ distinct visitor IDs with product_view × 100. |
| Funnel count | Distinct visitor IDs with that stage event during the selected interval. Unattributed orders have no visitor and are excluded from visitor-stage counts, while remaining in Completed Orders KPI. |
| Funnel conversion | Stage count ÷ previous stage count × 100; first stage 100%. |
| Funnel drop-off | max(0, 100 − stage conversion); unavailable when previous stage is zero. |
| Biggest Funnel Drop | Stage with the highest calculable drop-off. |
| Product views/adds | Count matching deduped view events / successful add actions for that product in the interval. |
| Product Add to Cart Rate | Product adds ÷ product views × 100. Repeat successful adds can make this exceed 100%; it is an action rate. |
| Product checkout/completed | Count distinct checkout/completed events containing that product. An order with several products contributes once to each product. |
| Top Searches | Count normalized query actions; Avg. Results is the mean recorded result count. Top 100 queries by count. |
| Zero Result Searches | Count actions where result_count=0, grouped by normalized query, with last timestamp. Top 100. |
| Traffic Visitors | Distinct visitor IDs with visit events attributed to that source in the interval. |
| Traffic Orders/Revenue/CVR | Eligible completion count, sum of backend total, and orders ÷ source visitors × 100. |

Ratios with zero denominators show 0%; funnel transitions with no previous-stage audience show a dash. High Interest — Still Available ranks unsold current products by adds, then views; it makes no predictive claims.

## Session attribution

Session source is fixed at session entry. Explicit UTM source/medium wins over the referrer; a later tagged page in the same session does not rewrite it. Instagram paid/cpc/paid_social/ppc/ads medium becomes Instagram Ads; ordinary Instagram, Threads, Google, Direct, Referral, and Other use simple source/domain rules. `utm_source`, `utm_medium`, `utm_campaign`, and `utm_content` persist; full query strings and order capability tokens do not.

Catalog orders retain the source of the session that created their checkout; manual orders retain the payment session. A visitor can appear under multiple channels across separate sessions, so summed channel visitors may exceed overall unique visitors.

## V1 limits and verification

Tracking starts at migration activation. Historic browsing/search/traffic cannot be reconstructed; already-confirmed historical orders are not backfilled. Pending orders confirmed after activation can appear with source Other. Activity-period funnel is not cohort analysis: a later payment can complete in a different interval from the visit. Conversion may exceed 100% for very small periods or multiple orders per visitor. Browser identifiers approximate devices/browsers, not verified people; cookie clearing creates another visitor. No cross-device identity merging is performed.

Browser blocking, offline exits and failed observer writes can miss client events. Public engagement counts are telemetry and can be manipulated despite same-origin validation, bounded payloads, UUID deduplication, stock checks and rate limiting; completion/revenue cannot be forged through that collector. No previous-period comparison, advanced attribution, geolocation, browser/OS analytics, AI, profit/COGS or finance metrics are added.

Automated tests cover session/refresh/source persistence, query normalization/zero results, stock/schedule guards, successful checkout observation, protected payment reach, proof/owner confirmation/idempotence, cancellation exclusion, formulas/date boundaries, owner/team/customer access, redacted errors and observer failure isolation. Full existing checkout/payment/shipping/auth/catalog/SOLD regression suite and production build are required. Local desktop/mobile visual QA uses a separate fixture database, without production test orders or stock changes.
