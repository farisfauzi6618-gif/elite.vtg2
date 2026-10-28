# Checkout UX V1 — 28 October 2026

## Before and after

`/order` was already one React page with three client states: details → payment → invoice. POST order separates the unsubmitted form from valid payment instructions; proof upload separates awaiting payment from submitted proof. This architecture is retained.

The updated details state shows a compact authoritative product preview first, recipient fields, automatic shipping, existing payment methods, complete price breakdown and consent. **Konfirmasi Pesanan** creates/updates the order and persists the selected method in the same request. Full transfer/QRIS instructions appear only afterwards. **Ganti metode** retains the existing PATCH operation if needed; Reserve keeps its original always-visible picker. The last progress label is **Status pesanan**. Invoice/download/tracking remain available and proof does not imply confirmed payment.

The main change for initial QRIS selection is one fewer server mutation (no separate initial PATCH), rather than claiming that every customer clicks fewer times. BCA keeps its default choice. No conversion uplift is assumed.

## Components and API compatibility

- `components/checkout-product-summary.tsx`: thumbnail, brand/name, historical variant/size, quantity and server-validated price. The quote reuses product reads already required by `checkedQuote()` and returns minimal `preview` fields. Images use existing `publicPhotoUrl(key,'thumb')`, with no new transformation or original-photo download.
- `components/payment-method-choice.tsx`, `payment-panel.tsx`, `order-form.tsx`: selection on the form, compact post-order method switch, clearer errors, progressive disclosure and focus to invalid fields.
- `POST /api/order` optionally accepts `paymentMethod`. Availability is checked server-side. Legacy clients omitting it continue to use existing defaults/saved method. Reserve's deposit/confirmation method remains unchanged.
- `modules/order/order-submission.ts`: optional 64-character `Idempotency-Key`, canonical payload fingerprint and unique database key. The session token is derived server-side using HMAC, never the browser-supplied key itself. Exact retries restore the original response/session even after the quote expires. Different payloads/accounts, rotated sessions and cancelled/expired orders are rejected. Fresh orders still undergo all price, stock, destination, quote, consent, discount and protection checks. Client ref locks prevent double-clicks; durable server deduplication also covers manual orders.
- Shared catalog selection responses no longer return the creating account's name/phone. The frontend uses the current account only. This closes an account-prefill exposure in shared capability URLs.

## Recipient defaults and temporary drafts

`GET /api/customer/checkout` requires a current authenticated customer and selects their own most recent non-cancelled/non-expired order. It returns only editable recipient fields. Another customer's address is never returned. Response is private/no-store, varies on Cookie, and is noindex. A cached valid destination can be reused, but a quote never is; otherwise postal-code search prompts current destination selection. No address-book table or management UI is added.

Drafts use sessionStorage with a 30-minute inactivity lifetime, scope hashed from selection + account identity, and clear on successful order creation/account change. Recipient data, manual item/amount and shipping/payment choices may be restored. Quote, consent, proof files, password and server session cookie are not stored. A private random request nonce and anonymous flow ID support retry/deduplication; the nonce is never sent to analytics or included in URLs. Storage is best effort and must not block checkout. If both browser cookie and draft are lost, existing account/payment-link recovery or owner assistance may still be needed.

## Shipping and inventory invariants

Origin, courier/services, weight rules, prepaid/collect, protection, price/sale/voucher formula and fees remain unchanged. Rates still calculate after a valid destination and are validated by the server. Stale or mismatched quotes are not restored or accepted for a new order. An already-created exact idempotent replay returns stored financial data without re-pricing it.

Search/provider failure now gives buyer-appropriate wording, retry and WhatsApp help, preserving inputs. It does not suggest an unsupported manual tariff. Mobile header decoration is hidden at narrow widths to prevent horizontal overflow while retaining account/tracking links.

Normal invoices do not reserve stock. The existing atomic confirmation prevents double deduction, but two unpaid invoices can exist for one item before owner verification. No automatic hold was introduced. Introducing a pre-payment hold requires separate business review. Reserve still locks after verified DP, with existing 48-hour expiry/extension rules. No Telegram content/trigger changes, auto-paid state, gateway or booking was added.

## Analytics definitions

Historical events and calculations are unchanged. `checkout_started` is selection creation for catalog, a client entry for manual checkout; it is not evidence that the form displayed. `payment_reached` remains the existing payment-state observation. Proof is server observed and `order_completed` means owner-confirmed payment, not parcel delivery.

New `checkout-ux-v1` diagnostic events use the existing endpoint/table:

- `checkout_viewed`, `recipient_info_completed`, `shipping_quote_success`, `shipping_option_selected`, `payment_method_selected`: client observations, deduplicated by anonymous checkout/flow ID. Automatic default selections count as selected. No address, phone, account number, payment capability, full URL or proof is stored in event metadata.
- `order_submitted`: recorded server-side only after an order is saved. Existing payment/proof/confirmation events supply the remaining progression; clients cannot fabricate successful financial stages.
- Entry is Buy Now/cart from the app's navigation marker, manual, or unknown; account kind is taken from current authentication, device is inferred from User-Agent (unknown if absent), traffic uses existing attribution. View dimensions remain the cohort's entry dimensions, even if login changes later. User-Agent is not stored.
- Catalog progress requires the existing analytics checkout/session context. Manual IDs cannot impersonate catalog contexts or another session's manual flow. Staff/prefetch/bot exclusions and rate limits remain.

The admin's separate cohort panel groups checkouts whose first `checkout_viewed` occurs in the chosen date range, following later activity as of report time. Main stages require nondecreasing view → submit → instructions → proof → confirmation timestamps. Recipient/shipping diagnostics are not assumed to occur in that strict order. Refresh/retry cannot create another cohort. Average view→submit time includes customer pauses. Reserve is excluded from this new normal/manual cohort; historical Reserve events remain as before. Client blocking, dropped events, expired sessions and external browsers may leave gaps; missing evidence is not treated as success.

The old per-period visitor-stage comparison and the new checkout cohort are not interchangeable. No historical backfill or abandonment percentage is inferred. This is lightweight, bounded text instrumentation, not additional polling or an analytics provider.

## Database release and rollback

`release_0022_checkout_ux.sql` adds two nullable order request fields and four nullable analytics fields, plus three indexes. No table, trigger, price, stock or customer row is deleted/replaced, and existing event definitions are unchanged. The partial unique request index permits all legacy NULL rows. Migration tests compare every original seeded order/event field and all trigger definitions. Production rollout uses a small atomic DDL + ledger batch with scalar before/after checks, without downloading complete customer/event tables.

Apply the migration before deploying the code. Reverting code is safe while retaining additive columns/indexes. Do not drop business data or rewrite historical event names to roll back UI changes.

## Verification and follow-up

Run `tests/checkout-ux.test.mjs`, the full regression suite, typecheck and production build. Browser fixtures in `../migration-private/checkout-ux-2026-10-28/` use actual checkout components/APIs, disposable SQLite, simulated bank/QRIS and mocked carrier/Telegram. They never create production orders or send real messages/payments. The selected mobile viewport is not a native iPhone/Instagram/Android test.

Measure new cohorts for at least seven complete WIB days, compare consistent entry/account/device/source groups, and report sample sizes and event gaps. Track checkout→saved order, instructions opened, proof, confirmed payment, recorded errors and average view→submit time. The as-of date and follow-up age must match across comparisons. Native Safari/Instagram/Android, real keyboard/autofill and real provider outages still need device/user validation. Actual conversion improvement must be established from comparable post-release data.
