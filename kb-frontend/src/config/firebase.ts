// kb-frontend/src/config/firebase.ts
// =============================================================
// Inisialisasi Firebase dan konstanta nama koleksi Firestore.
//
// Perubahan v2 --> v3:
//   - Tambah COLLECTIONS.SCRAP    = "scrap"
//   - Tambah COLLECTIONS.PEMUSNAHAN = "pemusnahan"
//
// PENTING: Ganti semua nilai firebaseConfig di bawah dengan
// nilai dari Firebase Console proyekmu:
//   Project Settings → General → Your apps → Web app → SDK setup
// =============================================================

import { initializeApp } from "firebase/app";
import { getFirestore, clearIndexedDbPersistence } from "firebase/firestore";

// ── Firebase Config ───────────────────────────────────────────
// Semua nilai diambil dari environment variable (.env)
// Jangan hardcode nilai ini langsung di sini.

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            as string,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        as string,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         as string,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             as string,
};

// ── Inisialisasi ─────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ── Fix BloomFilterError ──────────────────────────────────────
// BloomFilter cache corrupt terjadi pada Firebase SDK 12.x.
// Bersihkan IndexedDB otomatis saat error terdeteksi.
clearIndexedDbPersistence(db).catch(() => {
  // Diabaikan — normal terjadi kalau tidak ada persistence aktif
});

// ── Nama Koleksi Firestore ────────────────────────────────────
// Didefinisikan di satu tempat agar tidak ada typo yang tersebar
// di seluruh codebase. Selalu gunakan konstanta ini, bukan string
// literal, saat memanggil collection() di Firestore.
//
// Struktur path Firestore:
//   KB/{idKB}/barang_masuk/{docId}
//   KB/{idKB}/barang_keluar/{docId}
//   KB/{idKB}/scrap/{docId}            ← v3 baru
//   KB/{idKB}/pemusnahan/{docId}       ← v3 baru
//   KB/{idKB}/wip/{docId}
//   KB/{idKB}/hasil_produksi/{docId}
//   KB/{idKB}/bom/{docId}
//   KB/{idKB}/stock_opname/{docId}
//   KB/{idKB}/audit_log/{docId}

export const COLLECTIONS = {
  // ── Koleksi induk ──────────────────────────────────────────
  KB: "kawasan_berikat",

  // ── Sub-koleksi per KB ─────────────────────────────────────
  BARANG_MASUK:     "barang_masuk",
  BARANG_KELUAR:    "barang_keluar",
  SCRAP:            "scrap",           // v3: pengeluaran via BC 2.5
  PEMUSNAHAN:       "pemusnahan",      // v3: Berita Acara pemusnahan wasted
  WIP:              "wip",
  HASIL_PRODUKSI:   "hasil_produksi",
  BOM:              "bom",
  STOCK_OPNAME:     "stock_opname",
  AUDIT_LOG:        "audit_log",
  KATALOG:          "katalog",
} as const;

// Tipe helper untuk nama koleksi (opsional, berguna untuk type-safety)
export type CollectionName = typeof COLLECTIONS[keyof typeof COLLECTIONS];
