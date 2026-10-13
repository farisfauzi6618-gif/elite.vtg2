# Post-purchase V1 and Recently Sold

## Customer experience

Proof submission acknowledges Payment received and explicitly states that payment awaits owner verification. View Order opens the existing protected tracking page; its four-step timeline and current status update from the server. A customer's account menu links to Pesanan saya, showing only that account's submitted orders with stable keyset pagination. Guests retain order-session, protected tracking-link, and invoice/phone access already supported by the site. Manual tracking exposes a Copy tracking number button after shipment.

## Owner actions

Admin order management shows Order status and the actions Mark payment confirmed, Mark as preparing, and Mark as shipped. Owner confirmation requires an explicit second confirmation that funds were checked. Preparing requires confirmed payment and completed catalog stock sync. Shipped requires preparing plus courier and a validated tracking number. Stale concurrent writes are rejected by a revision guard. An owner may correct a shipped order's resi without resetting its shipped timestamp or moving status backward.

The existing stock synchronization path and existing payment-confirmation triggers preserve loyalty, discounts, analytics and idempotency. New manual actions never book a courier or invoke its tracking API. Existing integrated shipping and Telegram functionality remains available under an optional disclosure; existing legacy tracking continues to work.

## Data and access

One additive migration adds seven nullable/defaulted fields to existing orders: proof_received_at, preparing_at, shipped_at, courier_name, tracking_number, post_purchase_revision, post_purchase_updated_by. Existing confirmed_at is reused. A proof-key update trigger records future receipt times; historical dates are not invented or backfilled. Existing order and inventory fields are preserved. There is no duplicate order table.

Owner updates require owner authentication, same-origin requests, input validation, rate limiting and revision checks. Customer reads use the existing authenticated account, order session or tracking capability; an order number alone grants no access. Customer responses omit recipient address, phone, proof file, credentials and session hashes. Account changes invalidate in-flight order-list responses.

## Recently Sold

The separate archive now includes all visible SOLD products within 30 days, including young SOLD still permitted in the main catalog. Main-catalog available-first sorting and the 25% SOLD cap stay unchanged. Admin-hidden items and SOLD over 30 days remain excluded. Public direct URLs, stock logic and no-purchase protections remain unchanged.

## Validation

Integration tests exercise proof receipt, owner-only confirmation, sequential preparing/shipped transitions, required resi, corrections, concurrent stale writes, account isolation, equal-timestamp order pagination, no courier API calls for manual shipping, and exactly-once stock/loyalty effects. Existing fulfilment, promotions, loyalty, and SOLD tests cover compatibility. Production migration compares hashes of pre-existing business fields inside a write transaction and rolls back on mismatch.
