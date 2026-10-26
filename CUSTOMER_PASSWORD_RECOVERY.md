# Customer password recovery

Customer entry points: the existing sign-in dialog → **Lupa kata sandi?**, or `/akun/lupa-kata-sandi`.

## Production setup

1. Create the owner's Resend Free account. The owner completes account credentials, verification and acceptance of the provider's terms.
2. Verify a dedicated sending subdomain, preferably `account.elitevtg.com`, with the exact SPF/DKIM records supplied by Resend. Retain existing website and mail DNS records. Disable open and click tracking for this transactional domain. Do not enable paid upgrades or overages.
3. The owner creates a sending-only API key restricted to that domain and stores it as sensitive **Production** `RESEND_API_KEY` in Vercel. Set `CUSTOMER_RECOVERY_FROM` to a verified address such as `noreply@account.elitevtg.com`. These values must never be committed or copied into chat. Confirm `SITE_ORIGIN=https://elitevtg.com`.
4. Apply additive migration `release_0020_customer_password_recovery.sql` before deploying the code. Preserve all customer/order/loyalty records. Use the local migration report to verify business-row fingerprints.
5. Deploy once after configuration. Check request/reset flows with a dedicated owner-approved test account, not a real customer's account. Sending test mail requires an approved recipient. Without configuration the email request endpoint responds with a clear service-unavailable message and support link; it never reports a successful delivery.

## Email accounts

The visitor submits the previously registered email. Both existing and missing addresses receive the same generic response. Account lookup and sending run through Next `after` so account-dependent work does not affect HTTP response timing. Sending to a missing, phone-only or trashed account does nothing.

The email contains a plaintext HTTPS link with a 256-bit random token in the URL fragment. Only its SHA-256 verifier and the issuing password fingerprint are stored. It expires after 15 minutes. The fragment is read into component memory and removed from browser history; it never becomes a request-path query parameter. There is no automatic reset on GET, external media, or analytics event on the recovery routes. Email scanners cannot consume a token by opening a link.

Password reset requires matching 12–128 character inputs. A single database write transaction checks the unused/nonexpired token and current password fingerprint, updates the existing account's password hash, marks all its outstanding recovery tokens used, and revokes all customer sessions. It does not create an account or log in automatically. A notification email is scheduled after success. Existing login-session creation also checks the password hash to prevent a concurrent login with the old password surviving the reset.

## Phone accounts: owner-assisted WhatsApp

The public form offers a WhatsApp support link for phone-shaped identities, without exposing whether an account exists. It does not send a message automatically.

Owner path: **Data pelanggan → Bantu pulihkan akun** on an active phone-only account. The owner must independently verify possession of the registered WhatsApp number and acknowledge that verification. Name, birthday or an invoice number alone is insufficient. The server determines the destination from the stored identity and rejects email, inactive and trashed accounts. The UI only opens WhatsApp for that stored number and provides a copyable message as fallback. The owner sends the message manually. No WhatsApp OTP service is used.

If the registered number is inactive or ownership cannot be established, do not issue a link through this workflow. Further recovery needs independent owner review and is not automatic.

Owner-created links expire after 15 minutes and are issued at most once per minute per account. An unused link does not change the password or lock the account. Creating a newer request does not invalidate an older link before successful reset. Closing the owner panel does not revoke an already issued link; it expires normally.

## Abuse controls, storage and failure behavior

- Email request: 20/hour per client IP and 3/hour per normalized identity. Same controls apply to missing identities. At most one new token per minute per account/channel.
- Completion: 20/hour per IP; high-entropy verification occurs before the expensive password KDF.
- Owner issuance: 30/hour per owner, owner authentication and same-origin mutation checks.
- A shared database counter caps this feature at 90 attempted outbound emails/day, including reset requests and successful-change notifications, leaving headroom below the selected provider's daily free quota. No paid overages are enabled by application code.
- Failed sends invalidate the undelivered token. Existing password and sessions remain usable. Errors are logged as generic operation failures without email addresses, tokens or provider responses. After-response delivery failures are not exposed as account-specific browser errors; the confirmation advises waiting or using support.
- Reset records older than their expiry plus one day are cleaned on later issuance. No new cron, polling, media upload, Blob storage or third-party SDK is required. If there are no new requests, expired rows remain inert until the next cleanup.
- Trashing or restoring a customer revokes recovery links as well as sessions. Existing order references, discount eligibility, balances and loyalty history retain the original customer ID.

## Operational limitations

The first version uses synchronous provider submission inside a bounded Next after-response task, without a durable background retry queue. A provider outage, daily cap or Function interruption can require the customer to request a new link later or contact support. A provider's acceptance is not proof that an email reached the inbox. Free-tier limits, spam filtering and delivery status must be monitored through Resend. Never log or export raw recovery tokens.
