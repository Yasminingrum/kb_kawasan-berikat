// PortalOperatorKB.tsx — v4
// Perubahan dari v3:
//   - Integrasi Katalog Barang: semua form barang pakai ItemPicker
//   - ItemPicker: dropdown pilih dari katalog + ketik kode + auto-fill nama/HS/satuan
//   - Auto-register ke katalog saat submit (barang baru otomatis tersimpan)
//   - Katalog di-load sekali saat KB dipilih, di-cache di state

import { useState, useEffect, useCallback } from "react";
import type { Page } from "../App";
import type { BlockchainState } from "../hooks/useBlockchain";
import {
  getBarangMasuk, getBarangKeluar,
  getHasilProduksi, getWIPAktif, getScrap,
  ajukanBOM, getBOM,
} from "../service/firestoreService";
import {
  getKatalog, autoRegisterKatalog, autoRegisterKatalogBatch,
  type KatalogItem,
} from "../service/katalogService";
import ItemPicker from "../components/ItemPicker";
import {
  bcGetInfoKontrak, bcGetInfoKB, bcGetSaldoBarang,
} from "../service/blockchainService";
import { hashString } from "../service/hashService";
import LaporanKB from "./LaporanKB";

interface Props {
  page: Page;
  selectedKBId: string;
  setSelectedKBId: (id: string) => void;
  walletAddress: string;
  blockchain: BlockchainState;
}

interface SaldoItem {
  kodeBarang: string;
  kodeBarangHash: string;
  saldo: bigint;
}

export default function PortalOperatorKB({
  page, selectedKBId, walletAddress, blockchain,
}: Props) {
  const [namaKB, setNamaKB]       = useState("");
  const [izinAktif, setIzinAktif] = useState(true);
  const [saldoList, setSaldoList] = useState<SaldoItem[]>([]);
  const [riwayatMasuk, setRiwayatMasuk]   = useState<any[]>([]);
  const [riwayatKeluar, setRiwayatKeluar] = useState<any[]>([]);
  const [riwayatScrap, setRiwayatScrap]   = useState<any[]>([]);
  const [wipAktif, setWipAktif]           = useState<any[]>([]);
  const [pesan, setPesan] = useState<{ tipe: "success" | "error"; teks: string } | null>(null);

  // ── Katalog Barang (v4) ───────────────────────────────────
  const [katalog, setKatalog] = useState<KatalogItem[]>([]);

  const muatKatalog = useCallback(async () => {
    if (!selectedKBId) return;
    try {
      const items = await getKatalog(selectedKBId);
      setKatalog(items);
    } catch {}
  }, [selectedKBId]);

  // ── Form states ──────────────────────────────────────────────

  const [formMasuk, setFormMasuk] = useState({
    jenisDokumen: "PIB" as "PIB" | "TLDDP",
    nomorPIB: "", tanggalPIB: "",
    nomorTLDDP: "", tanggalTLDDP: "",
    namaBarang: "", kodeHS: "",
    kodeBarangInternal: "",           // v3
    negaraAsal: "",
    jumlah: "", satuan: "kg", nilaiBarang: "",
  });

  const [formKeluar, setFormKeluar] = useState({
    nomorPEB: "", tanggalPEB: "",
    namaBarang: "", kodeHS: "",
    kodeBarangInternal: "",           // v3
    negaraTujuan: "",
    jumlah: "", satuan: "kg", nilaiEkspor: "",
  });

  const [formScrap, setFormScrap] = useState({
    nomorBC25: "", tanggalBC25: "",
    namaBarang: "", kodeHS: "",
    kodeBarangInternal: "",           // v3
    jumlah: "", satuan: "kg",
    tujuanPengeluaran: "",
    nilaiJual: "",
  });

  const [formWIP, setFormWIP] = useState({
    idBatch: "", kodeFormulaBOM: "",
    kodeProdukInternal: "", namaProduk: "",  // v3: kodeProdukInternal + namaProduk
    outputExpected: "",
    bahan: [{ kodeBarangInternal: "", namaBarang: "", jumlah: "", satuan: "kg" }], // v3
  });

  const [formBOMOp, setFormBOMOp] = useState({
    kodeFormula: "", namaProduk: "",
    kodeHSProduk: "", versi: "v1",
    toleransiScrapPersen: "", toleransiWastedPersen: "",
    komposisi: [{ kodeBarangInternal: "", kodeHS: "", namaBarang: "", rasio: "", satuan: "kg" }],
  });

  const [daftarBOM, setDaftarBOM] = useState<any[]>([]);
  const [bomDetail, setBomDetail] = useState<any | null>(null);
  const [loadingBOM, setLoadingBOM] = useState(false);

  const [formHasil, setFormHasil] = useState({
    idBatch: "", kodeProdukInternal: "",     // v3
    namaBarangJadi: "", kodeHS: "",          // v3: tambah kodeHS
    jumlahOutput: "", satuan: "pcs",
    jumlahScrap: "", jumlahWasted: "",       // v3
    bahan: [{ kodeBarangInternal: "", namaBarang: "", jumlah: "" }], // v3
  });

  // ── Helpers ──────────────────────────────────────────────────

  const tampilPesan = (tipe: "success" | "error", teks: string) => {
    setPesan({ tipe, teks });
    setTimeout(() => setPesan(null), 6000);
  };

  const formatTx = (hash: string) =>
    hash === "pending" ? "⏳" : `${hash.slice(0, 10)}...${hash.slice(-6)}`;

  // ── Data loaders ─────────────────────────────────────────────

  const muatInfoKB = useCallback(async () => {
    if (!selectedKBId || !blockchain.ready) return;
    try {
      const [info, kontrak] = await Promise.all([
        bcGetInfoKB(selectedKBId),
        bcGetInfoKontrak(selectedKBId),
      ]);
      setIzinAktif(kontrak.izinAktif);
      setNamaKB(info.namaPerusahaan || selectedKBId);
    } catch {}
  }, [selectedKBId, blockchain.ready]);

  const muatSaldo = useCallback(async () => {
    if (!selectedKBId || !blockchain.ready) return;
    try {
      const masuk = await getBarangMasuk(selectedKBId, { limit: 50 });
      const kodeSet = new Map<string, string>();
      masuk.forEach(doc => {
        // v3: kodeBarangInternal sebagai key, bukan kodeHS:namaBarang
        if (doc.kodeBarangInternal) {
          kodeSet.set(doc.kodeBarangInternal, hashString(doc.kodeBarangInternal));
        }
      });
      const items: SaldoItem[] = [];
      for (const [key, h] of kodeSet) {
        const saldo = await bcGetSaldoBarang(selectedKBId, h);
        items.push({ kodeBarang: key, kodeBarangHash: h, saldo });
      }
      setSaldoList(items.filter(i => i.saldo > 0n));
    } catch {}
  }, [selectedKBId, blockchain.ready]);

  const muatRiwayat = useCallback(async () => {
    if (!selectedKBId) return;
    try {
      const [masuk, keluar, wip, scrap] = await Promise.all([
        getBarangMasuk(selectedKBId, { limit: 10 }),
        getBarangKeluar(selectedKBId, { limit: 10 }),
        getWIPAktif(selectedKBId),
        getScrap(selectedKBId, { limit: 10 }),  // v3
      ]);
      setRiwayatMasuk(masuk);
      setRiwayatKeluar(keluar);
      setWipAktif(wip);
      setRiwayatScrap(scrap);
    } catch {}
  }, [selectedKBId]);

  const muatDaftarBOM = useCallback(async () => {
    if (!selectedKBId) return;
    setLoadingBOM(true);
    try {
      const list = await getBOM(selectedKBId);
      setDaftarBOM(list);
    } catch {} finally { setLoadingBOM(false); }
  }, [selectedKBId]);

  const handleAjukanBOM = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKBId) { tampilPesan("error", "Pilih KB terlebih dahulu."); return; }
    try {
      // v4: auto-register semua bahan komposisi ke katalog sekaligus
      await autoRegisterKatalogBatch(selectedKBId,
        formBOMOp.komposisi
          .filter(k => k.kodeBarangInternal.trim() !== "")
          .map(k => ({
            kodeBarangInternal: k.kodeBarangInternal,
            namaBarang:         k.namaBarang,
            kodeHS:             k.kodeHS,
            satuan:             k.satuan,
            jenisBarang:        "bahan_baku" as const,
          }))
      );
      // v4: auto-register produk jadi ke katalog
      await autoRegisterKatalog(selectedKBId, {
        kodeBarangInternal: formBOMOp.namaProduk.replace(/\s+/g, "-").toUpperCase(), // fallback jika tidak ada kode produk di BOM
        namaBarang:         formBOMOp.namaProduk,
        kodeHS:             formBOMOp.kodeHSProduk,
        satuan:             "pcs",
        jenisBarang:        "produk_jadi",
      });
      await ajukanBOM({
        idKB: selectedKBId,
        kodeFormula: formBOMOp.kodeFormula,
        namaProduk: formBOMOp.namaProduk,
        kodeHSProduk: formBOMOp.kodeHSProduk,
        versi: formBOMOp.versi,
        toleransiScrapPersen: formBOMOp.toleransiScrapPersen ? Number(formBOMOp.toleransiScrapPersen) : undefined,
        toleransiWastedPersen: formBOMOp.toleransiWastedPersen ? Number(formBOMOp.toleransiWastedPersen) : undefined,
        komposisi: formBOMOp.komposisi.map(k => ({
          kodeBarangInternal: k.kodeBarangInternal,
          namaBarang: k.namaBarang,
          kodeHS: k.kodeHS,
          rasio: Number(k.rasio),
          satuan: k.satuan,
        })),
        validasiOleh: walletAddress,
        tanggalValidasi: new Date().toISOString(),
      });
      tampilPesan("success", `✅ BOM "${formBOMOp.kodeFormula}" diajukan ke Pejabat BC untuk persetujuan.`);
      setFormBOMOp({ kodeFormula: "", namaProduk: "", kodeHSProduk: "", versi: "v1", toleransiScrapPersen: "", toleransiWastedPersen: "", komposisi: [{ kodeBarangInternal: "", kodeHS: "", namaBarang: "", rasio: "", satuan: "kg" }] });
      muatDaftarBOM();
      muatKatalog(); // v4: refresh katalog setelah BOM diajukan
    } catch (err: any) {
      tampilPesan("error", err?.message ?? "Gagal mengajukan BOM");
    }
  };

  useEffect(() => {
    muatInfoKB();
    muatSaldo();
    muatRiwayat();
    muatDaftarBOM();
    muatKatalog(); // v4: load katalog barang
  }, [muatInfoKB, muatSaldo, muatRiwayat, muatDaftarBOM, muatKatalog]);

  // ── Shared UI ────────────────────────────────────────────────

  const headerKB = (
    <div style={{
      background: "#f0f4ff", border: "0.5px solid #bfdbfe",
      borderRadius: 8, padding: "10px 16px", marginBottom: 20,
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <div>
        <div style={{ fontSize: 11, color: "#1e40af" }}>Kawasan Berikat</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#0c2d6b" }}>
          {selectedKBId} · {namaKB}
        </div>
      </div>
      <span className={`badge ${izinAktif ? "badge-active" : "badge-frozen"}`} style={{ marginLeft: "auto" }}>
        {izinAktif ? "Aktif" : "Dibekukan"}
      </span>
    </div>
  );

  const alertPesan = pesan && (
    <div className={`alert alert-${pesan.tipe}`} style={{ marginBottom: 16 }}>{pesan.teks}</div>
  );

  const loadingBanner = blockchain.isLoading && (
    <div style={{
      background: "#eff6ff", border: "1px solid #93c5fd",
      borderRadius: 8, padding: "10px 16px", marginBottom: 16,
      color: "#1d4ed8", fontSize: 14,
    }}>
      ⏳ Memproses transaksi... Tunggu konfirmasi MetaMask dan blockchain.
    </div>
  );

  // ═══════════════════════════════════════════════
  // PAGE: BERANDA
  // ═══════════════════════════════════════════════
  if (page === "kb_beranda") return (
    <div>
      <div className="page-header">
        <h1>Beranda KB</h1>
        <p>Ringkasan inventaris Kawasan Berikat Anda</p>
      </div>
      {headerKB}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Jenis barang (saldo &gt; 0)</div>
          <div className="value">{saldoList.length}</div>
          <div className="sub">kode aktif di KB ini</div>
        </div>
        <div className="stat-card">
          <div className="label">Barang masuk (10 terakhir)</div>
          <div className="value">{riwayatMasuk.length}</div>
          <div className="sub">transaksi PIB/TLDDP</div>
        </div>
        <div className="stat-card">
          <div className="label">WIP aktif</div>
          <div className="value">{wipAktif.length}</div>
          <div className="sub">batch dalam proses</div>
        </div>
        <div className="stat-card">
          <div className="label">Scrap tercatat</div>
          <div className="value">{riwayatScrap.length}</div>
          <div className="sub">transaksi BC 2.5</div>
        </div>
        <div className="stat-card">
          <div className="label">Status izin</div>
          <div className="value" style={{ fontSize: 14, marginTop: 4, color: izinAktif ? "#16a34a" : "#d97706" }}>
            ● {izinAktif ? "Aktif" : "Dibekukan"}
          </div>
        </div>
      </div>
      {saldoList.length > 0 && (
        <div className="card">
          <div className="card-header"><span className="card-title">Saldo Inventaris (On-Chain)</span></div>
          <div className="table-wrap" style={{ margin: 0, border: "none" }}>
            <table>
              <thead><tr><th>Kode Barang Internal</th><th style={{ textAlign: "right" }}>Saldo</th></tr></thead>
              <tbody>
                {saldoList.map(item => (
                  <tr key={item.kodeBarangHash}>
                    <td><span className="mono" style={{ background: "#f0f4ff", color: "#0c2d6b", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>{item.kodeBarang}</span></td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{item.saldo.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  // ═══════════════════════════════════════════════
  // PAGE: JENIS BARANG
  // ═══════════════════════════════════════════════
  if (page === "kb_barang") {
    // Kumpulkan semua jenis barang unik dari riwayat masuk
    // dan gabungkan dengan saldo on-chain
    const jenisBarangMap = new Map<string, {
      kodeBarangInternal: string;
      namaBarang: string;
      kodeHS: string;
      satuan: string;
      totalMasuk: number;
      saldo: bigint;
    }>();

    riwayatMasuk.forEach((doc: any) => {
      const kode = doc.kodeBarangInternal;
      if (!kode) return;
      if (!jenisBarangMap.has(kode)) {
        jenisBarangMap.set(kode, {
          kodeBarangInternal: kode,
          namaBarang: doc.namaBarang || "-",
          kodeHS: doc.kodeHS || "-",
          satuan: doc.satuan || "-",
          totalMasuk: 0,
          saldo: 0n,
        });
      }
      const entry = jenisBarangMap.get(kode)!;
      entry.totalMasuk += Number(doc.jumlah) || 0;
    });

    // Patch saldo dari on-chain
    saldoList.forEach(s => {
      if (jenisBarangMap.has(s.kodeBarang)) {
        jenisBarangMap.get(s.kodeBarang)!.saldo = s.saldo;
      }
    });

    const jenisBarangList = Array.from(jenisBarangMap.values());

    return (
      <div>
        <div className="page-header">
          <h1>Jenis Barang</h1>
          <p>Daftar seluruh jenis bahan baku yang pernah masuk ke {selectedKBId}</p>
        </div>
        {headerKB}

        {/* Stat ringkasan */}
        <div className="stat-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <div className="label">Total jenis barang</div>
            <div className="value">{jenisBarangList.length}</div>
            <div className="sub">kode barang unik</div>
          </div>
          <div className="stat-card">
            <div className="label">Saldo aktif (&gt; 0)</div>
            <div className="value">{jenisBarangList.filter(b => b.saldo > 0n).length}</div>
            <div className="sub">jenis masih ada stok</div>
          </div>
          <div className="stat-card">
            <div className="label">Stok habis</div>
            <div className="value">{jenisBarangList.filter(b => b.saldo === 0n).length}</div>
            <div className="sub">jenis saldo nol</div>
          </div>
        </div>

        {jenisBarangList.length === 0 ? (
          <div className="card">
            <div className="empty" style={{ padding: "40px 0" }}>
              Belum ada data barang. Catat barang masuk terlebih dahulu.
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Katalog Barang — {selectedKBId}</span>
              <span style={{ fontSize: 12, color: "#64748b" }}>
                Saldo diambil langsung dari blockchain
              </span>
            </div>
            <div className="table-wrap" style={{ margin: 0, border: "none" }}>
              <table>
                <thead>
                  <tr>
                    <th>Kode Internal</th>
                    <th>Nama Barang</th>
                    <th>Kode HS</th>
                    <th style={{ textAlign: "right" }}>Total Masuk</th>
                    <th style={{ textAlign: "right" }}>Saldo (On-Chain)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {jenisBarangList.map(b => {
                    const adaSaldo = b.saldo > 0n;
                    return (
                      <tr key={b.kodeBarangInternal}>
                        <td>
                          <span className="mono" style={{
                            background: "#f0f4ff", color: "#0c2d6b",
                            padding: "2px 8px", borderRadius: 4, fontSize: 12,
                          }}>
                            {b.kodeBarangInternal}
                          </span>
                        </td>
                        <td style={{ fontWeight: 500 }}>{b.namaBarang}</td>
                        <td>
                          <span className="mono" style={{ fontSize: 12, color: "#475569" }}>
                            {b.kodeHS}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {b.totalMasuk.toLocaleString("id-ID")} <span style={{ color: "#94a3b8", fontSize: 12 }}>{b.satuan}</span>
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 600, color: adaSaldo ? "#0c2d6b" : "#94a3b8" }}>
                          {b.saldo.toLocaleString()} <span style={{ color: "#94a3b8", fontSize: 12 }}>{b.satuan}</span>
                        </td>
                        <td>
                          <span style={{
                            display: "inline-block",
                            padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600,
                            background: adaSaldo ? "#dcfce7" : "#f1f5f9",
                            color: adaSaldo ? "#16a34a" : "#94a3b8",
                          }}>
                            {adaSaldo ? "● Tersedia" : "○ Habis"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Info catatan */}
        <div style={{
          marginTop: 16, padding: "10px 16px", background: "#eff6ff",
          border: "1px solid #bfdbfe", borderRadius: 8, fontSize: 13, color: "#1e40af",
        }}>
          ℹ️ Saldo on-chain dihitung dari selisih barang masuk dikurangi pemakaian produksi dan pengeluaran.
          Data barang baru akan muncul setelah transaksi Barang Masuk pertama dicatat.
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // PAGE: BARANG MASUK
  // ═══════════════════════════════════════════════
  if (page === "kb_masuk") {
    const handleBarangMasuk = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!izinAktif) { tampilPesan("error", "Izin KB sedang dibekukan."); return; }
      try {
        // v4: auto-register ke katalog sebelum submit (barang baru otomatis tersimpan)
        await autoRegisterKatalog(selectedKBId, {
          kodeBarangInternal: formMasuk.kodeBarangInternal,
          namaBarang:         formMasuk.namaBarang,
          kodeHS:             formMasuk.kodeHS,
          satuan:             formMasuk.satuan,
          jenisBarang:        "bahan_baku",
        });

        const result = await blockchain.submitBarangMasuk({
          idKB: selectedKBId,
          jenisDokumen: formMasuk.jenisDokumen,
          // v3: field per jenis
          nomorPIB:     formMasuk.jenisDokumen === "PIB"   ? formMasuk.nomorPIB   : undefined,
          tanggalPIB:   formMasuk.jenisDokumen === "PIB"   ? formMasuk.tanggalPIB : undefined,
          nomorTLDDP:   formMasuk.jenisDokumen === "TLDDP" ? formMasuk.nomorTLDDP   : undefined,
          tanggalTLDDP: formMasuk.jenisDokumen === "TLDDP" ? formMasuk.tanggalTLDDP : undefined,
          namaBarang:         formMasuk.namaBarang,
          kodeHS:             formMasuk.kodeHS,
          kodeBarangInternal: formMasuk.kodeBarangInternal, // v3
          negaraAsal:         formMasuk.negaraAsal,
          jumlah:             Number(formMasuk.jumlah),
          satuan:             formMasuk.satuan,
          nilaiBarang:        Number(formMasuk.nilaiBarang),
          operatorWallet:     walletAddress,
        });
        tampilPesan("success",
          `✅ Barang masuk dicatat. TX: ${formatTx(result.txHash)} · Block #${result.blockNumber}`
        );
        setFormMasuk({
          jenisDokumen: "PIB",
          nomorPIB: "", tanggalPIB: "", nomorTLDDP: "", tanggalTLDDP: "",
          namaBarang: "", kodeHS: "", kodeBarangInternal: "",
          negaraAsal: "", jumlah: "", satuan: "kg", nilaiBarang: "",
        });
        muatSaldo(); muatRiwayat(); muatKatalog(); // v4: refresh katalog
      } catch {}
    };

    const isPIB = formMasuk.jenisDokumen === "PIB";

    return (
      <div>
        <div className="page-header"><h1>Barang Masuk</h1><p>Catat pemasukan bahan baku impor (PIB) atau dalam negeri (TLDDP)</p></div>
        {headerKB}{alertPesan}{loadingBanner}
        <div className="two-col" style={{ alignItems: "start" }}>
          <div className="card" style={{ maxWidth: 540 }}>
            <div className="card-header"><span className="card-title">Catat Barang Masuk</span></div>
            <form onSubmit={handleBarangMasuk}>

              {/* Jenis dokumen */}
              <div className="form-group">
                <label>Jenis Dokumen</label>
                <select value={formMasuk.jenisDokumen}
                  onChange={e => setFormMasuk({ ...formMasuk, jenisDokumen: e.target.value as "PIB" | "TLDDP" })}>
                  <option value="PIB">PIB — Pemberitahuan Impor Barang</option>
                  <option value="TLDDP">TLDDP — Dari Tempat Lain Dalam Negeri</option>
                </select>
              </div>

              {/* Nomor & tanggal dokumen — kondisional per jenis */}
              <div className="two-col">
                <div className="form-group">
                  <label>{isPIB ? "Nomor PIB" : "Nomor TLDDP"}</label>
                  <input
                    placeholder={isPIB ? "PIB-2026-00123" : "TLDDP-2026-00045"}
                    value={isPIB ? formMasuk.nomorPIB : formMasuk.nomorTLDDP}
                    onChange={e => setFormMasuk(isPIB
                      ? { ...formMasuk, nomorPIB: e.target.value }
                      : { ...formMasuk, nomorTLDDP: e.target.value }
                    )} required />
                </div>
                <div className="form-group">
                  <label>{isPIB ? "Tanggal PIB" : "Tanggal TLDDP"}</label>
                  <input type="date"
                    value={isPIB ? formMasuk.tanggalPIB : formMasuk.tanggalTLDDP}
                    onChange={e => setFormMasuk(isPIB
                      ? { ...formMasuk, tanggalPIB: e.target.value }
                      : { ...formMasuk, tanggalTLDDP: e.target.value }
                    )} required />
                </div>
              </div>

              {/* v4: Identifikasi barang — pakai ItemPicker */}
              <ItemPicker
                katalog={katalog}
                value={{
                  kodeBarangInternal: formMasuk.kodeBarangInternal,
                  namaBarang:         formMasuk.namaBarang,
                  kodeHS:             formMasuk.kodeHS,
                  satuan:             formMasuk.satuan,
                }}
                onChange={v => setFormMasuk({ ...formMasuk, ...v })}
              />

              <div className="form-group">
                <label>Negara Asal</label>
                <input placeholder="Tiongkok"
                  value={formMasuk.negaraAsal}
                  onChange={e => setFormMasuk({ ...formMasuk, negaraAsal: e.target.value })} required />
              </div>

              {/* Detail */}
              <div className="two-col">
                <div className="form-group">
                  <label>Jumlah</label>
                  <input type="number" min="1"
                    value={formMasuk.jumlah}
                    onChange={e => setFormMasuk({ ...formMasuk, jumlah: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Satuan</label>
                  <select value={formMasuk.satuan}
                    onChange={e => setFormMasuk({ ...formMasuk, satuan: e.target.value })}>
                    <option>kg</option><option>meter</option><option>liter</option><option>pcs</option><option>unit</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Nilai Barang (IDR)</label>
                <input type="number" min="0" placeholder="50000000"
                  value={formMasuk.nilaiBarang}
                  onChange={e => setFormMasuk({ ...formMasuk, nilaiBarang: e.target.value })} required />
              </div>

              <button className="btn btn-primary" type="submit" disabled={blockchain.isLoading || !izinAktif}>
                {blockchain.isLoading ? "Memproses..." : "Catat Barang Masuk"}
              </button>
            </form>
          </div>

          <div className="table-wrap">
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>10 Transaksi Terakhir</div>
            <table>
              <thead>
                <tr>
                  <th>No. PIB/TLDDP</th><th>Nama Barang</th>
                  <th>Kode Internal</th>
                  <th style={{ textAlign: "right" }}>Jumlah</th><th>TX</th>
                </tr>
              </thead>
              <tbody>
                {riwayatMasuk.length === 0
                  ? <tr><td colSpan={5}><div className="empty">Belum ada transaksi</div></td></tr>
                  : riwayatMasuk.map(doc => (
                    <tr key={doc.id}>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {doc.jenisDokumen === "PIB" ? doc.nomorPIB : doc.nomorTLDDP}
                      </td>
                      <td>{doc.namaBarang}</td>
                      <td><span className="mono" style={{ fontSize: 11, background: "#f0f4ff", color: "#0c2d6b", padding: "1px 5px", borderRadius: 3 }}>{doc.kodeBarangInternal}</span></td>
                      <td style={{ textAlign: "right" }}>{Number(doc.jumlah).toLocaleString("id-ID")} {doc.satuan}</td>
                      <td><span className="mono" style={{ fontSize: 11, color: "#6366f1" }}>{formatTx(doc.txHash)}</span></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // PAGE: EKSPOR (PEB)
  // ═══════════════════════════════════════════════
  if (page === "kb_ekspor") {
    const handleEkspor = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!izinAktif) { tampilPesan("error", "Izin KB sedang dibekukan."); return; }
      try {
        const result = await blockchain.submitBarangKeluar({
          idKB: selectedKBId,
          jenisDokumen: "PEB",
          nomorPEB:    formKeluar.nomorPEB,
          tanggalPEB:  formKeluar.tanggalPEB,
          namaBarang:         formKeluar.namaBarang,
          kodeHS:             formKeluar.kodeHS,
          kodeBarangInternal: formKeluar.kodeBarangInternal,  // v3
          negaraTujuan:       formKeluar.negaraTujuan,
          jumlah:             Number(formKeluar.jumlah),
          satuan:             formKeluar.satuan,
          nilaiEkspor:        Number(formKeluar.nilaiEkspor),
          operatorWallet:     walletAddress,
        });
        tampilPesan("success", `✅ Ekspor ke ${formKeluar.negaraTujuan} berhasil. TX: ${formatTx(result.txHash)}`);
        setFormKeluar({ nomorPEB: "", tanggalPEB: "", namaBarang: "", kodeHS: "", kodeBarangInternal: "", negaraTujuan: "", jumlah: "", satuan: "kg", nilaiEkspor: "" });
        muatSaldo(); muatRiwayat(); muatKatalog();
      } catch {}
    };

    return (
      <div>
        <div className="page-header"><h1>Ekspor (PEB)</h1><p>Catat pengeluaran barang untuk ekspor</p></div>
        {headerKB}{alertPesan}{loadingBanner}
        <div className="two-col" style={{ alignItems: "start" }}>
          <div className="card" style={{ maxWidth: 540 }}>
            <div className="card-header"><span className="card-title">Catat Pengeluaran Ekspor (PEB)</span></div>
            <form onSubmit={handleEkspor}>
              <div className="two-col">
                <div className="form-group"><label>Nomor PEB</label>
                  <input placeholder="PEB-2026-00456" value={formKeluar.nomorPEB}
                    onChange={e => setFormKeluar({ ...formKeluar, nomorPEB: e.target.value })} required /></div>
                <div className="form-group"><label>Tanggal PEB</label>
                  <input type="date" value={formKeluar.tanggalPEB}
                    onChange={e => setFormKeluar({ ...formKeluar, tanggalPEB: e.target.value })} required /></div>
              </div>

              {/* v4: ItemPicker — produk jadi yang diekspor */}
              <ItemPicker
                katalog={katalog}
                labelKode="Kode Produk Internal"
                value={{
                  kodeBarangInternal: formKeluar.kodeBarangInternal,
                  namaBarang:         formKeluar.namaBarang,
                  kodeHS:             formKeluar.kodeHS,
                  satuan:             formKeluar.satuan,
                }}
                onChange={v => setFormKeluar({ ...formKeluar, ...v })}
              />

              <div className="form-group"><label>Negara Tujuan</label>
                <input placeholder="Jepang" value={formKeluar.negaraTujuan}
                  onChange={e => setFormKeluar({ ...formKeluar, negaraTujuan: e.target.value })} required /></div>
              <div className="two-col">
                <div className="form-group"><label>Jumlah</label>
                  <input type="number" min="1" value={formKeluar.jumlah}
                    onChange={e => setFormKeluar({ ...formKeluar, jumlah: e.target.value })} required /></div>
                <div className="form-group"><label>Satuan</label>
                  <select value={formKeluar.satuan}
                    onChange={e => setFormKeluar({ ...formKeluar, satuan: e.target.value })}>
                    <option>pcs</option><option>kg</option><option>meter</option><option>liter</option>
                  </select></div>
              </div>
              <div className="form-group"><label>Nilai Ekspor (IDR)</label>
                <input type="number" min="0" placeholder="75000000" value={formKeluar.nilaiEkspor}
                  onChange={e => setFormKeluar({ ...formKeluar, nilaiEkspor: e.target.value })} required /></div>
              <button className="btn btn-primary" type="submit" disabled={blockchain.isLoading || !izinAktif}>
                {blockchain.isLoading ? "Memproses..." : "Catat Ekspor"}
              </button>
            </form>
          </div>
          <div className="table-wrap">
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Riwayat Ekspor</div>
            <table>
              <thead><tr><th>No. PEB</th><th>Tgl PEB</th><th>Barang</th><th>Negara</th><th style={{ textAlign: "right" }}>Jumlah</th></tr></thead>
              <tbody>
                {riwayatKeluar.length === 0
                  ? <tr><td colSpan={5}><div className="empty">Belum ada ekspor</div></td></tr>
                  : riwayatKeluar.map(doc => (
                    <tr key={doc.id}>
                      <td className="mono" style={{ fontSize: 12 }}>{doc.nomorPEB}</td>
                      <td style={{ fontSize: 12 }}>{doc.tanggalPEB ? new Date(doc.tanggalPEB).toLocaleDateString("id-ID") : "-"}</td>
                      <td>{doc.namaBarang}</td>
                      <td>{doc.negaraTujuan}</td>
                      <td style={{ textAlign: "right" }}>{Number(doc.jumlah).toLocaleString("id-ID")} {doc.satuan}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // PAGE: SCRAP (BC 2.5) — BARU v3
  // ═══════════════════════════════════════════════
  if (page === "kb_scrap") {
    const handleScrap = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!izinAktif) { tampilPesan("error", "Izin KB sedang dibekukan."); return; }
      try {
        // v4: auto-register barang scrap ke katalog
        await autoRegisterKatalog(selectedKBId, {
          kodeBarangInternal: formScrap.kodeBarangInternal,
          namaBarang:         formScrap.namaBarang,
          kodeHS:             formScrap.kodeHS,
          satuan:             formScrap.satuan,
          jenisBarang:        "scrap",
        });
        const result = await blockchain.submitScrap({
          idKB: selectedKBId,
          nomorBC25:          formScrap.nomorBC25,
          tanggalBC25:        formScrap.tanggalBC25,
          namaBarang:         formScrap.namaBarang,
          kodeHS:             formScrap.kodeHS,
          kodeBarangInternal: formScrap.kodeBarangInternal,
          jumlah:             Number(formScrap.jumlah),
          satuan:             formScrap.satuan,
          tujuanPengeluaran:  formScrap.tujuanPengeluaran,
          nilaiJual:          Number(formScrap.nilaiJual),
          operatorWallet:     walletAddress,
        });
        tampilPesan("success",
          `✅ Scrap BC 2.5 "${formScrap.nomorBC25}" dicatat. TX: ${formatTx(result.txHash)}`
        );
        setFormScrap({
          nomorBC25: "", tanggalBC25: "", namaBarang: "", kodeHS: "",
          kodeBarangInternal: "", jumlah: "", satuan: "kg",
          tujuanPengeluaran: "", nilaiJual: "",
        });
        muatSaldo(); muatRiwayat(); muatKatalog(); // v4
      } catch {}
    };

    return (
      <div>
        <div className="page-header">
          <h1>Scrap (BC 2.5)</h1>
          <p>Catat pengeluaran barang sisa produksi via dokumen BC 2.5</p>
        </div>
        {headerKB}{alertPesan}{loadingBanner}

        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          <strong>Catatan:</strong> Scrap adalah barang sisa produksi yang masih memiliki nilai jual
          dan dikeluarkan ke kawasan pabean lokal. Pengeluaran ini wajib dilengkapi dokumen BC 2.5
          dan akan mengurangi saldo bahan baku secara on-chain.
        </div>

        <div className="two-col" style={{ alignItems: "start" }}>
          <div className="card" style={{ maxWidth: 540 }}>
            <div className="card-header"><span className="card-title">Form Pengeluaran Scrap (BC 2.5)</span></div>
            <form onSubmit={handleScrap}>
              <div className="two-col">
                <div className="form-group"><label>Nomor BC 2.5</label>
                  <input placeholder="BC25-2026-00012" value={formScrap.nomorBC25}
                    onChange={e => setFormScrap({ ...formScrap, nomorBC25: e.target.value })} required /></div>
                <div className="form-group"><label>Tanggal BC 2.5</label>
                  <input type="date" value={formScrap.tanggalBC25}
                    onChange={e => setFormScrap({ ...formScrap, tanggalBC25: e.target.value })} required /></div>
              </div>

              {/* v4: ItemPicker — barang scrap */}
              <ItemPicker
                katalog={katalog}
                labelKode="Kode Barang Scrap"
                value={{
                  kodeBarangInternal: formScrap.kodeBarangInternal,
                  namaBarang:         formScrap.namaBarang,
                  kodeHS:             formScrap.kodeHS,
                  satuan:             formScrap.satuan,
                }}
                onChange={v => setFormScrap({ ...formScrap, ...v })}
              />

              <div className="two-col">
                <div className="form-group"><label>Jumlah</label>
                  <input type="number" min="1" value={formScrap.jumlah}
                    onChange={e => setFormScrap({ ...formScrap, jumlah: e.target.value })} required /></div>
                <div className="form-group"><label>Satuan</label>
                  <select value={formScrap.satuan}
                    onChange={e => setFormScrap({ ...formScrap, satuan: e.target.value })}>
                    <option>kg</option><option>meter</option><option>liter</option><option>pcs</option>
                  </select></div>
              </div>
              <div className="form-group"><label>Tujuan Pengeluaran</label>
                <input placeholder="PT. Daur Ulang Jaya, Surabaya" value={formScrap.tujuanPengeluaran}
                  onChange={e => setFormScrap({ ...formScrap, tujuanPengeluaran: e.target.value })} required /></div>
              <div className="form-group"><label>Nilai Jual Scrap (IDR)</label>
                <input type="number" min="0" placeholder="0 jika tidak dijual" value={formScrap.nilaiJual}
                  onChange={e => setFormScrap({ ...formScrap, nilaiJual: e.target.value })} required /></div>
              <button className="btn btn-primary" type="submit" disabled={blockchain.isLoading || !izinAktif}>
                {blockchain.isLoading ? "Memproses..." : "Catat Pengeluaran Scrap"}
              </button>
            </form>
          </div>

          <div className="table-wrap">
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Riwayat Scrap BC 2.5</div>
            <table>
              <thead>
                <tr>
                  <th>No. BC 2.5</th><th>Tgl</th><th>Barang</th>
                  <th style={{ textAlign: "right" }}>Jumlah</th><th>Tujuan</th><th>TX</th>
                </tr>
              </thead>
              <tbody>
                {riwayatScrap.length === 0
                  ? <tr><td colSpan={6}><div className="empty">Belum ada pencatatan scrap</div></td></tr>
                  : riwayatScrap.map(doc => (
                    <tr key={doc.id}>
                      <td className="mono" style={{ fontSize: 12 }}>{doc.nomorBC25}</td>
                      <td style={{ fontSize: 12 }}>{doc.tanggalBC25 ? new Date(doc.tanggalBC25).toLocaleDateString("id-ID") : "-"}</td>
                      <td>{doc.namaBarang}</td>
                      <td style={{ textAlign: "right" }}>{Number(doc.jumlah).toLocaleString("id-ID")} {doc.satuan}</td>
                      <td style={{ fontSize: 12 }}>{doc.tujuanPengeluaran}</td>
                      <td><span className="mono" style={{ fontSize: 11, color: "#6366f1" }}>{formatTx(doc.txHash)}</span></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // PAGE: PRODUKSI
  // ═══════════════════════════════════════════════
  if (page === "kb_produksi") {
    const handleBuatWIP = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!izinAktif) { tampilPesan("error", "Izin KB sedang dibekukan."); return; }
      try {
        // v4: auto-register semua bahan input ke katalog
        await autoRegisterKatalogBatch(selectedKBId,
          formWIP.bahan
            .filter(b => b.kodeBarangInternal.trim() !== "")
            .map(b => ({
              kodeBarangInternal: b.kodeBarangInternal,
              namaBarang:         b.namaBarang,
              kodeHS:             "",
              satuan:             b.satuan,
              jenisBarang:        "bahan_baku" as const,
            }))
        );
        const result = await blockchain.submitWIP({
          idKB: selectedKBId,
          idBatch: formWIP.idBatch,
          kodeFormulaBOM: formWIP.kodeFormulaBOM,
          inputBahan: formWIP.bahan.map(b => ({
            kodeBarangInternal: b.kodeBarangInternal,
            namaBarang: b.namaBarang,
            jumlah: Number(b.jumlah),
            satuan: b.satuan,
          })),
          outputExpected:     Number(formWIP.outputExpected),
          kodeProdukInternal: formWIP.kodeProdukInternal,
          namaProduk:         formWIP.namaProduk,
          tanggalMulai:       new Date().toISOString(),
          operatorWallet:     walletAddress,
        });
        tampilPesan("success", `✅ Batch "${formWIP.idBatch}" dibuat. TX: ${formatTx(result.txHash)}`);
        setFormWIP({ idBatch: "", kodeFormulaBOM: "", kodeProdukInternal: "", namaProduk: "", outputExpected: "", bahan: [{ kodeBarangInternal: "", namaBarang: "", jumlah: "", satuan: "kg" }] });
        muatRiwayat(); muatKatalog(); // v4
      } catch {}
    };

    const handleHasilProduksi = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        // v4: auto-register produk jadi + bahan terpakai ke katalog
        await autoRegisterKatalog(selectedKBId, {
          kodeBarangInternal: formHasil.kodeProdukInternal,
          namaBarang:         formHasil.namaBarangJadi,
          kodeHS:             formHasil.kodeHS,
          satuan:             formHasil.satuan,
          jenisBarang:        "produk_jadi",
        });
        await autoRegisterKatalogBatch(selectedKBId,
          formHasil.bahan
            .filter(b => b.kodeBarangInternal.trim() !== "")
            .map(b => ({
              kodeBarangInternal: b.kodeBarangInternal,
              namaBarang:         b.namaBarang,
              kodeHS:             "",
              satuan:             "kg",
              jenisBarang:        "bahan_baku" as const,
            }))
        );
        const result = await blockchain.submitHasilProduksi({
          idKB: selectedKBId,
          idBatch:            formHasil.idBatch,
          kodeProdukInternal: formHasil.kodeProdukInternal,  // v3
          namaBarangJadi:     formHasil.namaBarangJadi,
          kodeHS:             formHasil.kodeHS,              // v3
          jumlahOutput:       Number(formHasil.jumlahOutput),
          satuan:             formHasil.satuan,
          jumlahScrap:        formHasil.jumlahScrap ? Number(formHasil.jumlahScrap) : undefined,  // v3
          jumlahWasted:       formHasil.jumlahWasted ? Number(formHasil.jumlahWasted) : undefined, // v3
          bahanTerpakai:      formHasil.bahan.map(b => ({
            kodeBarangInternal: b.kodeBarangInternal,  // v3
            namaBarang: b.namaBarang,
            jumlah: Number(b.jumlah),
          })),
          tanggalSelesai: new Date().toISOString(),
          operatorWallet: walletAddress,
        });
        tampilPesan("success", `✅ Hasil produksi batch "${formHasil.idBatch}" dicatat. TX: ${formatTx(result.txHash)}`);
        setFormHasil({ idBatch: "", kodeProdukInternal: "", namaBarangJadi: "", kodeHS: "", jumlahOutput: "", satuan: "pcs", jumlahScrap: "", jumlahWasted: "", bahan: [{ kodeBarangInternal: "", namaBarang: "", jumlah: "" }] });
        muatSaldo(); muatRiwayat(); muatKatalog(); // v4
      } catch {}
    };

    return (
      <div>
        <div className="page-header"><h1>Proses Produksi</h1><p>Mulai batch produksi (Work In Process) dan catat hasil produksi selesai</p></div>
        {headerKB}{alertPesan}{loadingBanner}
        <div className="two-col" style={{ alignItems: "start" }}>
          {/* Form mulai batch produksi */}
          <div className="card">
            <div className="card-header"><span className="card-title">Mulai Batch Produksi (Work In Process)</span></div>
            <div style={{ fontSize: 12, color: "#64748b", padding: "0 0 12px 0" }}>
              Work In Process (WIP) = barang sedang dalam proses pengerjaan di lantai produksi, belum jadi produk akhir.
            </div>
            <form onSubmit={handleBuatWIP}>
              <div className="form-group"><label>ID Batch</label>
                <input placeholder="BATCH-2026-001" value={formWIP.idBatch}
                  onChange={e => setFormWIP({ ...formWIP, idBatch: e.target.value })} required /></div>

              {/* v4: produk yang akan diproses — pakai ItemPicker */}
              <div className="form-group">
                <label style={{ fontWeight: 600, fontSize: 13, color: "#374151" }}>Produk yang Diproduksi</label>
              </div>
              <ItemPicker
                katalog={katalog}
                labelKode="Kode Produk Internal"
                showKodeHS={false}
                value={{
                  kodeBarangInternal: formWIP.kodeProdukInternal,
                  namaBarang:         formWIP.namaProduk,
                  kodeHS:             "",
                  satuan:             "pcs",
                }}
                onChange={v => setFormWIP({ ...formWIP, kodeProdukInternal: v.kodeBarangInternal, namaProduk: v.namaBarang })}
              />

              <div className="form-group"><label>Kode Formula BOM</label>
                <input placeholder="BOM-KAOS-v1" value={formWIP.kodeFormulaBOM}
                  onChange={e => setFormWIP({ ...formWIP, kodeFormulaBOM: e.target.value })} required /></div>
              <div className="form-group"><label>Output Expected (unit)</label>
                <input type="number" min="1" placeholder="1000" value={formWIP.outputExpected}
                  onChange={e => setFormWIP({ ...formWIP, outputExpected: e.target.value })} required /></div>

              {/* v4: Bahan baku — setiap baris pakai ItemPicker */}
              <div className="form-group">
                <label style={{ fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 8, display: "block" }}>
                  Bahan Baku Input
                </label>
                {formWIP.bahan.map((b, i) => (
                  <div key={i} style={{
                    border: "1px solid #e2e8f0", borderRadius: 8,
                    padding: "12px", marginBottom: 10, position: "relative",
                  }}>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>Bahan #{i + 1}</div>
                    <ItemPicker
                      katalog={katalog}
                      labelKode={`Kode Bahan #${i + 1}`}
                      showSatuan={true}
                      value={{
                        kodeBarangInternal: b.kodeBarangInternal,
                        namaBarang:         b.namaBarang,
                        kodeHS:             "",
                        satuan:             b.satuan,
                      }}
                      onChange={v => {
                        const a = [...formWIP.bahan];
                        a[i] = { ...a[i], kodeBarangInternal: v.kodeBarangInternal, namaBarang: v.namaBarang, satuan: v.satuan };
                        setFormWIP({ ...formWIP, bahan: a });
                      }}
                    />
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Jumlah</label>
                      <input type="number" placeholder="Jumlah" value={b.jumlah}
                        onChange={e => { const a = [...formWIP.bahan]; a[i].jumlah = e.target.value; setFormWIP({ ...formWIP, bahan: a }); }} required />
                    </div>
                    {i > 0 && (
                      <button type="button"
                        style={{ position: "absolute", top: 8, right: 8, background: "#fee2e2", border: "none", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 12 }}
                        onClick={() => setFormWIP({ ...formWIP, bahan: formWIP.bahan.filter((_, j) => j !== i) })}>
                        ✕ Hapus
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }}
                  onClick={() => setFormWIP({ ...formWIP, bahan: [...formWIP.bahan, { kodeBarangInternal: "", namaBarang: "", jumlah: "", satuan: "kg" }] })}>
                  + Tambah Bahan
                </button>
              </div>
              <button className="btn btn-primary" type="submit" disabled={blockchain.isLoading || !izinAktif}>
                {blockchain.isLoading ? "Memproses..." : "Buat Batch WIP"}
              </button>
            </form>
          </div>

          {/* Form Hasil Produksi */}
          <div>
            <div className="card">
              <div className="card-header"><span className="card-title">Catat Hasil Produksi Selesai</span></div>
              <form onSubmit={handleHasilProduksi}>
                <div className="form-group"><label>ID Batch WIP</label>
                  <select value={formHasil.idBatch}
                    onChange={e => setFormHasil({ ...formHasil, idBatch: e.target.value })} required>
                    <option value="">-- Pilih batch aktif --</option>
                    {wipAktif.map(w => <option key={w.id} value={w.idBatch}>{w.idBatch}</option>)}
                  </select></div>

                {/* v4: produk jadi pakai ItemPicker */}
                <ItemPicker
                  katalog={katalog}
                  labelKode="Kode Produk Jadi"
                  value={{
                    kodeBarangInternal: formHasil.kodeProdukInternal,
                    namaBarang:         formHasil.namaBarangJadi,
                    kodeHS:             formHasil.kodeHS,
                    satuan:             formHasil.satuan,
                  }}
                  onChange={v => setFormHasil({
                    ...formHasil,
                    kodeProdukInternal: v.kodeBarangInternal,
                    namaBarangJadi:     v.namaBarang,
                    kodeHS:             v.kodeHS,
                    satuan:             v.satuan,
                  })}
                />

                <div className="two-col">
                  <div className="form-group"><label>Jumlah Output</label>
                    <input type="number" min="1" value={formHasil.jumlahOutput}
                      onChange={e => setFormHasil({ ...formHasil, jumlahOutput: e.target.value })} required /></div>
                  <div className="form-group"><label>Satuan</label>
                    <select value={formHasil.satuan}
                      onChange={e => setFormHasil({ ...formHasil, satuan: e.target.value })}>
                      <option>pcs</option><option>unit</option><option>kg</option><option>meter</option>
                    </select></div>
                </div>
                {/* v3: jumlah scrap & wasted dari batch ini */}
                <div className="two-col">
                  <div className="form-group">
                    <label>Jumlah Scrap dari Batch (opsional)</label>
                    <input type="number" min="0" placeholder="0" value={formHasil.jumlahScrap}
                      onChange={e => setFormHasil({ ...formHasil, jumlahScrap: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Jumlah Wasted dari Batch (opsional)</label>
                    <input type="number" min="0" placeholder="0" value={formHasil.jumlahWasted}
                      onChange={e => setFormHasil({ ...formHasil, jumlahWasted: e.target.value })} />
                  </div>
                </div>
                {/* v4: Bahan terpakai — ItemPicker per bahan */}
                <div className="form-group">
                  <label style={{ fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 8, display: "block" }}>
                    Bahan Baku Terpakai
                  </label>
                  {formHasil.bahan.map((b, i) => (
                    <div key={i} style={{
                      border: "1px solid #e2e8f0", borderRadius: 8,
                      padding: "12px", marginBottom: 10, position: "relative",
                    }}>
                      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>Bahan #{i + 1}</div>
                      <ItemPicker
                        katalog={katalog}
                        labelKode={`Kode Bahan #${i + 1}`}
                        showKodeHS={false}
                        showSatuan={false}
                        value={{
                          kodeBarangInternal: b.kodeBarangInternal,
                          namaBarang:         b.namaBarang,
                          kodeHS:             "",
                          satuan:             "kg",
                        }}
                        onChange={v => {
                          const a = [...formHasil.bahan];
                          a[i] = { ...a[i], kodeBarangInternal: v.kodeBarangInternal, namaBarang: v.namaBarang };
                          setFormHasil({ ...formHasil, bahan: a });
                        }}
                      />
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Jumlah Terpakai</label>
                        <input type="number" placeholder="Jumlah" value={b.jumlah}
                          onChange={e => { const a = [...formHasil.bahan]; a[i].jumlah = e.target.value; setFormHasil({ ...formHasil, bahan: a }); }} required />
                      </div>
                      {i > 0 && (
                        <button type="button"
                          style={{ position: "absolute", top: 8, right: 8, background: "#fee2e2", border: "none", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 12 }}
                          onClick={() => setFormHasil({ ...formHasil, bahan: formHasil.bahan.filter((_, j) => j !== i) })}>
                          ✕ Hapus
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }}
                    onClick={() => setFormHasil({ ...formHasil, bahan: [...formHasil.bahan, { kodeBarangInternal: "", namaBarang: "", jumlah: "" }] })}>
                    + Tambah Bahan
                  </button>
                </div>
                <button className="btn btn-primary" type="submit" disabled={blockchain.isLoading}>
                  {blockchain.isLoading ? "Memproses..." : "Catat Hasil Produksi"}
                </button>
              </form>
            </div>

            {wipAktif.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Batch WIP Aktif</div>
                <table>
                  <thead><tr><th>ID Batch</th><th>Produk</th><th style={{ textAlign: "right" }}>Output Exp.</th></tr></thead>
                  <tbody>
                    {wipAktif.map(w => (
                      <tr key={w.id}>
                        <td className="mono" style={{ fontSize: 12 }}>{w.idBatch}</td>
                        <td>{w.namaProduk || w.kodeProdukInternal}</td>
                        <td style={{ textAlign: "right" }}>{w.outputExpected?.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // PAGE: LAPORAN
  // ═══════════════════════════════════════════════
  if (page === "kb_laporan") return (
    <LaporanKB selectedKBId={selectedKBId} namaKB={namaKB} blockchain={blockchain} />
  );

  // ═══════════════════════════════════════════════
  // PAGE: BOM (Bill of Materials)
  // ═══════════════════════════════════════════════
  if (page === "kb_bom") {
    const statusBadge = (status: string) => {
      if (status === "disetujui") return <span className="badge badge-active">Disetujui</span>;
      if (status === "ditolak")   return <span style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 12, padding: "2px 10px", fontSize: 11, fontWeight: 500 }}>Ditolak</span>;
      return <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 12, padding: "2px 10px", fontSize: 11, fontWeight: 500 }}>Menunggu persetujuan BC</span>;
    };

    return (
      <div>
        <div className="page-header">
          <h1>Formula Produksi (BOM)</h1>
          <p>Bill of Materials — daftar bahan baku dan rasio konversi per unit produk jadi. Diajukan perusahaan, disetujui Pejabat BC.</p>
        </div>
        {headerKB}{alertPesan}

        <div className="two-col" style={{ alignItems: "start" }}>
          {/* ── Form ajukan BOM baru ── */}
          <div className="card">
            <div className="card-header"><span className="card-title">Ajukan Formula BOM Baru</span></div>
            <div className="alert alert-info" style={{ marginBottom: 14, fontSize: 12 }}>
              Formula yang diajukan akan masuk antrian persetujuan Pejabat BC. Sebelum disetujui, formula belum bisa digunakan untuk memulai batch produksi.
            </div>
            <form onSubmit={handleAjukanBOM}>
              <div className="two-col">
                <div className="form-group"><label>Kode Formula</label>
                  <input placeholder="BOM-KAOS-v1" value={formBOMOp.kodeFormula}
                    onChange={e => setFormBOMOp({ ...formBOMOp, kodeFormula: e.target.value })} required /></div>
                <div className="form-group"><label>Versi</label>
                  <input placeholder="v1" value={formBOMOp.versi}
                    onChange={e => setFormBOMOp({ ...formBOMOp, versi: e.target.value })} required /></div>
              </div>
              <div className="two-col">
                <div className="form-group"><label>Nama Produk Jadi</label>
                  <input placeholder="Kaos Cotton Putih" value={formBOMOp.namaProduk}
                    onChange={e => setFormBOMOp({ ...formBOMOp, namaProduk: e.target.value })} required /></div>
                <div className="form-group"><label>Kode HS Produk</label>
                  <input placeholder="6109.10.00" value={formBOMOp.kodeHSProduk}
                    onChange={e => setFormBOMOp({ ...formBOMOp, kodeHSProduk: e.target.value })} required /></div>
              </div>
              <div className="two-col">
                <div className="form-group"><label>Toleransi Scrap (%)</label>
                  <input type="number" min="0" max="100" placeholder="5" value={formBOMOp.toleransiScrapPersen}
                    onChange={e => setFormBOMOp({ ...formBOMOp, toleransiScrapPersen: e.target.value })} /></div>
                <div className="form-group"><label>Toleransi Wasted (%)</label>
                  <input type="number" min="0" max="100" placeholder="2" value={formBOMOp.toleransiWastedPersen}
                    onChange={e => setFormBOMOp({ ...formBOMOp, toleransiWastedPersen: e.target.value })} /></div>
              </div>
              <div className="form-group">
                <label style={{ fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 8, display: "block" }}>
                  Komposisi Bahan (per 1 unit produk jadi)
                </label>
                {formBOMOp.komposisi.map((k, i) => (
                  <div key={i} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px", marginBottom: 10, position: "relative" }}>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>Bahan #{i + 1}</div>
                    {/* v4: ItemPicker untuk setiap bahan di BOM */}
                    <ItemPicker
                      katalog={katalog}
                      labelKode={`Kode Bahan #${i + 1}`}
                      value={{
                        kodeBarangInternal: k.kodeBarangInternal,
                        namaBarang:         k.namaBarang,
                        kodeHS:             k.kodeHS,
                        satuan:             k.satuan,
                      }}
                      onChange={v => {
                        const a = [...formBOMOp.komposisi];
                        a[i] = { ...a[i], kodeBarangInternal: v.kodeBarangInternal, namaBarang: v.namaBarang, kodeHS: v.kodeHS, satuan: v.satuan };
                        setFormBOMOp({ ...formBOMOp, komposisi: a });
                      }}
                    />
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Rasio (per 1 unit produk jadi)</label>
                      <input type="number" placeholder="1.5" step="0.001" value={k.rasio}
                        onChange={e => { const a = [...formBOMOp.komposisi]; a[i].rasio = e.target.value; setFormBOMOp({ ...formBOMOp, komposisi: a }); }} required />
                    </div>
                    {i > 0 && (
                      <button type="button"
                        style={{ position: "absolute", top: 8, right: 8, background: "#fee2e2", border: "none", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 12 }}
                        onClick={() => setFormBOMOp({ ...formBOMOp, komposisi: formBOMOp.komposisi.filter((_, j) => j !== i) })}>
                        ✕ Hapus
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" className="btn btn-outline btn-sm"
                  onClick={() => setFormBOMOp({ ...formBOMOp, komposisi: [...formBOMOp.komposisi, { kodeBarangInternal: "", kodeHS: "", namaBarang: "", rasio: "", satuan: "kg" }] })}>
                  + Tambah Bahan
                </button>
              </div>
              <button className="btn btn-primary" type="submit">Ajukan ke Pejabat BC</button>
            </form>
          </div>

          {/* ── Daftar BOM + detail ── */}
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <span className="card-title">Daftar Formula BOM</span>
                <button className="btn btn-outline btn-sm" onClick={muatDaftarBOM}>Refresh</button>
              </div>
              {loadingBOM ? (
                <div className="empty">Memuat...</div>
              ) : daftarBOM.length === 0 ? (
                <div className="empty"><div className="empty-icon">◈</div>Belum ada formula BOM</div>
              ) : (
                <div className="table-wrap" style={{ margin: 0, border: "none" }}>
                  <table>
                    <thead><tr><th>Kode Formula</th><th>Produk</th><th>Versi</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {daftarBOM.map(bom => (
                        <tr key={bom.id} style={{ cursor: "pointer" }}>
                          <td className="mono" style={{ fontSize: 12 }}>{bom.kodeFormula}</td>
                          <td>{bom.namaProduk}</td>
                          <td>{bom.versi}</td>
                          <td>{statusBadge(bom.statusBOM || (bom.disetujui ? "disetujui" : "menunggu_persetujuan"))}</td>
                          <td>
                            <button className="btn btn-outline btn-sm"
                              onClick={() => setBomDetail(bomDetail?.id === bom.id ? null : bom)}>
                              {bomDetail?.id === bom.id ? "Tutup" : "Detail"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Detail BOM yang dipilih ── */}
            {bomDetail && (
              <div className="card" style={{ borderLeft: "3px solid #378ADD" }}>
                <div className="card-header">
                  <span className="card-title">Detail: {bomDetail.kodeFormula}</span>
                  <button className="btn btn-outline btn-sm" onClick={() => setBomDetail(null)}>✕ Tutup</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <div><div style={{ fontSize: 11, color: "#64748b" }}>Produk Jadi</div><div style={{ fontWeight: 500 }}>{bomDetail.namaProduk}</div></div>
                  <div><div style={{ fontSize: 11, color: "#64748b" }}>Kode HS</div><div className="mono" style={{ fontSize: 13 }}>{bomDetail.kodeHSProduk}</div></div>
                  <div><div style={{ fontSize: 11, color: "#64748b" }}>Versi</div><div>{bomDetail.versi}</div></div>
                  <div><div style={{ fontSize: 11, color: "#64748b" }}>Status</div>{statusBadge(bomDetail.statusBOM || (bomDetail.disetujui ? "disetujui" : "menunggu_persetujuan"))}</div>
                  {bomDetail.toleransiScrapPersen !== undefined && (
                    <div><div style={{ fontSize: 11, color: "#64748b" }}>Toleransi Scrap</div><div>{bomDetail.toleransiScrapPersen}%</div></div>
                  )}
                  {bomDetail.toleransiWastedPersen !== undefined && (
                    <div><div style={{ fontSize: 11, color: "#64748b" }}>Toleransi Wasted</div><div>{bomDetail.toleransiWastedPersen}%</div></div>
                  )}
                </div>
                {bomDetail.alasanTolak && (
                  <div className="alert alert-error" style={{ marginBottom: 12, fontSize: 12 }}>
                    Alasan penolakan: {bomDetail.alasanTolak}
                  </div>
                )}
                <div style={{ fontSize: 12, fontWeight: 500, color: "#334155", marginBottom: 8 }}>
                  Komposisi bahan (per 1 unit produk jadi)
                </div>
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Kode Internal</th>
                      <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Nama Bahan</th>
                      <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Kode HS</th>
                      <th style={{ padding: "6px 8px", textAlign: "right", borderBottom: "1px solid #e2e8f0" }}>Rasio</th>
                      <th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Satuan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(bomDetail.komposisi || []).map((k: any, i: number) => (
                      <tr key={i} style={{ borderBottom: "0.5px solid #f1f5f9" }}>
                        <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{k.kodeBarangInternal}</td>
                        <td style={{ padding: "6px 8px" }}>{k.namaBarang}</td>
                        <td style={{ padding: "6px 8px", fontFamily: "monospace", fontSize: 11 }}>{k.kodeHS}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 500 }}>{k.rasio}</td>
                        <td style={{ padding: "6px 8px", color: "#64748b" }}>{k.satuan}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {bomDetail.txHash && bomDetail.txHash !== "pending" && (
                  <div style={{ marginTop: 12, padding: "8px 10px", background: "#f0fdf4", borderRadius: 6, fontSize: 11 }}>
                    <span style={{ color: "#166534" }}>✓ Hash on-chain: </span>
                    <span className="mono" style={{ color: "#15803d" }}>{bomDetail.txHash.slice(0, 18)}...{bomDetail.txHash.slice(-8)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
