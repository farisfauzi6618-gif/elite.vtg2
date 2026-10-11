# Product photo upload

The editor accepts up to 12 photos per product, with original files up to 30 MiB each. JPG, PNG and WebP are supported; HEIC/HEIF originals are converted when the device's native image decoder supports them, such as supported iPhone Safari versions. Other browsers receive instructions to export HEIC as JPG.

Before sending, large photos are prepared sequentially in the browser. The whole frame and aspect ratio are retained, without cropping or upscaling. Encoding starts at JPEG quality 0.94 and a maximum long edge of 3072 px, then tries 0.90/0.86 and at most 2560/2048 px when necessary. Small decoded photos are preserved; conversion is avoided when it would increase an already valid, unscaled file. JPEG conversion uses a white matte for transparency. Source images are capped at 64 million pixels, covering common 48 MP phone originals, and temporary canvas buffers and object URLs are released after every file.

Prepared uploads are at most 3.5 MiB, leaving room for multipart framing under Vercel's 4.5 MB function payload limit. The independent server request/file guard remains 4 MiB and storage validation still checks JPG/PNG/WebP file signatures. Simply raising the server guard would not bypass the platform limit. Existing admin/team authentication, same-origin checks and private Blob storage remain unchanged. Payment-proof preparation has its separate policy and is unchanged.

The frontend reads server replies as text and parses JSON safely. Plain text/HTML/empty 413 or proxy errors, expired sessions, network failures and malformed confirmations result in actionable messages rather than raw Safari JSON/DOM errors. There are no automatic upload retries. A batch continues after a failed file and lists each failed filename; successful gallery keys remain in the editor. The admin must still save the product to attach the gallery. Progress is visible during preparation and upload.

Verification covers 30 MiB input, 48 MP dimensions, aspect ratios, quality thresholds, memory cleanup, native HEIC fallback, malformed replies, network/auth errors, partial batches, server authentication and request limits, and failed database insert cleanup. Browser QA uses an isolated local database and local storage, with simulated products/photos. No production test photos, stock changes, or payment transactions are required.

Primary platform references: https://vercel.com/docs/functions/limitations and https://webkit.org/blog/14445/webkit-features-in-safari-17-0/
