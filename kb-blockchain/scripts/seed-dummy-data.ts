// kb-blockchain/scripts/seed-dummy-data.ts — v2
// =============================================================
// Script pengisian dummy data menggunakan Firebase Admin SDK.
// Admin SDK bypass Firestore Security Rules sepenuhnya —
// tidak perlu ubah rules, tidak perlu Firebase Auth.
//
// PRASYARAT:
//   1. npm install firebase-admin  (di folder kb-blockchain)
//   2. Download serviceAccountKey.json dari:
//      Firebase Console → Project Settings → Service accounts
//      → Generate new private key → simpan ke scripts/serviceAccountKey.json
//   3. Hardhat node berjalan + setup.ts sudah dijalankan
//
// Cara menjalankan:
//   npx hardhat run scripts/seed-dummy-data.ts --network localhost
// =============================================================

import { ethers }                   from "hardhat";
import { initializeApp, cert }      from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync }             from "fs";
import { join }                     from "path";

// ── Konfigurasi ───────────────────────────────────────────────

const MASTER_REGISTRY_ADDRESS = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
const ID_KB                   = "KB-SBY-001";
const KOLEKSI_KB              = "kawasan_berikat";

// ── Inisialisasi Firebase Admin SDK ──────────────────────────

const serviceAccountPath = join(__dirname, "serviceAccountKey.json");

let serviceAccount: object;
try {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));
} catch {
  console.error("\n❌ File tidak ditemukan: scripts/serviceAccountKey.json");
  console.error("   Download dari: Firebase Console → Project Settings");
  console.error("   → Service accounts → Generate new private key\n");
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount as any) });
const db = getFirestore();

// ── Helpers ───────────────────────────────────────────────────

function subCol(sub: string) {
  return db.collection(KOLEKSI_KB).doc(ID_KB).collection(sub);
}

function h(str: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(str));
}

function hData(obj: object): string {
  const json = JSON.stringify(obj, Object.keys(obj).sort());
  return ethers.keccak256(ethers.toUtf8Bytes(json));
}

async function simpan(
  sub: string,
  data: object,
  txHash: string,
  blockNumber: number
): Promise<string> {
  const ref = await subCol(sub).add({
    ...data,
    dataHash:  hData(data),
    txHash,
    blockNumber,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

function log(icon: string, label: string, detail: string) {
  console.log(`  ${icon} ${label.padEnd(35)} ${detail}`);
}

// =============================================================
// MAIN
// =============================================================

async function main() {
  const [, pejabatBC, operatorSBY] = await ethers.getSigners();

  console.log("\n" + "=".repeat(65));
  console.log("  SEED DUMMY DATA — KB-SBY-001 (PT Maju Bersama Tekstil)");
  console.log("=".repeat(65));

  const registry = await ethers.getContractAt(
    "MasterRegistry_v3", MASTER_REGISTRY_ADDRESS
  ) as any;
  const infoKB = await registry.getInfoKB(ID_KB);
  const kb     = await ethers.getContractAt("KBContract_v3", infoKB.alamatKontrak) as any;

  console.log(`\n  Kontrak KB : ${infoKB.alamatKontrak}`);
  console.log(`  Operator   : ${operatorSBY.address}`);
  console.log(`  Pejabat BC : ${pejabatBC.address}\n`);

  // ===========================================================
  // [1/7] VALIDASI BOM
  // ===========================================================

  console.log("─".repeat(65));
  console.log("  [1/7] VALIDASI BILL OF MATERIALS");
  console.log("─".repeat(65));

  const bomList = [
    {
      kodeFormulaStr: `${ID_KB}:BOM-KAOS-CTN-v1:v1`,
      data: {
        idKB: ID_KB,
        kodeFormula: "BOM-KAOS-CTN-v1", namaProduk: "Kaos Cotton Combed 30s",
        kodeHSProduk: "6109.10.10", versi: "v1",
        komposisi: [
          { kodeBarangInternal: "KAIN-CTN-001", namaBarang: "Kain Cotton Greige", kodeHS: "5208.11.00", rasio: 0.28,  satuan: "kg"  },
          { kodeBarangInternal: "BNT-PTH-001",  namaBarang: "Benang Jahit Putih", kodeHS: "5204.11.00", rasio: 0.005, satuan: "kg"  },
          { kodeBarangInternal: "LBL-WVN-001",  namaBarang: "Label Woven",        kodeHS: "5807.10.00", rasio: 1,     satuan: "pcs" },
        ],
        toleransiScrapPersen: 8, toleransiWastedPersen: 2,
        validasiOleh: pejabatBC.address, tanggalValidasi: "2026-01-10T08:00:00.000Z",
      },
    },
    {
      kodeFormulaStr: `${ID_KB}:BOM-KMJA-PLY-v1:v1`,
      data: {
        idKB: ID_KB,
        kodeFormula: "BOM-KMJA-PLY-v1", namaProduk: "Kemeja Polyester Formal",
        kodeHSProduk: "6205.20.00", versi: "v1",
        komposisi: [
          { kodeBarangInternal: "KAIN-PLY-001", namaBarang: "Kain Polyester Twill", kodeHS: "5407.52.00", rasio: 0.35,  satuan: "kg"  },
          { kodeBarangInternal: "BNT-PTH-001",  namaBarang: "Benang Jahit Putih",   kodeHS: "5204.11.00", rasio: 0.008, satuan: "kg"  },
          { kodeBarangInternal: "KNC-PLK-001",  namaBarang: "Kancing Polyester",    kodeHS: "9606.21.00", rasio: 7,     satuan: "pcs" },
          { kodeBarangInternal: "LBL-WVN-001",  namaBarang: "Label Woven",          kodeHS: "5807.10.00", rasio: 1,     satuan: "pcs" },
        ],
        toleransiScrapPersen: 6, toleransiWastedPersen: 1,
        validasiOleh: pejabatBC.address, tanggalValidasi: "2026-01-10T09:00:00.000Z",
      },
    },
  ];

  for (const bom of bomList) {
    const dataHash   = hData(bom.data);
    const forHash    = h(bom.kodeFormulaStr);
    const tx = await kb.connect(pejabatBC).validasiBOM(forHash, dataHash);
    const rc = await tx.wait();
    await simpan("bom", bom.data, rc.hash, rc.blockNumber);
    log("✅", "BOM divalidasi:", bom.data.kodeFormula);
  }

  // ===========================================================
  // [2/7] BARANG MASUK (PIB & TLDDP)
  // ===========================================================

  console.log("\n" + "─".repeat(65));
  console.log("  [2/7] BARANG MASUK (PIB & TLDDP)");
  console.log("─".repeat(65));

  // Enum Solidity: PIB=0, TLDDP=1
  const masukList: Array<{ jenis: number; data: any }> = [
    { jenis: 0, data: { idKB: ID_KB, jenisDokumen: "PIB",   nomorPIB:   "PIB-2026-SBY-00123",   tanggalPIB:   "2026-01-15T00:00:00.000Z", namaBarang: "Kain Cotton Greige",    kodeHS: "5208.11.00", kodeBarangInternal: "KAIN-CTN-001", negaraAsal: "Tiongkok",      jumlah: 5000,   satuan: "kg",  nilaiBarang: 350_000_000, operatorWallet: operatorSBY.address } },
    { jenis: 0, data: { idKB: ID_KB, jenisDokumen: "PIB",   nomorPIB:   "PIB-2026-SBY-00156",   tanggalPIB:   "2026-01-20T00:00:00.000Z", namaBarang: "Kain Polyester Twill",  kodeHS: "5407.52.00", kodeBarangInternal: "KAIN-PLY-001", negaraAsal: "Vietnam",       jumlah: 3000,   satuan: "kg",  nilaiBarang: 225_000_000, operatorWallet: operatorSBY.address } },
    { jenis: 0, data: { idKB: ID_KB, jenisDokumen: "PIB",   nomorPIB:   "PIB-2026-SBY-00189",   tanggalPIB:   "2026-01-25T00:00:00.000Z", namaBarang: "Kancing Polyester",     kodeHS: "9606.21.00", kodeBarangInternal: "KNC-PLK-001",  negaraAsal: "Korea Selatan", jumlah: 50000,  satuan: "pcs", nilaiBarang: 15_000_000,  operatorWallet: operatorSBY.address } },
    { jenis: 0, data: { idKB: ID_KB, jenisDokumen: "PIB",   nomorPIB:   "PIB-2026-SBY-00201",   tanggalPIB:   "2026-02-01T00:00:00.000Z", namaBarang: "Benang Jahit Putih",    kodeHS: "5204.11.00", kodeBarangInternal: "BNT-PTH-001",  negaraAsal: "Tiongkok",      jumlah: 200,    satuan: "kg",  nilaiBarang: 18_000_000,  operatorWallet: operatorSBY.address } },
    { jenis: 1, data: { idKB: ID_KB, jenisDokumen: "TLDDP", nomorTLDDP: "TLDDP-2026-SBY-00045", tanggalTLDDP: "2026-02-03T00:00:00.000Z", namaBarang: "Label Woven",           kodeHS: "5807.10.00", kodeBarangInternal: "LBL-WVN-001",  negaraAsal: "Indonesia",     jumlah: 100000, satuan: "pcs", nilaiBarang: 25_000_000,  operatorWallet: operatorSBY.address } },
    { jenis: 0, data: { idKB: ID_KB, jenisDokumen: "PIB",   nomorPIB:   "PIB-2026-SBY-00267",   tanggalPIB:   "2026-02-10T00:00:00.000Z", namaBarang: "Kain Cotton Greige",    kodeHS: "5208.11.00", kodeBarangInternal: "KAIN-CTN-001", negaraAsal: "Tiongkok",      jumlah: 8000,   satuan: "kg",  nilaiBarang: 560_000_000, operatorWallet: operatorSBY.address } },
  ];

  for (const item of masukList) {
    const nomorDok = item.data.jenisDokumen === "PIB"
      ? item.data.nomorPIB : item.data.nomorTLDDP;
    const tx = await kb.connect(operatorSBY).catatBarangMasuk(
      h(`${ID_KB}:${nomorDok}`), h(item.data.kodeBarangInternal),
      item.jenis, item.data.jumlah, hData(item.data)
    );
    const rc = await tx.wait();
    await simpan("barang_masuk", item.data, rc.hash, rc.blockNumber);
    log("✅", `${item.data.jenisDokumen} masuk:`,
      `${item.data.namaBarang} — ${item.data.jumlah.toLocaleString()} ${item.data.satuan}`);
  }

  // ===========================================================
  // [3/7] PRODUKSI
  // ===========================================================

  console.log("\n" + "─".repeat(65));
  console.log("  [3/7] PRODUKSI (WIP + HASIL PRODUKSI)");
  console.log("─".repeat(65));

  const batchList = [
    {
      wip: { idKB: ID_KB, idBatch: "BATCH-2026-SBY-001", kodeFormulaBOM: "BOM-KAOS-CTN-v1", kodeProdukInternal: "KAOS-CTN-PTH-001", namaProduk: "Kaos Cotton Combed 30s Putih", outputExpected: 10000, tanggalMulai: "2026-02-15T07:00:00.000Z", operatorWallet: operatorSBY.address,
        inputBahan: [{ kodeBarangInternal: "KAIN-CTN-001", namaBarang: "Kain Cotton Greige", jumlah: 2800, satuan: "kg" }, { kodeBarangInternal: "BNT-PTH-001", namaBarang: "Benang Jahit Putih", jumlah: 50, satuan: "kg" }, { kodeBarangInternal: "LBL-WVN-001", namaBarang: "Label Woven", jumlah: 10000, satuan: "pcs" }] },
      hasil: { idKB: ID_KB, idBatch: "BATCH-2026-SBY-001", kodeProdukInternal: "KAOS-CTN-PTH-001", namaBarangJadi: "Kaos Cotton Combed 30s Putih", kodeHS: "6109.10.10", jumlahOutput: 9750, satuan: "pcs", jumlahScrap: 180, jumlahWasted: 45, tanggalSelesai: "2026-02-22T16:00:00.000Z", operatorWallet: operatorSBY.address,
        bahanTerpakai: [{ kodeBarangInternal: "KAIN-CTN-001", namaBarang: "Kain Cotton Greige", jumlah: 2800 }, { kodeBarangInternal: "BNT-PTH-001", namaBarang: "Benang Jahit Putih", jumlah: 50 }, { kodeBarangInternal: "LBL-WVN-001", namaBarang: "Label Woven", jumlah: 9750 }] },
      bahanHash: ["KAIN-CTN-001","BNT-PTH-001","LBL-WVN-001"], bahanJumlah: [2800, 50, 9750],
    },
    {
      wip: { idKB: ID_KB, idBatch: "BATCH-2026-SBY-002", kodeFormulaBOM: "BOM-KMJA-PLY-v1", kodeProdukInternal: "KMJA-PLY-BRU-001", namaProduk: "Kemeja Polyester Formal Biru", outputExpected: 5000, tanggalMulai: "2026-02-20T07:00:00.000Z", operatorWallet: operatorSBY.address,
        inputBahan: [{ kodeBarangInternal: "KAIN-PLY-001", namaBarang: "Kain Polyester Twill", jumlah: 1750, satuan: "kg" }, { kodeBarangInternal: "BNT-PTH-001", namaBarang: "Benang Jahit Putih", jumlah: 40, satuan: "kg" }, { kodeBarangInternal: "KNC-PLK-001", namaBarang: "Kancing Polyester", jumlah: 35000, satuan: "pcs" }, { kodeBarangInternal: "LBL-WVN-001", namaBarang: "Label Woven", jumlah: 5000, satuan: "pcs" }] },
      hasil: { idKB: ID_KB, idBatch: "BATCH-2026-SBY-002", kodeProdukInternal: "KMJA-PLY-BRU-001", namaBarangJadi: "Kemeja Polyester Formal Biru", kodeHS: "6205.20.00", jumlahOutput: 4920, satuan: "pcs", jumlahScrap: 60, jumlahWasted: 15, tanggalSelesai: "2026-02-28T17:00:00.000Z", operatorWallet: operatorSBY.address,
        bahanTerpakai: [{ kodeBarangInternal: "KAIN-PLY-001", namaBarang: "Kain Polyester Twill", jumlah: 1750 }, { kodeBarangInternal: "BNT-PTH-001", namaBarang: "Benang Jahit Putih", jumlah: 40 }, { kodeBarangInternal: "KNC-PLK-001", namaBarang: "Kancing Polyester", jumlah: 34440 }, { kodeBarangInternal: "LBL-WVN-001", namaBarang: "Label Woven", jumlah: 4920 }] },
      bahanHash: ["KAIN-PLY-001","BNT-PTH-001","KNC-PLK-001","LBL-WVN-001"], bahanJumlah: [1750, 40, 34440, 4920],
    },
  ];

  for (const batch of batchList) {
    const idBatchHash = h(`${ID_KB}:${batch.wip.idBatch}`);
    // WIP
    const txW = await kb.connect(operatorSBY).buatWIP(idBatchHash, hData(batch.wip));
    const rcW = await txW.wait();
    await simpan("wip", { ...batch.wip, status: "selesai" }, rcW.hash, rcW.blockNumber);
    log("📦", "WIP dibuat:", batch.wip.idBatch);
    // Hasil Produksi
    const txH = await kb.connect(operatorSBY).catatHasilProduksi(
      idBatchHash, h(batch.hasil.kodeProdukInternal), batch.hasil.jumlahOutput,
      batch.bahanHash.map(k => h(k)), batch.bahanJumlah, hData(batch.hasil)
    );
    const rcH = await txH.wait();
    await simpan("hasil_produksi", batch.hasil, rcH.hash, rcH.blockNumber);
    log("🏭", "Produksi selesai:",
      `${batch.hasil.namaBarangJadi} — ${batch.hasil.jumlahOutput.toLocaleString()} pcs`);
  }

  // ===========================================================
  // [4/7] EKSPOR (PEB)
  // ===========================================================

  console.log("\n" + "─".repeat(65));
  console.log("  [4/7] BARANG KELUAR EKSPOR (PEB)");
  console.log("─".repeat(65));

  // Enum Solidity: PEB=0, LOKAL=2
  const eksporList: Array<{ data: any }> = [
    { data: { idKB: ID_KB, jenisDokumen: "PEB", nomorPEB: "PEB-2026-SBY-00089", tanggalPEB: "2026-03-05T00:00:00.000Z", namaBarang: "Kaos Cotton Combed 30s Putih",  kodeHS: "6109.10.10", kodeBarangInternal: "KAOS-CTN-PTH-001", negaraTujuan: "Jepang",          jumlah: 5000, satuan: "pcs", nilaiEkspor: 450_000_000, operatorWallet: operatorSBY.address } },
    { data: { idKB: ID_KB, jenisDokumen: "PEB", nomorPEB: "PEB-2026-SBY-00112", tanggalPEB: "2026-03-12T00:00:00.000Z", namaBarang: "Kaos Cotton Combed 30s Putih",  kodeHS: "6109.10.10", kodeBarangInternal: "KAOS-CTN-PTH-001", negaraTujuan: "Amerika Serikat", jumlah: 3000, satuan: "pcs", nilaiEkspor: 285_000_000, operatorWallet: operatorSBY.address } },
    { data: { idKB: ID_KB, jenisDokumen: "PEB", nomorPEB: "PEB-2026-SBY-00134", tanggalPEB: "2026-03-18T00:00:00.000Z", namaBarang: "Kemeja Polyester Formal Biru", kodeHS: "6205.20.00", kodeBarangInternal: "KMJA-PLY-BRU-001", negaraTujuan: "Jepang",          jumlah: 2000, satuan: "pcs", nilaiEkspor: 240_000_000, operatorWallet: operatorSBY.address } },
  ];

  for (const item of eksporList) {
    const tx = await kb.connect(operatorSBY).catatBarangKeluar(
      h(`${ID_KB}:${item.data.nomorPEB}`), h(item.data.kodeBarangInternal),
      0, item.data.jumlah, hData(item.data)  // 0 = PEB
    );
    const rc = await tx.wait();
    await simpan("barang_keluar", item.data, rc.hash, rc.blockNumber);
    log("✅", "PEB ekspor:",
      `${item.data.namaBarang} → ${item.data.negaraTujuan} (${item.data.jumlah.toLocaleString()} pcs)`);
  }

  // ===========================================================
  // [5/7] SCRAP (BC 2.5)
  // ===========================================================

  console.log("\n" + "─".repeat(65));
  console.log("  [5/7] SCRAP (BC 2.5)");
  console.log("─".repeat(65));

  // Tambah saldo scrap via adjustSaldo (pejabat BC)
  for (const s of [
    { kode: "SCRAP-KAIN-CTN-001", jml: 180 },
    { kode: "SCRAP-BNT-001",      jml: 12  },
    { kode: "SCRAP-KNC-001",      jml: 560 },
  ]) {
    await (await kb.connect(pejabatBC).adjustSaldo(
      h(s.kode), s.jml, h(`init:${s.kode}`)
    )).wait();
  }

  const scrapList: Array<{ data: any }> = [
    { data: { idKB: ID_KB, nomorBC25: "BC25-2026-SBY-00034", tanggalBC25: "2026-02-23T00:00:00.000Z", namaBarang: "Sisa Kain Cotton Cutting", kodeHS: "6310.10.00", kodeBarangInternal: "SCRAP-KAIN-CTN-001", jumlah: 180, satuan: "kg",  tujuanPengeluaran: "CV Daur Ulang Tekstil Jaya, Surabaya",  nilaiJual: 3_600_000, operatorWallet: operatorSBY.address } },
    { data: { idKB: ID_KB, nomorBC25: "BC25-2026-SBY-00041", tanggalBC25: "2026-03-01T00:00:00.000Z", namaBarang: "Sisa Benang Jahit",        kodeHS: "5204.19.00", kodeBarangInternal: "SCRAP-BNT-001",      jumlah: 12,  satuan: "kg",  tujuanPengeluaran: "CV Daur Ulang Tekstil Jaya, Surabaya",  nilaiJual: 480_000,   operatorWallet: operatorSBY.address } },
    { data: { idKB: ID_KB, nomorBC25: "BC25-2026-SBY-00052", tanggalBC25: "2026-03-02T00:00:00.000Z", namaBarang: "Kancing Polyester Cacat",  kodeHS: "9606.29.00", kodeBarangInternal: "SCRAP-KNC-001",      jumlah: 560, satuan: "pcs", tujuanPengeluaran: "PT Limbah Plastik Nusantara, Gresik",   nilaiJual: 56_000,    operatorWallet: operatorSBY.address } },
  ];

  for (const item of scrapList) {
    const tx = await kb.connect(operatorSBY).catatScrap(
      h(`${ID_KB}:${item.data.nomorBC25}`), h(item.data.kodeBarangInternal),
      item.data.jumlah, hData(item.data)
    );
    const rc = await tx.wait();
    await simpan("scrap", item.data, rc.hash, rc.blockNumber);
    log("♻️ ", "Scrap BC 2.5:",
      `${item.data.namaBarang} — ${item.data.jumlah} ${item.data.satuan}`);
  }

  // ===========================================================
  // [6/7] PEMUSNAHAN (BERITA ACARA)
  // ===========================================================

  console.log("\n" + "─".repeat(65));
  console.log("  [6/7] PEMUSNAHAN (BERITA ACARA)");
  console.log("─".repeat(65));

  // Tambah saldo wasted via adjustSaldo
  for (const w of [
    { kode: "WASTE-KAIN-CTN-001", jml: 45 },
    { kode: "WASTE-KMJA-PLY-001", jml: 15 },
  ]) {
    await (await kb.connect(pejabatBC).adjustSaldo(
      h(w.kode), w.jml, h(`init:${w.kode}`)
    )).wait();
  }

  const pemusnahanList: Array<{ data: any }> = [
    { data: { idKB: ID_KB, nomorBA: "BA-MUSNAH-2026-SBY-001", tanggalBA: "2026-02-24T10:00:00.000Z", namaBarang: "Kain Cotton Reject — Cacat Produksi",  kodeHS: "6310.90.00", kodeBarangInternal: "WASTE-KAIN-CTN-001", jumlah: 45, satuan: "kg",  metodePemusnahan: "Insinerasi (dibakar)",               lokasiPemusnahan: "PPLI — PT Prasadha Pamunah Limbah Industri, Cileungsi", namaSaksiPejabatBC: "Budi Santoso, S.H. — NIP 197503151998031002", pejabatBCWallet: pejabatBC.address } },
    { data: { idKB: ID_KB, nomorBA: "BA-MUSNAH-2026-SBY-002", tanggalBA: "2026-03-03T10:00:00.000Z", namaBarang: "Kemeja Polyester Reject — Gagal QC", kodeHS: "6310.90.00", kodeBarangInternal: "WASTE-KMJA-PLY-001", jumlah: 15, satuan: "pcs", metodePemusnahan: "Landfill (dikubur di TPA berlisensi)", lokasiPemusnahan: "TPA Benowo, Surabaya",                                   namaSaksiPejabatBC: "Budi Santoso, S.H. — NIP 197503151998031002", pejabatBCWallet: pejabatBC.address } },
  ];

  for (const item of pemusnahanList) {
    const tx = await kb.connect(pejabatBC).catatPemusnahan(
      h(`${ID_KB}:${item.data.nomorBA}`), h(item.data.kodeBarangInternal),
      item.data.jumlah, hData(item.data)
    );
    const rc = await tx.wait();
    await simpan("pemusnahan", item.data, rc.hash, rc.blockNumber);
    log("🔥", "Pemusnahan (BA):",
      `${item.data.namaBarang.split("—")[0].trim()} — ${item.data.jumlah} ${item.data.satuan}`);
  }

  // ===========================================================
  // [7/7] STOCK OPNAME
  // ===========================================================

  console.log("\n" + "─".repeat(65));
  console.log("  [7/7] STOCK OPNAME");
  console.log("─".repeat(65));

  const opname = {
    idKB: ID_KB, idOpname: "OPNAME-2026-SBY-001", tanggal: "2026-03-20T08:00:00.000Z",
    pejabatBCWallet: pejabatBC.address,
    catatan: "Opname rutin Q1 2026. Selisih -2 kg kain polyester dalam batas toleransi (0.07%).",
    items: [
      { kodeBarangInternal: "KAIN-CTN-001",     namaBarang: "Kain Cotton Greige",          kodeHS: "5208.11.00", saldoSistem: 10200, saldoFisik: 10200, selisih: 0  },
      { kodeBarangInternal: "KAIN-PLY-001",     namaBarang: "Kain Polyester Twill",         kodeHS: "5407.52.00", saldoSistem: 1250,  saldoFisik: 1248,  selisih: -2 },
      { kodeBarangInternal: "BNT-PTH-001",      namaBarang: "Benang Jahit Putih",            kodeHS: "5204.11.00", saldoSistem: 98,    saldoFisik: 98,    selisih: 0  },
      { kodeBarangInternal: "KNC-PLK-001",      namaBarang: "Kancing Polyester",             kodeHS: "9606.21.00", saldoSistem: 15000, saldoFisik: 15000, selisih: 0  },
      { kodeBarangInternal: "LBL-WVN-001",      namaBarang: "Label Woven",                   kodeHS: "5807.10.00", saldoSistem: 79330, saldoFisik: 79330, selisih: 0  },
      { kodeBarangInternal: "KAOS-CTN-PTH-001", namaBarang: "Kaos Cotton Combed 30s Putih", kodeHS: "6109.10.10", saldoSistem: 1750,  saldoFisik: 1750,  selisih: 0  },
      { kodeBarangInternal: "KMJA-PLY-BRU-001", namaBarang: "Kemeja Polyester Formal Biru", kodeHS: "6205.20.00", saldoSistem: 2920,  saldoFisik: 2920,  selisih: 0  },
    ],
  };

  const txOp = await kb.connect(pejabatBC).catatStockOpname(
    h(`${ID_KB}:${opname.idOpname}:${opname.tanggal}`), hData(opname)
  );
  const rcOp = await txOp.wait();
  await simpan("stock_opname", opname, rcOp.hash, rcOp.blockNumber);
  log("📋", "Stock opname:", `${opname.idOpname} — ${opname.items.length} item`);

  // ===========================================================
  // RINGKASAN & SALDO AKHIR
  // ===========================================================

  console.log("\n" + "=".repeat(65));
  console.log("  SELESAI");
  console.log("=".repeat(65));

  console.log("\n  Saldo bahan baku on-chain:");
  for (const b of [
    { kode: "KAIN-CTN-001", nama: "Kain Cotton Greige",   sat: "kg"  },
    { kode: "KAIN-PLY-001", nama: "Kain Polyester Twill", sat: "kg"  },
    { kode: "BNT-PTH-001",  nama: "Benang Jahit Putih",   sat: "kg"  },
    { kode: "KNC-PLK-001",  nama: "Kancing Polyester",    sat: "pcs" },
    { kode: "LBL-WVN-001",  nama: "Label Woven",          sat: "pcs" },
  ]) {
    const s = await kb.getSaldoBarang(h(b.kode));
    console.log(`    ${b.nama.padEnd(28)} ${String(s).padStart(8)} ${b.sat}`);
  }

  console.log("\n  Saldo produk jadi on-chain:");
  for (const p of [
    { kode: "KAOS-CTN-PTH-001", nama: "Kaos Cotton Putih",    sat: "pcs" },
    { kode: "KMJA-PLY-BRU-001", nama: "Kemeja Polyester Biru", sat: "pcs" },
  ]) {
    const s = await kb.getSaldoProdukJadi(h(p.kode));
    console.log(`    ${p.nama.padEnd(28)} ${String(s).padStart(8)} ${p.sat}`);
  }

  console.log("\n  Buka frontend dan login sebagai tiap role untuk melihat data.");
  console.log("=".repeat(65) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Seed gagal:", err?.reason || err?.message || err);
    process.exit(1);
  });