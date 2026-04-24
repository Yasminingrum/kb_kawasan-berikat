// DashboardDJBC.tsx — v4
// Perubahan dari v3:
//   1. page "monitoring" tampilan BERBEDA dari "dashboard"
//      -> Monitoring KB: tabel detail per KB, klik expand untuk stat dokumen + wallet
//   2. page "tambah_bc" (Kelola Pejabat BC):
//      -> List semua pejabat BC terdaftar (dikumpulkan dari adminBC tiap KB on-chain)

import { useState, useEffect, useCallback } from "react";
import type { Page } from "../App";
import type { BlockchainState } from "../hooks/useBlockchain";
import {
  bcGetDaftarSemuaKB,
  bcGetInfoKB,
  bcGetInfoKontrak,
} from "../service/blockchainService";
import {
  getBarangMasuk,
  getBarangKeluar,
  getHasilProduksi,
  getScrap,
  getPemusnahan,
} from "../service/firestoreService";

interface Props {
  page: Page;
  setPage: (p: Page) => void;
  blockchain: BlockchainState;
  walletAddress: string;
}

interface InfoKB {
  id: string;
  namaPerusahaan: string;
  nomorIzin: string;
  alamatKontrak: string;
  izinAktif: boolean;
  djbc: string;
  adminBC: string;
  operator: string;
  tanggalDeploy: bigint;
}

interface StatKB {
  totalMasuk: number;
  totalKeluar: number;
  totalProduksi: number;
  totalScrap: number;
  totalPemusnahan: number;
}

interface PejabatBC {
  wallet: string;
  kbDiawasi: string[];
}

export default function DashboardDJBC({ page, setPage, blockchain, walletAddress }: Props) {
  const [daftarKB, setDaftarKB]           = useState<InfoKB[]>([]);
  const [statKB, setStatKB]               = useState<Record<string, StatKB>>({});
  const [loadingStat, setLoadingStat]     = useState(false);
  const [expandedKB, setExpandedKB]       = useState<string | null>(null);
  const [daftarPejabat, setDaftarPejabat] = useState<PejabatBC[]>([]);
  const [pesan, setPesan]                 = useState<{ tipe: "success" | "error"; teks: string } | null>(null);
  const [form, setForm]                   = useState({
    idKB: "", namaPerusahaan: "", nomorIzin: "", tanggalIzin: "",
    adminBC: "", operator: "", auditorDJP: ""
  });
  const [formBC, setFormBC]               = useState({ wallet: "" });
  const [daftarBCBaru, setDaftarBCBaru]   = useState<string[]>([]);

  const tampilPesan = (tipe: "success" | "error", teks: string) => {
    setPesan({ tipe, teks });
    setTimeout(() => setPesan(null), 6000);
  };

  // ── Muat semua KB ─────────────────────────────────────────────
  const muatKB = useCallback(async () => {
    if (!blockchain.ready) return;
    try {
      const ids = await bcGetDaftarSemuaKB();
      const list = await Promise.all(ids.map(async (id: string) => {
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
          djbc:           kontrak.djbc,
          adminBC:        kontrak.adminBC,
          operator:       kontrak.operator,
          tanggalDeploy:  kontrak.tanggalDeploy,
        } as InfoKB;
      }));
      setDaftarKB(list);

      // Kumpulkan pejabat BC unik dari adminBC tiap KB
      const pmap = new Map<string, string[]>();
      list.forEach(kb => {
        const addr = kb.adminBC?.toLowerCase();
        if (!addr || addr === "0x0000000000000000000000000000000000000000") return;
        if (!pmap.has(addr)) pmap.set(addr, []);
        pmap.get(addr)!.push(kb.id);
      });
      setDaftarPejabat(
        Array.from(pmap.entries()).map(([wallet, kbDiawasi]) => ({ wallet, kbDiawasi }))
      );
    } catch {}
  }, [blockchain.ready]);

  useEffect(() => { muatKB(); }, [muatKB]);

  // ── Muat statistik dokumen per KB (lazy, cached) ──────────────
  const muatStatKB = useCallback(async (id: string) => {
    if (statKB[id]) return;
    setLoadingStat(true);
    try {
      const [masuk, keluar, produksi, scrap, pemusnahan] = await Promise.all([
        getBarangMasuk(id,   { limit: 999 }),
        getBarangKeluar(id,  { limit: 999 }),
        getHasilProduksi(id, { limit: 999 }),
        getScrap(id,         { limit: 999 }),
        getPemusnahan(id,    { limit: 999 }),
      ]);
      setStatKB(prev => ({
        ...prev,
        [id]: {
          totalMasuk:      masuk.length,
          totalKeluar:     keluar.length,
          totalProduksi:   produksi.length,
          totalScrap:      scrap.length,
          totalPemusnahan: pemusnahan.length,
        }
      }));
    } catch {} finally { setLoadingStat(false); }
  }, [statKB]);

  const handleExpand = (id: string) => {
    if (expandedKB === id) { setExpandedKB(null); return; }
    setExpandedKB(id);
    muatStatKB(id);
  };

  const aktif = daftarKB.filter(kb => kb.izinAktif).length;
  const beku  = daftarKB.filter(kb => !kb.izinAktif).length;

  const loadingBanner = blockchain.isLoading && (
    <div style={{
      background: "#eff6ff", border: "1px solid #93c5fd",
      borderRadius: 8, padding: "10px 16px", marginBottom: 16,
      color: "#1d4ed8", fontSize: 14,
    }}>Memproses transaksi...</div>
  );

  const shortAddr = (addr?: string) =>
    addr && addr !== "0x0000000000000000000000000000000000000000"
      ? `${addr.slice(0, 8)}...${addr.slice(-6)}`
      : "\u2014";

  const tglDeploy = (ts?: bigint) => {
    if (!ts || ts === 0n) return "\u2014";
    return new Date(Number(ts) * 1000).toLocaleDateString("id-ID", {
      day: "2-digit", month: "short", year: "numeric"
    });
  };

  // ═══════════════════════════════════════════════════════════
  // PAGE: MONITORING KB
  // ═══════════════════════════════════════════════════════════
  if (page === "monitoring") return (
    <div>
      <div className="page-header">
        <h1>Monitoring Kawasan Berikat</h1>
        <p>Detail teknis dan statistik dokumen seluruh KB yang terdaftar on-chain</p>
      </div>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        {[
          { label: "Total KB", val: daftarKB.length, sub: "terdaftar on-chain", color: undefined },
          { label: "KB Aktif", val: aktif, sub: "izin berlaku", color: "#16a34a" },
          { label: "KB Dibekukan", val: beku, sub: "perlu tindak lanjut", color: "#d97706" },
          { label: "Pejabat BC", val: daftarPejabat.length, sub: "terdaftar", color: undefined },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="label">{s.label}</div>
            <div className="value" style={s.color ? { color: s.color } : undefined}>{s.val}</div>
            <div className="sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="alert alert-info" style={{ marginBottom: 16 }}>
        Klik baris KB untuk melihat detail wallet dan statistik dokumen.
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID KB</th>
              <th>Nama Perusahaan</th>
              <th>Nomor Izin</th>
              <th>Alamat Kontrak</th>
              <th>Pejabat BC (adminBC)</th>
              <th>Operator KB</th>
              <th>Tgl Deploy</th>
              <th>Status</th>
              <th style={{ width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {daftarKB.length === 0 ? (
              <tr><td colSpan={9}>
                <div className="empty"><div className="empty-icon">◈</div>Belum ada KB terdaftar</div>
              </td></tr>
            ) : daftarKB.map(kb => (
              <>
                <tr
                  key={kb.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => handleExpand(kb.id)}
                >
                  <td><strong style={{ color: "#0c2d6b" }}>{kb.id}</strong></td>
                  <td>{kb.namaPerusahaan}</td>
                  <td><span className="mono" style={{ fontSize: 11 }}>{kb.nomorIzin}</span></td>
                  <td><span className="mono" style={{ fontSize: 11, color: "#6366f1" }}>{shortAddr(kb.alamatKontrak)}</span></td>
                  <td><span className="mono" style={{ fontSize: 11 }}>{shortAddr(kb.adminBC)}</span></td>
                  <td><span className="mono" style={{ fontSize: 11 }}>{shortAddr(kb.operator)}</span></td>
                  <td style={{ fontSize: 11, color: "#64748b" }}>{tglDeploy(kb.tanggalDeploy)}</td>
                  <td>
                    {kb.izinAktif
                      ? <span className="badge badge-active">Aktif</span>
                      : <span className="badge badge-frozen">Dibekukan</span>}
                  </td>
                  <td style={{ color: "#94a3b8", fontSize: 12, textAlign: "center" }}>
                    {expandedKB === kb.id ? "▲" : "▼"}
                  </td>
                </tr>

                {expandedKB === kb.id && (
                  <tr key={`${kb.id}-exp`}>
                    <td colSpan={9} style={{ padding: 0, background: "#f8faff" }}>
                      <div style={{ padding: "16px 20px", borderTop: "2px solid #e0e7ff" }}>

                        {/* Statistik dokumen */}
                        <div style={{ fontWeight: 600, fontSize: 12, color: "#0c2d6b", marginBottom: 12 }}>
                          Statistik Dokumen — {kb.id}
                        </div>
                        {loadingStat && !statKB[kb.id]
                          ? <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 12 }}>Memuat statistik...</div>
                          : statKB[kb.id] && (
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                              {[
                                { label: "Barang Masuk",    val: statKB[kb.id].totalMasuk,      color: "#0c2d6b",  bg: "#f0f4ff" },
                                { label: "Barang Keluar",   val: statKB[kb.id].totalKeluar,     color: "#0369a1",  bg: "#f0f9ff" },
                                { label: "Hasil Produksi",  val: statKB[kb.id].totalProduksi,   color: "#166534",  bg: "#dcfce7" },
                                { label: "Scrap (BC 2.5)",  val: statKB[kb.id].totalScrap,      color: "#92400e",  bg: "#fef3c7" },
                                {
                                  label: "Pemusnahan (BA)",
                                  val: statKB[kb.id].totalPemusnahan,
                                  color: statKB[kb.id].totalPemusnahan > 0 ? "#991b1b" : "#64748b",
                                  bg:    statKB[kb.id].totalPemusnahan > 0 ? "#fee2e2" : "#f8fafc",
                                },
                              ].map(s => (
                                <div key={s.label} style={{
                                  background: s.bg, border: `1px solid ${s.color}25`,
                                  borderRadius: 8, padding: "10px 18px", minWidth: 120, textAlign: "center",
                                }}>
                                  <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.val}</div>
                                  <div style={{ fontSize: 10, color: s.color, marginTop: 2 }}>{s.label}</div>
                                </div>
                              ))}
                            </div>
                          )
                        }

                        {/* Detail wallet */}
                        <div style={{ fontWeight: 600, fontSize: 12, color: "#0c2d6b", marginBottom: 8 }}>
                          Alamat Wallet
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                          {[
                            { label: "Alamat Kontrak KB",          val: kb.alamatKontrak },
                            { label: "Pejabat BC (adminBC)",       val: kb.adminBC },
                            { label: "Operator KB (PKB/PDKB)",     val: kb.operator },
                          ].map(item => (
                            <div key={item.label} style={{
                              background: "#fff", border: "0.5px solid #e2e8f0",
                              borderRadius: 6, padding: "8px 12px",
                            }}>
                              <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 4 }}>{item.label}</div>
                              <div className="mono" style={{ fontSize: 10, color: "#0c2d6b", wordBreak: "break-all" }}>
                                {item.val || "\u2014"}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  // PAGE: KELOLA PEJABAT BC
  // ═══════════════════════════════════════════════════════════
  if (page === "tambah_bc") return (
    <div>
      <div className="page-header">
        <h1>Kelola Pejabat BC</h1>
        <p>Daftar Pejabat Bea Cukai yang terdaftar sebagai pengawas Kawasan Berikat</p>
      </div>
      {pesan && <div className={`alert alert-${pesan.tipe}`}>{pesan.teks}</div>}
      {loadingBanner}

      {/* ── Daftar pejabat terdaftar (on-chain) ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Pejabat BC Terdaftar</span>
          <span style={{ fontSize: 11, color: "#64748b" }}>
            Sumber: field <code style={{ background: "#f0f4ff", padding: "1px 4px", borderRadius: 3 }}>adminBC</code> tiap kontrak KB on-chain
          </span>
        </div>
        {daftarPejabat.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">◈</div>
            {blockchain.ready ? "Belum ada pejabat BC terdaftar" : "Menghubungkan ke blockchain..."}
          </div>
        ) : (
          <div className="table-wrap" style={{ margin: 0, border: "none" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>No</th>
                  <th>Alamat Wallet</th>
                  <th>KB yang Diawasi</th>
                  <th>Jumlah KB</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {daftarPejabat.map((p, i) => (
                  <tr key={p.wallet}>
                    <td style={{ color: "#94a3b8" }}>{i + 1}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%",
                          background: "#f0f4ff", color: "#0c2d6b",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, fontWeight: 700, flexShrink: 0,
                        }}>BC</div>
                        <span className="mono" style={{ fontSize: 12 }}>{p.wallet}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {p.kbDiawasi.map(id => (
                          <span key={id} style={{
                            background: "#f0f4ff", color: "#0c2d6b",
                            fontSize: 11, padding: "2px 8px", borderRadius: 99, fontWeight: 500,
                          }}>{id}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <strong style={{ fontSize: 14, color: "#0c2d6b" }}>{p.kbDiawasi.length}</strong>
                      <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 4 }}>KB</span>
                    </td>
                    <td><span className="badge badge-active">Aktif</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Form tambah + list sesi ── */}
      <div className="two-col" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Tambah Pejabat BC Baru</span></div>
          <div className="alert alert-info" style={{ marginBottom: 14 }}>
            Wallet ini akan menjadi <code>adminBC</code> pada kontrak KB yang ditunjuk. Pastikan milik pejabat yang berwenang.
          </div>
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!formBC.wallet.startsWith("0x") || formBC.wallet.length !== 42) {
              tampilPesan("error", "Format wallet tidak valid (harus 0x + 40 karakter hex).");
              return;
            }
            tampilPesan("success", `Wallet ${formBC.wallet.slice(0, 10)}... berhasil dicatat.`);
            setDaftarBCBaru(prev => [...new Set([...prev, formBC.wallet.toLowerCase()])]);
            setFormBC({ wallet: "" });
          }}>
            <div className="form-group">
              <label>Alamat Wallet Pejabat BC</label>
              <input
                placeholder="0x..."
                value={formBC.wallet}
                onChange={e => setFormBC({ wallet: e.target.value })}
                style={{ fontFamily: "monospace" }}
                required
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={blockchain.isLoading}>
              {blockchain.isLoading ? "Memproses..." : "Catat Pejabat BC"}
            </button>
          </form>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Ditambahkan di Sesi Ini</span></div>
          <div className="alert alert-warning" style={{ marginBottom: 14, fontSize: 11 }}>
            Catatan sesi bersifat sementara. Untuk akses resmi, daftarkan wallet sebagai <code>adminBC</code> saat mendaftarkan KB baru.
          </div>
          {daftarBCBaru.length === 0 ? (
            <div className="empty"><div className="empty-icon">◈</div>Belum ada</div>
          ) : (
            <div className="table-wrap" style={{ margin: 0, border: "none" }}>
              <table>
                <thead><tr><th>No</th><th>Alamat Wallet</th></tr></thead>
                <tbody>
                  {daftarBCBaru.map((addr, i) => (
                    <tr key={i}>
                      <td style={{ color: "#94a3b8" }}>{i + 1}</td>
                      <td><span className="mono">{addr}</span></td>
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

  // ═══════════════════════════════════════════════════════════
  // PAGE: DAFTARKAN KB BARU
  // ═══════════════════════════════════════════════════════════
  if (page === "daftar_kb") return (
    <div>
      <div className="page-header">
        <h1>Daftarkan Kawasan Berikat</h1>
        <p>Penerbitan izin KB baru — deploy KBContract_v3 otomatis via MasterRegistry</p>
      </div>
      {pesan && <div className={`alert alert-${pesan.tipe}`}>{pesan.teks}</div>}
      {loadingBanner}

      {/* ── Info wallet aktif — panduan pengisian ── */}
      <div style={{
        background: "#eff6ff", border: "1px solid #bfdbfe",
        borderRadius: 10, padding: "12px 16px", marginBottom: 20,
        display: "flex", alignItems: "flex-start", gap: 12,
      }}>
        <span style={{ fontSize: 20 }}>💡</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: "#1e40af", marginBottom: 4 }}>
            Wallet DJBC yang sedang aktif:
          </div>
          <code style={{
            display: "block", background: "#dbeafe", color: "#1e3a8a",
            padding: "4px 10px", borderRadius: 6, fontSize: 12,
            fontFamily: "monospace", marginBottom: 8, wordBreak: "break-all",
          }}>
            {walletAddress || "Belum terhubung"}
          </code>
          <div style={{ fontSize: 12, color: "#1e40af", lineHeight: 1.6 }}>
            Isi field <strong>Wallet Operator KB</strong> dengan alamat wallet MetaMask milik operator perusahaan tersebut.
            Operator tersebut nantinya bisa login langsung dengan wallet itu — tanpa perlu konfigurasi tambahan.
            Gunakan tombol <strong>"Pakai Wallet Saya"</strong> jika Anda ingin menguji sebagai operator sekarang.
          </div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-header"><span className="card-title">Form Pendaftaran KB Baru</span></div>
        <form onSubmit={async (e) => {
          e.preventDefault();
          try {
            const result = await blockchain.submitRegisterKB(
              form.idKB,
              form.namaPerusahaan,
              form.nomorIzin,
              form.tanggalIzin ? Math.floor(new Date(form.tanggalIzin).getTime() / 1000) : Math.floor(Date.now() / 1000),
              form.adminBC,
              form.operator,
              form.auditorDJP,
            );
            tampilPesan("success",
              `✅ KB "${form.namaPerusahaan}" berhasil didaftarkan. TX: ${result.txHash.slice(0,10)}... Block #${result.blockNumber}`
            );
            setForm({ idKB: "", namaPerusahaan: "", nomorIzin: "", tanggalIzin: "", adminBC: "", operator: "", auditorDJP: "" });
            await muatKB();
          } catch (err: any) {
            tampilPesan("error", err?.message ?? "Gagal mendaftarkan KB");
          }
        }}>
          <div className="two-col">
            <div className="form-group">
              <label>ID KB (kode unik)</label>
              <input placeholder="KB-JKT-002" value={form.idKB}
                onChange={e => setForm({ ...form, idKB: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Nomor SK Izin</label>
              <input placeholder="KEP-002/KPU.01/2026" value={form.nomorIzin}
                onChange={e => setForm({ ...form, nomorIzin: e.target.value })} required />
            </div>
          </div>
          <div className="form-group">
            <label>Tanggal SK Izin</label>
            <input type="date" value={form.tanggalIzin}
              onChange={e => setForm({ ...form, tanggalIzin: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Nama Perusahaan (PKB/PDKB)</label>
            <input placeholder="PT Karya Ekspor Mandiri" value={form.namaPerusahaan}
              onChange={e => setForm({ ...form, namaPerusahaan: e.target.value })} required />
          </div>

          {/* ── Wallet Pejabat BC ── */}
          <div className="form-group">
            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Wallet Pejabat BC (adminBC)</span>
              <button type="button"
                onClick={() => setForm({ ...form, adminBC: walletAddress })}
                style={{
                  fontSize: 11, padding: "2px 8px", background: "#eff6ff",
                  border: "1px solid #bfdbfe", borderRadius: 6,
                  color: "#1e40af", cursor: "pointer", fontWeight: 500,
                }}>
                📋 Pakai Wallet Saya
              </button>
            </label>
            <input placeholder="0x70997970..." value={form.adminBC}
              style={{ fontFamily: "monospace" }}
              onChange={e => setForm({ ...form, adminBC: e.target.value })} required />
          </div>

          {/* ── Wallet Operator KB — kunci utama akses login ── */}
          <div className="form-group">
            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Wallet Operator KB</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button"
                  onClick={() => setForm({ ...form, operator: walletAddress })}
                  style={{
                    fontSize: 11, padding: "2px 8px", background: "#eff6ff",
                    border: "1px solid #bfdbfe", borderRadius: 6,
                    color: "#1e40af", cursor: "pointer", fontWeight: 500,
                  }}>
                  📋 Pakai Wallet Saya
                </button>
              </div>
            </label>
            <input placeholder="0x3C44Cd..." value={form.operator}
              style={{ fontFamily: "monospace" }}
              onChange={e => setForm({ ...form, operator: e.target.value })} required />
            <div style={{
              fontSize: 11, color: "#64748b", marginTop: 4,
              background: "#f8fafc", padding: "6px 10px", borderRadius: 6,
              lineHeight: 1.5,
            }}>
              ⚠️ Pastikan wallet ini milik operator perusahaan KB tersebut. Setelah didaftarkan,
              operator cukup login MetaMask dengan wallet ini — sistem otomatis mendeteksi role dan KB-nya.
            </div>
          </div>

          <div className="form-group">
            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Wallet Auditor DJP (opsional)</span>
              <button type="button"
                onClick={() => setForm({ ...form, auditorDJP: walletAddress })}
                style={{
                  fontSize: 11, padding: "2px 8px", background: "#f0fdf4",
                  border: "1px solid #bbf7d0", borderRadius: 6,
                  color: "#166534", cursor: "pointer", fontWeight: 500,
                }}>
                📋 Pakai Wallet Saya
              </button>
            </label>
            <input placeholder="0x90F79b..." value={form.auditorDJP}
              style={{ fontFamily: "monospace" }}
              onChange={e => setForm({ ...form, auditorDJP: e.target.value })} />
          </div>

          <button className="btn btn-primary" type="submit" disabled={blockchain.isLoading}>
            {blockchain.isLoading ? "Memproses..." : "Terbitkan Izin & Deploy Kontrak"}
          </button>
        </form>
        <div className="alert alert-info" style={{ marginTop: 14, marginBottom: 0 }}>
          KBContract baru otomatis ter-deploy dan terhubung ke MasterRegistry.
          Operator KB bisa langsung login setelah kontrak ter-deploy.
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  // PAGE: DASHBOARD (default)
  // ═══════════════════════════════════════════════════════════
  return (
    <div>
      <div className="page-header">
        <h1>Dashboard DJBC</h1>
        <p>Monitoring semua Kawasan Berikat — Pasal 19 PER-9/BC/2021</p>
      </div>
      {pesan && <div className={`alert alert-${pesan.tipe}`}>{pesan.teks}</div>}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Total KB Terdaftar</div>
          <div className="value">{daftarKB.length}</div>
          <div className="sub">on-chain MasterRegistry_v3</div>
        </div>
        <div className="stat-card">
          <div className="label">KB Aktif</div>
          <div className="value" style={{ color: "#16a34a" }}>{aktif}</div>
          <div className="sub">izin berlaku</div>
        </div>
        <div className="stat-card">
          <div className="label">KB Dibekukan</div>
          <div className="value" style={{ color: "#d97706" }}>{beku}</div>
          <div className="sub">perlu tindak lanjut</div>
        </div>
        <div className="stat-card">
          <div className="label">Pejabat BC</div>
          <div className="value">{daftarPejabat.length}</div>
          <div className="sub">terdaftar</div>
        </div>
        <div className="stat-card">
          <div className="label">Jaringan</div>
          <div className="value" style={{
            fontSize: 14, marginTop: 4,
            color: blockchain.ready ? "#16a34a" : "#d97706",
          }}>
            {blockchain.ready ? "Terhubung" : "Menunggu..."}
          </div>
          <div className="sub">Hardhat Local :8545</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Kawasan Berikat Terdaftar</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={() => setPage("monitoring")}>
              Monitoring Detail
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => setPage("daftar_kb")}>
              + Daftarkan KB Baru
            </button>
          </div>
        </div>
        <div className="table-wrap" style={{ margin: 0, border: "none" }}>
          <table>
            <thead>
              <tr>
                <th>ID KB</th>
                <th>Nama Perusahaan</th>
                <th>Nomor Izin</th>
                <th>Alamat Kontrak</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {daftarKB.length === 0 ? (
                <tr><td colSpan={5}>
                  <div className="empty">
                    <div className="empty-icon">◈</div>
                    Belum ada KB yang terdaftar
                  </div>
                </td></tr>
              ) : daftarKB.map(kb => (
                <tr key={kb.id}>
                  <td><strong>{kb.id}</strong></td>
                  <td>{kb.namaPerusahaan}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{kb.nomorIzin}</td>
                  <td>
                    <span className="mono" style={{ fontSize: 11 }}>
                      {kb.alamatKontrak?.slice(0, 10)}...{kb.alamatKontrak?.slice(-8)}
                    </span>
                  </td>
                  <td>
                    {kb.izinAktif
                      ? <span className="badge badge-active">Aktif</span>
                      : <span className="badge badge-frozen">Dibekukan</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
