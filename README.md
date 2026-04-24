# Sistem IT Inventory Kawasan Berikat — v3
## Implementasi Blockchain sebagai Sistem IT Inventory pada Kawasan Berikat
### Arsitektur Hybrid: Blockchain + Firestore

---

## Apa yang Baru di v3

| Fitur | v2 | v3 |
|---|---|---|
| Scrap (BC 2.5) | Belum ada | ✅ Ada — fungsi `catatScrap()`, event `ScrapDikeluarkan` |
| Pemusnahan (BA) | Belum ada | ✅ Ada — fungsi `catatPemusnahan()`, event `BarangDimusnahkan` |
| Identifikasi barang | `kodeHS + namaBarang` | ✅ `kodeBarangInternal` — unik per item perusahaan |
| Nomor & tanggal PIB | Field generik | ✅ `nomorPIB` + `tanggalPIB` eksplisit |
| Nomor & tanggal PEB | Field generik | ✅ `nomorPEB` + `tanggalPEB` eksplisit |
| Jenis dokumen on-chain | Tidak dicatat | ✅ Enum `JenisDokumenMasuk` / `JenisDokumenKeluar` |
| Konversi BOM | Tanpa toleransi | ✅ `toleransiScrapPersen` + `toleransiWastedPersen` |
| Portal Pejabat BC | Tanpa pemusnahan | ✅ Halaman Pemusnahan (BA) |
| Portal Operator KB | Tanpa scrap | ✅ Halaman Scrap (BC 2.5) |
| Laporan Pejabat BC | ABI v1, rusak | ✅ Rewrite total ke Firestore hybrid |
| Export CSV | Tanpa scrap & BA | ✅ Mencakup semua 5 koleksi |
| Verifikasi integritas | Masuk & keluar saja | ✅ Masuk, keluar, scrap, dan pemusnahan |

---

## Arsitektur Sistem

### Mengapa Arsitektur Hybrid?

Blockchain murni menyimpan semua data secara publik — nama barang, nomor PIB/PEB, Bill of Materials, negara tujuan ekspor semua terbaca siapapun termasuk kompetitor. Arsitektur hybrid memisahkan tanggung jawab:

| Komponen | Tanggung Jawab | Yang Bisa Membaca |
|---|---|---|
| **Firestore** | Data lengkap (nama, nomor dokumen, nilai, dll.) | Hanya pihak berwenang |
| **Blockchain** | Hash integritas + saldo + status | Siapa saja (hanya hash) |

**Prinsip kunci:** Data di Firestore tidak bisa dimanipulasi secara diam-diam. Kalau ada yang mengubah data di Firestore, hash-nya tidak akan cocok dengan yang tersimpan permanen di blockchain.

### Alur Data (Contoh: Catat Scrap BC 2.5)

```
Operator isi form Scrap di frontend
        ↓
useBlockchain.submitScrap(data)
        ↓
hybridService.catatScrap(data)
        ├── hashService.hashScrap(data)
        │         → idDokumenBC25Hash = keccak256(idKB + nomorBC25)
        │         → kodeBarangHash    = keccak256(kodeBarangInternal)
        │         → dataHash          = keccak256(seluruh objek data)
        ├── firestoreService.simpanScrap(data, {dataHash, txHash:"pending", blockNumber:0})
        │         → Firestore: KB/{idKB}/scrap/{docId} [data lengkap tersimpan]
        ├── blockchainService.bcCatatScrap(idKB, idDokumenBC25Hash, kodeBarangHash, jumlah, dataHash)
        │         → KBContract_v3.catatScrap(...)
        │         → saldoBarang[kodeBarangHash] -= jumlah  [on-chain]
        │         → event ScrapDikeluarkan dipancarkan     [on-chain]
        └── firestoreService.catatAuditLog(...)
                  → Firestore: KB/{idKB}/audit_log/{docId}
```

---

## Struktur Folder

```
KB_KAWASAN_BERIKAT/
├── kb-blockchain/
│   ├── contracts/
│   │   ├── KBContract_v3.sol        ← Smart contract per KB
│   │   └── MasterRegistry_v3.sol    ← Registry induk (Factory Pattern)
│   ├── ignition/modules/
│   │   └── deploy.ts                ← Deploy script (Hardhat Ignition)
│   ├── scripts/
│   │   └── setup.ts                 ← Setup awal setelah deploy
│   ├── test/
│   │   ├── KBContract_v3.test.ts    ← Unit test contract baru
│   │   └── MasterRegistry_v3.test.ts
│   └── hardhat.config.ts
│
├── kb-frontend/
│   └── src/
│       ├── components/
│       │   ├── Navbar.tsx
│       │   └── Sidebar.tsx           ← v3: menu Scrap & Pemusnahan
│       ├── config/
│       │   ├── contracts.ts          ← Wallet roles & KB mapping
│       │   └── firebase.ts           ← v3: tambah SCRAP & PEMUSNAHAN koleksi
│       ├── contracts/
│       │   ├── KBContract_v3.json    ← ABI (dari artifacts/ setelah compile)
│       │   └── MasterRegistry_v3.json
│       ├── hooks/
│       │   ├── useBlockchain.ts      ← v3: submitScrap, submitPemusnahan
│       │   └── useMetaMask.ts
│       ├── pages/
│       │   ├── DashboardDJBC.tsx
│       │   ├── LaporanKB.tsx         ← v3: tab Scrap & Pemusnahan
│       │   ├── LaporanPejabatBC.tsx  ← v3: rewrite total
│       │   ├── LoginPage.tsx
│       │   ├── PortalDJP.tsx         ← v3: tab Scrap & Pemusnahan
│       │   ├── PortalOperatorKB.tsx  ← v3: page kb_scrap
│       │   └── PortalPejabatBC.tsx   ← v3: page pejabat_pemusnahan
│       ├── service/
│       │   ├── blockchainService.ts  ← v3: bcCatatScrap, bcCatatPemusnahan
│       │   ├── firestoreService.ts   ← v3: simpanScrap, simpanPemusnahan
│       │   ├── hashService.ts        ← v3: DataScrap, DataPemusnahan
│       │   └── hybridService.ts      ← v3: catatScrap, catatPemusnahan
│       ├── App.tsx                   ← v3: page kb_scrap, pejabat_pemusnahan
│       └── main.tsx
│
├── firestore.rules                   ← v3: rules untuk scrap & pemusnahan
└── README.md
```

---

## Panduan Setup End-to-End

### Prasyarat

```bash
node >= 18.0.0
npm  >= 9.0.0
MetaMask browser extension (terpasang di Chrome/Firefox/Brave)
Akun Firebase (gratis di console.firebase.google.com)
```

### Langkah 1 — Clone & Install

```bash
# Install dependensi blockchain
cd kb-blockchain
npm install

# Install dependensi frontend
cd ../kb-frontend
npm install
```

### Langkah 2 — Jalankan Hardhat Node

Buka terminal baru dan jalankan:

```bash
cd kb-blockchain
npx hardhat node
```

Terminal akan menampilkan daftar 20 akun dengan private key-nya. **Simpan daftar ini** — kamu butuh alamat akun #0 sampai #4 untuk konfigurasi.

### Langkah 3 — Deploy Contract v3

```bash
cd kb-blockchain
npx hardhat ignition deploy ./ignition/modules/deploy.ts --network localhost
```
 
Salin alamat `MasterRegistry_v3` dari output.

### Langkah 4 — Setup Awal (Daftarkan KB)

Edit `scripts/setup.ts` → isi `MASTER_REGISTRY_ADDRESS` dengan alamat dari langkah 3, lalu:

```bash
npx hardhat run scripts/setup.ts --network localhost
```

Script ini akan:
- Mendaftarkan wallet Pejabat BC ke whitelist
- Registrasi dua KB contoh (KB-SBY-001 dan KB-JKT-001)
- Menampilkan konfigurasi siap-salin untuk `.env` dan `contracts.ts`

### Langkah 5 — Copy ABI ke Frontend

Setelah compile (otomatis saat deploy), copy ABI:

```bash
cp kb-blockchain/artifacts/contracts/KBContract_v3.sol/KBContract_v3.json \
   kb-frontend/src/contracts/KBContract_v3.json

cp kb-blockchain/artifacts/contracts/MasterRegistry_v3.sol/MasterRegistry_v3.json \
   kb-frontend/src/contracts/MasterRegistry_v3.json
```

### Langkah 6 — Konfigurasi Firebase

1. Buka https://console.firebase.google.com
2. Buat project baru → nama: `kb-inventory`
3. **Build → Firestore Database → Create database** → pilih mode production → lokasi `asia-southeast1`
4. **Project Settings → Your apps → Web** → register app → salin `firebaseConfig`
5. Deploy Firestore rules:

```bash
npm install -g firebase-tools
firebase login
firebase init firestore    # pilih project yang baru dibuat
firebase deploy --only firestore:rules
```

### Langkah 7 — Konfigurasi .env

Buat file `kb-frontend/.env` (salin dari `.env.example`):

```bash
cd kb-frontend
cp .env.example .env
```

Isi semua nilai sesuai output dari langkah 3–4 dan firebaseConfig dari langkah 6.

### Langkah 8 — Konfigurasi contracts.ts

Edit `kb-frontend/src/config/contracts.ts`:
- Isi `WALLET_ROLES` dengan alamat dari output `setup.ts`
- Isi `OPERATOR_KB_MAP` dengan pemetaan operator ke KB

### Langkah 9 — Tambah Akun Hardhat ke MetaMask

Di MetaMask:
1. Import Account → masukkan private key akun #0 (DJBC)
2. Ulangi untuk akun #1 (Pejabat BC), #2 (Operator SBY), #3 (Operator JKT), #4 (DJP)
3. Tambah network Hardhat: Chain ID `31337`, RPC URL `http://127.0.0.1:8545`

### Langkah 10 — Jalankan Frontend

```bash
cd kb-frontend
npm run dev
```

### Langkah 11 - Lakukan seeder
npx hardhat run scripts/reset-firestore.ts --network localhost
npx hardhat run scripts/seed-dummy-data.ts --network localhost

Buka http://localhost:5173 di browser, hubungkan MetaMask, dan pilih akun sesuai role yang ingin dicoba.

---

## Referensi Regulasi

| Dokumen | Pasal | Keterkaitan |
|---|---|---|
| PER-9/BC/2021 | Pasal 19 | Kewajiban IT Inventory: realtime, traceable, authorized |
| PER-9/BC/2021 | Pasal 57 | Pembekuan izin KB oleh Pejabat BC |
| PMK No. 65/PMK.04/2021 | Semua | Kewajiban pencatatan barang impor/ekspor |
| PER-07/BC/2021 | Semua | Tata cara pengeluaran barang KB (BC 2.5 & pemusnahan) |

---

## Pertanyaan untuk Presentasi

**"Kenapa tidak simpan semua di blockchain?"**

> Menyimpan data bisnis sensitif seperti Bill of Material secara verbatim di public blockchain merupakan pelanggaran terhadap prinsip kerahasiaan dagang. Arsitektur hash-only yang digunakan mengadopsi pola kriptografis yang sama dengan sistem seperti Certificate Transparency Log (digunakan browser untuk verifikasi TLS certificate) dan Git (menggunakan SHA-256 untuk integritas konten). Blockchain berperan sebagai notaris digital — ia tidak perlu tahu isi dokumen untuk menjamin dokumen tidak diubah setelah dicap.

**"Kalau data di Firestore, apa bedanya dengan database biasa?"**

> Perbedaan fundamentalnya ada pada kriptografis binding. Di sistem konvensional, administrator database bisa mengubah data tanpa jejak. Di sistem ini, setiap perubahan di Firestore akan terdeteksi saat audit karena hash-nya tidak akan cocok dengan yang tersimpan permanen di blockchain. Ini adalah properti integritas yang tidak bisa dipalsukan — bahkan oleh DJBC sendiri sekalipun.

**"Bagaimana dengan scrap dan pemusnahan? Apakah ada jaminan tidak dimanipulasi?"**

> Untuk scrap (BC 2.5), hash dokumen disimpan on-chain via `catatScrap()` dan saldo bahan baku berkurang secara atomik. Untuk pemusnahan (BA), hanya Pejabat BC yang bisa mencatatnya — ada mekanisme pemisahan wewenang (operator tidak bisa menginput pemusnahan sendiri). Kedua dokumen tidak pernah bisa dihapus dari Firestore (rules `allow delete: if false`) maupun dari blockchain (data on-chain bersifat immutable). Auditor dapat memverifikasi integritas setiap dokumen kapan saja lewat tombol "Verifikasi" di portal laporan.
#   K B - K a w a s a n - B e r i k a t  
 #   K B - K a w a s a n - B e r i k a t  
 #   K B - K a w a s a n - B e r i k a t  
 #   K B - K a w a s a n - B e r i k a t  
 