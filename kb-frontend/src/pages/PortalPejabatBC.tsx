// PortalPejabatBC.tsx — v4
// Perubahan:
//   - Tambah prop walletAddress (untuk pemusnahan)
//   - Tambah page pejabat_pemusnahan: form Berita Acara pemusnahan
//   - Form BOM: tambah kodeBarangInternal & kodeHS per komponen, tambah kodeHSProduk
//   - Form Stock Opname: tambah kodeBarangInternal & kodeHS per item
//   - Ganti form validasi BOM di halaman Kelola Izin dengan RekapBOM per KB

// ─── Sub-komponen: Rekap status BOM per KB ───────────────────────
function RekapBOM({ daftarKB }: { daftarKB: any[] }) {
  const [selectedKB, setSelectedKB] = useState("");
  const [bomList, setBomList]       = useState<any[]>([]);
  const [loading, setLoading]       = useState(false);
  const [expanded, setExpanded]     = useState<string | null>(null);

  const muat = async (idKB: string) => {
    if (!idKB) { setBomList([]); return; }
    setLoading(true);
    try {
      const data = await getBOM(idKB);
      setBomList(data);
    } catch { setBomList([]); }
    finally { setLoading(false); }
  };

  const statusBadge = (status: string) => {
    if (status === "disetujui")              return <span className="badge badge-active">Disetujui</span>;
    if (status === "ditolak")               return <span style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 12, padding: "2px 10px", fontSize: 11, fontWeight: 500 }}>Ditolak</span>;
    if (status === "menunggu_persetujuan")  return <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 12, padding: "2px 10px", fontSize: 11, fontWeight: 500 }}>Menunggu</span>;
    return <span style={{ background: "#f1f5f9", color: "#475569", borderRadius: 12, padding: "2px 10px", fontSize: 11 }}>{status}</span>;
  };

  const counts = bomList.reduce((acc, b) => {
    const s = b.statusBOM ?? "lainnya";
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div style={{ marginTop: 32 }}>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18 }}>Daftar Formula BOM per KB</h2>
        <p>Lihat seluruh formula produksi yang telah diajukan oleh perusahaan KB</p>
      </div>

      <div className="card">
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 16 }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label>Pilih Kawasan Berikat</label>
            <select value={selectedKB} onChange={e => { setSelectedKB(e.target.value); muat(e.target.value); setExpanded(null); }}>
              <option value="">-- Pilih KB --</option>
              {daftarKB.map(kb => (
                <option key={kb.id} value={kb.id}>{kb.id} · {kb.namaPerusahaan}</option>
              ))}
            </select>
          </div>
          {selectedKB && (
            <button className="btn btn-outline btn-sm" style={{ marginBottom: 0 }} onClick={() => muat(selectedKB)}>
              Refresh
            </button>
          )}
        </div>

        {/* Ringkasan badge */}
        {selectedKB && bomList.length > 0 && (
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { label: "Total",    val: bomList.length,                        bg: "#f1f5f9", color: "#334155" },
              { label: "Disetujui", val: counts["disetujui"] ?? 0,             bg: "#dcfce7", color: "#166534" },
              { label: "Menunggu", val: counts["menunggu_persetujuan"] ?? 0,   bg: "#fef3c7", color: "#92400e" },
              { label: "Ditolak",  val: counts["ditolak"] ?? 0,                bg: "#fee2e2", color: "#991b1b" },
            ].map(({ label, val, bg, color }) => (
              <div key={label} style={{ background: bg, color, borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600 }}>
                {val} <span style={{ fontWeight: 400 }}>{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* List BOM */}
        {!selectedKB ? (
          <div className="empty"><div className="empty-icon">◈</div>Pilih KB untuk melihat daftar formula BOM</div>
        ) : loading ? (
          <div className="empty">Memuat...</div>
        ) : bomList.length === 0 ? (
          <div className="empty"><div className="empty-icon">✓</div>Belum ada formula BOM yang diajukan oleh KB ini</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {bomList.map(bom => (
              <div key={bom.id} style={{
                border: expanded === bom.id ? "1px solid #378ADD" : "0.5px solid var(--color-border-tertiary)",
                borderRadius: 10, overflow: "hidden",
              }}>
                {/* Header row */}
                <div
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", cursor: "pointer", background: expanded === bom.id ? "#E6F1FB18" : "transparent" }}
                  onClick={() => setExpanded(expanded === bom.id ? null : bom.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{bom.kodeFormula}</span>
                      <span style={{ color: "#64748b", fontSize: 12, marginLeft: 8 }}>{bom.versi}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "#475569" }}>{bom.namaProduk}</div>
                    <div style={{ fontFamily: "monospace", fontSize: 11, color: "#94a3b8" }}>HS {bom.kodeHSProduk}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {statusBadge(bom.statusBOM ?? "—")}
                    <span style={{ color: "#94a3b8", fontSize: 12 }}>{expanded === bom.id ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Expanded: komposisi */}
                {expanded === bom.id && (
                  <div style={{ padding: "0 14px 14px", borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                    <div style={{ fontSize: 12, color: "#64748b", margin: "10px 0 6px", fontWeight: 600 }}>
                      Komposisi bahan baku ({bom.komposisi?.length ?? 0} bahan)
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "var(--color-background-secondary)" }}>
                            {["Kode Internal", "Nama Bahan", "Kode HS", "Rasio", "Satuan"].map(h => (
                              <th key={h} style={{ padding: "6px 10px", textAlign: h === "Rasio" ? "right" : "left", borderBottom: "0.5px solid var(--color-border-tertiary)", fontWeight: 500, color: "#475569" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(bom.komposisi ?? []).map((k: any, i: number) => (
                            <tr key={i} style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                              <td style={{ padding: "6px 10px", fontFamily: "monospace", fontSize: 11 }}>{k.kodeBarangInternal}</td>
                              <td style={{ padding: "6px 10px" }}>{k.namaBarang}</td>
                              <td style={{ padding: "6px 10px", fontFamily: "monospace", fontSize: 11 }}>{k.kodeHS}</td>
                              <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600 }}>{k.rasio}</td>
                              <td style={{ padding: "6px 10px", color: "#64748b" }}>{k.satuan}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {(bom.toleransiScrapPersen != null || bom.toleransiWastedPersen != null) && (
                      <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
                        {bom.toleransiScrapPersen != null && (
                          <div style={{ background: "#f8fafc", borderRadius: 6, padding: "4px 12px", fontSize: 12 }}>
                            Toleransi Scrap: <strong>{bom.toleransiScrapPersen}%</strong>
                          </div>
                        )}
                        {bom.toleransiWastedPersen != null && (
                          <div style={{ background: "#f8fafc", borderRadius: 6, padding: "4px 12px", fontSize: 12 }}>
                            Toleransi Wasted: <strong>{bom.toleransiWastedPersen}%</strong>
                          </div>
                        )}
                      </div>
                    )}
                    {bom.statusBOM === "ditolak" && bom.alasanTolak && (
                      <div style={{ marginTop: 10, background: "#fff1f2", border: "0.5px solid #fecdd3", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#991b1b" }}>
                        <strong>Alasan ditolak:</strong> {bom.alasanTolak}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


import { useState, useEffect, useCallback } from "react";
import type { Page } from "../App";
import type { BlockchainState } from "../hooks/useBlockchain";
import { bcGetDaftarSemuaKB, bcGetInfoKB, bcGetInfoKontrak } from "../service/blockchainService";
import { getStockOpname, getPemusnahan, getBOMMenunggu, getBOM, approveBOM, tolakBOM } from "../service/firestoreService";
import { hashBOM } from "../service/hashService";

interface Props {
  page: Page;
  blockchain: BlockchainState;
  walletAddress: string;            // v3: diperlukan untuk pemusnahan
}

export default function PortalPejabatBC({ page, blockchain, walletAddress }: Props) {
  const [daftarKB, setDaftarKB] = useState<any[]>([]);
  const [pesan, setPesan] = useState<{ tipe: "success" | "error"; teks: string } | null>(null);

  const [formIzin, setFormIzin] = useState({
    idKB: "", aksi: "bekukan", alasan: "",
  });

  const [formOpname, setFormOpname] = useState({
    idKB: "", idOpname: "", catatan: "",
    items: [{
      kodeBarangInternal: "",  // v3
      kodeHS: "",              // v3
      namaBarang: "",
      saldoSistem: "", saldoFisik: "",
    }],
  });

  const [formBOM, setFormBOM] = useState({
    idKB: "", kodeFormula: "", namaProduk: "",
    kodeHSProduk: "",                    // v3
    versi: "v1",
    toleransiScrapPersen: "",            // v3 opsional
    toleransiWastedPersen: "",           // v3 opsional
    komposisi: [{
      kodeBarangInternal: "",            // v3
      kodeHS: "",                        // v3
      namaBarang: "", rasio: "", satuan: "kg",
    }],
  });

  // v3: form Berita Acara pemusnahan
  const [formPemusnahan, setFormPemusnahan] = useState({
    idKB: "",
    nomorBA: "", tanggalBA: "",
    namaBarang: "", kodeHS: "",
    kodeBarangInternal: "",
    jumlah: "", satuan: "kg",
    metodePemusnahan: "",
    lokasiPemusnahan: "",
    namaSaksiPejabatBC: "",
  });

  const [riwayatOpname, setRiwayatOpname]         = useState<any[]>([]);
  const [riwayatPemusnahan, setRiwayatPemusnahan] = useState<any[]>([]);
  const [bomMenunggu, setBomMenunggu]             = useState<any[]>([]);
  const [bomSelectedKB, setBomSelectedKB]         = useState("");
  const [alasanTolak, setAlasanTolak]             = useState<Record<string, string>>({});
  const [bomDetail, setBomDetail]                 = useState<any | null>(null);
  const [selectedOpnameKB, setSelectedOpnameKB]   = useState("");
  const [selectedPemusnahanKB, setSelectedPemusnahanKB] = useState("");

  // ── Helpers ──────────────────────────────────────────────────

  const tampilPesan = (tipe: "success" | "error", teks: string) => {
    setPesan({ tipe, teks });
    setTimeout(() => setPesan(null), 6000);
  };

  const formatTx = (hash: string) =>
    hash === "pending" ? "⏳ pending" : `${hash.slice(0, 10)}...${hash.slice(-6)}`;

  // ── Loaders ──────────────────────────────────────────────────

  const muatKB = useCallback(async () => {
    if (!blockchain.ready) return;
    try {
      const ids = await bcGetDaftarSemuaKB();
      const list = await Promise.all(ids.map(async (id: string) => {
        try {
          const [info, kontrak] = await Promise.all([
            bcGetInfoKB(id),
            bcGetInfoKontrak(id),
          ]);
          return {
            id,
            namaPerusahaan: info.namaPerusahaan,
            nomorIzin:      info.nomorIzin,
            alamatKontrak:  info.alamatKontrak,
            izinAktif:      kontrak.izinAktif,
          };
        } catch {
          return { id, namaPerusahaan: id, nomorIzin: "-", alamatKontrak: "-", izinAktif: false };
        }
      }));
      setDaftarKB(list);
    } catch (e) {
      console.error("muatKB error:", e);
    }
  }, [blockchain.ready]);

  useEffect(() => { muatKB(); }, [muatKB]);

  useEffect(() => {
    if (selectedOpnameKB) muatOpname(selectedOpnameKB);
  }, [selectedOpnameKB]);

  useEffect(() => {
    if (selectedPemusnahanKB) muatPemusnahan(selectedPemusnahanKB);
  }, [selectedPemusnahanKB]);

  // Reload riwayat when user navigates to the page
  useEffect(() => {
    if (page === "pejabat_opname" && selectedOpnameKB) muatOpname(selectedOpnameKB);
    if (page === "pejabat_pemusnahan" && selectedPemusnahanKB) muatPemusnahan(selectedPemusnahanKB);
    if (page === "pejabat_bom" && bomSelectedKB) muatBOMMenunggu(bomSelectedKB);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const muatOpname = async (idKB: string) => {
    if (!idKB) return;
    try {
      const data = await getStockOpname(idKB, { limit: 20 });
      setRiwayatOpname(data);
    } catch (e) {
      console.error("muatOpname error:", e);
      setRiwayatOpname([]);
    }
  };

  const muatPemusnahan = async (idKB: string) => {
    if (!idKB) return;
    try {
      const data = await getPemusnahan(idKB, { limit: 20 });
      setRiwayatPemusnahan(data);
    } catch (e) {
      console.error("muatPemusnahan error:", e);
      setRiwayatPemusnahan([]);
    }
  };

  // ── Handlers ─────────────────────────────────────────────────

  const handleUpdateIzin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const aktif = formIzin.aksi === "aktifkan";
      const result = await blockchain.updateStatusIzin(formIzin.idKB, aktif);
      tampilPesan("success",
        `✅ KB ${formIzin.idKB} berhasil ${aktif ? "diaktifkan" : "dibekukan"}. TX: ${formatTx(result.txHash)}`
      );
      setFormIzin({ idKB: "", aksi: "bekukan", alasan: "" });
      muatKB();
    } catch {}
  };

  const handleOpname = async (e: React.FormEvent) => {
    e.preventDefault();
    const idKBNow = selectedOpnameKB || formOpname.idKB;
    if (!idKBNow) { tampilPesan("error", "Pilih KB terlebih dahulu."); return; }
    try {
      const itemsParsed = formOpname.items.map(item => ({
        kodeBarangInternal: item.kodeBarangInternal,
        kodeHS:             item.kodeHS,
        namaBarang:         item.namaBarang,
        saldoSistem:        Number(item.saldoSistem),
        saldoFisik:         Number(item.saldoFisik),
        selisih:            Number(item.saldoFisik) - Number(item.saldoSistem),
      }));
      const result = await blockchain.submitStockOpname({
        idKB:            idKBNow,
        idOpname:        formOpname.idOpname,
        tanggal:         new Date().toISOString(),
        items:           itemsParsed,
        pejabatBCWallet: walletAddress,
        catatan:         formOpname.catatan,
      });
      tampilPesan("success",
        `✅ Stock opname "${formOpname.idOpname}" dicatat. TX: ${formatTx(result.txHash)}`
      );
      setFormOpname({
        idKB: idKBNow,
        idOpname: "", catatan: "",
        items: [{ kodeBarangInternal: "", kodeHS: "", namaBarang: "", saldoSistem: "", saldoFisik: "" }],
      });
      muatOpname(idKBNow);
    } catch (e) {
      console.error("handleOpname error:", e);
    }
  };

  const handleValidasiBOM = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await blockchain.submitValidasiBOM({
        idKB:            formBOM.idKB,
        kodeFormula:     formBOM.kodeFormula,
        namaProduk:      formBOM.namaProduk,
        kodeHSProduk:    formBOM.kodeHSProduk,
        versi:           formBOM.versi,
        toleransiScrapPersen:  formBOM.toleransiScrapPersen  ? Number(formBOM.toleransiScrapPersen)  : undefined,
        toleransiWastedPersen: formBOM.toleransiWastedPersen ? Number(formBOM.toleransiWastedPersen) : undefined,
        komposisi: formBOM.komposisi.map(k => ({
          kodeBarangInternal: k.kodeBarangInternal,
          kodeHS:             k.kodeHS,
          namaBarang:         k.namaBarang,
          rasio:              Number(k.rasio),
          satuan:             k.satuan,
        })),
        validasiOleh:      walletAddress,
        tanggalValidasi:   new Date().toISOString(),
      });
      tampilPesan("success",
        `✅ BOM "${formBOM.kodeFormula}" divalidasi. TX: ${formatTx(result.txHash)}`
      );
      setFormBOM({
        idKB: "", kodeFormula: "", namaProduk: "", kodeHSProduk: "", versi: "v1",
        toleransiScrapPersen: "", toleransiWastedPersen: "",
        komposisi: [{ kodeBarangInternal: "", kodeHS: "", namaBarang: "", rasio: "", satuan: "kg" }],
      });
    } catch {}
  };

  // ── BOM Approval handlers ─────────────────────────────────────

  const muatBOMMenunggu = async (idKB: string) => {
    if (!idKB) return;
    try {
      const list = await getBOMMenunggu(idKB);
      setBomMenunggu(list);
    } catch {}
  };

  const handleApproveBOM = async (bom: any) => {
    try {
      // Hitung hash dari data BOM yang sudah ada di Firestore
      const hashes = hashBOM({
        idKB:                  bom.idKB,
        kodeFormula:           bom.kodeFormula,
        namaProduk:            bom.namaProduk,
        kodeHSProduk:          bom.kodeHSProduk,
        versi:                 bom.versi,
        komposisi:             bom.komposisi ?? [],
        toleransiScrapPersen:  bom.toleransiScrapPersen,
        toleransiWastedPersen: bom.toleransiWastedPersen,
        validasiOleh:          walletAddress,
        tanggalValidasi:       bom.tanggalValidasi ?? new Date().toISOString(),
      });

      // Kirim langsung ke blockchain (tidak buat dokumen Firestore baru)
      const txResult = await blockchain.approveBOMOnChain(
        bom.idKB,
        hashes.kodeFormulaHash,
        hashes.dataHash
      );

      // Update dokumen Firestore yang sudah ada dengan txHash & dataHash
      await approveBOM(bom.idKB, bom.id, {
        txHash:      txResult.txHash,
        blockNumber: txResult.blockNumber,
        dataHash:    hashes.dataHash,
      });

      tampilPesan("success", `✅ BOM "${bom.kodeFormula}" disetujui. TX: ${formatTx(txResult.txHash)}`);
      muatBOMMenunggu(bomSelectedKB);
      setBomDetail(null);
    } catch (err: any) {
      tampilPesan("error", err?.message ?? "Gagal menyetujui BOM");
    }
  };

  const handleTolakBOM = async (bom: any) => {
    const alasan = alasanTolak[bom.id] ?? "";
    if (!alasan.trim()) { tampilPesan("error", "Isi alasan penolakan sebelum menolak."); return; }
    try {
      await tolakBOM(bom.idKB, bom.id, alasan);
      tampilPesan("success", `BOM "${bom.kodeFormula}" ditolak. Operator KB perlu mengajukan ulang.`);
      setAlasanTolak(prev => { const next = { ...prev }; delete next[bom.id]; return next; });
      muatBOMMenunggu(bomSelectedKB);
      setBomDetail(null);
    } catch (err: any) {
      tampilPesan("error", err?.message ?? "Gagal menolak BOM");
    }
  };

  // v3: handler pemusnahan
  const handlePemusnahan = async (e: React.FormEvent) => {
    e.preventDefault();
    const idKBNow = selectedPemusnahanKB || formPemusnahan.idKB;
    if (!idKBNow) { tampilPesan("error", "Pilih KB terlebih dahulu."); return; }
    try {
      const result = await blockchain.submitPemusnahan({
        idKB:                idKBNow,
        nomorBA:             formPemusnahan.nomorBA,
        tanggalBA:           formPemusnahan.tanggalBA,
        namaBarang:          formPemusnahan.namaBarang,
        kodeHS:              formPemusnahan.kodeHS,
        kodeBarangInternal:  formPemusnahan.kodeBarangInternal,
        jumlah:              Number(formPemusnahan.jumlah),
        satuan:              formPemusnahan.satuan,
        metodePemusnahan:    formPemusnahan.metodePemusnahan,
        lokasiPemusnahan:    formPemusnahan.lokasiPemusnahan,
        namaSaksiPejabatBC:  formPemusnahan.namaSaksiPejabatBC,
        pejabatBCWallet:     walletAddress,
      });
      tampilPesan("success",
        `✅ Berita Acara "${formPemusnahan.nomorBA}" dicatat. TX: ${formatTx(result.txHash)}`
      );
      setFormPemusnahan({
        idKB: idKBNow,
        nomorBA: "", tanggalBA: "",
        namaBarang: "", kodeHS: "", kodeBarangInternal: "",
        jumlah: "", satuan: "kg",
        metodePemusnahan: "", lokasiPemusnahan: "", namaSaksiPejabatBC: "",
      });
      muatPemusnahan(idKBNow);
    } catch (e) {
      console.error("handlePemusnahan error:", e);
    }
  };

  // ── Shared UI ────────────────────────────────────────────────

  const STATUS = (aktif: boolean) => aktif
    ? <span className="badge badge-active">Aktif</span>
    : <span className="badge badge-frozen">Dibekukan</span>;

  const loadingBanner = blockchain.isLoading && (
    <div style={{
      background: "#eff6ff", border: "1px solid #93c5fd",
      borderRadius: 8, padding: "10px 16px", marginBottom: 16,
      color: "#1d4ed8", fontSize: 14,
    }}>⏳ Memproses transaksi...</div>
  );

  const alertPesan = pesan && (
    <div className={`alert alert-${pesan.tipe}`} style={{ marginBottom: 16 }}>{pesan.teks}</div>
  );

  // ═══════════════════════════════════════════════
  // PAGE: KELOLA IZIN
  // ═══════════════════════════════════════════════
  if (page === "pejabat_izin") return (
    <div>
      <div className="page-header">
        <h1>Kelola Izin KB</h1>
        <p>Pembekuan dan reaktivasi izin Kawasan Berikat — Pasal 57 PER-9/BC/2021</p>
      </div>
      {alertPesan}{loadingBanner}
      <div className="two-col" style={{ alignItems: "start" }}>
        {/* Form update izin */}
        <div className="card">
          <div className="card-header"><span className="card-title">Update Status Izin KB</span></div>
          <div className="alert alert-warning" style={{ marginBottom: 14 }}>
            Pembekuan izin langsung mengunci semua operasi KB secara on-chain.
          </div>
          <form onSubmit={handleUpdateIzin}>
            <div className="form-group"><label>Kawasan Berikat</label>
              <select value={formIzin.idKB}
                onChange={e => setFormIzin({ ...formIzin, idKB: e.target.value })} required>
                <option value="">-- Pilih KB --</option>
                {daftarKB.map(kb => (
                  <option key={kb.id} value={kb.id}>{kb.id} · {kb.namaPerusahaan}</option>
                ))}
              </select>
            </div>
            <div className="form-group"><label>Aksi</label>
              <select value={formIzin.aksi}
                onChange={e => setFormIzin({ ...formIzin, aksi: e.target.value })}>
                <option value="bekukan">Bekukan Izin</option>
                <option value="aktifkan">Aktifkan Kembali</option>
              </select>
            </div>
            <div className="form-group"><label>Alasan (untuk audit log)</label>
              <input placeholder="Ditemukan pelanggaran..."
                value={formIzin.alasan}
                onChange={e => setFormIzin({ ...formIzin, alasan: e.target.value })} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={blockchain.isLoading}>
              {blockchain.isLoading ? "Memproses..." : "Update Status Izin"}
            </button>
          </form>
        </div>

        {/* Daftar status KB */}
        <div className="table-wrap">
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Status Semua KB</div>
          <table>
            <thead><tr><th>ID KB</th><th>Nama Perusahaan</th><th>Status</th></tr></thead>
            <tbody>
              {daftarKB.length === 0
                ? <tr><td colSpan={3}><div className="empty">Belum ada KB terdaftar</div></td></tr>
                : daftarKB.map(kb => (
                  <tr key={kb.id}>
                    <td><strong>{kb.id}</strong></td>
                    <td>{kb.namaPerusahaan}</td>
                    <td>{STATUS(kb.izinAktif)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Panel Rekap BOM per KB */}
      <RekapBOM daftarKB={daftarKB} />
    </div>
  );

  // ═══════════════════════════════════════════════
  // PAGE: PEMUSNAHAN (BA) — BARU v3
  // ═══════════════════════════════════════════════
  if (page === "pejabat_pemusnahan") return (
    <div>
      <div className="page-header">
        <h1>Pemusnahan Barang (Berita Acara)</h1>
        <p>Catat pemusnahan barang wasted secara on-chain — hanya Pejabat BC yang berwenang</p>
      </div>
      {alertPesan}{loadingBanner}
      <div className="alert alert-warning" style={{ marginBottom: 20 }}>
        <strong>Perhatian:</strong> Pencatatan pemusnahan bersifat permanen dan tidak dapat dibatalkan.
        Pastikan Berita Acara fisik sudah ditandatangani sebelum mencatat on-chain.
        Saldo bahan baku akan berkurang secara permanen.
      </div>
      <div className="two-col" style={{ alignItems: "start" }}>
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="card-header"><span className="card-title">Form Berita Acara Pemusnahan</span></div>
          <form onSubmit={handlePemusnahan}>
            <div className="form-group"><label>Kawasan Berikat</label>
              <select value={selectedPemusnahanKB}
                onChange={e => {
                  setSelectedPemusnahanKB(e.target.value);
                  setFormPemusnahan({ ...formPemusnahan, idKB: e.target.value });
                }} required>
                <option value="">-- Pilih KB --</option>
                {daftarKB.map(kb => (
                  <option key={kb.id} value={kb.id}>{kb.id} · {kb.namaPerusahaan}</option>
                ))}
              </select>
            </div>
            <div className="two-col">
              <div className="form-group"><label>Nomor Berita Acara</label>
                <input placeholder="BA-MUSNAH-2026-001" value={formPemusnahan.nomorBA}
                  onChange={e => setFormPemusnahan({ ...formPemusnahan, nomorBA: e.target.value })} required /></div>
              <div className="form-group"><label>Tanggal Berita Acara</label>
                <input type="date" value={formPemusnahan.tanggalBA}
                  onChange={e => setFormPemusnahan({ ...formPemusnahan, tanggalBA: e.target.value })} required /></div>
            </div>
            <div className="form-group"><label>Nama Barang yang Dimusnahkan</label>
              <input placeholder="Kain Reject / Cacat" value={formPemusnahan.namaBarang}
                onChange={e => setFormPemusnahan({ ...formPemusnahan, namaBarang: e.target.value })} required /></div>
            <div className="two-col">
              <div className="form-group"><label>Kode HS</label>
                <input placeholder="5208.11.00" value={formPemusnahan.kodeHS}
                  onChange={e => setFormPemusnahan({ ...formPemusnahan, kodeHS: e.target.value })} required /></div>
              <div className="form-group"><label>Kode Barang Internal</label>
                <input placeholder="REJECT-KAIN-001" value={formPemusnahan.kodeBarangInternal}
                  onChange={e => setFormPemusnahan({ ...formPemusnahan, kodeBarangInternal: e.target.value })} required /></div>
            </div>
            <div className="two-col">
              <div className="form-group"><label>Jumlah</label>
                <input type="number" min="1" value={formPemusnahan.jumlah}
                  onChange={e => setFormPemusnahan({ ...formPemusnahan, jumlah: e.target.value })} required /></div>
              <div className="form-group"><label>Satuan</label>
                <select value={formPemusnahan.satuan}
                  onChange={e => setFormPemusnahan({ ...formPemusnahan, satuan: e.target.value })}>
                  <option>kg</option><option>meter</option><option>liter</option><option>pcs</option>
                </select></div>
            </div>
            <div className="form-group"><label>Metode Pemusnahan</label>
              <select value={formPemusnahan.metodePemusnahan}
                onChange={e => setFormPemusnahan({ ...formPemusnahan, metodePemusnahan: e.target.value })} required>
                <option value="">-- Pilih metode --</option>
                <option>Insinerasi (dibakar)</option>
                <option>Landfill (dikubur)</option>
                <option>Daur ulang terkontrol</option>
                <option>Pengolahan limbah B3</option>
                <option>Lainnya</option>
              </select>
            </div>
            <div className="form-group"><label>Lokasi Pemusnahan</label>
              <input placeholder="Jl. Industri No.5, Surabaya" value={formPemusnahan.lokasiPemusnahan}
                onChange={e => setFormPemusnahan({ ...formPemusnahan, lokasiPemusnahan: e.target.value })} required /></div>
            <div className="form-group"><label>Nama Saksi Pejabat BC</label>
              <input placeholder="Nama lengkap Pejabat BC yang menyaksikan" value={formPemusnahan.namaSaksiPejabatBC}
                onChange={e => setFormPemusnahan({ ...formPemusnahan, namaSaksiPejabatBC: e.target.value })} required /></div>
            <button className="btn btn-primary" type="submit" disabled={blockchain.isLoading}
              style={{ background: "#dc2626" }}>
              {blockchain.isLoading ? "Memproses..." : "Catat Pemusnahan On-Chain"}
            </button>
          </form>
        </div>

        <div className="table-wrap">
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Riwayat Pemusnahan</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <select
              value={selectedPemusnahanKB}
              style={{ flex: 1, fontSize: 13 }}
              onChange={e => setSelectedPemusnahanKB(e.target.value)}
            >
              <option value="">-- Pilih KB untuk melihat riwayat --</option>
              {daftarKB.map(kb => (
                <option key={kb.id} value={kb.id}>{kb.id} · {kb.namaPerusahaan}</option>
              ))}
            </select>
            {selectedPemusnahanKB && (
              <button className="btn btn-outline btn-sm" onClick={() => muatPemusnahan(selectedPemusnahanKB)}>Refresh</button>
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th>No. BA</th><th>Tgl</th><th>Barang</th>
                <th style={{ textAlign: "right" }}>Jumlah</th>
                <th>Metode</th><th>TX</th>
              </tr>
            </thead>
            <tbody>
              {riwayatPemusnahan.length === 0
                ? <tr><td colSpan={6}><div className="empty">{selectedPemusnahanKB ? "Belum ada data pemusnahan untuk KB ini" : "Pilih KB untuk melihat riwayat"}</div></td></tr>
                : riwayatPemusnahan.map(p => (
                  <tr key={p.id}>
                    <td className="mono" style={{ fontSize: 12 }}>{p.nomorBA}</td>
                    <td style={{ fontSize: 12 }}>{p.tanggalBA ? new Date(p.tanggalBA).toLocaleDateString("id-ID") : "-"}</td>
                    <td>{p.namaBarang}</td>
                    <td style={{ textAlign: "right", color: "#ef4444", fontWeight: 600 }}>{Number(p.jumlah).toLocaleString("id-ID")} {p.satuan}</td>
                    <td style={{ fontSize: 12 }}>{p.metodePemusnahan}</td>
                    <td><span className="mono" style={{ fontSize: 11, color: "#6366f1" }}>{formatTx(p.txHash)}</span></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════
  // PAGE: STOCK OPNAME
  // ═══════════════════════════════════════════════
  if (page === "pejabat_opname") return (
    <div>
      <div className="page-header">
        <h1>Stock Opname</h1>
        <p>Rekonsiliasi saldo sistem vs cacah fisik — hasil dicatat on-chain</p>
      </div>
      {alertPesan}{loadingBanner}
      <div className="alert alert-info" style={{ marginBottom: 20 }}>
        <strong>Alur:</strong> Pilih KB → Isi ID sesi → Input saldo sistem dan cacah fisik → Submit.
      </div>
      <div className="two-col" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Form Stock Opname</span></div>
          <form onSubmit={handleOpname}>
            <div className="two-col">
              <div className="form-group"><label>Kawasan Berikat</label>
                <select value={selectedOpnameKB}
                  onChange={e => {
                    setSelectedOpnameKB(e.target.value);
                    setFormOpname({ ...formOpname, idKB: e.target.value });
                  }} required>
                  <option value="">-- Pilih KB --</option>
                  {daftarKB.map(kb => (
                    <option key={kb.id} value={kb.id}>{kb.id} · {kb.namaPerusahaan}</option>
                  ))}
                </select>
              </div>
              <div className="form-group"><label>ID Sesi Opname</label>
                <input placeholder="OPNAME-2026-001" value={formOpname.idOpname}
                  onChange={e => setFormOpname({ ...formOpname, idOpname: e.target.value })} required />
              </div>
            </div>
            <div className="form-group">
              <label>Item Inventaris</label>
              {formOpname.items.map((item, i) => (
                <div key={i} style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "10px 12px", marginBottom: 8 }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <input placeholder="Kode internal" style={{ flex: 2 }} value={item.kodeBarangInternal}
                      onChange={e => { const a = [...formOpname.items]; a[i].kodeBarangInternal = e.target.value; setFormOpname({ ...formOpname, items: a }); }} required />
                    <input placeholder="Kode HS" style={{ flex: 1 }} value={item.kodeHS}
                      onChange={e => { const a = [...formOpname.items]; a[i].kodeHS = e.target.value; setFormOpname({ ...formOpname, items: a }); }} required />
                    <input placeholder="Nama barang" style={{ flex: 3 }} value={item.namaBarang}
                      onChange={e => { const a = [...formOpname.items]; a[i].namaBarang = e.target.value; setFormOpname({ ...formOpname, items: a }); }} required />
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, color: "#64748b" }}>Saldo Sistem</label>
                      <input type="number" min="0" value={item.saldoSistem}
                        onChange={e => { const a = [...formOpname.items]; a[i].saldoSistem = e.target.value; setFormOpname({ ...formOpname, items: a }); }} required />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, color: "#64748b" }}>Cacah Fisik</label>
                      <input type="number" min="0" value={item.saldoFisik}
                        onChange={e => { const a = [...formOpname.items]; a[i].saldoFisik = e.target.value; setFormOpname({ ...formOpname, items: a }); }} required />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, color: "#64748b" }}>Selisih</label>
                      <input readOnly
                        style={{ background: "#f8fafc", fontWeight: 600, color: Number(item.saldoFisik) - Number(item.saldoSistem) < 0 ? "#dc2626" : "#16a34a" }}
                        value={item.saldoFisik && item.saldoSistem ? Number(item.saldoFisik) - Number(item.saldoSistem) : ""} />
                    </div>
                    {i > 0 && (
                      <button type="button" style={{ background: "#fee2e2", border: "none", borderRadius: 4, padding: "6px 10px", cursor: "pointer", marginTop: 16 }}
                        onClick={() => setFormOpname({ ...formOpname, items: formOpname.items.filter((_, j) => j !== i) })}>✕</button>
                    )}
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }}
                onClick={() => setFormOpname({ ...formOpname, items: [...formOpname.items, { kodeBarangInternal: "", kodeHS: "", namaBarang: "", saldoSistem: "", saldoFisik: "" }] })}>
                + Tambah Item
              </button>
            </div>
            <div className="form-group"><label>Catatan</label>
              <input placeholder="Catatan hasil opname..."
                value={formOpname.catatan}
                onChange={e => setFormOpname({ ...formOpname, catatan: e.target.value })} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={blockchain.isLoading}>
              {blockchain.isLoading ? "Memproses..." : "Submit Stock Opname On-Chain"}
            </button>
          </form>
        </div>

        <div className="table-wrap">
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Riwayat Stock Opname</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <select
              value={selectedOpnameKB}
              style={{ flex: 1, fontSize: 13 }}
              onChange={e => setSelectedOpnameKB(e.target.value)}
            >
              <option value="">-- Pilih KB untuk melihat riwayat --</option>
              {daftarKB.map(kb => (
                <option key={kb.id} value={kb.id}>{kb.id} · {kb.namaPerusahaan}</option>
              ))}
            </select>
            {selectedOpnameKB && (
              <button className="btn btn-outline btn-sm" onClick={() => muatOpname(selectedOpnameKB)}>Refresh</button>
            )}
          </div>
          <table>
            <thead><tr><th>ID Sesi</th><th>Tanggal</th><th>Item</th><th>TX</th></tr></thead>
            <tbody>
              {riwayatOpname.length === 0
                ? <tr><td colSpan={4}><div className="empty">{selectedOpnameKB ? "Belum ada data opname untuk KB ini" : "Pilih KB untuk melihat riwayat"}</div></td></tr>
                : riwayatOpname.map(op => (
                  <tr key={op.id}>
                    <td className="mono" style={{ fontSize: 12 }}>{op.idOpname}</td>
                    <td style={{ fontSize: 12 }}>{op.tanggal ? new Date(op.tanggal).toLocaleDateString("id-ID") : "-"}</td>
                    <td style={{ textAlign: "right" }}>{op.items?.length || 0}</td>
                    <td><span className="mono" style={{ fontSize: 11, color: "#6366f1" }}>{formatTx(op.txHash)}</span></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════
  // PAGE: PERSETUJUAN BOM
  // ═══════════════════════════════════════════════
  if (page === "pejabat_bom") {
    const statusBadge = (status: string) => {
      if (status === "disetujui") return <span className="badge badge-active">Disetujui</span>;
      if (status === "ditolak")   return <span style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 12, padding: "2px 10px", fontSize: 11, fontWeight: 500 }}>Ditolak</span>;
      return <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 12, padding: "2px 10px", fontSize: 11, fontWeight: 500 }}>Menunggu persetujuan</span>;
    };

    return (
      <div>
        <div className="page-header">
          <h1>Persetujuan Formula BOM</h1>
          <p>Tinjau dan setujui atau tolak formula produksi (BOM) yang diajukan oleh perusahaan KB</p>
        </div>
        {alertPesan}{loadingBanner}

        {/* Pilih KB */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">Pilih Kawasan Berikat</span></div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label>Kawasan Berikat</label>
              <select value={bomSelectedKB}
                onChange={e => {
                  setBomSelectedKB(e.target.value);
                  setBomDetail(null);
                  setBomMenunggu([]);
                  if (e.target.value) muatBOMMenunggu(e.target.value);
                }}>
                <option value="">-- Pilih KB --</option>
                {daftarKB.map(kb => (
                  <option key={kb.id} value={kb.id}>{kb.id} · {kb.namaPerusahaan}</option>
                ))}
              </select>
            </div>
            <button className="btn btn-outline" style={{ marginBottom: 0 }}
              onClick={() => bomSelectedKB && muatBOMMenunggu(bomSelectedKB)}>
              Refresh
            </button>
          </div>
        </div>

        {bomSelectedKB && (
          <div className="two-col" style={{ alignItems: "start" }}>

            {/* ── Daftar BOM menunggu ── */}
            <div>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <span className="card-title">Antrian Menunggu Persetujuan</span>
                  {bomMenunggu.length > 0 && (
                    <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 12, padding: "2px 10px", fontSize: 11, fontWeight: 600 }}>
                      {bomMenunggu.length} formula
                    </span>
                  )}
                </div>
                {bomMenunggu.length === 0 ? (
                  <div className="empty">
                    <div className="empty-icon">✓</div>
                    Tidak ada BOM yang menunggu persetujuan
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {bomMenunggu.map(bom => (
                      <div key={bom.id} style={{
                        border: bomDetail?.id === bom.id ? "1px solid #378ADD" : "0.5px solid var(--color-border-tertiary)",
                        borderRadius: 10, padding: "12px 14px",
                        background: bomDetail?.id === bom.id ? "#E6F1FB22" : "var(--color-background-primary)",
                        cursor: "pointer",
                      }}
                        onClick={() => setBomDetail(bomDetail?.id === bom.id ? null : bom)}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{bom.kodeFormula} <span style={{ color: "#64748b", fontWeight: 400 }}>· {bom.versi}</span></div>
                            <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>{bom.namaProduk}</div>
                          </div>
                          {statusBadge(bom.statusBOM || "menunggu_persetujuan")}
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>
                          {bom.komposisi?.length || 0} bahan baku · HS {bom.kodeHSProduk}
                        </div>
                        <div style={{ fontSize: 11, color: "#378ADD", marginTop: 4 }}>
                          {bomDetail?.id === bom.id ? "▲ Klik untuk tutup" : "▼ Klik untuk tinjau"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Panel detail + approve/tolak ── */}
            <div>
              {!bomDetail ? (
                <div className="card" style={{ textAlign: "center", padding: "40px 20px", color: "#94a3b8" }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>◈</div>
                  <div>Pilih formula BOM di sebelah kiri untuk melihat detail dan mengambil keputusan</div>
                </div>
              ) : (
                <div className="card" style={{ borderTop: "3px solid #BA7517" }}>
                  <div className="card-header">
                    <span className="card-title">Tinjauan: {bomDetail.kodeFormula}</span>
                    <button className="btn btn-outline btn-sm" onClick={() => setBomDetail(null)}>✕</button>
                  </div>

                  {/* Info produk */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                    {[
                      ["Produk Jadi", bomDetail.namaProduk],
                      ["Kode HS Produk", bomDetail.kodeHSProduk],
                      ["Versi Formula", bomDetail.versi],
                      ["Diajukan oleh KB", bomDetail.idKB],
                      ["Toleransi Scrap", bomDetail.toleransiScrapPersen != null ? `${bomDetail.toleransiScrapPersen}%` : "—"],
                      ["Toleransi Wasted", bomDetail.toleransiWastedPersen != null ? `${bomDetail.toleransiWastedPersen}%` : "—"],
                    ].map(([lbl, val]) => (
                      <div key={lbl} style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: "8px 12px" }}>
                        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>{lbl}</div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Tabel komposisi */}
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "#334155" }}>
                    Komposisi bahan baku (per 1 unit produk jadi)
                  </div>
                  <div style={{ overflowX: "auto", marginBottom: 16 }}>
                    <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "var(--color-background-secondary)" }}>
                          {["Kode Internal", "Nama Bahan", "Kode HS", "Rasio", "Satuan"].map(h => (
                            <th key={h} style={{ padding: "7px 10px", textAlign: h === "Rasio" ? "right" : "left", borderBottom: "0.5px solid var(--color-border-tertiary)", fontWeight: 500, color: "#475569" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(bomDetail.komposisi || []).map((k: any, i: number) => (
                          <tr key={i} style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                            <td style={{ padding: "7px 10px", fontFamily: "monospace", fontSize: 11 }}>{k.kodeBarangInternal}</td>
                            <td style={{ padding: "7px 10px" }}>{k.namaBarang}</td>
                            <td style={{ padding: "7px 10px", fontFamily: "monospace", fontSize: 11 }}>{k.kodeHS}</td>
                            <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600 }}>{k.rasio}</td>
                            <td style={{ padding: "7px 10px", color: "#64748b" }}>{k.satuan}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Zona keputusan */}
                  <div style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: "#334155" }}>
                      Keputusan Pejabat BC
                    </div>

                    {/* Setujui */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>
                        Menyetujui berarti formula ini akan divalidasi on-chain dan bisa langsung digunakan operator KB untuk memulai batch produksi.
                      </div>
                      <button
                        className="btn btn-primary"
                        style={{ background: "#16a34a", borderColor: "#15803d", width: "100%" }}
                        disabled={blockchain.isLoading}
                        onClick={() => handleApproveBOM(bomDetail)}
                      >
                        {blockchain.isLoading ? "Memproses..." : "✓ Setujui & Validasi On-Chain"}
                      </button>
                    </div>

                    <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 11, marginBottom: 14 }}>— atau —</div>

                    {/* Tolak */}
                    <div>
                      <div className="form-group" style={{ marginBottom: 8 }}>
                        <label style={{ fontSize: 11 }}>Alasan penolakan (wajib diisi sebelum menolak)</label>
                        <input
                          placeholder="Contoh: Rasio konversi tidak wajar, perlu dilampirkan data uji produksi"
                          value={alasanTolak[bomDetail.id] ?? ""}
                          onChange={e => setAlasanTolak(prev => ({ ...prev, [bomDetail.id]: e.target.value }))}
                          style={{ fontSize: 13 }}
                        />
                      </div>
                      <button
                        className="btn btn-outline"
                        style={{ borderColor: "#dc2626", color: "#dc2626", width: "100%" }}
                        onClick={() => handleTolakBOM(bomDetail)}
                      >
                        ✕ Tolak — Minta Operator Revisi
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
}
