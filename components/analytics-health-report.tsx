import type {AnalyticsReport} from '@/modules/analytics/report';
const labels:Record<string,string>={image_recovered:'Foto produk pulih melalui fallback',cart_rejected_sold:'Keranjang ditolak · barang habis',cart_rejected_scheduled:'Keranjang ditolak · belum dibuka',cart_rejected_quantity_limit:'Keranjang ditolak · batas jumlah'};
export function AnalyticsHealthReport({data}:{data:AnalyticsReport}){
 return <>
  {data.reserveFlow&&<section className="an-panel">
   <h2>Perjalanan Reserve / DP</h2>
   <p className="an-muted">Checkout DP yang mulai tampil dalam rentang ini, diikuti sampai status terbaru. Terpisah dari checkout biasa; data lama yang tidak memiliki catatan tampilan tidak dihitung ulang.</p>
   <div className="an-scroll"><table className="an-table">
    <thead><tr><th scope="col">Tahap</th><th scope="col">Checkout DP</th></tr></thead>
    <tbody>{data.reserveFlow.stages.map(stage=><tr key={stage.key}><th scope="row">{stage.label}</th><td>{stage.count.toLocaleString('id-ID')}</td></tr>)}</tbody>
   </table></div>
  </section>}
  <section className="an-panel">
   <h2>Pemulihan gambar dan penolakan keranjang</h2>
   <p className="an-muted">Foto yang berhasil pulih dan penolakan sesuai stok/jadwal dipisahkan dari kegagalan teknis. Catatan dideduplikasi per sesi, produk dan lima menit. Nol catatan bukan jaminan bebas masalah.</p>
   {data.activity.length?<div className="an-scroll"><table className="an-table">
    <thead><tr><th scope="col">Aktivitas</th><th scope="col">Catatan</th></tr></thead>
    <tbody>{data.activity.map(row=><tr key={row.name}><th scope="row">{labels[row.name]??row.name}</th><td>{row.count.toLocaleString('id-ID')}</td></tr>)}</tbody>
   </table></div>:<p className="an-muted">Belum ada aktivitas tercatat dalam rentang ini.</p>}
   <p className="an-muted">Catatan gambar lama dapat mencakup preview yang pulih atau QRIS. Pencatatan baru memisahkan QRIS dan kegagalan foto setelah fallback. Error 400/409 dapat berupa validasi atau konflik, bukan selalu gangguan server.</p>
  </section>
 </>;
}
