# Telegram SOLD — additive product details

The existing SOLD stock-sync message in `modules/order/catalog-bridge.ts` is preserved verbatim as the prefix. Its `Buka katalog` button, bot, paired chat, payment/stock gates, compare-and-set deduplication, and best-effort delivery remain unchanged. Only this message receives the appended section and disabled link previews. Invoice/proof, recipient, Reserve/DP and other notifications are untouched. No new Reserve SOLD trigger is introduced.

## Before / after

The invoice ID below is a simulation. The product is an existing public SOLD product; the URL was checked against the production API and page on 28 October 2026.

Before:

```text
ELITE.VTG · EV-261028-ABCD1234
Pembayaran dikonfirmasi. Stok katalog sudah dikurangi sesuai barang dan ukuran pesanan.
```

After:

```text
ELITE.VTG · EV-261028-ABCD1234
Pembayaran dikonfirmasi. Stok katalog sudah dikurangi sesuai barang dan ukuran pesanan.

PRODUCT DETAILS

1. USPA — Cable Knit Sweater — Navy
Size: M
View Product: https://elitevtg.com/produk/38134afb-9db1-4f92-986b-70df4f45ff52
```

`Code` appears only when an actual code is available. `Quantity` appears when more than one unit of a line was bought. Every line has its own numbered entry. If a color already appears in the product name, it is not added again. The existing button stays with the original message.

## Data and safety

- Source: structured `orders.catalog_items_json`, with `catalog_checkouts.lines_json` as the existing-relation fallback. Historical name and choice label take priority. No order creation/schema change or text-description parsing.
- One batched read obtains product/group metadata, selecting only brand, color, code and relation fields; no photo/gallery data is fetched. No new storage, service, dependency, polling or cron.
- Legacy snapshots have no saved brand/color ID/SKU. Available brand and imported `shortcode` are read from current metadata. The internal `local_*` creation marker is omitted; no SKU is invented. If dimensions/variant relations changed, retain historical text rather than assert an unverified variant URL.
- URLs reuse `productShareUrl`: `https://elitevtg.com/produk/{id}` plus `?color={id}` for the verified active ordered variant. Draft, deleted, missing or unverified color references do not produce guessed links. Remaining verified snapshot text and the original message still send.
- Published SOLD pages already work independently of main-catalog visibility, SOLD age and `sold_hidden`. Local regression verifies old/hidden SOLD API access, zero buyable stock and existing CTA. Products actually deleted/trashed or reverted to draft are not made public.
- Plain text is the existing parse mode. Control characters in appended values become spaces; special characters and Unicode remain literal. No images, thumbnails, media or link previews are added.
- Text at most 4,096 UTF-16 code units is sent in the existing message. Only longer text uses sequential fallback chunks, favoring whole entries/lines and preserving every original character and complete product URLs. No per-product notifications. The original button is on the first message. The existing best-effort policy is retained; no new retry queue or delivery semantics are introduced.
- [Telegram sendMessage / LinkPreviewOptions](https://core.telegram.org/bots/api#sendmessage) documents the text limit and preview controls.

## Verification

`tests/catalog-sold-notification.test.mjs` covers one/multiple products, quantity, ordered color, absent color/code, historical name/size, changed/inactive/missing variant, SOLD direct URL and stock guard, special characters, 20-item fallback, long Unicode fields, missing reference/DB metadata failure, checkout snapshot fallback, concurrent deduplication, unconfirmed payment, chat mismatch and Telegram rejection. Real transport is mocked; no production order, confirmation or message is created for testing.

Release report and local evidence: `../TELEGRAM_SOLD_2026-10-28.md`, `../migration-private/telegram-sold-2026-10-28/`.

## Scope confirmation

No existing SOLD information is removed or reordered. Other Telegram notifications, customer notices, checkout/payment rules and state transitions, stock/reserve/shipping logic, public/admin design, product editing and order creation are unchanged. No product photos are sent. No database migration is needed.
