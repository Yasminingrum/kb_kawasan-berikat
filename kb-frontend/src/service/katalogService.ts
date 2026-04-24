// katalogService.ts
// =============================================================
// Katalog Barang per KB — sumber kebenaran nama, kodeHS, satuan.
//
// Struktur Firestore:
//   kawasan_berikat/{idKB}/katalog/{kodeBarangInternal}
//   (kodeBarangInternal dipakai sebagai docId agar mudah di-get)
//
// Filosofi "auto-grow":
//   - Operator tidak perlu mendaftarkan barang terlebih dahulu.
//   - Setiap kali form submit dengan kode yang belum ada di katalog,
//     sistem otomatis menyimpan entry baru dengan data minimal.
//   - Entry bisa di-update nanti melalui halaman Katalog (opsional).
// =============================================================

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, COLLECTIONS } from "../config/firebase";

// ── Tipe data ────────────────────────────────────────────────

export interface KatalogItem {
  kodeBarangInternal: string;
  namaBarang: string;
  kodeHS: string;
  satuan: string;
  jenisBarang: "bahan_baku" | "produk_jadi" | "bahan_penolong" | "scrap" | "lainnya";
  keterangan?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

// ── Helper ───────────────────────────────────────────────────

function katalogCol(idKB: string) {
  return collection(db, COLLECTIONS.KB, idKB, "katalog");
}

function katalogDoc(idKB: string, kodeBarangInternal: string) {
  // Encode kode agar aman sebagai docId Firestore
  // (hapus karakter /  yang tidak boleh ada di path)
  const safeId = kodeBarangInternal.replace(/\//g, "_");
  return doc(db, COLLECTIONS.KB, idKB, "katalog", safeId);
}

// ── Read ─────────────────────────────────────────────────────

/** Ambil seluruh katalog satu KB. Di-cache di state React, bukan dipanggil terus. */
export async function getKatalog(idKB: string): Promise<KatalogItem[]> {
  const snap = await getDocs(katalogCol(idKB));
  return snap.docs.map(d => d.data() as KatalogItem);
}

/** Cek apakah satu kode sudah ada di katalog. */
export async function getKatalogItem(
  idKB: string,
  kodeBarangInternal: string
): Promise<KatalogItem | null> {
  const snap = await getDoc(katalogDoc(idKB, kodeBarangInternal));
  return snap.exists() ? (snap.data() as KatalogItem) : null;
}

// ── Write ────────────────────────────────────────────────────

/**
 * Simpan atau update satu entry katalog.
 * Pakai setDoc (upsert) — aman dipanggil berkali-kali.
 */
export async function simpanKatalogItem(
  idKB: string,
  item: Omit<KatalogItem, "createdAt" | "updatedAt">
): Promise<void> {
  const ref = katalogDoc(idKB, item.kodeBarangInternal);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    // Update — hanya timpa field yang disediakan, jaga createdAt
    await updateDoc(ref, {
      ...item,
      updatedAt: serverTimestamp(),
    });
  } else {
    // Insert baru
    await setDoc(ref, {
      ...item,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * Auto-register: dipanggil saat form submit.
 * Hanya menyimpan jika kode BELUM ADA — tidak menimpa data yang sudah lengkap.
 * Kalau sudah ada → skip (data lama lebih terpercaya karena bisa saja sudah di-edit).
 */
export async function autoRegisterKatalog(
  idKB: string,
  item: Omit<KatalogItem, "createdAt" | "updatedAt">
): Promise<void> {
  const ref = katalogDoc(idKB, item.kodeBarangInternal);
  const existing = await getDoc(ref);
  if (!existing.exists()) {
    await setDoc(ref, {
      ...item,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * Batch auto-register banyak barang sekaligus.
 * Dipakai saat submit BOM (bisa ada banyak bahan komposisi).
 */
export async function autoRegisterKatalogBatch(
  idKB: string,
  items: Omit<KatalogItem, "createdAt" | "updatedAt">[]
): Promise<void> {
  await Promise.all(items.map(item => autoRegisterKatalog(idKB, item)));
}
