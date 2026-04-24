// LaporanPejabatBC.tsx — v3
// =============================================================
// Rewrite total dari v1 (ABI langsung) ke arsitektur hybrid v3.
//
// Masalah v1:
//   - Pakai ABI v1 lama (KBContract.json) yang sudah tidak ada
//   - Memanggil fungsi contract yang tidak ada di v3:
//     getDaftarBarang(), getTraceabilityBarang(), statusIzin
//   - Tidak mencakup scrap (BC 2.5) dan pemusnahan (BA)
//
// Pendekatan v3:
//   - Data diambil dari Firestore (cepat, lengkap, ada nama barang)
//   - Hash integritas diverifikasi on-chain via blockchainService
//   - Mencakup semua jenis dokumen: PIB/TLDDP, PEB/LOKAL, scrap, pemusnahan
//   - Export CSV mencakup semua koleksi termasuk scrap & pemusnahan
//   - Tab ringkasan menampilkan stat per KB secara paralel
// =============================================================

import { useState, useEffect, useCallback } from "react";
import type { BlockchainState } from "../hooks/useBlockchain";
import {
  bcGetDaftarSemuaKB,
  bcGetInfoKB,
  bcGetInfoKontrak,
  bcVerifikasiHashBarangMasuk,
  bcVerifikasiHashBarangKeluar,
  bcVerifikasiHashScrap,
  bcVerifikasiHashPemusnahan,
} from "../service/blockchainService";
import {
  getBarangMasuk,
  getBarangKeluar,
  getScrap,
  getPemusnahan,
  getHasilProduksi,
  getStockOpname,
  getBOM,
} from "../service/firestoreService";
import { hashData, hashString } from "../service/hashService";

// =============================================================
// TIPE
// =============================================================

interface Props { blockchain: BlockchainState; }

interface RingkasanKB {
  id:              string;
  namaPerusahaan:  string;
  alamatKontrak:   string;
  izinAktif:       boolean;
  totalMasuk:      number;
  totalKeluar:     number;
  totalScrap:      number;
  totalPemusnahan: number;
  totalProduksi:   number;
  totalOpname:     number;
}

type TabLaporan =
  | "ringkasan"
  | "masuk" | "keluar" | "scrap" | "pemusnahan"
  | "produksi" | "opname" | "bom";

// =============================================================
// KOMPONEN
// =============================================================

export default function LaporanPejabatBC({ blockchain }: Props) {
  const [daftarKB, setDaftarKB]           = useState<any[]>([]);
  const [selectedKB, setSelectedKB]       = useState("");
  const [tab, setTab]                     = useState<TabLaporan>("ringkasan");
  const [data, setData]                   = useState<any[]>([]);
  const [ringkasan, setRingkasan]         = useState<RingkasanKB[]>([]);
  const [loading, setLoading]             = useState(false);
  const [loadingRingkasan, setLoadingRingkasan] = useState(false);
  const [verStatus, setVerStatus]         = useState<Record<string, boolean | null>>({});

  // ── Muat daftar KB ───────────────────────────────────────────

  const muatKB = useCallback(async () => {
    if (!blockchain.ready) return;
    try {
      const ids = await bcGetDaftarSemuaKB();
      const list = await Promise.all(ids.map(async (id: string) => {
        const [info, kontrak] = await Promise.all([
          bcGetInfoKB(id),
          bcGetInfoKontrak(id),
        ]);
        return { id, ...info, izinAktif: kontrak.izinAktif };
      }));
      setDaftarKB(list);
    } catch {}
  }, [blockchain.ready]);

  useEffect(() => { muatKB(); }, [muatKB]);

  // ── Muat ringkasan semua KB (paralel) ────────────────────────

  const muatRingkasan = useCallback(async () => {
    if (!blockchain.ready || daftarKB.length === 0) return;
    setLoadingRingkasan(true);
    try {
      const results = await Promise.all(
        daftarKB.map(async (kb) => {
          const [masuk, keluar, scrap, pemusnahan, produksi, opname] =
            await Promise.all([
              getBarangMasuk(kb.id,    { limit: 999 }),
              getBarangKeluar(kb.id,   { limit: 999 }),
              getScrap(kb.id,          { limit: 999 }),
              getPemusnahan(kb.id,     { limit: 999 }),
              getHasilProduksi(kb.id,  { limit: 999 }),
              getStockOpname(kb.id,    { limit: 999 }),
            ]);
          return {
            id:              kb.id,
            namaPerusahaan:  kb.namaPerusahaan,
            alamatKontrak:   kb.alamatKontrak,
            izinAktif:       kb.izinAktif,
            totalMasuk:      masuk.length,
            totalKeluar:     keluar.length,
            totalScrap:      scrap.length,
            totalPemusnahan: pemusnahan.length,
            totalProduksi:   produksi.length,
            totalOpname:     opname.length,
          } as RingkasanKB;
        })
      );
      setRingkasan(results);
    } catch {} finally { setLoadingRingkasan(false); }
  }, [blockchain.ready, daftarKB]);

  useEffect(() => {
    if (tab === "ringkasan") muatRingkasan();
  }, [tab, muatRingkasan]);

  // ── Muat data per tab per KB ─────────────────────────────────

  const muatData = useCallback(async (idKB: string, tabAktif: TabLaporan) => {
    if (!idKB || tabAktif === "ringkasan") return;
    setLoading(true); setData([]); setVerStatus({});
    try {
      let hasil: any[] = [];
      if      (tabAktif === "masuk")       hasil = await getBarangMasuk(idKB,   { limit: 50 });
      else if (tabAktif === "keluar")      hasil = await getBarangKeluar(idKB,  { limit: 50 });
      else if (tabAktif === "scrap")       hasil = await getScrap(idKB,         { limit: 50 });
      else if (tabAktif === "pemusnahan")  hasil = await getPemusnahan(idKB,    { limit: 50 });
      else if (tabAktif === "produksi")    hasil = await getHasilProduksi(idKB, { limit: 50 });
      else if (tabAktif === "opname")      hasil = await getStockOpname(idKB,   { limit: 20 });
      else if (tabAktif === "bom")         hasil = await getBOM(idKB);
      setData(hasil);
    } catch {} finally { setLoading(false); }
  }, []);

  const handlePilihKB = (idKB: string) => {
    setSelectedKB(idKB);
    if (tab !== "ringkasan") muatData(idKB, tab);
  };

  const handleTab = (t: TabLaporan) => {
    setTab(t);
    if (t === "ringkasan") { muatRingkasan(); return; }
    if (selectedKB) muatData(selectedKB, t);
  };

  // ── Verifikasi integritas on-chain ───────────────────────────

  const verifikasi = async (doc: any, jenisDok: TabLaporan) => {
    if (!selectedKB) return;
    try {
      // Hitung ulang hash dari data Firestore
      const { id, dataHash: storedHash, txHash, blockNumber, createdAt, ...dataOnly } = doc;
      const dihitung = hashData(dataOnly);

      let valid = false;
      if (jenisDok === "masuk") {
        const nomorDok = doc.jenisDokumen === "PIB" ? doc.nomorPIB : doc.nomorTLDDP;
        const idHash = hashString(`${selectedKB}:${nomorDok}`);
        valid = await bcVerifikasiHashBarangMasuk(selectedKB, idHash, dihitung);
      } else if (jenisDok === "keluar") {
        const nomorDok = doc.jenisDokumen === "PEB" ? doc.nomorPEB : doc.nomorDokumenLokal;
        const idHash = hashString(`${selectedKB}:${nomorDok}`);
        valid = await bcVerifikasiHashBarangKeluar(selectedKB, idHash, dihitung);
      } else if (jenisDok === "scrap") {
        const idHash = hashString(`${selectedKB}:${doc.nomorBC25}`);
        valid = await bcVerifikasiHashScrap(selectedKB, idHash, dihitung);
      } else if (jenisDok === "pemusnahan") {
        const idHash = hashString(`${selectedKB}:${doc.nomorBA}`);
        valid = await bcVerifikasiHashPemusnahan(selectedKB, idHash, dihitung);
      }

      setVerStatus(prev => ({ ...prev, [doc.id]: valid }));
    } catch {
      setVerStatus(prev => ({ ...prev, [doc.id]: false }));
    }
  };

  // ── Export CSV lengkap ────────────────────────────────────────

  const exportCSV = async () => {
    if (!selectedKB) return;
    setLoading(true);
    try {
      const [masuk, keluar, scrap, pemusnahan, produksi] = await Promise.all([
        getBarangMasuk(selectedKB,   { limit: 9999 }),
        getBarangKeluar(selectedKB,  { limit: 9999 }),
        getScrap(selectedKB,         { limit: 9999 }),
        getPemusnahan(selectedKB,    { limit: 9999 }),
        getHasilProduksi(selectedKB, { limit: 9999 }),
      ]);

      const baris: string[][] = [];

      // ── Barang Masuk
      baris.push(["=== BARANG MASUK (PIB/TLDDP) ==="]);
      baris.push(["Jenis","No. Dokumen","Tgl Dokumen","Nama Barang","Kode Internal","HS Code","Negara Asal","Jumlah","Satuan","Nilai (IDR)","TX Hash"]);
      masuk.forEach(d => baris.push([
        d.jenisDokumen,
        d.jenisDokumen === "PIB" ? (d.nomorPIB ?? "-") : (d.nomorTLDDP ?? "-"),
        d.jenisDokumen === "PIB" ? (d.tanggalPIB ?? "-") : (d.tanggalTLDDP ?? "-"),
        d.namaBarang, d.kodeBarangInternal, d.kodeHS, d.negaraAsal,
        String(d.jumlah), d.satuan, String(d.nilaiBarang), d.txHash,
      ]));
      baris.push([]);

      // ── Barang Keluar
      baris.push(["=== BARANG KELUAR (PEB/LOKAL) ==="]);
      baris.push(["Jenis","No. Dokumen","Tgl Dokumen","Nama Barang","Kode Internal","HS Code","Negara Tujuan","Jumlah","Satuan","Nilai Ekspor (IDR)","TX Hash"]);
      keluar.forEach(d => baris.push([
        d.jenisDokumen,
        d.jenisDokumen === "PEB" ? (d.nomorPEB ?? "-") : (d.nomorDokumenLokal ?? "-"),
        d.jenisDokumen === "PEB" ? (d.tanggalPEB ?? "-") : (d.tanggalDokumenLokal ?? "-"),
        d.namaBarang, d.kodeBarangInternal, d.kodeHS,
        d.negaraTujuan ?? "-",
        String(d.jumlah), d.satuan, String(d.nilaiEkspor ?? 0), d.txHash,
      ]));
      baris.push([]);

      // ── Scrap
      baris.push(["=== SCRAP (BC 2.5) ==="]);
      baris.push(["No. BC 2.5","Tgl BC 2.5","Nama Barang","Kode Internal","HS Code","Jumlah","Satuan","Tujuan Pengeluaran","Nilai Jual (IDR)","TX Hash"]);
      scrap.forEach(d => baris.push([
        d.nomorBC25, d.tanggalBC25, d.namaBarang,
        d.kodeBarangInternal, d.kodeHS,
        String(d.jumlah), d.satuan, d.tujuanPengeluaran,
        String(d.nilaiJual ?? 0), d.txHash,
      ]));
      baris.push([]);

      // ── Pemusnahan
      baris.push(["=== PEMUSNAHAN (BERITA ACARA) ==="]);
      baris.push(["No. BA","Tgl BA","Nama Barang","Kode Internal","HS Code","Jumlah","Satuan","Metode","Lokasi","Saksi Pejabat BC","TX Hash"]);
      pemusnahan.forEach(d => baris.push([
        d.nomorBA, d.tanggalBA, d.namaBarang,
        d.kodeBarangInternal, d.kodeHS,
        String(d.jumlah), d.satuan,
        d.metodePemusnahan, d.lokasiPemusnahan, d.namaSaksiPejabatBC, d.txHash,
      ]));
      baris.push([]);

      // ── Hasil Produksi
      baris.push(["=== HASIL PRODUKSI ==="]);
      baris.push(["ID Batch","Kode Produk Internal","Nama Produk","HS Code","Output","Satuan","Scrap","Wasted","TX Hash"]);
      produksi.forEach(d => baris.push([
        d.idBatch, d.kodeProdukInternal, d.namaBarangJadi, d.kodeHS,
        String(d.jumlahOutput), d.satuan,
        String(d.jumlahScrap ?? 0), String(d.jumlahWasted ?? 0), d.txHash,
      ]));

      const csvContent = baris
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\n");

      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `laporan-${selectedKB}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {} finally { setLoading(false); }
  };

  // ── Export PDF Produksi ───────────────────────────────────────

  const exportPDFProduksi = async () => {
    if (!selectedKB) return;
    setLoading(true);
    try {
      const produksi = await getHasilProduksi(selectedKB, { limit: 9999 });
      const kbInfo = daftarKB.find(k => k.id === selectedKB);
      const namaKB = kbInfo?.namaPerusahaan ?? selectedKB;
      const tgl = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });

      const rows = produksi.map((d: any, i: number) => `
        <tr style="background:${i % 2 === 0 ? "#f8faff" : "#fff"}">
          <td>${i + 1}</td>
          <td style="font-family:monospace;font-size:11px">${d.idBatch}</td>
          <td>${d.namaBarangJadi}</td>
          <td style="font-family:monospace;font-size:11px;background:#f0f4ff;color:#0c2d6b;padding:1px 4px;border-radius:3px">${d.kodeProdukInternal}</td>
          <td>${d.kodeHS ?? "-"}</td>
          <td style="text-align:right;font-weight:600">${Number(d.jumlahOutput).toLocaleString("id-ID")} ${d.satuan}</td>
          <td style="text-align:right;color:#d97706">${d.jumlahScrap ? Number(d.jumlahScrap).toLocaleString("id-ID") : "-"}</td>
          <td style="text-align:right;color:#ef4444">${d.jumlahWasted ? Number(d.jumlahWasted).toLocaleString("id-ID") : "-"}</td>
          <td style="font-size:10px">
            ${(d.bahanTerpakai ?? []).map((b: any) => `<span style="display:inline-block;margin:1px;background:#f0f4ff;color:#0c2d6b;padding:1px 4px;border-radius:3px;font-size:10px">${b.kodeBarangInternal}: ${b.jumlah}</span>`).join("")}
          </td>
          <td style="font-family:monospace;font-size:10px;color:#6366f1">${d.txHash === "pending" ? "⏳" : `${d.txHash.slice(0,8)}...${d.txHash.slice(-6)}`}</td>
        </tr>`).join("");

      const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"/>
        <title>Laporan Hasil Produksi — ${namaKB}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; padding: 24px; }
          .header { margin-bottom: 20px; border-bottom: 2px solid #1e293b; padding-bottom: 14px; }
          .header h2 { font-size: 18px; font-weight: 700; color: #1e293b; margin-bottom: 2px; }
          .header p { font-size: 12px; color: #64748b; }
          .header .sub { font-size: 11px; color: #94a3b8; margin-top: 6px; padding-top: 6px; border-top: 1px solid #e2e8f0; }
          .meta { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 11px; color: #475569; background: #f8fafc; border-radius: 6px; padding: 8px 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { background: #1e293b; color: #fff; padding: 6px 8px; text-align: left; white-space: nowrap; }
          td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
          .footer { margin-top: 20px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          @media print { body { padding: 12px; } }
        </style>
      </head><body>
        <div class="header">
          <h2>${namaKB}</h2>
          <p>Kawasan Berikat &mdash; ID: ${selectedKB}</p>
          <div class="sub">LAPORAN HASIL PRODUKSI &nbsp;|&nbsp; Dokumen Internal Perusahaan</div>
        </div>
        <div class="meta">
          <div><strong>Periode cetak:</strong> ${tgl}</div>
          <div><strong>Total batch produksi:</strong> ${produksi.length} batch</div>
        </div>
        <table>
          <thead><tr>
            <th>#</th><th>ID Batch</th><th>Produk Jadi</th><th>Kode Internal</th><th>HS Code</th>
            <th style="text-align:right">Output</th>
            <th style="text-align:right">Scrap</th>
            <th style="text-align:right">Wasted</th>
            <th>Bahan Terpakai</th>
            <th>TX Hash</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="10" style="text-align:center;padding:20px;color:#94a3b8">Belum ada data produksi</td></tr>'}</tbody>
        </table>
        <div class="footer">
          Dokumen internal perusahaan. Data produksi tercatat on-chain &mdash; hash dapat diverifikasi secara independen oleh DJBC atau DJP.
        </div>
      </body></html>`;

      const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `laporan-produksi-${selectedKB}-${new Date().toISOString().slice(0, 10)}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {} finally { setLoading(false); }
  };

  // ── Helpers UI ───────────────────────────────────────────────

  const formatTx = (hash: string) =>
    hash === "pending"
      ? <span style={{ color: "var(--color-text-warning)" }}>⏳</span>
      : <span className="mono" style={{ fontSize: 11, color: "#6366f1" }}>
          {hash.slice(0, 8)}...{hash.slice(-6)}
        </span>;

  const VerBtn = ({ doc, jenis }: { doc: any; jenis: TabLaporan }) => {
    const s = verStatus[doc.id];
    if (s === undefined) return (
      <button onClick={() => verifikasi(doc, jenis)} style={{
        fontSize: 11, padding: "2px 8px", cursor: "pointer",
        background: "var(--color-background-secondary)",
        border: "1px solid var(--color-border-secondary)",
        borderRadius: 4, color: "var(--color-text-secondary)",
      }}>Verifikasi</button>
    );
    if (s === null) return <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>...</span>;
    return s
      ? <span style={{ color: "var(--color-text-success)", fontSize: 12 }}>✅ Valid</span>
      : <span style={{ color: "var(--color-text-danger)", fontSize: 12 }}>❌ Tidak valid</span>;
  };

  const tabBtn = (t: TabLaporan, label: string) => (
    <button onClick={() => handleTab(t)} style={{
      padding: "5px 12px", border: "none", borderRadius: 6, cursor: "pointer",
      fontSize: 12, fontWeight: tab === t ? 600 : 400,
      background: tab === t ? "#1e40af" : "var(--color-background-secondary)",
      color: tab === t ? "#fff" : "var(--color-text-secondary)",
    }}>{label}</button>
  );

  const empty = (cols: number) => (
    <tr><td colSpan={cols}><div className="empty">Belum ada data</div></td></tr>
  );

  // ── Statistik ringkasan total ─────────────────────────────────

  const totalKB          = ringkasan.length;
  const totalAktif       = ringkasan.filter(k => k.izinAktif).length;
  const totalBeku        = ringkasan.filter(k => !k.izinAktif).length;
  const totalPemusnahan  = ringkasan.reduce((a, k) => a + k.totalPemusnahan, 0);
  const totalScrap       = ringkasan.reduce((a, k) => a + k.totalScrap, 0);

  // =============================================================
  // RENDER
  // =============================================================

  return (
    <div>
      <div className="page-header">
        <h1>Laporan & Audit</h1>
        <p>Ringkasan inventory seluruh Kawasan Berikat yang diawasi — data dari Firestore, diverifikasi on-chain</p>
      </div>

      {/* ── Stat global ──────────────────────────────────────── */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="label">Total KB</div>
          <div className="value">{totalKB}</div>
          <div className="sub">terdaftar</div>
        </div>
        <div className="stat-card">
          <div className="label">KB Aktif</div>
          <div className="value" style={{ color: "var(--color-text-success)" }}>{totalAktif}</div>
        </div>
        <div className="stat-card">
          <div className="label">KB Dibekukan</div>
          <div className="value" style={{ color: "var(--color-text-warning)" }}>{totalBeku}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Scrap (BC 2.5)</div>
          <div className="value">{totalScrap}</div>
          <div className="sub">di semua KB</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Pemusnahan (BA)</div>
          <div className="value" style={{ color: totalPemusnahan > 0 ? "var(--color-text-danger)" : undefined }}>
            {totalPemusnahan}
          </div>
          <div className="sub">di semua KB</div>
        </div>
      </div>

      {/* ── Layout utama: sidebar KB + konten ────────────────── */}
      <div className="two-col" style={{ alignItems: "start" }}>

        {/* Sidebar pilih KB */}
        <div style={{ minWidth: 200, maxWidth: 240 }}>
          <div className="card" style={{ padding: "12px 14px" }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: "var(--color-text-primary)" }}>
              Pilih Kawasan Berikat
            </div>
            {daftarKB.map(kb => (
              <div key={kb.id} onClick={() => handlePilihKB(kb.id)} style={{
                padding: "8px 10px", borderRadius: 6, cursor: "pointer", marginBottom: 6,
                border: "1px solid",
                borderColor: selectedKB === kb.id ? "#1e40af" : "var(--color-border-tertiary)",
                background: selectedKB === kb.id ? "#eff6ff" : "var(--color-background-primary)",
              }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--color-text-primary)" }}>{kb.id}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>
                  {kb.namaPerusahaan}
                </div>
                {kb.izinAktif
                  ? <span className="badge badge-active">Aktif</span>
                  : <span className="badge badge-frozen">Dibekukan</span>}
              </div>
            ))}
            {daftarKB.length === 0 && (
              <div className="empty" style={{ fontSize: 12 }}>Tidak ada KB</div>
            )}
          </div>
        </div>

        {/* Area konten */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Toolbar: tab + export */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {tabBtn("ringkasan",  "Ringkasan")}
              {tabBtn("masuk",      "Barang Masuk")}
              {tabBtn("keluar",     "Barang Keluar")}
              {tabBtn("scrap",      "Scrap (BC 2.5)")}
              {tabBtn("pemusnahan", "Pemusnahan (BA)")}
              {tabBtn("produksi",   "Produksi")}
              {tabBtn("opname",     "Stock Opname")}
              {tabBtn("bom",        "BOM")}
            </div>
            {selectedKB && (
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="btn btn-primary"
                  style={{ fontSize: 12, padding: "5px 14px" }}
                  onClick={exportCSV}
                  disabled={loading}
                >
                  ⬇ Export CSV
                </button>
                <button
                  className="btn"
                  style={{ fontSize: 12, padding: "5px 14px", background: "#0f766e", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
                  onClick={exportPDFProduksi}
                  disabled={loading}
                >
                  📄 PDF Produksi
                </button>
              </div>
            )}
          </div>

          {!selectedKB && tab !== "ringkasan" && (
            <div className="empty" style={{ padding: "40px 0" }}>Pilih KB di sebelah kiri untuk melihat detail</div>
          )}
          {loading && (
            <div style={{ color: "var(--color-text-secondary)", fontSize: 14, padding: "20px 0" }}>
              Memuat data...
            </div>
          )}

          {/* ── TAB: RINGKASAN ─────────────────────────────── */}
          {!loading && tab === "ringkasan" && (
            <div>
              {loadingRingkasan && (
                <div style={{ color: "var(--color-text-secondary)", fontSize: 13, marginBottom: 12 }}>
                  Memuat ringkasan semua KB...
                </div>
              )}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ID KB</th>
                      <th>Nama Perusahaan</th>
                      <th>Status</th>
                      <th style={{ textAlign: "right" }}>Masuk</th>
                      <th style={{ textAlign: "right" }}>Keluar</th>
                      <th style={{ textAlign: "right" }}>Scrap</th>
                      <th style={{ textAlign: "right" }}>Pemusnahan</th>
                      <th style={{ textAlign: "right" }}>Produksi</th>
                      <th style={{ textAlign: "right" }}>Opname</th>
                      <th>Alamat Kontrak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ringkasan.length === 0
                      ? empty(10)
                      : ringkasan.map(kb => (
                        <tr key={kb.id} style={{ cursor: "pointer" }}
                          onClick={() => { handlePilihKB(kb.id); handleTab("masuk"); }}>
                          <td><strong>{kb.id}</strong></td>
                          <td>{kb.namaPerusahaan}</td>
                          <td>
                            {kb.izinAktif
                              ? <span className="badge badge-active">Aktif</span>
                              : <span className="badge badge-frozen">Dibekukan</span>}
                          </td>
                          <td style={{ textAlign: "right" }}>{kb.totalMasuk}</td>
                          <td style={{ textAlign: "right" }}>{kb.totalKeluar}</td>
                          <td style={{ textAlign: "right" }}>{kb.totalScrap}</td>
                          <td style={{ textAlign: "right", color: kb.totalPemusnahan > 0 ? "var(--color-text-danger)" : undefined, fontWeight: kb.totalPemusnahan > 0 ? 600 : undefined }}>
                            {kb.totalPemusnahan}
                          </td>
                          <td style={{ textAlign: "right" }}>{kb.totalProduksi}</td>
                          <td style={{ textAlign: "right" }}>{kb.totalOpname}</td>
                          <td>
                            <span className="mono" style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                              {kb.alamatKontrak ? `${kb.alamatKontrak.slice(0, 10)}...${kb.alamatKontrak.slice(-6)}` : "-"}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className="alert alert-info" style={{ marginTop: 12, fontSize: 12 }}>
                Klik baris KB untuk langsung melihat detail barang masuknya. Gunakan tab di atas untuk berpindah kategori.
              </div>
            </div>
          )}

          {/* ── TAB: BARANG MASUK ──────────────────────────── */}
          {!loading && tab === "masuk" && selectedKB && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Jenis</th><th>No. Dokumen</th><th>Tgl Dokumen</th>
                    <th>Nama Barang</th><th>Kode Internal</th><th>HS Code</th>
                    <th>Negara Asal</th>
                    <th style={{ textAlign: "right" }}>Jumlah</th>
                    <th style={{ textAlign: "right" }}>Nilai (IDR)</th>
                    <th>TX</th><th>Integritas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 ? empty(11) : data.map(doc => (
                    <tr key={doc.id}>
                      <td><span className="badge badge-active">{doc.jenisDokumen}</span></td>
                      <td className="mono" style={{ fontSize: 11 }}>
                        {doc.jenisDokumen === "PIB" ? doc.nomorPIB : doc.nomorTLDDP}
                      </td>
                      <td style={{ fontSize: 11 }}>
                        {(() => {
                          const tgl = doc.jenisDokumen === "PIB" ? doc.tanggalPIB : doc.tanggalTLDDP;
                          return tgl ? new Date(tgl).toLocaleDateString("id-ID") : "-";
                        })()}
                      </td>
                      <td>{doc.namaBarang}</td>
                      <td><span className="mono" style={{ fontSize: 11, background: "#f0f4ff", color: "#0c2d6b", padding: "1px 5px", borderRadius: 3 }}>{doc.kodeBarangInternal}</span></td>
                      <td className="mono" style={{ fontSize: 11 }}>{doc.kodeHS}</td>
                      <td>{doc.negaraAsal}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{Number(doc.jumlah).toLocaleString("id-ID")} {doc.satuan}</td>
                      <td style={{ textAlign: "right" }}>Rp {Number(doc.nilaiBarang ?? 0).toLocaleString("id-ID")}</td>
                      <td>{formatTx(doc.txHash)}</td>
                      <td><VerBtn doc={doc} jenis="masuk" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── TAB: BARANG KELUAR ─────────────────────────── */}
          {!loading && tab === "keluar" && selectedKB && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Jenis</th><th>No. Dokumen</th><th>Tgl Dokumen</th>
                    <th>Nama Barang</th><th>Kode Internal</th>
                    <th>Negara Tujuan</th>
                    <th style={{ textAlign: "right" }}>Jumlah</th>
                    <th style={{ textAlign: "right" }}>Nilai Ekspor (IDR)</th>
                    <th>TX</th><th>Integritas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 ? empty(10) : data.map(doc => (
                    <tr key={doc.id}>
                      <td><span className="badge badge-active">{doc.jenisDokumen}</span></td>
                      <td className="mono" style={{ fontSize: 11 }}>
                        {doc.jenisDokumen === "PEB" ? doc.nomorPEB : doc.nomorDokumenLokal}
                      </td>
                      <td style={{ fontSize: 11 }}>
                        {(() => {
                          const tgl = doc.jenisDokumen === "PEB" ? doc.tanggalPEB : doc.tanggalDokumenLokal;
                          return tgl ? new Date(tgl).toLocaleDateString("id-ID") : "-";
                        })()}
                      </td>
                      <td>{doc.namaBarang}</td>
                      <td><span className="mono" style={{ fontSize: 11, background: "#f0f4ff", color: "#0c2d6b", padding: "1px 5px", borderRadius: 3 }}>{doc.kodeBarangInternal}</span></td>
                      <td>{doc.negaraTujuan ?? "-"}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{Number(doc.jumlah).toLocaleString("id-ID")} {doc.satuan}</td>
                      <td style={{ textAlign: "right" }}>Rp {Number(doc.nilaiEkspor ?? 0).toLocaleString("id-ID")}</td>
                      <td>{formatTx(doc.txHash)}</td>
                      <td><VerBtn doc={doc} jenis="keluar" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── TAB: SCRAP (BC 2.5) ────────────────────────── */}
          {!loading && tab === "scrap" && selectedKB && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>No. BC 2.5</th><th>Tgl BC 2.5</th>
                    <th>Nama Barang</th><th>Kode Internal</th><th>HS Code</th>
                    <th style={{ textAlign: "right" }}>Jumlah</th>
                    <th>Tujuan Pengeluaran</th>
                    <th style={{ textAlign: "right" }}>Nilai Jual (IDR)</th>
                    <th>TX</th><th>Integritas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 ? empty(10) : data.map(doc => (
                    <tr key={doc.id}>
                      <td className="mono" style={{ fontSize: 11 }}>{doc.nomorBC25}</td>
                      <td style={{ fontSize: 11 }}>{doc.tanggalBC25 ? new Date(doc.tanggalBC25).toLocaleDateString("id-ID") : "-"}</td>
                      <td>{doc.namaBarang}</td>
                      <td><span className="mono" style={{ fontSize: 11, background: "#fef9c3", color: "#713f12", padding: "1px 5px", borderRadius: 3 }}>{doc.kodeBarangInternal}</span></td>
                      <td className="mono" style={{ fontSize: 11 }}>{doc.kodeHS}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{Number(doc.jumlah).toLocaleString("id-ID")} {doc.satuan}</td>
                      <td style={{ fontSize: 12 }}>{doc.tujuanPengeluaran}</td>
                      <td style={{ textAlign: "right" }}>Rp {Number(doc.nilaiJual ?? 0).toLocaleString("id-ID")}</td>
                      <td>{formatTx(doc.txHash)}</td>
                      <td><VerBtn doc={doc} jenis="scrap" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── TAB: PEMUSNAHAN (BA) ───────────────────────── */}
          {!loading && tab === "pemusnahan" && selectedKB && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>No. BA</th><th>Tgl BA</th>
                    <th>Nama Barang</th><th>Kode Internal</th>
                    <th style={{ textAlign: "right" }}>Jumlah</th>
                    <th>Metode</th><th>Lokasi</th>
                    <th>Saksi Pejabat BC</th>
                    <th>TX</th><th>Integritas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 ? empty(10) : data.map(doc => (
                    <tr key={doc.id}>
                      <td className="mono" style={{ fontSize: 11 }}>{doc.nomorBA}</td>
                      <td style={{ fontSize: 11 }}>{doc.tanggalBA ? new Date(doc.tanggalBA).toLocaleDateString("id-ID") : "-"}</td>
                      <td>{doc.namaBarang}</td>
                      <td><span className="mono" style={{ fontSize: 11, background: "#fee2e2", color: "#7f1d1d", padding: "1px 5px", borderRadius: 3 }}>{doc.kodeBarangInternal}</span></td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: "var(--color-text-danger)" }}>{Number(doc.jumlah).toLocaleString("id-ID")} {doc.satuan}</td>
                      <td style={{ fontSize: 12 }}>{doc.metodePemusnahan}</td>
                      <td style={{ fontSize: 12 }}>{doc.lokasiPemusnahan}</td>
                      <td style={{ fontSize: 12 }}>{doc.namaSaksiPejabatBC}</td>
                      <td>{formatTx(doc.txHash)}</td>
                      <td><VerBtn doc={doc} jenis="pemusnahan" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── TAB: PRODUKSI ──────────────────────────────── */}
          {!loading && tab === "produksi" && selectedKB && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID Batch</th><th>Produk Jadi</th><th>Kode Internal</th>
                    <th style={{ textAlign: "right" }}>Output</th>
                    <th style={{ textAlign: "right" }}>Scrap</th>
                    <th style={{ textAlign: "right" }}>Wasted</th>
                    <th>TX</th>
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 ? empty(7) : data.map(doc => (
                    <tr key={doc.id}>
                      <td className="mono" style={{ fontSize: 11 }}>{doc.idBatch}</td>
                      <td>{doc.namaBarangJadi}</td>
                      <td><span className="mono" style={{ fontSize: 11, background: "#f0f4ff", color: "#0c2d6b", padding: "1px 5px", borderRadius: 3 }}>{doc.kodeProdukInternal}</span></td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{Number(doc.jumlahOutput).toLocaleString("id-ID")} {doc.satuan}</td>
                      <td style={{ textAlign: "right", color: "var(--color-text-warning)" }}>{doc.jumlahScrap ? Number(doc.jumlahScrap).toLocaleString("id-ID") : "-"}</td>
                      <td style={{ textAlign: "right", color: "var(--color-text-danger)" }}>{doc.jumlahWasted ? Number(doc.jumlahWasted).toLocaleString("id-ID") : "-"}</td>
                      <td>{formatTx(doc.txHash)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── TAB: STOCK OPNAME ──────────────────────────── */}
          {!loading && tab === "opname" && selectedKB && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID Sesi</th><th>Tanggal</th>
                    <th style={{ textAlign: "right" }}>Item</th>
                    <th>Catatan</th><th>TX</th>
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 ? empty(5) : data.map(doc => (
                    <tr key={doc.id}>
                      <td className="mono" style={{ fontSize: 11 }}>{doc.idOpname}</td>
                      <td style={{ fontSize: 12 }}>{doc.tanggal ? new Date(doc.tanggal).toLocaleDateString("id-ID") : "-"}</td>
                      <td style={{ textAlign: "right" }}>{doc.items?.length || 0}</td>
                      <td style={{ fontSize: 12 }}>{doc.catatan || "-"}</td>
                      <td>{formatTx(doc.txHash)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── TAB: BOM ───────────────────────────────────── */}
          {!loading && tab === "bom" && selectedKB && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Kode Formula</th><th>Nama Produk</th><th>HS Produk</th>
                    <th>Versi</th>
                    <th style={{ textAlign: "right" }}>Toleransi Scrap</th>
                    <th style={{ textAlign: "right" }}>Toleransi Wasted</th>
                    <th>Komposisi</th>
                    <th>TX</th>
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 ? empty(8) : data.map(doc => (
                    <tr key={doc.id}>
                      <td className="mono" style={{ fontSize: 11 }}>{doc.kodeFormula}</td>
                      <td>{doc.namaProduk}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{doc.kodeHSProduk ?? "-"}</td>
                      <td><span className="badge badge-active">{doc.versi}</span></td>
                      <td style={{ textAlign: "right" }}>{doc.toleransiScrapPersen != null ? `${doc.toleransiScrapPersen}%` : "-"}</td>
                      <td style={{ textAlign: "right" }}>{doc.toleransiWastedPersen != null ? `${doc.toleransiWastedPersen}%` : "-"}</td>
                      <td style={{ fontSize: 12 }}>
                        {doc.komposisi?.map((k: any, i: number) => (
                          <div key={i}>
                            <span className="mono" style={{ fontSize: 10, color: "#0c2d6b" }}>{k.kodeBarangInternal}</span>
                            {" "}{k.namaBarang}: {k.rasio} {k.satuan}/unit
                          </div>
                        ))}
                      </td>
                      <td>{formatTx(doc.txHash)}</td>
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
