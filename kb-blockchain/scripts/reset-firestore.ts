// kb-blockchain/scripts/reset-firestore.ts — v2
// =============================================================
// Hapus semua dokumen Firestore KB-SBY-001 menggunakan Admin SDK.
// Dipakai sebelum seed ulang dari awal.
//
// Cara menjalankan:
//   npx hardhat run scripts/reset-firestore.ts --network localhost
// =============================================================

import { initializeApp, cert }      from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync }             from "fs";
import { join }                     from "path";

const ID_KB      = "KB-SBY-001";
const KOLEKSI_KB = "kawasan_berikat";
const SUB_KOLEKSI = [
  "barang_masuk", "barang_keluar", "scrap", "pemusnahan",
  "wip", "hasil_produksi", "bom", "stock_opname", "audit_log",
];

// ── Inisialisasi Admin SDK ────────────────────────────────────

const serviceAccountPath = join(__dirname, "serviceAccountKey.json");

let serviceAccount: object;
try {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));
} catch {
  console.error("\n❌ File tidak ditemukan: scripts/serviceAccountKey.json");
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount as any) });
const db = getFirestore();

// ── Helper: hapus sub-koleksi dalam batch ─────────────────────

async function hapusSubKoleksi(sub: string): Promise<number> {
  const ref  = db.collection(KOLEKSI_KB).doc(ID_KB).collection(sub);
  const snap = await ref.get();
  if (snap.empty) return 0;

  let count = 0;
  // Hapus dalam batch maksimal 500 dokumen
  const chunks: FirebaseFirestore.QueryDocumentSnapshot[][] = [];
  for (let i = 0; i < snap.docs.length; i += 500) {
    chunks.push(snap.docs.slice(i, i + 500));
  }
  for (const chunk of chunks) {
    const batch = db.batch();
    chunk.forEach(d => batch.delete(d.ref));
    await batch.commit();
    count += chunk.length;
  }
  return count;
}

async function main() {
  console.log("\n" + "=".repeat(55));
  console.log("  RESET FIRESTORE — " + ID_KB);
  console.log("=".repeat(55));
  console.log("  Menghapus semua sub-koleksi...\n");

  let total = 0;
  for (const sub of SUB_KOLEKSI) {
    const jumlah = await hapusSubKoleksi(sub);
    if (jumlah > 0) {
      console.log(`  🗑️  ${sub.padEnd(20)} ${jumlah} dokumen dihapus`);
    } else {
      console.log(`  ⬜  ${sub.padEnd(20)} kosong`);
    }
    total += jumlah;
  }

  console.log("\n" + "─".repeat(55));
  console.log(`  Total dihapus : ${total} dokumen`);
  console.log("  Firestore bersih. Siap untuk seed ulang.");
  console.log("=".repeat(55) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Reset gagal:", err?.message || err);
    process.exit(1);
  });