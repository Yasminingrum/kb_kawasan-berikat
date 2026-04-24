// blockchainService.ts — v3
// =============================================================
// Semua interaksi langsung dengan smart contract KBContract_v3.
// Menerima hash (bytes32) dari hashService, mengirimnya ke chain.
// Tidak ada string sensitif di sini — hanya hash + angka + enum.
//
// Perubahan v2 --> v3:
//   1. Import ABI diupdate ke KBContract_v3 & MasterRegistry_v3
//   2. bcCatatBarangMasuk: tambah parameter jenisDokumen (enum uint8)
//   3. bcCatatBarangKeluar: tambah parameter jenisDokumen (enum uint8)
//   4. bcCatatScrap(): fungsi baru — kirim hash BC 2.5 ke blockchain
//   5. bcCatatPemusnahan(): fungsi baru — kirim hash BA ke blockchain
//   6. bcVerifikasiHashScrap(): verifikasi integritas scrap
//   7. bcVerifikasiHashPemusnahan(): verifikasi integritas BA
//   8. bcGetSaldoProdukJadi(): sudah ada, tidak berubah
// =============================================================

import { ethers, type BrowserProvider, type Signer } from "ethers";
import KBContract_v3ABI      from "../contracts/KBContract_v3.json";
import MasterRegistry_v3ABI  from "../contracts/MasterRegistry_v3.json";

// =============================================================
// SECTION 1: ENUM (mirror dari Solidity)
// =============================================================
// Nilai ini harus persis sama dengan urutan enum di KBContract_v3.sol
// karena Solidity mengirim/menerima enum sebagai uint8.

export const JenisDokumenMasuk = {
  PIB:   0,  // Pemberitahuan Impor Barang
  TLDDP: 1,  // Tempat Lain Dalam Daerah Pabean
} as const;

export const JenisDokumenKeluar = {
  PEB:   0,  // Pemberitahuan Ekspor Barang
  BC25:  1,  // Dokumen BC 2.5 (scrap) — tidak dipakai di catatBarangKeluar
  LOKAL: 2,  // Pengeluaran lokal lainnya
} as const;

// =============================================================
// SECTION 2: KONSTANTA & SINGLETON
// =============================================================

const MASTER_REGISTRY_ADDRESS = import.meta.env.VITE_MASTER_REGISTRY_ADDRESS as string;

let _provider: BrowserProvider | null = null;
let _signer:   Signer | null = null;

// Cache alamat kontrak KB agar tidak query registry berulang
const _kbAddressCache = new Map<string, string>();

export function setProvider(provider: BrowserProvider, signer: Signer) {
  _provider = provider;
  _signer   = signer;
  _kbAddressCache.clear(); // reset cache saat provider berganti
}

function getSigner(): Signer {
  if (!_signer) throw new Error(
    "Signer belum diinisialisasi. Hubungkan MetaMask terlebih dahulu."
  );
  return _signer;
}

// =============================================================
// SECTION 3: CONTRACT INSTANCES
// =============================================================

function getMasterRegistry() {
  return new ethers.Contract(
    MASTER_REGISTRY_ADDRESS,
    MasterRegistry_v3ABI.abi,  // v3
    getSigner()
  );
}

async function getKBContract(idKB: string) {
  // Gunakan cache jika sudah pernah query
  let alamatKontrak = _kbAddressCache.get(idKB);

  if (!alamatKontrak) {
    const registry = getMasterRegistry();
    alamatKontrak = await registry.getAlamatKontrak(idKB) as string;
    if (!alamatKontrak || alamatKontrak === ethers.ZeroAddress) {
      throw new Error(`KB dengan ID "${idKB}" tidak ditemukan di registry.`);
    }
    _kbAddressCache.set(idKB, alamatKontrak);
  }

  return new ethers.Contract(
    alamatKontrak,
    KBContract_v3ABI.abi,  // v3
    getSigner()
  );
}

// =============================================================
// SECTION 4: TIPE RETURN
// =============================================================

export interface TxResult {
  txHash: string;
  blockNumber: number;
}

// =============================================================
// SECTION 5: OPERASI TULIS — BARANG MASUK
// =============================================================

/**
 * Catat barang masuk (PIB/TLDDP) ke blockchain.
 *
 * @param idKB           ID Kawasan Berikat
 * @param idDokumenHash  keccak256(idKB + nomorPIB/TLDDP)
 * @param kodeBarangHash keccak256(kodeBarangInternal)
 * @param jenisDokumen   JenisDokumenMasuk.PIB (0) atau .TLDDP (1)
 * @param jumlah         Kuantitas dalam satuan terkecil
 * @param dataHash       keccak256(seluruh DataBarangMasuk)
 */
export async function bcCatatBarangMasuk(
  idKB:           string,
  idDokumenHash:  string,
  kodeBarangHash: string,
  jenisDokumen:   "PIB" | "TLDDP",   // v3: enum
  jumlah:         number,
  dataHash:       string
): Promise<TxResult> {
  const contract = await getKBContract(idKB);
  const jenis = JenisDokumenMasuk[jenisDokumen];  // string → uint8
  const tx = await contract.catatBarangMasuk(
    idDokumenHash,
    kodeBarangHash,
    jenis,      // v3: enum parameter baru
    jumlah,
    dataHash
  );
  const receipt = await tx.wait();
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
}

// =============================================================
// SECTION 6: OPERASI TULIS — BARANG KELUAR
// =============================================================

/**
 * Catat barang keluar ekspor (PEB) atau lokal.
 * JANGAN gunakan untuk scrap — pakai bcCatatScrap().
 *
 * @param jenisDokumen  JenisDokumenKeluar.PEB (0) atau .LOKAL (2)
 */
export async function bcCatatBarangKeluar(
  idKB:           string,
  idDokumenHash:  string,
  kodeBarangHash: string,
  jenisDokumen:   "PEB" | "LOKAL",   // v3: enum (BC25 tidak diizinkan di sini)
  jumlah:         number,
  dataHash:       string
): Promise<TxResult> {
  const contract = await getKBContract(idKB);
  const jenis = JenisDokumenKeluar[jenisDokumen];  // string → uint8
  const tx = await contract.catatBarangKeluar(
    idDokumenHash,
    kodeBarangHash,
    jenis,      // v3: enum parameter baru
    jumlah,
    dataHash
  );
  const receipt = await tx.wait();
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
}

// =============================================================
// SECTION 7: OPERASI TULIS — SCRAP (BC 2.5) — BARU v3
// =============================================================

/**
 * Catat pengeluaran scrap via dokumen BC 2.5 ke blockchain.
 * Saldo bahan baku akan berkurang on-chain.
 * Hanya bisa dipanggil oleh operator KB.
 *
 * @param idDokumenBC25Hash  keccak256(idKB + nomorBC25)
 * @param kodeBarangHash     keccak256(kodeBarangInternal scrap)
 * @param jumlah             Kuantitas scrap yang dikeluarkan
 * @param dataHash           keccak256(seluruh DataScrap)
 */
export async function bcCatatScrap(
  idKB:              string,
  idDokumenBC25Hash: string,
  kodeBarangHash:    string,
  jumlah:            number,
  dataHash:          string
): Promise<TxResult> {
  const contract = await getKBContract(idKB);
  const tx = await contract.catatScrap(
    idDokumenBC25Hash,
    kodeBarangHash,
    jumlah,
    dataHash
  );
  const receipt = await tx.wait();
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
}

// =============================================================
// SECTION 8: OPERASI TULIS — PEMUSNAHAN (BA) — BARU v3
// =============================================================

/**
 * Catat pemusnahan barang wasted berdasarkan Berita Acara ke blockchain.
 * Saldo bahan baku akan berkurang permanen on-chain.
 * HANYA bisa dipanggil oleh Pejabat BC (AdminBC di contract).
 *
 * @param idBeritaAcaraHash  keccak256(idKB + nomorBA)
 * @param kodeBarangHash     keccak256(kodeBarangInternal barang yang dimusnahkan)
 * @param jumlah             Kuantitas yang dimusnahkan
 * @param dataHash           keccak256(seluruh DataPemusnahan)
 */
export async function bcCatatPemusnahan(
  idKB:               string,
  idBeritaAcaraHash:  string,
  kodeBarangHash:     string,
  jumlah:             number,
  dataHash:           string
): Promise<TxResult> {
  const contract = await getKBContract(idKB);
  const tx = await contract.catatPemusnahan(
    idBeritaAcaraHash,
    kodeBarangHash,
    jumlah,
    dataHash
  );
  const receipt = await tx.wait();
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
}

// =============================================================
// SECTION 9: OPERASI TULIS — PRODUKSI
// =============================================================

/** Buat batch Work In Process (mulai siklus produksi). */
export async function bcBuatWIP(
  idKB:        string,
  idBatchHash: string,
  dataHash:    string
): Promise<TxResult> {
  const contract = await getKBContract(idKB);
  const tx = await contract.buatWIP(idBatchHash, dataHash);
  const receipt = await tx.wait();
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
}

/**
 * Catat hasil produksi selesai.
 * Otomatis mengurangi saldo bahan baku on-chain sesuai konsumsi aktual.
 *
 * @param kodeBahanBakuHashes  Array keccak256(kodeBarangInternal) per bahan
 * @param jumlahBahan          Array jumlah per bahan (harus sesuai BOM)
 */
export async function bcCatatHasilProduksi(
  idKB:                string,
  idBatchHash:         string,
  kodeProdukHash:      string,
  jumlahOutput:        number,
  kodeBahanBakuHashes: string[],
  jumlahBahan:         number[],
  dataHash:            string
): Promise<TxResult> {
  const contract = await getKBContract(idKB);
  const tx = await contract.catatHasilProduksi(
    idBatchHash,
    kodeProdukHash,
    jumlahOutput,
    kodeBahanBakuHashes,
    jumlahBahan,
    dataHash
  );
  const receipt = await tx.wait();
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
}

// =============================================================
// SECTION 10: OPERASI TULIS — BOM & STOCK OPNAME
// =============================================================

/** Validasi BOM — hanya Pejabat BC yang bisa memanggil ini. */
export async function bcValidasiBOM(
  idKB:            string,
  kodeFormulaHash: string,
  dataHash:        string
): Promise<TxResult> {
  const contract = await getKBContract(idKB);
  const tx = await contract.validasiBOM(kodeFormulaHash, dataHash);
  const receipt = await tx.wait();
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
}

/** Catat stock opname — hanya Pejabat BC. */
export async function bcCatatStockOpname(
  idKB:        string,
  idOpnameHash: string,
  dataHash:    string
): Promise<TxResult> {
  const contract = await getKBContract(idKB);
  const tx = await contract.catatStockOpname(idOpnameHash, dataHash);
  const receipt = await tx.wait();
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
}

// =============================================================
// SECTION 11: OPERASI TULIS — ADMINISTRATIF
// =============================================================

/**
 * Daftarkan KB baru via MasterRegistry — hanya DJBC (owner).
 * Deploy KBContract baru otomatis on-chain.
 */
export async function bcRegisterKawasanBerikat(
  idKB:           string,
  namaPerusahaan: string,
  nomorIzin:      string,
  tanggalIzin:    number,   // unix timestamp — dari tanggal SK izin
  adminBC:        string,
  operator:       string,
  auditorDJP:     string
): Promise<TxResult> {
  const registry = getMasterRegistry();
  const tx = await registry.registerKawasanBerikat(
    idKB,
    namaPerusahaan,
    nomorIzin,
    tanggalIzin,
    adminBC,
    operator,
    auditorDJP || ethers.ZeroAddress
  );
  const receipt = await tx.wait();
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
}

/** Update status izin KB (bekukan/aktifkan) — hanya Pejabat BC / DJBC. */
export async function bcUpdateStatusIzin(
  idKB:        string,
  statusAktif: boolean
): Promise<TxResult> {
  const contract = await getKBContract(idKB);
  const tx = await contract.updateStatusIzin(statusAktif);
  const receipt = await tx.wait();
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
}

// =============================================================
// SECTION 12: QUERY / READ-ONLY
// =============================================================

/** Ambil saldo bahan baku on-chain. kodeBarangHash = keccak256(kodeBarangInternal) */
export async function bcGetSaldoBarang(
  idKB:           string,
  kodeBarangHash: string
): Promise<bigint> {
  const contract = await getKBContract(idKB);
  return await contract.getSaldoBarang(kodeBarangHash);
}

/** Ambil saldo produk jadi on-chain. */
export async function bcGetSaldoProdukJadi(
  idKB:           string,
  kodeProdukHash: string
): Promise<bigint> {
  const contract = await getKBContract(idKB);
  return await contract.getSaldoProdukJadi(kodeProdukHash);
}

/** Ambil info dasar kontrak KB (untuk dashboard monitoring). */
export async function bcGetInfoKontrak(idKB: string): Promise<{
  djbc:         string;
  adminBC:      string;
  operator:     string;
  izinAktif:    boolean;
  tanggalDeploy: bigint;
}> {
  const contract = await getKBContract(idKB);
  const [djbc, adminBC, operator, izinAktif, tanggalDeploy] =
    await contract.getInfoKontrak();
  return { djbc, adminBC, operator, izinAktif, tanggalDeploy };
}

/** Ambil semua ID KB dari MasterRegistry. */
export async function bcGetDaftarSemuaKB(): Promise<string[]> {
  const registry = getMasterRegistry();
  return await registry.getDaftarSemuaKB();
}

/** Ambil info KB dari MasterRegistry (nama, nomor izin, alamat kontrak). */
export async function bcGetInfoKB(idKB: string): Promise<{
  namaPerusahaan: string;
  nomorIzin: string;
  tanggalIzin: bigint;
  alamatKontrak: string;
  terdaftar: boolean;
}> {
  const registry = getMasterRegistry();
  const result = await registry.getInfoKB(idKB);
  // ethers v6 mengembalikan Result (array-like) untuk tuple — destructure eksplisit
  return {
    namaPerusahaan: result[0] ?? result.namaPerusahaan ?? "",
    nomorIzin:      result[1] ?? result.nomorIzin ?? "",
    tanggalIzin:    result[2] ?? result.tanggalIzin ?? 0n,
    alamatKontrak:  result[3] ?? result.alamatKontrak ?? "",
    terdaftar:      result[4] ?? result.terdaftar ?? false,
  };
}

// =============================================================
// SECTION 13: VERIFIKASI INTEGRITAS
// =============================================================
// Dipakai portal audit DJBC/DJP untuk membuktikan data Firestore
// tidak dimanipulasi setelah dicatat on-chain.

/** Verifikasi integritas dokumen barang masuk. */
export async function bcVerifikasiHashBarangMasuk(
  idKB:          string,
  idDokumenHash: string,
  dataHash:      string
): Promise<boolean> {
  const contract = await getKBContract(idKB);
  return await contract.verifikasiHashBarangMasuk(idDokumenHash, dataHash);
}

/** Verifikasi integritas dokumen barang keluar. */
export async function bcVerifikasiHashBarangKeluar(
  idKB:          string,
  idDokumenHash: string,
  dataHash:      string
): Promise<boolean> {
  const contract = await getKBContract(idKB);
  return await contract.verifikasiHashBarangKeluar(idDokumenHash, dataHash);
}

/** Verifikasi integritas dokumen scrap BC 2.5. — BARU v3 */
export async function bcVerifikasiHashScrap(
  idKB:              string,
  idDokumenBC25Hash: string,
  dataHash:          string
): Promise<boolean> {
  const contract = await getKBContract(idKB);
  return await contract.verifikasiHashScrap(idDokumenBC25Hash, dataHash);
}

/** Verifikasi integritas Berita Acara pemusnahan. — BARU v3 */
export async function bcVerifikasiHashPemusnahan(
  idKB:               string,
  idBeritaAcaraHash:  string,
  dataHash:           string
): Promise<boolean> {
  const contract = await getKBContract(idKB);
  return await contract.verifikasiHashPemusnahan(idBeritaAcaraHash, dataHash);
}
