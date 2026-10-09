"use client";
import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type InstallPrompt = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)");
    const detect = () => setInstalled(display.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
    const ready = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const complete = () => { setInstalled(true); setHelpOpen(false); setPrompt(null); };
    detect();
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", complete);
    display.addEventListener("change", detect);
    return () => {
      window.removeEventListener("beforeinstallprompt", ready);
      window.removeEventListener("appinstalled", complete);
      display.removeEventListener("change", detect);
    };
  }, []);
  async function install() {
    if (!prompt) { setHelpOpen(true); return; }
    setPrompt(null);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setHelpOpen(false);
    } catch { setHelpOpen(true); }
  }
  if (installed) return null;
  return <>
    <Button type="button" variant="outline" className="install-button" onClick={() => void install()} aria-label="Pasang aplikasi ELITE.VTG" title="Pasang di layar utama"><Smartphone size={16} aria-hidden="true" />Pasang</Button>
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className="install-dialog">
        <DialogHeader><DialogTitle>Pasang ELITE.VTG</DialogTitle><DialogDescription>Buka situs ini langsung di browser HP, lalu tambahkan ke layar utama.</DialogDescription></DialogHeader>
        {prompt && <Button type="button" onClick={() => void install()}>Pasang sekarang</Button>}
        <section><h3>Android · Chrome</h3><ol><li>Buka menu <strong>⋮</strong> di Chrome.</li><li>Pilih <strong>Instal dan buat pintasan</strong>, lalu <strong>Instal</strong>. Pada beberapa versi, pilih <strong>Tambahkan ke layar utama</strong>.</li><li>Ikuti petunjuk di layar.</li></ol></section>
        <section><h3>iPhone · Safari</h3><ol><li>Buka menu <strong>Bagikan / Share</strong> di Safari.</li><li>Pilih <strong>Tambah ke Layar Utama / Add to Home Screen</strong>.</li><li>Aktifkan <strong>Buka sebagai App Web / Open as Web App</strong> jika tersedia, lalu pilih <strong>Tambah / Add</strong>.</li></ol></section>
        <p className="install-note">Cek tarif membutuhkan internet. Akses tetap privat; masuk dengan akun Anda jika diminta.</p>
      </DialogContent>
    </Dialog>
  </>;
}
