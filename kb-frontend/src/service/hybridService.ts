// hybridService.ts — v3
// =============================================================
// ORCHESTRATOR utama arsitektur hybrid.
// Urutan operasi untuk setiap transaksi:
//   1. Hitung hash dari data (hashService)
//   2. Simpan data lengkap ke Firestore dengan txHash "pending"
//   3. Kirim hash ke blockchain (blockchainService)
//   4. Catat ke audit log Firestore
//
// Jika blockchain gagal setelah Firestore berhasil,
// dokumen Firestore tetap tersimpan dengan txHash = "pending".
// Ini bisa di-retry oleh admin tanpa kehilangan data.
//
// Perubahan v2 --> v3:
//   1. Tambah catatScrap() untuk pengeluaran via BC 2.5
//   2. Tambah catatPemusnahan() untuk Berita Acara pemusnahan
//   3. Update audit log detail: pakai nomorPIB/nomorPEB/nomorBC25/nomorBA
//      (bukan nomorDokumen generik)
//   4. hashHasilProduksi: pakai kodeBarangInternal (bukan kodeBarang)
//   5. verifikasiIntegritas: dibuat generik untuk semua tipe dokumen
// =============================================================

import * as hash from "./hashService";
import * as firestore from "./firestoreService";
import * as blockchain from "./blockchainService";
import type {
  DataBarangMasuk,
  DataBarangKeluar,
  DataScrap,
  DataPemusnahan,
  DataWIP,
  DataHasilProduksi,
  DataBOM,
  DataStockOpname,
} from "./hashService";

// =============================================================
// SECTION 1: TIPE & ERROR
// =============================================================

/** Hasil setiap operasi hybrid yang berhasil penuh */
export interface HybridResult {
  firestoreId: string;  // ID dokumen di Firestore
  txHash: string;       // hash transaksi Ethereum
  blockNumber: number;  // nomor blok konfirmasi
  dataHash: string;     // keccak256 dari data (untuk verifikasi mandiri)
}

/** Error bertingkat — memberi tahu di tahap mana kegagalan terjadi */
export class HybridError extends Error {
  constructor(
    message: string,
    public readonly step: "hash" | "firestore" | "blockchain",
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "HybridError";
  }
}

// =============================================================
// SECTION 2: BARANG MASUK (PIB / TLDDP)
// =============================================================

/**
 * Catat barang masuk impor (PIB) atau dari dalam negeri (TLDDP).
 * Flow: hash → Firestore (pending) → blockchain → audit log
 */
export async function catatBarangMasuk(data: DataBarangMasuk): Promise<HybridResult> {
  // 1. Hitung hash
  let hashes: ReturnType<typeof hash.hashBarangMasuk>;
  try {
    hashes = hash.hashBarangMasuk(data);
  } catch (e) {
    throw new HybridError("Gagal menghitung hash data barang masuk", "hash", e);
  }

  // 2. Simpan ke Firestore (data lengkap, txHash masih "pending")
  let firestoreId: string;
  try {
    firestoreId = await firestore.simpanBarangMasuk(data, {
      dataHash: hashes.dataHash,
      txHash: "pending",
      blockNumber: 0,
    });
  } catch (e) {
    throw new HybridError("Gagal menyimpan data barang masuk ke Firestore", "firestore", e);
  }

  // 3. Kirim hash ke blockchain
  let txResult: blockchain.TxResult;
  try {
    txResult = await blockchain.bcCatatBarangMasuk(
      data.idKB,
      hashes.idDokumenHash,
      hashes.kodeBarangHash,
      data.jenisDokumen,   // v3: enum JenisDokumenMasuk (0=PIB, 1=TLDDP)
      data.jumlah,
      hashes.dataHash
    );
  } catch (e) {
    throw new HybridError(
      `Data tersimpan di Firestore (id: ${firestoreId}) tapi transaksi blockchain gagal. ` +
      `Hubungi administrator untuk retry.`,
      "blockchain",
      e
    );
  }

  // 4. Audit log — gunakan nomor dokumen eksplisit per jenis
  const nomorDokumen = data.jenisDokumen === "PIB"
    ? (data.nomorPIB ?? "-")
    : (data.nomorTLDDP ?? "-");
  const tanggalDokumen = data.jenisDokumen === "PIB"
    ? (data.tanggalPIB ?? "-")
    : (data.tanggalTLDDP ?? "-");

  await firestore.catatAuditLog({
    idKB: data.idKB,
    aksi: "BARANG_MASUK",
    pelaku: data.operatorWallet,
    walletAddress: data.operatorWallet,
    dataHash: hashes.dataHash,
    txHash: txResult.txHash,
    detail: {
      jenis: data.jenisDokumen,
      nomorDokumen,
      tanggalDokumen,
      namaBarang: data.namaBarang,
      kodeBarangInternal: data.kodeBarangInternal,
      kodeHS: data.kodeHS,
      jumlah: data.jumlah,
      satuan: data.satuan,
    },
  });

  return {
    firestoreId,
    txHash: txResult.txHash,
    blockNumber: txResult.blockNumber,
    dataHash: hashes.dataHash,
  };
}

// =============================================================
// SECTION 3: BARANG KELUAR (PEB / LOKAL)
// =============================================================

export async function catatBarangKeluar(data: DataBarangKeluar): Promise<HybridResult> {
  let hashes: ReturnType<typeof hash.hashBarangKeluar>;
  try {
    hashes = hash.hashBarangKeluar(data);
  } catch (e) {
    throw new HybridError("Gagal menghitung hash data barang keluar", "hash", e);
  }

  let firestoreId: string;
  try {
    firestoreId = await firestore.simpanBarangKeluar(data, {
      dataHash: hashes.dataHash,
      txHash: "pending",
      blockNumber: 0,
    });
  } catch (e) {
    throw new HybridError("Gagal menyimpan data barang keluar ke Firestore", "firestore", e);
  }

  let txResult: blockchain.TxResult;
  try {
    txResult = await blockchain.bcCatatBarangKeluar(
      data.idKB,
      hashes.idDokumenHash,
      hashes.kodeBarangHash,
      data.jenisDokumen,   // v3: enum JenisDokumenKeluar (0=PEB, 2=LOKAL)
      data.jumlah,
      hashes.dataHash
    );
  } catch (e) {
    throw new HybridError(
      `Data tersimpan di Firestore (id: ${firestoreId}) tapi transaksi blockchain gagal.`,
      "blockchain",
      e
    );
  }

  const nomorDokumen = data.jenisDokumen === "PEB"
    ? (data.nomorPEB ?? "-")
    : (data.nomorDokumenLokal ?? "-");
  const tanggalDokumen = data.jenisDokumen === "PEB"
    ? (data.tanggalPEB ?? "-")
    : (data.tanggalDokumenLokal ?? "-");

  await firestore.catatAuditLog({
    idKB: data.idKB,
    aksi: "BARANG_KELUAR",
    pelaku: data.operatorWallet,
    walletAddress: data.operatorWallet,
    dataHash: hashes.dataHash,
    txHash: txResult.txHash,
    detail: {
      jenis: data.jenisDokumen,
      nomorDokumen,
      tanggalDokumen,
      namaBarang: data.namaBarang,
      kodeBarangInternal: data.kodeBarangInternal,
      jumlah: data.jumlah,
      satuan: data.satuan,
    },
  });

  return {
    firestoreId,
    txHash: txResult.txHash,
    blockNumber: txResult.blockNumber,
    dataHash: hashes.dataHash,
  };
}

// =============================================================
// SECTION 4: SCRAP (BC 2.5) — BARU v3
// =============================================================

/**
 * Catat pengeluaran scrap via dokumen BC 2.5.
 * Flow: hash → Firestore (pending) → blockchain → audit log
 * Dipanggil oleh Operator KB. Saldo bahan baku berkurang on-chain.
 */
export async function catatScrap(data: DataScrap): Promise<HybridResult> {
  // 1. Hitung hash
  let hashes: ReturnType<typeof hash.hashScrap>;
  try {
    hashes = hash.hashScrap(data);
  } catch (e) {
    throw new HybridError("Gagal menghitung hash data scrap", "hash", e);
  }

  // 2. Simpan ke Firestore
  let firestoreId: string;
  try {
    firestoreId = await firestore.simpanScrap(data, {
      dataHash: hashes.dataHash,
      txHash: "pending",
      blockNumber: 0,
    });
  } catch (e) {
    throw new HybridError("Gagal menyimpan data scrap ke Firestore", "firestore", e);
  }

  // 3. Kirim ke blockchain
  let txResult: blockchain.TxResult;
  try {
    txResult = await blockchain.bcCatatScrap(
      data.idKB,
      hashes.idDokumenBC25Hash,
      hashes.kodeBarangHash,
      data.jumlah,
      hashes.dataHash
    );
  } catch (e) {
    throw new HybridError(
      `Data scrap tersimpan di Firestore (id: ${firestoreId}) tapi blockchain gagal.`,
      "blockchain",
      e
    );
  }

  // 4. Audit log
  await firestore.catatAuditLog({
    idKB: data.idKB,
    aksi: "SCRAP_BC25",
    pelaku: data.operatorWallet,
    walletAddress: data.operatorWallet,
    dataHash: hashes.dataHash,
    txHash: txResult.txHash,
    detail: {
      nomorBC25: data.nomorBC25,
      tanggalBC25: data.tanggalBC25,
      namaBarang: data.namaBarang,
      kodeBarangInternal: data.kodeBarangInternal,
      kodeHS: data.kodeHS,
      jumlah: data.jumlah,
      satuan: data.satuan,
      tujuanPengeluaran: data.tujuanPengeluaran,
      nilaiJual: data.nilaiJual,
    },
  });

  return {
    firestoreId,
    txHash: txResult.txHash,
    blockNumber: txResult.blockNumber,
    dataHash: hashes.dataHash,
  };
}

// =============================================================
// SECTION 5: PEMUSNAHAN (BERITA ACARA) — BARU v3
// =============================================================

/**
 * Catat pemusnahan barang wasted berdasarkan Berita Acara.
 * Flow: hash → Firestore (pending) → blockchain → audit log
 * HANYA dipanggil oleh alur AdminBC — bukan operator biasa.
 * Saldo bahan baku berkurang on-chain secara permanen.
 */
export async function catatPemusnahan(data: DataPemusnahan): Promise<HybridResult> {
  // 1. Hitung hash
  let hashes: ReturnType<typeof hash.hashPemusnahan>;
  try {
    hashes = hash.hashPemusnahan(data);
  } catch (e) {
    throw new HybridError("Gagal menghitung hash Berita Acara pemusnahan", "hash", e);
  }

  // 2. Simpan ke Firestore
  let firestoreId: string;
  try {
    firestoreId = await firestore.simpanPemusnahan(data, {
      dataHash: hashes.dataHash,
      txHash: "pending",
      blockNumber: 0,
    });
  } catch (e) {
    throw new HybridError("Gagal menyimpan Berita Acara pemusnahan ke Firestore", "firestore", e);
  }

  // 3. Kirim ke blockchain
  let txResult: blockchain.TxResult;
  try {
    txResult = await blockchain.bcCatatPemusnahan(
      data.idKB,
      hashes.idBeritaAcaraHash,
      hashes.kodeBarangHash,
      data.jumlah,
      hashes.dataHash
    );
  } catch (e) {
    throw new HybridError(
      `Berita Acara tersimpan di Firestore (id: ${firestoreId}) tapi blockchain gagal.`,
      "blockchain",
      e
    );
  }

  // 4. Audit log — detail lengkap penting untuk jejak pemusnahan
  await firestore.catatAuditLog({
    idKB: data.idKB,
    aksi: "PEMUSNAHAN_BA",
    pelaku: data.pejabatBCWallet,
    walletAddress: data.pejabatBCWallet,
    dataHash: hashes.dataHash,
    txHash: txResult.txHash,
    detail: {
      nomorBA: data.nomorBA,
      tanggalBA: data.tanggalBA,
      namaBarang: data.namaBarang,
      kodeBarangInternal: data.kodeBarangInternal,
      kodeHS: data.kodeHS,
      jumlah: data.jumlah,
      satuan: data.satuan,
      metodePemusnahan: data.metodePemusnahan,
      lokasiPemusnahan: data.lokasiPemusnahan,
      namaSaksiPejabatBC: data.namaSaksiPejabatBC,
    },
  });

  return {
    firestoreId,
    txHash: txResult.txHash,
    blockNumber: txResult.blockNumber,
    dataHash: hashes.dataHash,
  };
}

// =============================================================
// SECTION 6: WORK IN PROCESS
// =============================================================

export async function buatWIP(data: DataWIP): Promise<HybridResult> {
  let hashes: ReturnType<typeof hash.hashWIP>;
  try {
    hashes = hash.hashWIP(data);
  } catch (e) {
    throw new HybridError("Gagal menghitung hash WIP", "hash", e);
  }

  let firestoreId: string;
  try {
    firestoreId = await firestore.simpanWIP(data, {
      dataHash: hashes.dataHash,
      txHash: "pending",
      blockNumber: 0,
    });
  } catch (e) {
    throw new HybridError("Gagal menyimpan WIP ke Firestore", "firestore", e);
  }

  let txResult: blockchain.TxResult;
  try {
    txResult = await blockchain.bcBuatWIP(
      data.idKB,
      hashes.idBatchHash,
      hashes.dataHash
    );
  } catch (e) {
    throw new HybridError(
      `WIP tersimpan di Firestore (id: ${firestoreId}) tapi blockchain gagal.`,
      "blockchain",
      e
    );
  }

  await firestore.catatAuditLog({
    idKB: data.idKB,
    aksi: "WIP_DIBUAT",
    pelaku: data.operatorWallet,
    walletAddress: data.operatorWallet,
    dataHash: hashes.dataHash,
    txHash: txResult.txHash,
    detail: {
      idBatch: data.idBatch,
      kodeProdukInternal: data.kodeProdukInternal,  // v3
      kodeFormulaBOM: data.kodeFormulaBOM,
    },
  });

  return {
    firestoreId,
    txHash: txResult.txHash,
    blockNumber: txResult.blockNumber,
    dataHash: hashes.dataHash,
  };
}

// =============================================================
// SECTION 7: HASIL PRODUKSI
// =============================================================

export async function catatHasilProduksi(data: DataHasilProduksi): Promise<HybridResult> {
  let hashes: ReturnType<typeof hash.hashHasilProduksi>;
  try {
    hashes = hash.hashHasilProduksi(data);
  } catch (e) {
    throw new HybridError("Gagal menghitung hash hasil produksi", "hash", e);
  }

  let firestoreId: string;
  try {
    firestoreId = await firestore.simpanHasilProduksi(data, {
      dataHash: hashes.dataHash,
      txHash: "pending",
      blockNumber: 0,
    });
  } catch (e) {
    throw new HybridError("Gagal menyimpan hasil produksi ke Firestore", "firestore", e);
  }

  // v3: pakai kodeBarangInternal (bukan kodeBarang generik)
  const kodeBahanBakuHashes = data.bahanTerpakai.map((b) =>
    hash.hashString(b.kodeBarangInternal)
  );
  const jumlahBahan = data.bahanTerpakai.map((b) => b.jumlah);

  let txResult: blockchain.TxResult;
  try {
    txResult = await blockchain.bcCatatHasilProduksi(
      data.idKB,
      hashes.idBatchHash,
      hashes.kodeProdukHash,
      data.jumlahOutput,
      kodeBahanBakuHashes,
      jumlahBahan,
      hashes.dataHash
    );
  } catch (e) {
    throw new HybridError(
      `Hasil produksi tersimpan di Firestore (id: ${firestoreId}) tapi blockchain gagal.`,
      "blockchain",
      e
    );
  }

  await firestore.catatAuditLog({
    idKB: data.idKB,
    aksi: "HASIL_PRODUKSI",
    pelaku: data.operatorWallet,
    walletAddress: data.operatorWallet,
    dataHash: hashes.dataHash,
    txHash: txResult.txHash,
    detail: {
      idBatch: data.idBatch,
      kodeProdukInternal: data.kodeProdukInternal,  // v3
      jumlahOutput: data.jumlahOutput,
      jumlahScrap: data.jumlahScrap ?? 0,
      jumlahWasted: data.jumlahWasted ?? 0,
    },
  });

  return {
    firestoreId,
    txHash: txResult.txHash,
    blockNumber: txResult.blockNumber,
    dataHash: hashes.dataHash,
  };
}

// =============================================================
// SECTION 8: BOM
// =============================================================

export async function validasiBOM(data: DataBOM): Promise<HybridResult> {
  let hashes: ReturnType<typeof hash.hashBOM>;
  try {
    hashes = hash.hashBOM(data);
  } catch (e) {
    throw new HybridError("Gagal menghitung hash BOM", "hash", e);
  }

  let firestoreId: string;
  try {
    firestoreId = await firestore.simpanBOM(data, {
      dataHash: hashes.dataHash,
      txHash: "pending",
      blockNumber: 0,
    });
  } catch (e) {
    throw new HybridError("Gagal menyimpan BOM ke Firestore", "firestore", e);
  }

  let txResult: blockchain.TxResult;
  try {
    txResult = await blockchain.bcValidasiBOM(
      data.idKB,
      hashes.kodeFormulaHash,
      hashes.dataHash
    );
  } catch (e) {
    throw new HybridError(
      `BOM tersimpan di Firestore (id: ${firestoreId}) tapi blockchain gagal.`,
      "blockchain",
      e
    );
  }

  await firestore.catatAuditLog({
    idKB: data.idKB,
    aksi: "BOM_DIVALIDASI",
    pelaku: data.validasiOleh,
    walletAddress: data.validasiOleh,
    dataHash: hashes.dataHash,
    txHash: txResult.txHash,
    detail: {
      kodeFormula: data.kodeFormula,
      namaProduk: data.namaProduk,
      versi: data.versi,
      jumlahKomponen: data.komposisi.length,
    },
  });

  return {
    firestoreId,
    txHash: txResult.txHash,
    blockNumber: txResult.blockNumber,
    dataHash: hashes.dataHash,
  };
}

// =============================================================
// SECTION 9: STOCK OPNAME
// =============================================================

export async function catatStockOpname(data: DataStockOpname): Promise<HybridResult> {
  let hashes: ReturnType<typeof hash.hashStockOpname>;
  try {
    hashes = hash.hashStockOpname(data);
  } catch (e) {
    throw new HybridError("Gagal menghitung hash stock opname", "hash", e);
  }

  let firestoreId: string;
  try {
    firestoreId = await firestore.simpanStockOpname(data, {
      dataHash: hashes.dataHash,
      txHash: "pending",
      blockNumber: 0,
    });
  } catch (e) {
    throw new HybridError("Gagal menyimpan stock opname ke Firestore", "firestore", e);
  }

  let txResult: blockchain.TxResult;
  try {
    txResult = await blockchain.bcCatatStockOpname(
      data.idKB,
      hashes.idOpnameHash,
      hashes.dataHash
    );
  } catch (e) {
    throw new HybridError(
      `Stock opname tersimpan di Firestore (id: ${firestoreId}) tapi blockchain gagal.`,
      "blockchain",
      e
    );
  }

  await firestore.catatAuditLog({
    idKB: data.idKB,
    aksi: "STOCK_OPNAME",
    pelaku: data.pejabatBCWallet,
    walletAddress: data.pejabatBCWallet,
    dataHash: hashes.dataHash,
    txHash: txResult.txHash,
    detail: {
      idOpname: data.idOpname,
      tanggal: data.tanggal,
      jumlahItem: data.items.length,
    },
  });

  return {
    firestoreId,
    txHash: txResult.txHash,
    blockNumber: txResult.blockNumber,
    dataHash: hashes.dataHash,
  };
}

// =============================================================
// SECTION 10: VERIFIKASI INTEGRITAS
// =============================================================

/**
 * Cross-check data dari Firestore terhadap hash yang tersimpan on-chain.
 * Dipakai portal audit DJBC/DJP untuk membuktikan data otentik.
 *
 * @param data        objek data lengkap yang diambil dari Firestore
 * @param hashOnChain hash yang tersimpan di blockchain (dari mapping)
 * @returns { valid: boolean, dataHash: string }
 *          valid = true berarti data Firestore belum dimanipulasi
 */
export function verifikasiIntegritas(
  data: object,
  hashOnChain: string
): { valid: boolean; dataHash: string } {
  const dataHash = hash.hashData(data);
  return {
    valid: dataHash === hashOnChain,
    dataHash,
  };
}
