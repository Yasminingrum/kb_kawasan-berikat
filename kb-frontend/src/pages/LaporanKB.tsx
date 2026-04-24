// LaporanKB.tsx — v3
// Perubahan:
//   - Tambah tab "scrap" dan "pemusnahan"
//   - Ringkasan tambah stat scrap & pemusnahan
//   - Tabel barang masuk: kolom nomorDokumen -> nomorPIB/nomorTLDDP per jenis
//   - Tabel barang keluar: kolom nomorDokumen -> nomorPEB
//   - Tabel produksi: tampilkan kodeBarangInternal di bahan terpakai
//   - Tabel BOM: tampilkan kodeBarangInternal di komposisi

import { useState, useEffect, useCallback } from "react";
import type { BlockchainState } from "../hooks/useBlockchain";
import {
  getBarangMasuk, getBarangKeluar,
  getHasilProduksi, getWIPAktif, getBOM,
  getScrap, getPemusnahan,          // v3
} from "../service/firestoreService";

interface Props {
  selectedKBId: string;
  namaKB: string;
  blockchain: BlockchainState;
}

type TabLaporan = "ringkasan" | "masuk" | "keluar" | "produksi" | "bom" | "scrap" | "pemusnahan";

export default function LaporanKB({ selectedKBId, namaKB }: Props) {
  const [tab, setTab]       = useState<TabLaporan>("ringkasan");
  const [data, setData]     = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [ringkasan, setRingkasan] = useState({
    totalMasuk: 0, totalKeluar: 0,
    wipAktif: 0, totalProduksi: 0,
    totalScrap: 0, totalPemusnahan: 0,   // v3
  });

  const muatRingkasan = useCallback(async () => {
    if (!selectedKBId) return;
    try {
      const [masuk, keluar, wip, produksi, scrap, pemusnahan] = await Promise.all([
        getBarangMasuk(selectedKBId, { limit: 50 }),
        getBarangKeluar(selectedKBId, { limit: 50 }),
        getWIPAktif(selectedKBId),
        getHasilProduksi(selectedKBId, { limit: 50 }),
        getScrap(selectedKBId, { limit: 50 }),           // v3
        getPemusnahan(selectedKBId, { limit: 50 }),      // v3
      ]);
      setRingkasan({
        totalMasuk: masuk.length,
        totalKeluar: keluar.length,
        wipAktif: wip.length,
        totalProduksi: produksi.length,
        totalScrap: scrap.length,
        totalPemusnahan: pemusnahan.length,
      });
    } catch {}
  }, [selectedKBId]);

  useEffect(() => { muatRingkasan(); }, [muatRingkasan]);

  const exportCSV = async () => {
    try {
      const [masuk, keluar, scrap, pemusnahan, produksi] = await Promise.all([
        getBarangMasuk(selectedKBId, { limit: 9999 }),
        getBarangKeluar(selectedKBId, { limit: 9999 }),
        getScrap(selectedKBId, { limit: 9999 }),
        getPemusnahan(selectedKBId, { limit: 9999 }),
        getHasilProduksi(selectedKBId, { limit: 9999 }),
      ]);
      const baris: string[][] = [];
      baris.push(["=== BARANG MASUK (PIB/TLDDP) ==="]);
      baris.push(["Jenis","No. Dokumen","Tgl Dokumen","Nama Barang","Kode Internal","HS Code","Negara Asal","Jumlah","Satuan","Nilai (IDR)","TX Hash"]);
      masuk.forEach((d: any) => baris.push([d.jenisDokumen, d.jenisDokumen==="PIB"?(d.nomorPIB??"-"):(d.nomorTLDDP??"-"), d.jenisDokumen==="PIB"?(d.tanggalPIB??"-"):(d.tanggalTLDDP??"-"), d.namaBarang, d.kodeBarangInternal, d.kodeHS, d.negaraAsal, String(d.jumlah), d.satuan, String(d.nilaiBarang), d.txHash]));
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
      baris.push(["No. BA","Tgl BA","Nama Barang","Kode Internal","HS Code","Jumlah","Satuan","Metode","Lokasi","Saksi","TX Hash"]);
      pemusnahan.forEach((d: any) => baris.push([d.nomorBA, d.tanggalBA, d.namaBarang, d.kodeBarangInternal, d.kodeHS, String(d.jumlah), d.satuan, d.metodePemusnahan, d.lokasiPemusnahan, d.namaSaksiPejabatBC, d.txHash]));
      baris.push([]);
      baris.push(["=== HASIL PRODUKSI ==="]);
      baris.push(["ID Batch","Kode Produk","Nama Produk","HS Code","Output","Satuan","Scrap","Wasted","TX Hash"]);
      produksi.forEach((d: any) => baris.push([d.idBatch, d.kodeProdukInternal, d.namaBarangJadi, d.kodeHS??"-", String(d.jumlahOutput), d.satuan, String(d.jumlahScrap??0), String(d.jumlahWasted??0), d.txHash]));
      const csv = baris.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url;
      a.download = `laporan-${selectedKBId}-${new Date().toISOString().slice(0,10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
    } catch {}
  };

  const exportPDFProduksi = async () => {
    try {
      const produksi = await getHasilProduksi(selectedKBId, { limit: 9999 });
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
          <td style="font-size:10px">${(d.bahanTerpakai??[]).map((b: any)=>`<span style="display:inline-block;margin:1px;background:#f0f4ff;color:#0c2d6b;padding:1px 4px;border-radius:3px">${b.kodeBarangInternal}:${b.jumlah}</span>`).join("")}</td>
          <td style="font-family:monospace;font-size:10px;color:#6366f1">${d.txHash==="pending"?"⏳":`${d.txHash.slice(0,8)}...${d.txHash.slice(-6)}`}</td>
        </tr>`).join("");
      const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"/>
        <title>Laporan Produksi — ${namaKB}</title>
        <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:12px;color:#1e293b;padding:24px}.header{margin-bottom:20px;border-bottom:2px solid #1e293b;padding-bottom:14px}.header h2{font-size:18px;font-weight:700;color:#1e293b;margin-bottom:2px}.header p{font-size:12px;color:#64748b}.header .sub{font-size:11px;color:#94a3b8;margin-top:6px;padding-top:6px;border-top:1px solid #e2e8f0}.meta{display:flex;justify-content:space-between;margin-bottom:16px;font-size:11px;color:#475569;background:#f8fafc;border-radius:6px;padding:8px 12px}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#1e293b;color:#fff;padding:6px 8px;text-align:left;white-space:nowrap}td{padding:5px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}.footer{margin-top:20px;font-size:10px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:10px}</style>
      </head><body>
        <div class="header">
          <h2>${namaKB}</h2>
          <p>Kawasan Berikat &mdash; ID: ${selectedKBId}</p>
          <div class="sub">LAPORAN HASIL PRODUKSI &nbsp;|&nbsp; Dokumen Internal Perusahaan</div>
        </div>
        <div class="meta">
          <div><strong>Periode cetak:</strong> ${tgl}</div>
          <div><strong>Total batch produksi:</strong> ${produksi.length} batch</div>
        </div>
        <table><thead><tr><th>#</th><th>ID Batch</th><th>Produk Jadi</th><th>Kode Internal</th><th>HS Code</th><th style="text-align:right">Output</th><th style="text-align:right">Scrap</th><th style="text-align:right">Wasted</th><th>Bahan Terpakai</th><th>TX Hash</th></tr></thead>
        <tbody>${rows||'<tr><td colspan="10" style="text-align:center;padding:20px;color:#94a3b8">Belum ada data</td></tr>'}</tbody></table>
        <div class="footer">Dokumen internal perusahaan. Data produksi tercatat on-chain &mdash; hash dapat diverifikasi secara independen oleh DJBC atau DJP.</div>
      </body></html>`;
      const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
      const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url;
      a.download = `laporan-produksi-${selectedKBId}-${new Date().toISOString().slice(0,10)}.html`;
      a.click(); URL.revokeObjectURL(url);
    } catch {}
  };

  const muatTab = async (t: TabLaporan) => {
    setTab(t);
    if (t === "ringkasan") { muatRingkasan(); return; }
    setLoading(true); setData([]);
    try {
      if (t === "masuk")       setData(await getBarangMasuk(selectedKBId));
      else if (t === "keluar") setData(await getBarangKeluar(selectedKBId));
      else if (t === "produksi") setData(await getHasilProduksi(selectedKBId));
      else if (t === "bom")    setData(await getBOM(selectedKBId));
      else if (t === "scrap")  setData(await getScrap(selectedKBId));           // v3
      else if (t === "pemusnahan") setData(await getPemusnahan(selectedKBId));  // v3
    } catch {} finally { setLoading(false); }
  };

  const formatTx = (hash: string) =>
    hash === "pending"
      ? <span style={{ color: "#d97706" }}>⏳ pending</span>
      : <span className="mono" style={{ fontSize: 11, color: "#6366f1" }}>{hash.slice(0, 8)}...{hash.slice(-6)}</span>;

  const tabBtn = (t: TabLaporan, label: string) => (
    <button onClick={() => muatTab(t)} style={{
      padding: "6px 14px", border: "none", borderRadius: 6, cursor: "pointer",
      fontSize: 13, fontWeight: tab === t ? 600 : 400,
      background: tab === t ? "#1e40af" : "#f1f5f9",
      color: tab === t ? "#fff" : "#475569",
    }}>{label}</button>
  );

  return (
    <div>
      <div className="page-header">
        <h1>Laporan KB</h1>
        <p>Riwayat transaksi lengkap — {selectedKBId} · {namaKB}</p>
      </div>

      {/* Tab navigation + export buttons */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tabBtn("ringkasan",   "Ringkasan")}
          {tabBtn("masuk",       "Barang Masuk")}
          {tabBtn("keluar",      "Barang Keluar")}
          {tabBtn("produksi",    "Hasil Produksi")}
          {tabBtn("bom",         "Bill of Materials")}
          {tabBtn("scrap",       "Scrap (BC 2.5)")}
          {tabBtn("pemusnahan",  "Pemusnahan (BA)")}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={exportCSV} style={{
            fontSize: 12, padding: "5px 14px", cursor: "pointer",
            background: "#1e40af", color: "#fff", border: "none", borderRadius: 6,
          }}>⬇ Export CSV</button>
          <button onClick={exportPDFProduksi} style={{
            fontSize: 12, padding: "5px 14px", cursor: "pointer",
            background: "#0f766e", color: "#fff", border: "none", borderRadius: 6,
          }}>📄 PDF Produksi</button>
        </div>
      </div>

      {loading && <div style={{ color: "#64748b", fontSize: 14, padding: "20px 0" }}>Memuat data...</div>}

      {/* ── RINGKASAN ─────────────────────────────────────── */}
      {tab === "ringkasan" && (
        <div>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="label">Total Pemasukan</div>
              <div className="value">{ringkasan.totalMasuk}</div>
              <div className="sub">transaksi PIB/TLDDP</div>
            </div>
            <div className="stat-card">
              <div className="label">Total Pengeluaran Ekspor</div>
              <div className="value">{ringkasan.totalKeluar}</div>
              <div className="sub">transaksi PEB/lokal</div>
            </div>
            <div className="stat-card">
              <div className="label">WIP Aktif</div>
              <div className="value">{ringkasan.wipAktif}</div>
              <div className="sub">batch dalam produksi</div>
            </div>
            <div className="stat-card">
              <div className="label">Total Produksi</div>
              <div className="value">{ringkasan.totalProduksi}</div>
              <div className="sub">batch selesai</div>
            </div>
            <div className="stat-card">
              <div className="label">Total Scrap (BC 2.5)</div>
              <div className="value">{ringkasan.totalScrap}</div>
              <div className="sub">transaksi scrap keluar</div>
            </div>
            <div className="stat-card">
              <div className="label">Total Pemusnahan</div>
              <div className="value" style={{ color: ringkasan.totalPemusnahan > 0 ? "#d97706" : undefined }}>
                {ringkasan.totalPemusnahan}
              </div>
              <div className="sub">Berita Acara tercatat</div>
            </div>
          </div>
          <div className="alert alert-info" style={{ marginTop: 8 }}>
            Semua transaksi tersimpan di Firestore dengan hash kriptografis yang dikonfirmasi on-chain.
            Integritas data dapat diverifikasi kapan saja oleh DJBC atau DJP.
          </div>
        </div>
      )}

      {/* ── BARANG MASUK ─────────────────────────────────── */}
      {!loading && tab === "masuk" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Jenis</th>
                <th>No. Dokumen</th>
                <th>Tgl Dokumen</th>
                <th>Nama Barang</th>
                <th>Kode Internal</th>
                <th>HS Code</th>
                <th>Negara Asal</th>
                <th style={{ textAlign: "right" }}>Jumlah</th>
                <th style={{ textAlign: "right" }}>Nilai (IDR)</th>
                <th>TX Hash</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0
                ? <tr><td colSpan={10}><div className="empty">Belum ada transaksi</div></td></tr>
                : data.map(doc => (
                  <tr key={doc.id}>
                    <td><span className={`badge ${doc.jenisDokumen === "PIB" ? "badge-active" : "badge-info"}`}>{doc.jenisDokumen}</span></td>
                    {/* v3: nomorDokumen eksplisit per jenis */}
                    <td className="mono" style={{ fontSize: 12 }}>
                      {doc.jenisDokumen === "PIB" ? doc.nomorPIB : doc.nomorTLDDP}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {doc.jenisDokumen === "PIB"
                        ? (doc.tanggalPIB   ? new Date(doc.tanggalPIB).toLocaleDateString("id-ID")   : "-")
                        : (doc.tanggalTLDDP ? new Date(doc.tanggalTLDDP).toLocaleDateString("id-ID") : "-")}
                    </td>
                    <td>{doc.namaBarang}</td>
                    <td><span className="mono" style={{ fontSize: 11, background: "#f0f4ff", color: "#0c2d6b", padding: "1px 5px", borderRadius: 3 }}>{doc.kodeBarangInternal}</span></td>
                    <td className="mono" style={{ fontSize: 12 }}>{doc.kodeHS}</td>
                    <td>{doc.negaraAsal}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{Number(doc.jumlah).toLocaleString("id-ID")} {doc.satuan}</td>
                    <td style={{ textAlign: "right" }}>Rp {Number(doc.nilaiBarang).toLocaleString("id-ID")}</td>
                    <td>{formatTx(doc.txHash)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── BARANG KELUAR ────────────────────────────────── */}
      {!loading && tab === "keluar" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Jenis</th><th>No. PEB</th><th>Tgl PEB</th>
                <th>Nama Barang</th><th>Kode Internal</th>
                <th>Negara Tujuan</th>
                <th style={{ textAlign: "right" }}>Jumlah</th>
                <th style={{ textAlign: "right" }}>Nilai Ekspor</th>
                <th>TX Hash</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0
                ? <tr><td colSpan={9}><div className="empty">Belum ada ekspor</div></td></tr>
                : data.map(doc => (
                  <tr key={doc.id}>
                    <td><span className="badge badge-active">{doc.jenisDokumen}</span></td>
                    <td className="mono" style={{ fontSize: 12 }}>{doc.nomorPEB || doc.nomorDokumenLokal}</td>
                    <td style={{ fontSize: 12 }}>
                      {(doc.tanggalPEB || doc.tanggalDokumenLokal)
                        ? new Date(doc.tanggalPEB || doc.tanggalDokumenLokal).toLocaleDateString("id-ID")
                        : "-"}
                    </td>
                    <td>{doc.namaBarang}</td>
                    <td><span className="mono" style={{ fontSize: 11, background: "#f0f4ff", color: "#0c2d6b", padding: "1px 5px", borderRadius: 3 }}>{doc.kodeBarangInternal}</span></td>
                    <td>{doc.negaraTujuan || "-"}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{Number(doc.jumlah).toLocaleString("id-ID")} {doc.satuan}</td>
                    <td style={{ textAlign: "right" }}>Rp {Number(doc.nilaiEkspor || 0).toLocaleString("id-ID")}</td>
                    <td>{formatTx(doc.txHash)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── PRODUKSI ─────────────────────────────────────── */}
      {!loading && tab === "produksi" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID Batch</th><th>Produk Jadi</th><th>Kode Internal</th>
                <th style={{ textAlign: "right" }}>Output</th>
                <th style={{ textAlign: "right" }}>Scrap</th>
                <th style={{ textAlign: "right" }}>Wasted</th>
                <th>Bahan Terpakai</th><th>TX Hash</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0
                ? <tr><td colSpan={8}><div className="empty">Belum ada produksi</div></td></tr>
                : data.map(doc => (
                  <tr key={doc.id}>
                    <td className="mono" style={{ fontSize: 12 }}>{doc.idBatch}</td>
                    <td>{doc.namaBarangJadi}</td>
                    <td><span className="mono" style={{ fontSize: 11, background: "#f0f4ff", color: "#0c2d6b", padding: "1px 5px", borderRadius: 3 }}>{doc.kodeProdukInternal}</span></td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{Number(doc.jumlahOutput).toLocaleString("id-ID")} {doc.satuan}</td>
                    <td style={{ textAlign: "right", color: "#d97706" }}>{doc.jumlahScrap ? Number(doc.jumlahScrap).toLocaleString("id-ID") : "-"}</td>
                    <td style={{ textAlign: "right", color: "#ef4444" }}>{doc.jumlahWasted ? Number(doc.jumlahWasted).toLocaleString("id-ID") : "-"}</td>
                    <td style={{ fontSize: 12 }}>
                      {doc.bahanTerpakai?.map((b: any, i: number) => (
                        <span key={i} style={{ background: "#f0f4ff", color: "#0c2d6b", padding: "1px 6px", borderRadius: 4, marginRight: 4, display: "inline-block", marginBottom: 2 }}>
                          {b.kodeBarangInternal}: {b.jumlah}
                        </span>
                      ))}
                    </td>
                    <td>{formatTx(doc.txHash)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── BOM ──────────────────────────────────────────── */}
      {!loading && tab === "bom" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kode Formula</th><th>Nama Produk</th><th>Versi</th>
                <th>Komposisi</th><th>Divalidasi Oleh</th><th>TX Hash</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0
                ? <tr><td colSpan={6}><div className="empty">Belum ada BOM divalidasi</div></td></tr>
                : data.map(doc => (
                  <tr key={doc.id}>
                    <td className="mono" style={{ fontSize: 12 }}>{doc.kodeFormula}</td>
                    <td>{doc.namaProduk}</td>
                    <td><span className="badge badge-active">{doc.versi}</span></td>
                    <td style={{ fontSize: 12 }}>
                      {doc.komposisi?.map((k: any, i: number) => (
                        <div key={i}>
                          <span className="mono" style={{ fontSize: 11, color: "#0c2d6b" }}>{k.kodeBarangInternal}</span>
                          {" "}{k.namaBarang}: {k.rasio} {k.satuan}/unit
                        </div>
                      ))}
                    </td>
                    <td><span className="mono" style={{ fontSize: 11 }}>{doc.validasiOleh?.slice(0, 8)}...</span></td>
                    <td>{formatTx(doc.txHash)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SCRAP (BC 2.5) ──────────────────────────────── v3 */}
      {!loading && tab === "scrap" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>No. BC 2.5</th><th>Tgl BC 2.5</th>
                <th>Nama Barang</th><th>Kode Internal</th><th>HS Code</th>
                <th style={{ textAlign: "right" }}>Jumlah</th>
                <th>Tujuan</th>
                <th style={{ textAlign: "right" }}>Nilai Jual (IDR)</th>
                <th>TX Hash</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0
                ? <tr><td colSpan={9}><div className="empty">Belum ada pencatatan scrap</div></td></tr>
                : data.map(doc => (
                  <tr key={doc.id}>
                    <td className="mono" style={{ fontSize: 12 }}>{doc.nomorBC25}</td>
                    <td style={{ fontSize: 12 }}>{doc.tanggalBC25 ? new Date(doc.tanggalBC25).toLocaleDateString("id-ID") : "-"}</td>
                    <td>{doc.namaBarang}</td>
                    <td><span className="mono" style={{ fontSize: 11, background: "#fef9c3", color: "#713f12", padding: "1px 5px", borderRadius: 3 }}>{doc.kodeBarangInternal}</span></td>
                    <td className="mono" style={{ fontSize: 12 }}>{doc.kodeHS}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{Number(doc.jumlah).toLocaleString("id-ID")} {doc.satuan}</td>
                    <td style={{ fontSize: 12 }}>{doc.tujuanPengeluaran}</td>
                    <td style={{ textAlign: "right" }}>Rp {Number(doc.nilaiJual || 0).toLocaleString("id-ID")}</td>
                    <td>{formatTx(doc.txHash)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── PEMUSNAHAN (BA) ─────────────────────────────── v3 */}
      {!loading && tab === "pemusnahan" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>No. BA</th><th>Tgl BA</th>
                <th>Nama Barang</th><th>Kode Internal</th>
                <th style={{ textAlign: "right" }}>Jumlah</th>
                <th>Metode</th><th>Lokasi</th>
                <th>Saksi Pejabat BC</th><th>TX Hash</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0
                ? <tr><td colSpan={9}><div className="empty">Belum ada pencatatan pemusnahan</div></td></tr>
                : data.map(doc => (
                  <tr key={doc.id}>
                    <td className="mono" style={{ fontSize: 12 }}>{doc.nomorBA}</td>
                    <td style={{ fontSize: 12 }}>{doc.tanggalBA ? new Date(doc.tanggalBA).toLocaleDateString("id-ID") : "-"}</td>
                    <td>{doc.namaBarang}</td>
                    <td><span className="mono" style={{ fontSize: 11, background: "#fee2e2", color: "#7f1d1d", padding: "1px 5px", borderRadius: 3 }}>{doc.kodeBarangInternal}</span></td>
                    <td style={{ textAlign: "right", fontWeight: 600, color: "#ef4444" }}>{Number(doc.jumlah).toLocaleString("id-ID")} {doc.satuan}</td>
                    <td style={{ fontSize: 12 }}>{doc.metodePemusnahan}</td>
                    <td style={{ fontSize: 12 }}>{doc.lokasiPemusnahan}</td>
                    <td style={{ fontSize: 12 }}>{doc.namaSaksiPejabatBC}</td>
                    <td>{formatTx(doc.txHash)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
