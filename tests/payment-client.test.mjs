import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const esbuild = require("esbuild");
const bundle = await esbuild.build({
  stdin: { contents: "export * from './modules/order/payment-proof'; export * from './modules/order/clipboard';", resolveDir: process.cwd(), loader: "ts" },
  bundle: true, platform: "browser", format: "cjs", write: false,
});
const MB = 1024 * 1024;
function file(bytes, type = "image/png") {
  return new File([new Uint8Array(bytes)], "bukti.png", { type, lastModified: 1234 });
}

// Isolated browser API simulations; no payment, carrier, or Telegram requests.
function browser({ width = 4000, height = 3000, sizes = [2 * MB], decodeFails = false, contextMissing = false, clipboardFails = false, fallbackFails = false } = {}) {
  const state = { encoded: [], drawn: [], revoked: [], copies: [], appended: [], removed: [], focused: 0, createdImages: 0 };
  let encodeIndex = 0;
  const canvas = {
    width: 0, height: 0,
    getContext() {
      if (contextMissing) return null;
      return { fillRect() {}, drawImage(...args) { state.drawn.push(args.slice(1)); } };
    },
    toBlob(callback, type, quality) {
      state.encoded.push({ width: this.width, height: this.height, type, quality });
      const size = sizes[Math.min(encodeIndex++, sizes.length - 1)];
      if (size === null) { callback(null); return; }
      const bytes = new Uint8Array(size);
      bytes.set([255, 216, 255]);
      queueMicrotask(() => callback(new Blob([bytes], { type })));
    },
  };
  class Element { focus() { state.focused++; } }
  const context = vm.createContext({
    module: { exports: {} }, File, Blob, Set, Error, Promise, Math, queueMicrotask, HTMLElement: Element,
    URL: { createObjectURL: () => "blob:test-proof", revokeObjectURL: url => state.revoked.push(url) },
    Image: class {
      constructor() { state.createdImages++; this.naturalWidth = width; this.naturalHeight = height; }
      set src(value) { if (value) queueMicrotask(() => decodeFails ? this.onerror?.() : this.onload?.()); }
    },
    navigator: { clipboard: { async writeText(value) { if (clipboardFails) throw new Error("denied"); state.copies.push(value); } } },
    document: {
      activeElement: new Element(),
      createElement(tag) {
        if (tag === "canvas") return canvas;
        const input = { style: {}, value: "", readonly: false, setAttribute(name) { if (name === "readonly") this.readonly = true; }, focus() {}, select() {}, remove() { state.removed.push(this); } };
        return input;
      },
      body: { appendChild(input) { state.appended.push(input); } },
      execCommand(command) { assert.equal(command, "copy"); if (fallbackFails) return false; state.copies.push(state.appended.at(-1).value); return true; },
    },
  });
  vm.runInContext(bundle.outputFiles[0].text, context);
  return { api: context.module.exports, state, canvas };
}

test("small payment screenshots retain their original bytes and filename", async () => {
  const { api, state } = browser();
  const original = file(80);
  assert.equal(await api.preparePaymentProof(original), original);
  assert.equal(state.createdImages, 0);
});

test("an oversized proof becomes an uploadable JPEG without cropping or upscaling", async () => {
  const { api, state, canvas } = browser();
  const prepared = await api.preparePaymentProof(file(6 * MB));
  assert.equal(prepared.name, "bukti.jpg");
  assert.equal(prepared.type, "image/jpeg");
  assert.ok(prepared.size <= api.PROOF_UPLOAD_MAX_BYTES);
  assert.equal(prepared.lastModified, 1234);
  assert.deepEqual(Array.from(new Uint8Array(await prepared.slice(0, 3).arrayBuffer())), [255, 216, 255]);
  assert.deepEqual(state.drawn, [[0, 0, 4000, 3000]]);
  assert.equal(state.encoded[0].quality >= 0.9, true);
  assert.deepEqual(state.revoked, ["blob:test-proof"]);
  assert.equal(canvas.width * canvas.height, 0);
});

test("compression retries keep image quality and dimensions within readable bounds", async () => {
  const { api, state } = browser({ sizes: [5 * MB, 5 * MB, 5 * MB, 3 * MB] });
  const prepared = await api.preparePaymentProof(file(8 * MB));
  assert.ok(prepared.size <= 4 * MB);
  assert.ok(state.encoded.length > 1);
  for (const image of state.encoded) {
    assert.ok(image.quality >= 0.86);
    assert.ok(Math.max(image.width, image.height) >= 2048);
    assert.ok(Math.abs(image.width / image.height - 4 / 3) < 0.001);
  }
});

test("long receipt images retain their full aspect ratio", async () => {
  const { api, state } = browser({ width: 800, height: 10000 });
  await api.preparePaymentProof(file(6 * MB));
  const first = state.encoded[0];
  assert.ok(first.height <= 8192);
  assert.ok(Math.abs(first.width / first.height - 0.08) < 0.001);
  assert.deepEqual(state.drawn[0], [0, 0, first.width, first.height]);
});

test("an already valid file is preserved if JPEG conversion would increase its size", async () => {
  const { api } = browser({ sizes: [3 * MB] });
  const original = file(2 * MB);
  assert.equal(await api.preparePaymentProof(original), original);
});

test("unsupported formats, empty files, and inputs over 20 MB fail before decoding", async () => {
  const { api, state } = browser();
  await assert.rejects(api.preparePaymentProof(file(100, "image/heic")), /HEIC/);
  await assert.rejects(api.preparePaymentProof(file(0)), /kosong/);
  await assert.rejects(api.preparePaymentProof(file(21 * MB)), /20 MB/);
  assert.equal(state.createdImages, 0);
});

test("undecodable or excessively large images provide a clear error and release resources", async () => {
  for (const options of [{ decodeFails: true }, { width: 10000, height: 10000 }, { contextMissing: true }, { sizes: [null] }]) {
    const { api, state, canvas } = browser(options);
    await assert.rejects(api.preparePaymentProof(file(6 * MB)), /Gambar|Resolusi/);
    assert.deepEqual(state.revoked, ["blob:test-proof"]);
    assert.equal(canvas.width * canvas.height, 0);
  }
});

test("files still exceeding the backend limit fail instead of becoming an unreadable upload", async () => {
  const { api, state, canvas } = browser({ sizes: [5 * MB] });
  await assert.rejects(api.preparePaymentProof(file(6 * MB)), /masih terlalu besar/);
  assert.ok(state.encoded.every(image => image.quality >= 0.86 && Math.max(image.width, image.height) >= 2048));
  assert.equal(canvas.width * canvas.height, 0);
  assert.deepEqual(state.revoked, ["blob:test-proof"]);
});

test("clipboard retains the exact numeric amount and existing invoice text", async () => {
  const { api, state } = browser();
  await api.copyText(String(338000));
  await api.copyText("INVOICE ELITE.VTG\nTotal: Rp338.000");
  assert.deepEqual(state.copies, ["338000", "INVOICE ELITE.VTG\nTotal: Rp338.000"]);
  assert.equal(state.appended.length, 0);
});

test("clipboard fallback restores focus and removes its temporary input", async () => {
  const { api, state } = browser({ clipboardFails: true });
  await api.copyText("338000");
  assert.deepEqual(state.copies, ["338000"]);
  assert.equal(state.appended[0].readonly, true);
  assert.deepEqual(state.appended, state.removed);
  assert.equal(state.focused, 1);
});

test("clipboard failure is reported and still cleans up the fallback input", async () => {
  const { api, state } = browser({ clipboardFails: true, fallbackFails: true });
  await assert.rejects(api.copyText("338000"), /Copy failed/);
  assert.deepEqual(state.copies, []);
  assert.deepEqual(state.appended, state.removed);
  assert.equal(state.focused, 1);
});
