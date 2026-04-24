// App.tsx — v4 (fix: pisah useEffect role statis vs operator KB)
// =============================================================
// Perubahan:
//   - useEffect dipecah menjadi dua:
//     1. Effect pertama: deteksi role STATIS (DJBC, Pejabat BC, DJP)
//        — hanya bergantung pada metamask.account, tidak butuh blockchain
//     2. Effect kedua: deteksi role OPERATOR KB dari blockchain
//        — bergantung pada metamask.account + blockchain.ready + role
//        — hanya jalan jika role belum terdeteksi oleh effect pertama
//   - Ini menghilangkan error "deps array changed size" karena
//     setiap useEffect memiliki deps array yang ukurannya konstan.
// =============================================================

import { useState, useEffect } from "react";
import { useMetaMask } from "./hooks/useMetaMask";
import { useBlockchain } from "./hooks/useBlockchain";
import { WALLET_ROLES } from "./config/contracts";
import { bcGetDaftarSemuaKB, bcGetInfoKontrak } from "./service/blockchainService";
import LoginPage from "./pages/LoginPage";
import DashboardDJBC from "./pages/DashboardDJBC";
import PortalPejabatBC from "./pages/PortalPejabatBC";
import PortalOperatorKB from "./pages/PortalOperatorKB";
import PortalDJP from "./pages/PortalDJP";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import LaporanPejabatBC from "./pages/LaporanPejabatBC";

export type Role = "djbc" | "pejabat_bc" | "operator_kb" | "djp";

export type Page =
  | "dashboard" | "daftar_kb" | "monitoring" | "tambah_bc"
  | "pejabat_izin" | "pejabat_opname" | "pejabat_laporan"
  | "pejabat_pemusnahan"
  | "pejabat_bom"
  | "kb_beranda" | "kb_barang" | "kb_masuk"
  | "kb_produksi" | "kb_ekspor"
  | "kb_scrap"
  | "kb_bom"
  | "kb_laporan"
  | "djp_laporan";

export default function App() {
  const metamask   = useMetaMask();
  const blockchain = useBlockchain(metamask.provider, metamask.signer);

  const [role, setRole]                 = useState<Role | null>(null);
  const [page, setPage]                 = useState<Page>("dashboard");
  const [selectedKBId, setSelectedKBId] = useState("");
  const [detecting, setDetecting]       = useState(false);

  // ── Effect 1: Deteksi role STATIS (tidak butuh blockchain) ───
  // Deps: [metamask.account] — ukuran selalu 1, tidak berubah
  useEffect(() => {
    if (!metamask.account) {
      setRole(null);
      setDetecting(false);
      return;
    }

    const addr = metamask.account.toLowerCase();
    const staticRole = WALLET_ROLES[addr];

    if (staticRole) {
      setRole(staticRole);
      setDetecting(false);
      setPage(
        staticRole === "djbc"       ? "dashboard"    :
        staticRole === "pejabat_bc" ? "pejabat_izin" :
        "djp_laporan"
      );
    } else {
      // Bukan role statis — tandai sedang menunggu deteksi blockchain
      setRole(null);
      setDetecting(true);
    }
  }, [metamask.account]);

  // ── Effect 2: Deteksi role OPERATOR KB dari blockchain ────────
  // Hanya jalan jika wallet connect, blockchain ready, dan role belum ada
  // Deps: [metamask.account, blockchain.ready, role] — ukuran selalu 3
  useEffect(() => {
    if (!metamask.account || !blockchain.ready || role !== null) return;

    const addr = metamask.account.toLowerCase();

    // Sudah ditangani Effect 1
    if (WALLET_ROLES[addr]) return;

    let cancelled = false;

    (async () => {
      try {
        const idList = await bcGetDaftarSemuaKB();
        for (const idKB of idList) {
          if (cancelled) return;
          try {
            const info = await bcGetInfoKontrak(idKB);
            if (
              info.operator?.toLowerCase() === addr ||
              info.adminBC?.toLowerCase()  === addr
            ) {
              if (!cancelled) {
                setRole("operator_kb");
                setSelectedKBId(idKB);
                setPage("kb_beranda");
              }
              return;
            }
          } catch { /* skip KB yang kontraknya gagal dibaca */ }
        }
        if (!cancelled) setRole(null);
      } catch (e) {
        console.error("Role detection error:", e);
        if (!cancelled) setRole(null);
      } finally {
        if (!cancelled) setDetecting(false);
      }
    })();

    return () => { cancelled = true; };
  }, [metamask.account, blockchain.ready, role]);

  // ── LoginPage: belum connect atau role belum terdeteksi ───────
  if (!metamask.connected || !role) {
    return (
      <LoginPage
        onConnect={metamask.connect}
        connecting={metamask.connecting}
        error={metamask.error}
        account={metamask.account}
        detecting={detecting}
      />
    );
  }

  // ── Error blockchain (network salah, Hardhat mati) ────────────
  if (!blockchain.ready && blockchain.error) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", flexDirection: "column", gap: "1rem", padding: "2rem",
      }}>
        <p style={{ color: "#ef4444", fontWeight: 600 }}>⚠️ {blockchain.error}</p>
        <button onClick={metamask.disconnect} style={{ padding: "0.5rem 1rem" }}>
          Kembali ke Login
        </button>
      </div>
    );
  }

  // ── Render halaman ────────────────────────────────────────────
  const renderPage = () => {
    switch (page) {
      case "dashboard":
      case "daftar_kb":
      case "monitoring":
        return (
          <DashboardDJBC
            page={page}
            setPage={setPage}
            blockchain={blockchain}
            walletAddress={metamask.account || ""}
          />
        );

      case "pejabat_izin":
      case "pejabat_opname":
      case "pejabat_pemusnahan":
      case "pejabat_bom":
        return (
          <PortalPejabatBC
            page={page}
            blockchain={blockchain}
            walletAddress={metamask.account || ""}
          />
        );

      case "pejabat_laporan":
        return <LaporanPejabatBC blockchain={blockchain} />;

      case "kb_beranda":
      case "kb_barang":
      case "kb_masuk":
      case "kb_produksi":
      case "kb_ekspor":
      case "kb_scrap":
      case "kb_bom":
      case "kb_laporan":
        return (
          <PortalOperatorKB
            page={page}
            selectedKBId={selectedKBId}
            setSelectedKBId={setSelectedKBId}
            walletAddress={metamask.account || ""}
            blockchain={blockchain}
          />
        );

      case "djp_laporan":
        return <PortalDJP blockchain={blockchain} />;

      default:
        return (
          <DashboardDJBC
            page={page}
            setPage={setPage}
            blockchain={blockchain}
          />
        );
    }
  };

  return (
    <div>
      <Navbar
        role={role}
        account={metamask.account || ""}
        onLogout={metamask.disconnect}
      />
      <div className="layout">
        <Sidebar role={role} page={page} setPage={setPage} />
        <main className="main">
          {blockchain.error && (
            <div style={{
              background: "#fef2f2", border: "1px solid #fca5a5",
              borderRadius: "8px", padding: "0.75rem 1rem",
              margin: "1rem", color: "#b91c1c", fontSize: "0.875rem",
            }}>
              ⚠️ {blockchain.error}
            </div>
          )}
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
