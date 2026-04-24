// PortalDJP.tsx — v3
// =============================================================
// Portal read-only untuk auditor DJP.
// Perubahan v2 --> v3:
//   1. Import tambah: getScrap, getPemusnahan dari firestoreService
//   2. Import tambah: bcVerifikasiHashScrap, bcVerifikasiHashPemusnahan
//   3. Tab baru: "scrap" dan "pemusnahan"
//   4. Tabel barang masuk: kolom nomorDokumen → nomorPIB/nomorTLDDP per jenis
//   5. Tabel barang keluar: kolom nomorDokumen → nomorPEB/nomorDokumenLokal
//   6. Fungsi verifikasi: update hash key sesuai jenis dokumen v3
//   7. Tampilkan kodeBarangInternal di semua tabel
// =============================================================

import { useState, useEffect, useCallback } from "react";
import type { BlockchainState } from "../hooks/useBlockchain";
import {
  bcGetDaftarSemuaKB,
  bcGetInfoKB,
  bcGetInfoKontrak,
  bcVerifikasiHashBarangMasuk,
  bcVerifikasiHashBarangKeluar,
  bcVerifikasiHashScrap,           // v3
  bcVerifikasiHashPemusnahan,      // v3
} from "../service/blockchainService";
import {
  getBarangMasuk,
  getBarangKeluar,
  getScrap,                        // v3
  getPemusnahan,                   // v3
  getHasilProduksi,
  getStockOpname,
} from "../service/firestoreService";
import { hashData, hashString } from "../service/hashService";

interface Props { blockchain: BlockchainState; }

type TabDJP = "masuk" | "keluar" | "scrap" | "pemusnahan" | "produksi" | "opname";

export default function PortalDJP({ blockchain }: Props) {
  const [daftarKB, setDaftarKB]       = useState<any[]>([]);
  const [selectedKB, setSelectedKB]   = useState("");
  const [tab, setTab]                 = useState<TabDJP>("masuk");
  const [data, setData]               = useState<any[]>([]);
  const [loading, setLoading]         = useState(false);
  const [verStatus, setVerStatus]     = useState<Record<string, boolean | null>>({});

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

  // ── Muat data per tab ────────────────────────────────────────

  const muatData = useCallback(async (idKB: string, tabAktif: TabDJP) => {
    if (!idKB) return;
    setLoading(true); setData([]); setVerStatus({});
    try {
      let hasil: any[] = [];
      if      (tabAktif === "masuk")      hasil = await getBarangMasuk(idKB,   { limit: 20 });
      else if (tabAktif === "keluar")     hasil = await getBarangKeluar(idKB,  { limit: 20 });
      else if (tabAktif === "scrap")      hasil = await getScrap(idKB,         { limit: 20 }); // v3
      else if (tabAktif === "pemusnahan") hasil = await getPemusnahan(idKB,    { limit: 20 }); // v3
      else if (tabAktif === "produksi")   hasil = await getHasilProduksi(idKB, { limit: 20 });
      else if (tabAktif === "opname")     hasil = await getStockOpname(idKB,   { limit: 10 });
      setData(hasil);
    } catch {} finally { setLoading(false); }
  }, []);

  const handlePilihKB = (idKB: string) => { setSelectedKB(idKB); muatData(idKB, tab); };
  const handleTab     = (t: TabDJP)    => { setTab(t); if (selectedKB) muatData(selectedKB, t); };

  // ── Verifikasi integritas on-chain ───────────────────────────
  // Hitung ulang hash dari data Firestore, cocokkan dengan hash on-chain.

  const verifikasi = async (doc: any, jenisDok: TabDJP) => {
    if (!selectedKB) return;
    try {
      // Strip metadata Firestore sebelum hash
      const { id, dataHash: _, txHash: __, blockNumber: ___, createdAt: ____, ...dataOnly } = doc;
      const dihitung = hashData(dataOnly);

      let valid = false;
      if (jenisDok === "masuk") {
        // v3: nomor dokumen diambil per jenis
        const nomorDok = doc.jenisDokumen === "PIB" ? doc.nomorPIB : doc.nomorTLDDP;
        const idHash   = hashString(`${selectedKB}:${nomorDok}`);
        valid = await bcVerifikasiHashBarangMasuk(selectedKB, idHash, dihitung);
      } else if (jenisDok === "keluar") {
        const nomorDok = doc.jenisDokumen === "PEB" ? doc.nomorPEB : doc.nomorDokumenLokal;
        const idHash   = hashString(`${selectedKB}:${nomorDok}`);
        valid = await bcVerifikasiHashBarangKeluar(selectedKB, idHash, dihitung);
      } else if (jenisDok === "scrap") {       // v3
        const idHash = hashString(`${selectedKB}:${doc.nomorBC25}`);
        valid = await bcVerifikasiHashScrap(selectedKB, idHash, dihitung);
      } else if (jenisDok === "pemusnahan") {  // v3
        const idHash = hashString(`${selectedKB}:${doc.nomorBA}`);
        valid = await bcVerifikasiHashPemusnahan(selectedKB, idHash, dihitung);
      }

      setVerStatus(prev => ({ ...prev, [doc.id]: valid }));
    } catch {
      setVerStatus(prev => ({ ...prev, [doc.id]: false }));
    }
  };

  // ── Export CSV ───────────────────────────────────────────────

  const exportCSV = async () => {
    if (!selectedKB) return;
    try {
      const [masuk, keluar, scrap, pemusnahan, produksi] = await Promise.all([
        getBarangMasuk(selectedKB, { limit: 9999 }),
        getBarangKeluar(selectedKB, { limit: 9999 }),
        getScrap(selectedKB, { limit: 9999 }),
        getPemusnahan(selectedKB, { limit: 9999 }),
        getHasilProduksi(selectedKB, { limit: 9999 }),
      ]);
      const baris: string[][] = [];
      baris.push(["=== BARANG MASUK (PIB/TLDDP) ==="]);
      baris.push(["Jenis","No. Dokumen","Tgl Dokumen","Nama Barang","Kode Internal","HS Code","Negara Asal","Jumlah","Satuan","TX Hash"]);
      masuk.forEach((d: any) => baris.push([d.jenisDokumen, d.jenisDokumen==="PIB"?(d.nomorPIB??"-"):(d.nomorTLDDP??"-"), d.jenisDokumen==="PIB"?(d.tanggalPIB??"-"):(d.tanggalTLDDP??"-"), d.namaBarang, d.kodeBarangInternal, d.kodeHS, d.negaraAsal, String(d.jumlah), d.satuan, d.txHash]));
      baris.push([]);
      baris.push(["=== BARANG KELUAR (PEB/LOKAL) ==="]);
      baris.push(["Jenis","No. Dokumen","Tgl Dokumen","Nama Barang","Kode Internal","Negara Tujuan","Jumlah","Satuan","Nilai Ekspor","TX Hash"]);
      keluar.forEach((d: any) => baris.push([d.jenisDokumen, d.jenisDokumen==="PEB"?(d.nomorPEB??"-"):(d.nomorDokumenLokal??"-"), d.jenisDokumen==="PEB"?(d.tanggalPEB??"-"):(d.tanggalDokumenLokal??"-"), d.namaBarang, d.kodeBarangInternal, d.negaraTujuan??"-", String(d.jumlah), d.satuan, String(d.nilaiEkspor??0), d.txHash]));
      baris.push([]);
      baris.push(["=== SCRAP (BC 2.5) ==="]);
      baris.push(["No. BC 2.5","Tgl BC 2.5","Nama Barang","Kode Internal","HS Code","Jumlah","Satuan","Tujuan","Nilai Jual","TX Hash"]);
      scrap.forEach((d: any) => baris.push([d.nomorBC25, d.tanggalBC25, d.namaBarang, d.kodeBarangInternal, d.kodeHS, String(d.jumlah), d.satuan, d.tujuanPengeluaran, String(d.nilaiJual??0), d.txHash]));
      baris.push([]);
      baris.push(["=== PEMUSNAHAN (BERITA ACARA) ==="]);
      baris.push(["No. BA","Tgl BA","Nama Barang","Kode Internal","HS Code","Jumlah","Satuan","Metode","Saksi Pejabat BC","TX Hash"]);
      pemusnahan.forEach((d: any) => baris.push([d.nomorBA, d.tanggalBA, d.namaBarang, d.kodeBarangInternal, d.kodeHS, String(d.jumlah), d.satuan, d.metodePemusnahan, d.namaSaksiPejabatBC, d.txHash]));
      baris.push([]);
      baris.push(["=== HASIL PRODUKSI ==="]);
      baris.push(["ID Batch","Kode Produk","Nama Produk","HS Code","Output","Satuan","Scrap","Wasted","TX Hash"]);
      produksi.forEach((d: any) => baris.push([d.idBatch, d.kodeProdukInternal, d.namaBarangJadi, d.kodeHS??"-", String(d.jumlahOutput), d.satuan, String(d.jumlahScrap??0), String(d.jumlahWasted??0), d.txHash]));
      const csv = baris.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url;
      a.download = `audit-djp-${selectedKB}-${new Date().toISOString().slice(0,10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
    } catch {}
  };

  // ── Export PDF Produksi ──────────────────────────────────────

  const exportPDFProduksi = async () => {
    if (!selectedKB) return;
    try {
      const produksi = await getHasilProduksi(selectedKB, { limit: 9999 });
      const kbInfo = daftarKB.find((k: any) => k.id === selectedKB);
      const namaKB = kbInfo?.namaPerusahaan ?? selectedKB;
      const tgl = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
      const rows = produksi.map((d: any, i: number) => `
        <tr style="background:${i%2===0?"#f8faff":"#fff"}">
          <td>${i+1}</td>
          <td style="font-family:monospace;font-size:11px">${d.idBatch}</td>
          <td>${d.namaBarangJadi}</td>
          <td style="font-family:monospace;font-size:11px;background:#f0f4ff;color:#0c2d6b;padding:1px 4px;border-radius:3px">${d.kodeProdukInternal}</td>
          <td>${d.kodeHS??"-"}</td>
          <td style="text-align:right;font-weight:600">${Number(d.jumlahOutput).toLocaleString("id-ID")} ${d.satuan}</td>
          <td style="text-align:right;color:#d97706">${d.jumlahScrap?Number(d.jumlahScrap).toLocaleString("id-ID"):"-"}</td>
          <td style="text-align:right;color:#ef4444">${d.jumlahWasted?Number(d.jumlahWasted).toLocaleString("id-ID"):"-"}</td>
          <td style="font-family:monospace;font-size:10px;color:#6366f1">${d.txHash==="pending"?"⏳":`${d.txHash.slice(0,8)}...${d.txHash.slice(-6)}`}</td>
        </tr>`).join("");
      const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"/>
        <title>Laporan Produksi — ${namaKB}</title>
        <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:12px;color:#1e293b;padding:24px}.header{margin-bottom:20px;border-bottom:2px solid #1e293b;padding-bottom:14px}.header h2{font-size:18px;font-weight:700;color:#1e293b;margin-bottom:2px}.header p{font-size:12px;color:#64748b}.header .sub{font-size:11px;color:#94a3b8;margin-top:6px;padding-top:6px;border-top:1px solid #e2e8f0}.meta{display:flex;justify-content:space-between;margin-bottom:16px;font-size:11px;color:#475569;background:#f8fafc;border-radius:6px;padding:8px 12px}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#1e293b;color:#fff;padding:6px 8px;text-align:left;white-space:nowrap}td{padding:5px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}.footer{margin-top:20px;font-size:10px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:10px}</style>
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
        <table><thead><tr><th>#</th><th>ID Batch</th><th>Produk Jadi</th><th>Kode Internal</th><th>HS Code</th><th style="text-align:right">Output</th><th style="text-align:right">Scrap</th><th style="text-align:right">Wasted</th><th>TX Hash</th></tr></thead>
        <tbody>${rows||'<tr><td colspan="9" style="text-align:center;padding:20px;color:#94a3b8">Belum ada data</td></tr>'}</tbody></table>
        <div class="footer">Dokumen internal perusahaan. Data produksi tercatat on-chain &mdash; hash dapat diverifikasi secara independen oleh DJBC atau DJP.</div>
      </body></html>`;
      const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
      const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url;
      a.download = `audit-produksi-${selectedKB}-${new Date().toISOString().slice(0,10)}.html`;
      a.click(); URL.revokeObjectURL(url);
    } catch {}
  };

  // ── Helpers UI ───────────────────────────────────────────────

  const formatTx = (hash: string) =>
    hash === "pending"
      ? <span style={{ color: "var(--color-text-warning)" }}>⏳</span>
      : <span className="mono" style={{ fontSize: 11, color: "#6366f1" }}>
          {hash.slice(0, 8)}...{hash.slice(-6)}
        </span>;

  const VerBtn = ({ doc, jenis }: { doc: any; jenis: TabDJP }) => {
    const s = verStatus[doc.id];
    if (s === undefined) return (
      <button onClick={() => verifikasi(doc, jenis)} style={{
        fontSize: 11, padding: "2px 8px", cursor: "pointer",
        background: "var(--color-background-secondary)",
        border: "1px solid var(--color-border-secondary)",
        borderRadius: 4, color: "var(--color-text-secondary)",
      }}>Verifikasi</button>
    );
    return s
      ? <span style={{ color: "var(--color-text-success)", fontSize: 12 }}>✅ Valid</span>
      : <span style={{ color: "var(--color-text-danger)",  fontSize: 12 }}>❌ Tidak valid</span>;
  };

  const tabBtn = (t: TabDJP, label: string) => (
    <button onClick={() => handleTab(t)} style={{
      padding: "6px 14px", border: "none", borderRadius: 6, cursor: "pointer",
      fontSize: 13, fontWeight: tab === t ? 600 : 400,
      background: tab === t ? "#7c3aed" : "var(--color-background-secondary)",
      color: tab === t ? "#fff" : "var(--color-text-secondary)",
    }}>{label}</button>
  );

  const empty = (cols: number) => (
    <tr><td colSpan={cols}><div className="empty">Tidak ada data</div></td></tr>
  );

  const kodeTag = (kode: string, warna: "biru" | "kuning" | "merah" = "biru") => {
    const style: Record<string, string> = {
      biru:   "background:#f0f4ff;color:#0c2d6b",
      kuning: "background:#fef9c3;color:#713f12",
      merah:  "background:#fee2e2;color:#7f1d1d",
    };
    return (
      <span className="mono" style={{
        fontSize: 11, padding: "1px 5px", borderRadius: 3,
        ...Object.fromEntries(style[warna].split(";").map(s => s.split(":")))
      }}>{kode}</span>
    );
  };

  // =============================================================
  // RENDER
  // =============================================================

  return (
    <div>
      <div className="page-header">
        <h1>Portal DJP</h1>
        <p>Akses read-only laporan inventory Kawasan Berikat — audit perpajakan</p>
      </div>

      {/* Info badge */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)",
        border: "1px solid #c4b5fd", borderRadius: 10, padding: "12px 16px", marginBottom: 20,
      }}>
        <span style={{ fontSize: 22 }}>🔒</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: "#5b21b6" }}>Akses Read-Only — Auditor DJP</div>
          <div style={{ fontSize: 12, color: "#7c3aed", marginTop: 2 }}>
            Data dari Firestore. Klik <strong>Verifikasi</strong> untuk konfirmasi integritas terhadap hash blockchain yang permanen.
          </div>
        </div>
      </div>

      <div className="two-col" style={{ alignItems: "start", marginBottom: 20 }}>

        {/* Sidebar pilih KB */}
        <div style={{ minWidth: 200, maxWidth: 240 }}>
          <div className="card" style={{ padding: "12px 14px" }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: "var(--color-text-primary)" }}>
              Pilih Kawasan Berikat
            </div>
            {daftarKB.map((kb: any) => (
              <div key={kb.id} onClick={() => handlePilihKB(kb.id)} style={{
                padding: "8px 10px", borderRadius: 6, cursor: "pointer", marginBottom: 6,
                border: "1px solid",
                borderColor: selectedKB === kb.id ? "#7c3aed" : "var(--color-border-tertiary)",
                background: selectedKB === kb.id ? "#f5f3ff" : "var(--color-background-primary)",
                transition: "all 0.15s",
              }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: selectedKB === kb.id ? "#5b21b6" : "var(--color-text-primary)" }}>{kb.id}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>
                  {kb.namaPerusahaan}
                </div>
                {kb.izinAktif
                  ? <span className="badge badge-active">Aktif</span>
                  : <span className="badge badge-frozen">Dibekukan</span>}
              </div>
            ))}
            {daftarKB.length === 0 && <div className="empty">Tidak ada KB</div>}
          </div>
        </div>

        {/* Area konten */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Toolbar tab + export */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {tabBtn("masuk",      "Barang Masuk")}
              {tabBtn("keluar",     "Barang Keluar")}
              {tabBtn("scrap",      "Scrap (BC 2.5)")}
              {tabBtn("pemusnahan", "Pemusnahan (BA)")}
              {tabBtn("produksi",   "Produksi")}
              {tabBtn("opname",     "Stock Opname")}
            </div>
            {selectedKB && (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={exportCSV} style={{
                  fontSize: 12, padding: "5px 14px", cursor: "pointer",
                  background: "#7c3aed", color: "#fff", border: "none", borderRadius: 6,
                }}>⬇ Export CSV</button>
                <button onClick={exportPDFProduksi} style={{
                  fontSize: 12, padding: "5px 14px", cursor: "pointer",
                  background: "#0f766e", color: "#fff", border: "none", borderRadius: 6,
                }}>📄 PDF Produksi</button>
              </div>
            )}
          </div>

          {!selectedKB && (
            <div className="empty" style={{ padding: "40px 0" }}>
              Pilih KB di sebelah kiri untuk melihat data
            </div>
          )}
          {loading && (
            <div style={{ color: "var(--color-text-secondary)", fontSize: 14, padding: "20px 0" }}>
              Memuat data...
            </div>
          )}

          {/* ── BARANG MASUK ─────────────────────────────── */}
          {!loading && tab === "masuk" && selectedKB && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Jenis</th><th>No. Dokumen</th><th>Tgl Dokumen</th>
                    <th>Nama Barang</th><th>Kode Internal</th><th>HS Code</th>
                    <th>Negara Asal</th>
                    <th style={{ textAlign: "right" }}>Jumlah</th>
                    <th>TX</th><th>Integritas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 ? empty(10) : data.map(doc => (
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
                      <td>{kodeTag(doc.kodeBarangInternal, "biru")}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{doc.kodeHS}</td>
                      <td>{doc.negaraAsal}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>
                        {Number(doc.jumlah).toLocaleString("id-ID")} {doc.satuan}
                      </td>
                      <td>{formatTx(doc.txHash)}</td>
                      <td><VerBtn doc={doc} jenis="masuk" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── BARANG KELUAR ────────────────────────────── */}
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
                      <td>{kodeTag(doc.kodeBarangInternal, "biru")}</td>
                      <td>{doc.negaraTujuan ?? "-"}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>
                        {Number(doc.jumlah).toLocaleString("id-ID")} {doc.satuan}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        Rp {Number(doc.nilaiEkspor ?? 0).toLocaleString("id-ID")}
                      </td>
                      <td>{formatTx(doc.txHash)}</td>
                      <td><VerBtn doc={doc} jenis="keluar" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── SCRAP (BC 2.5) ──────────────────────────── */}
          {!loading && tab === "scrap" && selectedKB && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>No. BC 2.5</th><th>Tgl BC 2.5</th>
                    <th>Nama Barang</th><th>Kode Internal</th><th>HS Code</th>
                    <th style={{ textAlign: "right" }}>Jumlah</th>
                    <th>Tujuan</th>
                    <th style={{ textAlign: "right" }}>Nilai Jual (IDR)</th>
                    <th>TX</th><th>Integritas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 ? empty(10) : data.map(doc => (
                    <tr key={doc.id}>
                      <td className="mono" style={{ fontSize: 11 }}>{doc.nomorBC25}</td>
                      <td style={{ fontSize: 11 }}>
                        {doc.tanggalBC25 ? new Date(doc.tanggalBC25).toLocaleDateString("id-ID") : "-"}
                      </td>
                      <td>{doc.namaBarang}</td>
                      <td>{kodeTag(doc.kodeBarangInternal, "kuning")}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{doc.kodeHS}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>
                        {Number(doc.jumlah).toLocaleString("id-ID")} {doc.satuan}
                      </td>
                      <td style={{ fontSize: 12 }}>{doc.tujuanPengeluaran}</td>
                      <td style={{ textAlign: "right" }}>
                        Rp {Number(doc.nilaiJual ?? 0).toLocaleString("id-ID")}
                      </td>
                      <td>{formatTx(doc.txHash)}</td>
                      <td><VerBtn doc={doc} jenis="scrap" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── PEMUSNAHAN (BA) ─────────────────────────── */}
          {!loading && tab === "pemusnahan" && selectedKB && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>No. BA</th><th>Tgl BA</th>
                    <th>Nama Barang</th><th>Kode Internal</th>
                    <th style={{ textAlign: "right" }}>Jumlah</th>
                    <th>Metode</th><th>Saksi Pejabat BC</th>
                    <th>TX</th><th>Integritas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 ? empty(9) : data.map(doc => (
                    <tr key={doc.id}>
                      <td className="mono" style={{ fontSize: 11 }}>{doc.nomorBA}</td>
                      <td style={{ fontSize: 11 }}>
                        {doc.tanggalBA ? new Date(doc.tanggalBA).toLocaleDateString("id-ID") : "-"}
                      </td>
                      <td>{doc.namaBarang}</td>
                      <td>{kodeTag(doc.kodeBarangInternal, "merah")}</td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: "var(--color-text-danger)" }}>
                        {Number(doc.jumlah).toLocaleString("id-ID")} {doc.satuan}
                      </td>
                      <td style={{ fontSize: 12 }}>{doc.metodePemusnahan}</td>
                      <td style={{ fontSize: 12 }}>{doc.namaSaksiPejabatBC}</td>
                      <td>{formatTx(doc.txHash)}</td>
                      <td><VerBtn doc={doc} jenis="pemusnahan" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── PRODUKSI ─────────────────────────────────── */}
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
                      <td>{kodeTag(doc.kodeProdukInternal, "biru")}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>
                        {Number(doc.jumlahOutput).toLocaleString("id-ID")} {doc.satuan}
                      </td>
                      <td style={{ textAlign: "right", color: "var(--color-text-warning)" }}>
                        {doc.jumlahScrap ? Number(doc.jumlahScrap).toLocaleString("id-ID") : "-"}
                      </td>
                      <td style={{ textAlign: "right", color: "var(--color-text-danger)" }}>
                        {doc.jumlahWasted ? Number(doc.jumlahWasted).toLocaleString("id-ID") : "-"}
                      </td>
                      <td>{formatTx(doc.txHash)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── STOCK OPNAME ─────────────────────────────── */}
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
                      <td style={{ fontSize: 12 }}>
                        {doc.tanggal ? new Date(doc.tanggal).toLocaleDateString("id-ID") : "-"}
                      </td>
                      <td style={{ textAlign: "right" }}>{doc.items?.length || 0}</td>
                      <td style={{ fontSize: 12 }}>{doc.catatan || "-"}</td>
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
