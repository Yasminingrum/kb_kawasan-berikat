// Sidebar.tsx — v3
import type { Role, Page } from "../App";

interface MenuItem { id: Page; label: string; icon: string; }

const MENUS: Record<Role, MenuItem[]> = {
  djbc: [
    { id: "dashboard",    label: "Dashboard",        icon: "◉" },
    { id: "daftar_kb",    label: "Daftarkan KB",     icon: "＋" },
    { id: "monitoring",   label: "Monitoring KB",    icon: "◈" },
    { id: "tambah_bc",    label: "Kelola Pejabat BC", icon: "👤" },
  ],
  pejabat_bc: [
    { id: "pejabat_izin",        label: "Kelola Izin KB",      icon: "◉" },
    { id: "pejabat_bom",         label: "Persetujuan BOM",     icon: "✓" }, // v4
    { id: "pejabat_opname",      label: "Stock Opname",        icon: "◈" },
    { id: "pejabat_pemusnahan",  label: "Pemusnahan (BA)",     icon: "🔥" }, // v3
    { id: "pejabat_laporan",     label: "Laporan & Audit",     icon: "▣" },
  ],
  operator_kb: [
    { id: "kb_beranda",   label: "Beranda KB",                  icon: "◉" },
    { id: "kb_barang",    label: "Jenis Barang",                icon: "▣" },
    { id: "kb_masuk",     label: "Barang Masuk",                icon: "↓" },
    { id: "kb_bom",       label: "Formula Produksi (BOM)",      icon: "◎" }, // v4
    { id: "kb_produksi",  label: "Proses Produksi (WIP)",       icon: "⚙" },
    { id: "kb_ekspor",    label: "Ekspor (PEB)",                icon: "↑" },
    { id: "kb_scrap",     label: "Scrap (BC 2.5)",              icon: "♻" }, // v3
    { id: "kb_laporan",   label: "Laporan",                     icon: "◈" },
  ],
  djp: [
    { id: "djp_laporan",  label: "Laporan Pajak",    icon: "◉" },
  ],
};

const SECTIONS: Record<Role, string> = {
  djbc:        "Manajemen",
  pejabat_bc:  "Pengawasan",
  operator_kb: "Inventory",
  djp:         "Monitoring",
};

export default function Sidebar({
  role, page, setPage,
}: {
  role: Role; page: Page; setPage: (p: Page) => void;
}) {
  return (
    <aside className="sidebar">
      <div style={{ padding: "12px 16px 8px", marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>Jaringan</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#16a34a" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#16a34a", display: "inline-block" }} />
          Hardhat Local
        </div>
      </div>
      <div style={{ margin: "0 16px 12px", borderBottom: "0.5px solid #e2e8f0" }} />
      <div className="sidebar-section">{SECTIONS[role]}</div>
      {MENUS[role].map(item => (
        <div
          key={item.id}
          className={`sidebar-item ${page === item.id ? "active" : ""}`}
          onClick={() => setPage(item.id)}
        >
          <span className="sidebar-icon">{item.icon}</span>
          {item.label}
        </div>
      ))}
    </aside>
  );
}
