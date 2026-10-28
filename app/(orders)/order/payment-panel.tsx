"use client";
import {BCA_DISPLAY_NAME} from '@/modules/order/payment-types';
/* eslint-disable @next/next/no-img-element -- Display the original owner-controlled payment asset. */
import { useState } from "react";
import { Check, Copy, Download, Maximize2, X } from "lucide-react";
import { Dialog } from "radix-ui";
import {PaymentMethodChoice} from '@/components/payment-method-choice';
import { Button } from "@/components/ui/button";
import { copyText } from "@/modules/order/clipboard";
import { rupiah, type Order } from "@/modules/order/order-types";
import { storedPaymentMethod, type PaymentConfig, type PaymentMethod } from "@/modules/order/payment-types";

export function PaymentPanel({ order, payment, busy, onSelect, onAssetError, compact=false }: {
  order: Order; payment?: PaymentConfig; busy: boolean; compact?:boolean;
  onSelect: (method: PaymentMethod) => Promise<void>; onAssetError: () => void;
}) {
  const method = storedPaymentMethod(order.payment_method);
  const [copied, setCopied] = useState<"account" | "amount" | null>(null);
  const [error, setError] = useState("");
  const [qrisFailed, setQrisFailed] = useState(false);
  const [changing,setChanging]=useState(false);
  const bank = payment?.bca, qris = payment?.qris;
  async function copy(value: string, kind: "account" | "amount") {
    setError(""); setCopied(null);
    try { await copyText(value); setCopied(kind); }
    catch { setError("Salin belum tersedia. Tekan lama nomor rekening atau nominal untuk menyalinnya."); }
  }
  function failedAsset() { setQrisFailed(true); onAssetError(); }
  return <>
    {compact&&<div className="payment-selected"><span>{method==='bca_transfer'?BCA_DISPLAY_NAME:'QRIS DANA'}</span><button type="button" className="text-button" aria-expanded={changing} onClick={()=>setChanging(v=>!v)} disabled={busy}>Ganti metode</button></div>}
    {(!compact||changing||method==='bca_transfer'&&!bank||method==='qris_dana'&&(!qris||qrisFailed))&&<PaymentMethodChoice method={method} payment={payment} disabled={busy} qrisFailed={qrisFailed} onSelect={value=>void onSelect(value)}/>}
    {method === "bca_transfer" ? bank ? <>
      <div className="bank-panel">
        <span className="eyebrow">{BCA_DISPLAY_NAME}</span>
        <span className="bank-account">{bank.accountNumber}</span>
        <span className="bank-holder">{bank.accountHolder}</span>
      </div>
      <div className="payment-actions">
        <Button type="button" className="secondary" onClick={() => void copy(bank.accountNumber, "account")}>{copied === "account" ? <Check size={17} /> : <Copy size={17} />}{copied === "account" ? "Rekening tersalin" : "Salin nomor rekening"}</Button>
        <Button type="button" className="secondary" onClick={() => void copy(String(order.total), "amount")}>{copied === "amount" ? <Check size={17} /> : <Copy size={17} />}{copied === "amount" ? "Total tersalin" : "Salin total pembayaran"}</Button>
      </div>
      <p className="payment-instruction">Transfer sesuai total pembayaran, lalu unggah bukti transfer. Periksa nama <b>{bank.accountHolder}</b> di aplikasi bank sebelum mengirim <b>{rupiah(order.total)}</b>.</p>
    </> : <div className="notice error" role="alert">Transfer BCA sedang tidak tersedia. Pilih metode lain atau hubungi ELITE.VTG.</div>
    : qris && !qrisFailed ? <>
      <div className="qris-frame"><img src={qris.imageUrl} alt={`QRIS DANA ${qris.merchant}`} onError={failedAsset} /><span>{qris.merchant}</span></div>
      <div className="payment-actions">
        <Button type="button" className="secondary" onClick={() => void copy(String(order.total), "amount")}>{copied === "amount" ? <Check size={17} /> : <Copy size={17} />}{copied === "amount" ? "Total tersalin" : "Salin total pembayaran"}</Button>
        <Dialog.Root>
          <Dialog.Trigger asChild><Button type="button" className="secondary"><Maximize2 size={17} />Perbesar QRIS</Button></Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="qris-dialog-overlay" />
            <Dialog.Content className="qris-dialog">
              <Dialog.Title>QRIS DANA</Dialog.Title>
              <Dialog.Description>Periksa merchant {qris.merchant} sebelum membayar.</Dialog.Description>
              <img src={qris.imageUrl} alt={`QRIS DANA ${qris.merchant} diperbesar`} onError={failedAsset} />
              <a className="primary link-button full" href={qris.imageUrl} download="QRIS-ELITE-VTG"><Download size={17} />Simpan QRIS</a>
              <Dialog.Close asChild><Button type="button" className="qris-dialog-close secondary" aria-label="Tutup QRIS"><X size={20} /></Button></Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
      <a className="secondary link-button full" href={qris.imageUrl} download="QRIS-ELITE-VTG"><Download size={17} />Simpan QRIS</a>
      <p className="payment-instruction">Pindai QRIS atau pilih gambar dari galeri. Periksa merchant <b>{qris.merchant}</b> dan masukkan tepat <b>{rupiah(order.total)}</b>, lalu unggah bukti pembayaran.</p>
    </> : <div className="notice error" role="alert">QRIS sedang tidak tersedia. Pilih transfer BCA atau hubungi ELITE.VTG.</div>}
    {copied && <p className="payment-copy-status" role="status">{copied === "account" ? "Nomor rekening berhasil disalin." : "Total pembayaran berhasil disalin."}</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
  </>;
}
