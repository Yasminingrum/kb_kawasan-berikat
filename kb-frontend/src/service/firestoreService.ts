// firestoreService.ts — v3 (fix: stripUndefined pada semua addDoc)
// =============================================================
// Perubahan dari versi sebelumnya:
//   - Tambah helper stripUndefined() — Firestore melempar error
//     jika ada field bernilai undefined (mis: nomorTLDDP saat
//     jenis dokumen adalah PIB). Semua fungsi simpan* sekarang
//     membersihkan undefined sebelum addDoc dipanggil.
//   - Semua fungsi get*() tidak menggabungkan orderBy + where
//     dalam satu query (butuh composite index). Sort dilakukan
//     di sisi client setelah data diambil.
// =============================================================

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  limit,
  serverTimestamp,
  type QueryConstraint,
} from "firebase/firestore";
import { db, COLLECTIONS } from "../config/firebase";
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
// SECTION 1: INTERFACE DOKUMEN FIRESTORE
// =============================================================

export interface DocBarangMasuk extends DataBarangMasuk {
  dataHash: string;
  txHash: string;
  blockNumber: number;
  createdAt: unknown;
}

export interface DocBarangKeluar extends DataBarangKeluar {
  dataHash: string;
  txHash: string;
  blockNumber: number;
  createdAt: unknown;
}

export interface DocScrap extends DataScrap {
  dataHash: string;
  txHash: string;
  blockNumber: number;
  createdAt: unknown;
}

export interface DocPemusnahan extends DataPemusnahan {
  dataHash: string;
  txHash: string;
  blockNumber: number;
  createdAt: unknown;
}

export interface DocWIP extends DataWIP {
  dataHash: string;
  txHash: string;
  blockNumber: number;
  status: "aktif" | "selesai" | "dibatalkan";
  createdAt: unknown;
}

export interface DocHasilProduksi extends DataHasilProduksi {
  dataHash: string;
  txHash: string;
  blockNumber: number;
  createdAt: unknown;
}

export interface DocBOM extends DataBOM {
  dataHash: string;
  txHash: string;
  blockNumber: number;
  disetujui: boolean;
  statusBOM: "menunggu_persetujuan" | "disetujui" | "ditolak";
  alasanTolak?: string;
  createdAt: unknown;
}

export interface DocStockOpname extends DataStockOpname {
  dataHash: string;
  txHash: string;
  blockNumber: number;
  createdAt: unknown;
}

// =============================================================
// SECTION 2: HELPER
// =============================================================

function subCol(idKB: string, subCollection: string) {
  return collection(db, COLLECTIONS.KB, idKB, subCollection);
}

type BlockchainMeta = {
  dataHash: string;
  txHash: string;
  blockNumber: number;
};

/**
 * Hapus semua field bernilai undefined dari object sebelum dikirim ke Firestore.
 * Firestore melempar FirebaseError jika ada field undefined — ini terjadi misalnya
 * saat field opsional (nomorTLDDP, tanggalPEB, dll.) tidak diisi karena jenis
 * dokumen berbeda. Fungsi ini memastikan hanya field yang benar-benar ada yang
 * dikirim ke Firestore.
 */
function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  );
}

/**
 * Sort array dokumen Firestore berdasarkan createdAt descending (terbaru di atas).
 * createdAt bisa berupa Firestore Timestamp atau null saat pending.
 */
function sortByCreatedAt<T extends { createdAt: unknown }>(docs: T[]): T[] {
  return [...docs].sort((a, b) => {
    const ta = (a.createdAt as any)?.seconds ?? 0;
    const tb = (b.createdAt as any)?.seconds ?? 0;
    return tb - ta; // descending
  });
}

// =============================================================
// SECTION 3: BARANG MASUK (PIB / TLDDP)
// =============================================================

export async function simpanBarangMasuk(
  data: DataBarangMasuk,
  blockchain: BlockchainMeta
): Promise<string> {
  const ref = await addDoc(
    subCol(data.idKB, COLLECTIONS.BARANG_MASUK),
    stripUndefined({ ...data, ...blockchain, createdAt: serverTimestamp() })
  );
  return ref.id;
}

export async function getBarangMasuk(
  idKB: string,
  options?: {
    limit?: number;
    nomorPIB?: string;
    nomorTLDDP?: string;
    jenis?: "PIB" | "TLDDP";
  }
) {
  const constraints: QueryConstraint[] = [];

  if (options?.jenis) {
    constraints.push(where("jenisDokumen", "==", options.jenis));
  } else if (options?.nomorPIB) {
    constraints.push(where("nomorPIB", "==", options.nomorPIB));
  } else if (options?.nomorTLDDP) {
    constraints.push(where("nomorTLDDP", "==", options.nomorTLDDP));
  }

  if (options?.limit) {
    constraints.push(limit(options.limit));
  }

  const snap = await getDocs(
    query(subCol(idKB, COLLECTIONS.BARANG_MASUK), ...constraints)
  );
  const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocBarangMasuk) }));
  return sortByCreatedAt(docs);
}

// =============================================================
// SECTION 4: BARANG KELUAR (PEB / LOKAL)
// =============================================================

export async function simpanBarangKeluar(
  data: DataBarangKeluar,
  blockchain: BlockchainMeta
): Promise<string> {
  const ref = await addDoc(
    subCol(data.idKB, COLLECTIONS.BARANG_KELUAR),
    stripUndefined({ ...data, ...blockchain, createdAt: serverTimestamp() })
  );
  return ref.id;
}

export async function getBarangKeluar(
  idKB: string,
  options?: {
    limit?: number;
    jenis?: "PEB" | "LOKAL";
    nomorPEB?: string;
  }
) {
  const constraints: QueryConstraint[] = [];

  if (options?.jenis) {
    constraints.push(where("jenisDokumen", "==", options.jenis));
  } else if (options?.nomorPEB) {
    constraints.push(where("nomorPEB", "==", options.nomorPEB));
  }

  if (options?.limit) {
    constraints.push(limit(options.limit));
  }

  const snap = await getDocs(
    query(subCol(idKB, COLLECTIONS.BARANG_KELUAR), ...constraints)
  );
  const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocBarangKeluar) }));
  return sortByCreatedAt(docs);
}

// =============================================================
// SECTION 5: SCRAP (BC 2.5)
// =============================================================

export async function simpanScrap(
  data: DataScrap,
  blockchain: BlockchainMeta
): Promise<string> {
  const ref = await addDoc(
    subCol(data.idKB, COLLECTIONS.SCRAP),
    stripUndefined({ ...data, ...blockchain, createdAt: serverTimestamp() })
  );
  return ref.id;
}

export async function getScrap(
  idKB: string,
  options?: { limit?: number; nomorBC25?: string }
) {
  const constraints: QueryConstraint[] = [];

  if (options?.nomorBC25) {
    constraints.push(where("nomorBC25", "==", options.nomorBC25));
  }
  if (options?.limit) {
    constraints.push(limit(options.limit));
  }

  const snap = await getDocs(
    query(subCol(idKB, COLLECTIONS.SCRAP), ...constraints)
  );
  const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocScrap) }));
  return sortByCreatedAt(docs);
}

// =============================================================
// SECTION 6: PEMUSNAHAN (BERITA ACARA)
// =============================================================

export async function simpanPemusnahan(
  data: DataPemusnahan,
  blockchain: BlockchainMeta
): Promise<string> {
  const ref = await addDoc(
    subCol(data.idKB, COLLECTIONS.PEMUSNAHAN),
    stripUndefined({ ...data, ...blockchain, createdAt: serverTimestamp() })
  );
  return ref.id;
}

export async function getPemusnahan(
  idKB: string,
  options?: { limit?: number; nomorBA?: string }
) {
  const constraints: QueryConstraint[] = [];

  if (options?.nomorBA) {
    constraints.push(where("nomorBA", "==", options.nomorBA));
  }
  if (options?.limit) {
    constraints.push(limit(options.limit));
  }

  const snap = await getDocs(
    query(subCol(idKB, COLLECTIONS.PEMUSNAHAN), ...constraints)
  );
  const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocPemusnahan) }));
  return sortByCreatedAt(docs);
}

// =============================================================
// SECTION 7: WORK IN PROCESS
// =============================================================

export async function simpanWIP(
  data: DataWIP,
  blockchain: BlockchainMeta
): Promise<string> {
  const ref = await addDoc(
    subCol(data.idKB, COLLECTIONS.WIP),
    stripUndefined({ ...data, ...blockchain, status: "aktif", createdAt: serverTimestamp() })
  );
  return ref.id;
}

export async function getWIPAktif(idKB: string) {
  const snap = await getDocs(
    query(
      subCol(idKB, COLLECTIONS.WIP),
      where("status", "==", "aktif")
    )
  );
  const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocWIP) }));
  return sortByCreatedAt(docs);
}

export async function getSemuaWIP(idKB: string, options?: { limit?: number }) {
  const constraints: QueryConstraint[] = [];
  if (options?.limit) constraints.push(limit(options.limit));
  const snap = await getDocs(query(subCol(idKB, COLLECTIONS.WIP), ...constraints));
  const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocWIP) }));
  return sortByCreatedAt(docs);
}

// =============================================================
// SECTION 8: HASIL PRODUKSI
// =============================================================

export async function simpanHasilProduksi(
  data: DataHasilProduksi,
  blockchain: BlockchainMeta
): Promise<string> {
  const ref = await addDoc(
    subCol(data.idKB, COLLECTIONS.HASIL_PRODUKSI),
    stripUndefined({ ...data, ...blockchain, createdAt: serverTimestamp() })
  );
  return ref.id;
}

export async function getHasilProduksi(
  idKB: string,
  options?: { limit?: number }
) {
  const constraints: QueryConstraint[] = [];
  if (options?.limit) constraints.push(limit(options.limit));
  const snap = await getDocs(
    query(subCol(idKB, COLLECTIONS.HASIL_PRODUKSI), ...constraints)
  );
  const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocHasilProduksi) }));
  return sortByCreatedAt(docs);
}

// =============================================================
// SECTION 9: BILL OF MATERIALS
// =============================================================

/**
 * Ajukan BOM baru oleh operator KB — status "menunggu_persetujuan".
 * Blockchain belum dipanggil di sini; hanya simpan ke Firestore.
 */
export async function ajukanBOM(data: DataBOM): Promise<string> {
  const ref = await addDoc(
    subCol(data.idKB, COLLECTIONS.BOM),
    stripUndefined({
      ...data,
      disetujui: false,
      statusBOM: "menunggu_persetujuan",
      txHash: "pending",
      blockNumber: 0,
      dataHash: "",
      createdAt: serverTimestamp(),
    })
  );
  return ref.id;
}

/**
 * Approve BOM oleh Pejabat BC — update status + simpan blockchain meta.
 * Dipanggil setelah blockchain berhasil.
 */
export async function approveBOM(
  idKB: string,
  docId: string,
  blockchain: BlockchainMeta & { dataHash: string }
): Promise<void> {
  const ref = doc(db, COLLECTIONS.KB, idKB, COLLECTIONS.BOM, docId);
  await updateDoc(ref, {
    disetujui: true,
    statusBOM: "disetujui",
    txHash: blockchain.txHash,
    blockNumber: blockchain.blockNumber,
    dataHash: blockchain.dataHash,
  });
}

/**
 * Tolak BOM oleh Pejabat BC — update status + simpan alasan penolakan.
 */
export async function tolakBOM(
  idKB: string,
  docId: string,
  alasanTolak: string
): Promise<void> {
  const ref = doc(db, COLLECTIONS.KB, idKB, COLLECTIONS.BOM, docId);
  await updateDoc(ref, {
    disetujui: false,
    statusBOM: "ditolak",
    alasanTolak,
  });
}

/** Simpan BOM langsung dengan status disetujui (legacy, dipertahankan). */
export async function simpanBOM(
  data: DataBOM,
  blockchain: BlockchainMeta
): Promise<string> {
  const ref = await addDoc(
    subCol(data.idKB, COLLECTIONS.BOM),
    stripUndefined({
      ...data,
      ...blockchain,
      disetujui: true,
      statusBOM: "disetujui",
      createdAt: serverTimestamp(),
    })
  );
  return ref.id;
}

export async function getBOM(idKB: string, kodeFormula?: string) {
  const constraints: QueryConstraint[] = [];
  if (kodeFormula) {
    constraints.push(where("kodeFormula", "==", kodeFormula));
  }
  const snap = await getDocs(query(subCol(idKB, COLLECTIONS.BOM), ...constraints));
  const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocBOM) }));
  return sortByCreatedAt(docs);
}

/** Ambil BOM yang menunggu persetujuan Pejabat BC. */
export async function getBOMMenunggu(idKB: string) {
  const snap = await getDocs(
    query(subCol(idKB, COLLECTIONS.BOM), where("statusBOM", "==", "menunggu_persetujuan"))
  );
  const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocBOM) }));
  return sortByCreatedAt(docs);
}

// =============================================================
// SECTION 10: STOCK OPNAME
// =============================================================

export async function simpanStockOpname(
  data: DataStockOpname,
  blockchain: BlockchainMeta
): Promise<string> {
  const ref = await addDoc(
    subCol(data.idKB, COLLECTIONS.STOCK_OPNAME),
    stripUndefined({ ...data, ...blockchain, createdAt: serverTimestamp() })
  );
  return ref.id;
}

export async function getStockOpname(
  idKB: string,
  options?: { limit?: number }
) {
  const constraints: QueryConstraint[] = [];
  if (options?.limit) constraints.push(limit(options.limit));
  const snap = await getDocs(
    query(subCol(idKB, COLLECTIONS.STOCK_OPNAME), ...constraints)
  );
  const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocStockOpname) }));
  return sortByCreatedAt(docs);
}

// =============================================================
// SECTION 11: LAPORAN AUDIT TERPADU
// =============================================================

export async function getSemuaPengeluaran(
  idKB: string,
  options?: { limit?: number }
) {
  const [keluar, scrap, pemusnahan] = await Promise.all([
    getBarangKeluar(idKB, options),
    getScrap(idKB, options),
    getPemusnahan(idKB, options),
  ]);
  return { keluar, scrap, pemusnahan };
}

// =============================================================
// SECTION 12: AUDIT LOG
// =============================================================

export async function catatAuditLog(entry: {
  idKB: string;
  aksi: string;
  pelaku: string;
  walletAddress: string;
  dataHash: string;
  txHash?: string;
  detail?: object;
}) {
  await addDoc(
    subCol(entry.idKB, COLLECTIONS.AUDIT_LOG),
    stripUndefined({ ...entry, createdAt: serverTimestamp() })
  );
}

// =============================================================
// SECTION 13: METADATA KB
// =============================================================

export async function getMetadataKB(idKB: string) {
  const snap = await getDoc(doc(db, COLLECTIONS.KB, idKB));
  if (!snap.exists()) return null;
  return snap.data();
}
