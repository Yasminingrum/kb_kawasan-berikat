// hashService.ts — v3
// =============================================================
// Menghitung hash kriptografis dari data sebelum dikirim ke blockchain.
// Hash = keccak256(JSON.stringify(data)) via ethers.js
// Hasil hash inilah yang disimpan on-chain; data aslinya di Firestore.
//
// Perubahan v2 --> v3:
//   1. Semua interface tambah field kodeBarangInternal (kode unik per item
//      di perusahaan, mis: "CAT-MERAH-001"). kodeBarangHash di-hash dari
//      field ini, bukan lagi dari kodeHS + namaBarang.
//   2. DataBarangMasuk: nomorDokumen dipecah menjadi nomorPIB / nomorTLDDP
//      + tanggalDokumen yang eksplisit (terpisah dari tanggal sistem).
//   3. DataBarangKeluar: nomorDokumen dipecah menjadi nomorPEB /
//      nomorDokumenLokal + tanggalDokumen yang eksplisit.
//   4. DataBarangKeluar: jenisDokumen tambah "BC25" agar bisa dibedakan
//      dari LOKAL (meskipun scrap punya fungsi sendiri di contract).
//   5. Tambah interface DataScrap (BC 2.5) dan DataPemusnahan (BA).
//   6. Tambah fungsi hashScrap() dan hashPemusnahan().
// =============================================================

import { ethers } from "ethers";

// =============================================================
// SECTION 1: INTERFACE (Tipe Data per Operasi)
// =============================================================
// Semua interface ini merepresentasikan data LENGKAP yang disimpan
// di Firestore. Hash dari objek ini yang dikirim ke blockchain.

// ─── Barang Masuk (PIB / TLDDP) ───────────────────────────────

export interface DataBarangMasuk {
  idKB: string;

  // --- Identifikasi dokumen (eksplisit per jenis) ---
  jenisDokumen: "PIB" | "TLDDP";
  nomorPIB?: string;          // diisi jika jenisDokumen === "PIB"
  tanggalPIB?: string;        // tanggal terbit dokumen PIB (ISO string)
  nomorTLDDP?: string;        // diisi jika jenisDokumen === "TLDDP"
  tanggalTLDDP?: string;      // tanggal terbit dokumen TLDDP (ISO string)

  // --- Identifikasi barang ---
  namaBarang: string;
  kodeHS: string;             // 8-10 digit kode HS internasional
  kodeBarangInternal: string; // kode unik per item di perusahaan (mis: "CAT-MERAH-001")
                              // → ini yang di-hash menjadi kodeBarangHash on-chain

  // --- Detail pemasukan ---
  negaraAsal: string;
  jumlah: number;
  satuan: string;             // kg / liter / pcs / meter / dll.
  nilaiBarang: number;        // nilai dalam IDR

  // --- Metadata ---
  operatorWallet: string;     // wallet PKB/PDKB yang input
}

// ─── Barang Keluar Ekspor (PEB) atau Lokal ────────────────────

export interface DataBarangKeluar {
  idKB: string;

  // --- Identifikasi dokumen (eksplisit per jenis) ---
  jenisDokumen: "PEB" | "LOKAL";
  nomorPEB?: string;              // diisi jika jenisDokumen === "PEB"
  tanggalPEB?: string;            // tanggal terbit dokumen PEB (ISO string)
  nomorDokumenLokal?: string;     // diisi jika jenisDokumen === "LOKAL"
  tanggalDokumenLokal?: string;   // tanggal terbit dokumen lokal (ISO string)

  // --- Identifikasi barang ---
  namaBarang: string;
  kodeHS: string;
  kodeBarangInternal: string;     // kode unik per item di perusahaan

  // --- Detail pengeluaran ---
  negaraTujuan?: string;          // wajib untuk PEB
  jumlah: number;
  satuan: string;
  nilaiEkspor?: number;           // nilai dalam IDR, wajib untuk PEB

  // --- Metadata ---
  operatorWallet: string;
}

// ─── Scrap (Pengeluaran via Dokumen BC 2.5) ──────────────────

export interface DataScrap {
  idKB: string;

  // --- Identifikasi dokumen ---
  nomorBC25: string;          // nomor dokumen BC 2.5 resmi
  tanggalBC25: string;        // tanggal terbit dokumen BC 2.5 (ISO string)

  // --- Identifikasi barang scrap ---
  namaBarang: string;         // nama barang scrap
  kodeHS: string;             // kode HS barang scrap
  kodeBarangInternal: string; // kode internal barang scrap di perusahaan

  // --- Detail pengeluaran scrap ---
  jumlah: number;
  satuan: string;
  tujuanPengeluaran: string;  // nama/alamat pembeli/penerima scrap
  nilaiJual: number;          // nilai jual scrap dalam IDR (bisa 0 jika dibuang)

  // --- Metadata ---
  operatorWallet: string;     // wallet operator yang input
}

// ─── Pemusnahan (Berita Acara / BA) ──────────────────────────

export interface DataPemusnahan {
  idKB: string;

  // --- Identifikasi Berita Acara ---
  nomorBA: string;            // nomor Berita Acara pemusnahan resmi
  tanggalBA: string;          // tanggal pelaksanaan pemusnahan (ISO string)

  // --- Identifikasi barang yang dimusnahkan ---
  namaBarang: string;
  kodeHS: string;
  kodeBarangInternal: string; // kode internal barang di perusahaan

  // --- Detail pemusnahan ---
  jumlah: number;
  satuan: string;
  metodePemusnahan: string;   // misal: "insinerasi", "landfill", "daur ulang"
  lokasiPemusnahan: string;   // alamat/lokasi pemusnahan dilakukan

  // --- Pengawasan ---
  namaSaksiPejabatBC: string; // nama lengkap Pejabat BC yang menyaksikan
  pejabatBCWallet: string;    // wallet Pejabat BC yang mencatat on-chain
}

// ─── Work In Process (WIP) ────────────────────────────────────

export interface DataWIP {
  idKB: string;
  idBatch: string;            // ID batch internal perusahaan
  kodeFormulaBOM: string;     // referensi ke formula BOM yang dipakai
  inputBahan: Array<{
    kodeBarangInternal: string; // v3: ganti dari kodeBarang generik
    namaBarang: string;
    jumlah: number;
    satuan: string;
  }>;
  outputExpected: number;     // estimasi output produk jadi
  kodeProdukInternal: string; // v3: ganti dari kodeProduk generik
  namaProduk: string;
  tanggalMulai: string;       // ISO string
  operatorWallet: string;
}

// ─── Hasil Produksi ───────────────────────────────────────────

export interface DataHasilProduksi {
  idKB: string;
  idBatch: string;
  kodeProdukInternal: string; // v3: kode internal produk jadi
  namaBarangJadi: string;
  kodeHS: string;             // v3: tambah kode HS produk jadi
  jumlahOutput: number;
  satuan: string;
  bahanTerpakai: Array<{
    kodeBarangInternal: string; // v3: ganti dari kodeBarang generik
    namaBarang: string;
    jumlah: number;
  }>;
  // Scrap & wasted dari batch ini (opsional, dicatat terpisah tapi
  // direferensikan di sini untuk rekonsiliasi BOM)
  jumlahScrap?: number;       // total scrap dari batch ini
  jumlahWasted?: number;      // total wasted dari batch ini
  tanggalSelesai: string;     // ISO string
  operatorWallet: string;
}

// ─── Bill of Materials (BOM / Konversi) ──────────────────────

export interface DataBOM {
  idKB: string;
  kodeFormula: string;        // kode formula internal
  namaProduk: string;
  kodeHSProduk: string;       // v3: tambah kode HS produk jadi
  versi: string;              // versi BOM (untuk tracking revisi)
  komposisi: Array<{
    kodeBarangInternal: string; // v3: ganti dari kodeBarang generik
    namaBarang: string;
    kodeHS: string;
    rasio: number;            // jumlah bahan per 1 unit produk jadi
    satuan: string;
  }>;
  // Toleransi rendemen (opsional tapi direkomendasikan untuk audit)
  toleransiScrapPersen?: number;  // % scrap yang diizinkan dari total input
  toleransiWastedPersen?: number; // % wasted yang diizinkan dari total input
  validasiOleh: string;       // wallet Pejabat BC
  tanggalValidasi: string;    // ISO string
}

// ─── Stock Opname ─────────────────────────────────────────────

export interface DataStockOpname {
  idKB: string;
  idOpname: string;
  tanggal: string;            // ISO string
  items: Array<{
    kodeBarangInternal: string; // v3: ganti dari kodeBarang generik
    namaBarang: string;
    kodeHS: string;           // v3: tambah kode HS per item
    saldoSistem: number;      // saldo menurut sistem IT Inventory
    saldoFisik: number;       // saldo hasil hitung fisik di lapangan
    selisih: number;          // saldoFisik - saldoSistem (bisa negatif)
  }>;
  pejabatBCWallet: string;
  catatan: string;
}

// =============================================================
// SECTION 2: FUNGSI HASH UTILITAS
// =============================================================

/**
 * Hitung keccak256 dari sembarang objek data.
 * Keys diurutkan secara alfabetis agar output selalu konsisten
 * meskipun urutan penulisan field berbeda.
 * Output: bytes32 hex string (0x...) siap dikirim ke Solidity.
 */
export function hashData(data: object): string {
  const json = JSON.stringify(data, Object.keys(data).sort());
  return ethers.keccak256(ethers.toUtf8Bytes(json));
}

/**
 * Hitung keccak256 dari string tunggal.
 * Dipakai untuk membuat parameter bytes32 di contract:
 *   - idDokumen  = hashString(`${idKB}:${nomorDokumen}`)
 *   - kodeBarang = hashString(kodeBarangInternal)
 *   - idBatch    = hashString(`${idKB}:${idBatch}`)
 */
export function hashString(str: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(str));
}

/**
 * Verifikasi integritas: cocokkan hash on-chain dengan data Firestore.
 * Dipakai di portal audit (DJP / DJBC) untuk membuktikan data
 * belum dimanipulasi sejak pertama kali dicatat.
 * @returns true jika hash cocok (data otentik)
 */
export function verifikasiHash(data: object, hashTersimpan: string): boolean {
  return hashData(data) === hashTersimpan;
}

// =============================================================
// SECTION 3: FUNGSI HASH PER TIPE DOKUMEN
// =============================================================
// Setiap fungsi mengembalikan semua bytes32 yang dibutuhkan
// sebagai parameter transaksi blockchain.
// Konsistensi dijaga di sini — frontend tidak perlu tahu cara
// menghitung hash, cukup panggil fungsi yang sesuai.

// ─── Barang Masuk ─────────────────────────────────────────────

export function hashBarangMasuk(data: DataBarangMasuk): {
  idDokumenHash: string;    // → parameter idDokumen di catatBarangMasuk()
  kodeBarangHash: string;   // → parameter kodeBarang di catatBarangMasuk()
  dataHash: string;         // → parameter dataHash di catatBarangMasuk()
} {
  // Nomor dokumen diambil sesuai jenis (PIB atau TLDDP)
  const nomorDokumen = data.jenisDokumen === "PIB"
    ? (data.nomorPIB ?? "")
    : (data.nomorTLDDP ?? "");

  return {
    idDokumenHash:  hashString(`${data.idKB}:${nomorDokumen}`),
    kodeBarangHash: hashString(data.kodeBarangInternal), // v3: dari kodeBarangInternal
    dataHash:       hashData(data),
  };
}

// ─── Barang Keluar ────────────────────────────────────────────

export function hashBarangKeluar(data: DataBarangKeluar): {
  idDokumenHash: string;
  kodeBarangHash: string;
  dataHash: string;
} {
  const nomorDokumen = data.jenisDokumen === "PEB"
    ? (data.nomorPEB ?? "")
    : (data.nomorDokumenLokal ?? "");

  return {
    idDokumenHash:  hashString(`${data.idKB}:${nomorDokumen}`),
    kodeBarangHash: hashString(data.kodeBarangInternal), // v3: dari kodeBarangInternal
    dataHash:       hashData(data),
  };
}

// ─── Scrap (BC 2.5) ───────────────────────────────────────────

export function hashScrap(data: DataScrap): {
  idDokumenBC25Hash: string;  // → parameter idDokumenBC25 di catatScrap()
  kodeBarangHash: string;     // → parameter kodeBarang di catatScrap()
  dataHash: string;           // → parameter dataHash di catatScrap()
} {
  return {
    idDokumenBC25Hash: hashString(`${data.idKB}:${data.nomorBC25}`),
    kodeBarangHash:    hashString(data.kodeBarangInternal),
    dataHash:          hashData(data),
  };
}

// ─── Pemusnahan (Berita Acara) ────────────────────────────────

export function hashPemusnahan(data: DataPemusnahan): {
  idBeritaAcaraHash: string;  // → parameter idBeritaAcara di catatPemusnahan()
  kodeBarangHash: string;     // → parameter kodeBarang di catatPemusnahan()
  dataHash: string;           // → parameter dataHash di catatPemusnahan()
} {
  return {
    idBeritaAcaraHash: hashString(`${data.idKB}:${data.nomorBA}`),
    kodeBarangHash:    hashString(data.kodeBarangInternal),
    dataHash:          hashData(data),
  };
}

// ─── WIP ──────────────────────────────────────────────────────

export function hashWIP(data: DataWIP): {
  idBatchHash: string;
  dataHash: string;
} {
  return {
    idBatchHash: hashString(`${data.idKB}:${data.idBatch}`),
    dataHash:    hashData(data),
  };
}

// ─── Hasil Produksi ───────────────────────────────────────────

export function hashHasilProduksi(data: DataHasilProduksi): {
  idBatchHash: string;
  kodeProdukHash: string;
  dataHash: string;
} {
  return {
    idBatchHash:    hashString(`${data.idKB}:${data.idBatch}`),
    kodeProdukHash: hashString(data.kodeProdukInternal), // v3: dari kodeProdukInternal
    dataHash:       hashData(data),
  };
}

// ─── BOM ──────────────────────────────────────────────────────

export function hashBOM(data: DataBOM): {
  kodeFormulaHash: string;
  dataHash: string;
} {
  return {
    kodeFormulaHash: hashString(`${data.idKB}:${data.kodeFormula}:${data.versi}`),
    dataHash:        hashData(data),
  };
}

// ─── Stock Opname ─────────────────────────────────────────────

export function hashStockOpname(data: DataStockOpname): {
  idOpnameHash: string;
  dataHash: string;
} {
  return {
    idOpnameHash: hashString(`${data.idKB}:${data.idOpname}:${data.tanggal}`),
    dataHash:     hashData(data),
  };
}
