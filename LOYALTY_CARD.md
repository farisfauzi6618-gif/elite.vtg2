# ELITE Card

Loyalty is available only to customers who are logged in when creating their order. Guest orders are never linked retrospectively by name, phone or email. Customers open **Akun saya** to view their card. Owners open **Admin → Data pelanggan → Loyalty** for a read-only card and paged stamp audit.

## Rules

- One purchased unit earns one stamp after the existing owner payment confirmation, using the server order quantity (1–20 units).
- Only confirmations on or after `loyalty_config.started_at` count. Previously confirmed purchases are not backfilled.
- At 3 stamps: Rp50,000 reward without a minimum. At 5: Rp100,000; at 10: Rp250,000. The latter two require Rp500,000 of merchandise, excluding shipping.
- Each 10 stamps completes a cycle and opens the next. Excess stamps carry over through any number of cycles. Unused rewards from completed cards remain available without expiry.
- Reward values, membership, ownership, unlocked state, reservation, minimum and redemption are checked server-side by the existing single-voucher architecture. Only one discount is applied per order, without stacking. Discounts cannot exceed merchandise value; shipping is unchanged.
- Rewards are usable on subsequent transactions only. The source order and invoices created before unlocking cannot use a newly unlocked reward. Checkout continues to select the best eligible voucher automatically and allows selection of another reward or no voucher. Locked milestones are informational and cannot be selected.
- A reward is reserved for one invoice at a time and marked REDEEMED only on verified payment. Existing cancellation/expiration reservation rules continue to apply.

## Data and safety

`release_0008_loyalty_card.sql` adds config, order credits, cycles, rewards and per-cycle stamp history. Three database triggers run in the same write transaction as existing order updates. Each order has one immutable credit, and each milestone has one reward per cycle. Retry confirmation cannot duplicate stamps or redemption. No existing rows, historical prices, stock or credentials are changed by the migration.

Full-order cancellation, failure, refund or reversal of confirmed payment removes that order's eligible stamps once, retains the audit trail and recalculates progress. Unearned unredeemed rewards become locked. Previously redeemed rewards and existing invoice prices are preserved. If a reward was already reserved on an invoice before a source-order reversal, that invoice retains its agreed price; future quotes exclude the deactivated reward. The existing application has no partial-item refund workflow, so this release does not invent one or alter payment/status logic.

Owner audit pages show 30 stamp records at a time. Reward pages show 30 records; completed-cycle summaries show the 10 most recent, with all earlier data retained in the database and accessible through the stamp audit. Customer APIs expose only the authenticated customer's card, are private/no-store and reject customer ID overrides. Owner APIs require the existing owner session. No stamp editing or public mutation API is provided.

Reads do not create rows. Cards fetch when opened and when requested by the user, without a new polling loop. The system uses Turso data and existing vouchers, without Blob assets, cron jobs, a new customer database or a paid service.

## Verification

`tests/loyalty.test.mjs` uses isolated local databases and simulated customers/orders. It covers milestone crossings, exact reset, multi-cycle carry-over, retained rewards, ownership/membership, next-order eligibility, minimum purchase, one reservation, redemption, cancellation release, repeated confirmations, pre-launch/guest exclusion, refund correction, private APIs, audit pagination, checkout locked states/no stacking and transactional rollback. Run with the existing reward and commerce regression suite before deployment. Production verification must remain read-only and must not create real test orders or send Telegram notifications.
