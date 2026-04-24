// kb-blockchain/ignition/modules/deploy.ts
// =============================================================
// Hardhat Ignition deployment module untuk v3.
//
// Perubahan v2 --> v3:
//   - Deploy MasterRegistry_v3 (bukan v2)
//   - MasterRegistry_v3 otomatis deploy KBContract_v3
//     via Factory Pattern saat registerKawasanBerikat() dipanggil
//
// Cara deploy:
//   npx hardhat ignition deploy ./ignition/modules/deploy.ts --network localhost
//
// Setelah deploy:
//   1. Salin alamat MasterRegistry_v3 dari output
//   2. Paste ke kb-frontend/.env → VITE_MASTER_REGISTRY_ADDRESS
//   3. Restart: npm run dev
// =============================================================

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const KBDeployModule = buildModule("KBDeployModule", (m) => {

  // ── Deploy MasterRegistry_v3 ─────────────────────────────
  // Constructor tidak butuh parameter — owner otomatis = deployer (msg.sender)
  // Deployer account ini yang akan menjadi DJBC (owner) di sistem

  const masterRegistry = m.contract("MasterRegistry_v3");

  return { masterRegistry };
});

export default KBDeployModule;
