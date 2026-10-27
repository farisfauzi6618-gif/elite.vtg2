# Payment flow fixes — 27 October 2026

Owner approved all three audit fixes and the pre-voucher shipment-value policy.

- New shipping protection quotes use the authoritative goods subtotal after sale/color/size prices, before account vouchers. The existing percentage/provider premium remains unchanged. Full-value vouchers retain their full discount, including net merchandise Rp0. Freight and protection remain payable according to prepaid/collect mode.
- New quotes record `protection.valueBasis=before_voucher` inside the existing server-stored shipping snapshot. Old quotes without the marker keep their original net-value accounting until refreshed. Saved/submitted invoices are not backfilled or repriced.
- The additive migration `release_0021_protection_voucher_basis.sql` replaces only two validation triggers. It accepts the exact subtotal basis for marked quotes and exact net basis for legacy quotes, retaining total validation, submitted-proof immutability and shipping-confirmation guards. Apply before the code rollout; it supports the previous application too.
- Client detects a stale protected quote, retries once for each distinct mismatch, and retains a visible manual retry if it cannot recover. Reward loading is explained. With the new subtotal basis, reward-only refreshes do not cause another shipping quote request.
- Shipment integration payloads/admin estimates use the saved declared shipment value, including fully covered goods. Provider validation and the existing legacy Komship minimum are retained; no shipment or paid booking is created by checkout.
- Admin Telegram retry checks the application result as well as HTTP status. Failed/busy sends return503; only a confirmed successful result shows the sent message. Existing delivery checkpoints keep retries idempotent.

Validation: 591/591 regression tests and TypeScript/build passed. New fixture tests cover full voucher prepaid/collect, reward expiry, legacy net quotes, Telegram failure→success and consistent shipping payload values. Browser QA uses original React checkout/reward/admin components and synthetic local HTTP fixtures, with no real payment/messages. Actual390px layout checked. No dependencies, Blob/photo uploads, polling interval changes, provider/plan changes, or migration of business rows.

Rollback: previous application still runs with the migration because unmarked quotes use the original validation. Existing marked invoices retain saved totals. Keep the trigger migration in place rather than restoring a net-only trigger that would reject marked invoices during later updates.
