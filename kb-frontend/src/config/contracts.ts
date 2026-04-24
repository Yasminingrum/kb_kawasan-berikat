// kb-frontend/src/config/contracts.ts
// =============================================================
// Konfigurasi contract address, network, dan pemetaan wallet → role.
//
// CATATAN v4:
//   - Role "operator_kb" tidak lagi di-hardcode di sini.
//     Deteksi dilakukan dinamis dari blockchain di App.tsx:
//     wallet yang cocok dengan field `operator` di KBContract
//     mana pun akan otomatis mendapat role operator_kb.
//   - Yang perlu di-hardcode hanya role DJBC, Pejabat BC, dan DJP
//     karena role tersebut tidak tersimpan di kontrak KB.
//
// CARA UPDATE SETELAH DEPLOY ULANG:
//   1. Jalankan: npx hardhat ignition deploy ./ignition/modules/deploy.ts
//   2. Lihat output terminal → salin alamat MasterRegistry_v3
//   3. Update VITE_MASTER_REGISTRY_ADDRESS di file .env
//   4. Restart dev server (npm run dev)
// =============================================================

import type { Role } from "../App";

// ── Network Config ────────────────────────────────────────────

export const NETWORK_CONFIG = {
  chainId:  31337,            // Hardhat local network
  name:     "Hardhat Local",
  rpcUrl:   "http://127.0.0.1:8545",
} as const;

// ── Wallet → Role Mapping (statis) ───────────────────────────
// Hanya untuk role yang tidak bisa dideteksi dari kontrak KB:
//   DJBC  → deployer / owner MasterRegistry
//   Pejabat BC → pengawas KB
//   DJP   → auditor read-only
//
// Role "operator_kb" dideteksi otomatis dari blockchain.
// Tambahkan akun Hardhat yang dipakai untuk masing-masing role.

export const WALLET_ROLES: Record<string, Role> = {
  // ── DJBC (owner MasterRegistry, akun #0 Hardhat) ──────────
  "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266": "djbc",

  // ── Pejabat BC (akun #1 Hardhat) ─────────────────────────
  "0x70997970c51812dc3a010c7d01b50e0d17dc79c8": "pejabat_bc",

  // ── Auditor DJP (akun #4 Hardhat) ────────────────────────
  "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65": "djp",
};
