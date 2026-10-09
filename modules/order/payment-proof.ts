/** Browser-only preparation. The backend keeps its independent 4 MB limit. */
export const PROOF_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const PROOF_INPUT_MAX_BYTES = 20 * 1024 * 1024;
const OPTIMIZE_AFTER_BYTES = 1024 * 1024;
const MAX_SOURCE_PIXELS = 40_000_000;
const MAX_CANVAS_PIXELS = 16_000_000;
const MAX_CANVAS_EDGE = 8192;
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob?.type === "image/jpeg" && blob.size >= 32) resolve(blob);
      else reject(new Error("Gambar belum dapat disiapkan. Coba unggah tangkapan layar bukti pembayaran."));
    }, "image/jpeg", quality);
  });
}

export async function preparePaymentProof(file: File): Promise<File> {
  if (!SUPPORTED_TYPES.has(file.type)) {
    throw new Error("Gunakan JPG, PNG, atau WebP. Untuk foto HEIC di iPhone, unggah tangkapan layar bukti pembayaran.");
  }
  if (file.size < 32) throw new Error("File gambar kosong atau rusak. Pilih kembali bukti pembayaran.");
  if (file.size > PROOF_INPUT_MAX_BYTES) {
    throw new Error("Gambar melebihi 20 MB. Unggah tangkapan layar bukti pembayaran agar lebih ringan.");
  }
  // Keep small proofs byte-for-byte, including sharp screenshot text.
  if (file.size <= OPTIMIZE_AFTER_BYTES) return file;

  const url = URL.createObjectURL(file);
  const image = new Image();
  let canvas: HTMLCanvasElement | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Gambar tidak dapat dibaca. Pilih kembali atau unggah tangkapan layar bukti pembayaran."));
      image.src = url;
    });
    const width = image.naturalWidth, height = image.naturalHeight;
    if (!width || !height || width * height > MAX_SOURCE_PIXELS) {
      throw new Error("Resolusi gambar terlalu besar. Unggah tangkapan layar bukti pembayaran agar detailnya tetap jelas.");
    }
    const baseScale = Math.min(1, MAX_CANVAS_EDGE / width, MAX_CANVAS_EDGE / height, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
    canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Gambar belum dapat disiapkan. Coba unggah tangkapan layar bukti pembayaran.");

    // High quality first; never crop, upscale, or use aggressive JPEG quality.
    for (const reduction of [1, 0.85, 0.7, 0.55]) {
      const scale = baseScale * reduction;
      if (reduction < 1 && Math.max(width, height) * scale < 2048) break;
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.94, 0.9, 0.86]) {
        const blob = await encode(canvas, quality);
        // Avoid a lossy conversion when it would increase an already valid file.
        if (file.size <= PROOF_UPLOAD_MAX_BYTES && blob.size >= file.size) return file;
        if (blob.size <= PROOF_UPLOAD_MAX_BYTES) {
          const name = (file.name.replace(/\.[^.]+$/, "") || "bukti-pembayaran") + ".jpg";
          return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
        }
      }
    }
    throw new Error("Gambar masih terlalu besar setelah disiapkan. Unggah tangkapan layar yang menampilkan nominal dan detail transaksi dengan jelas.");
  } finally {
    image.onload = image.onerror = null;
    image.src = "";
    URL.revokeObjectURL(url);
    // Release the large pixel buffer on mobile, including on failed attempts.
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
