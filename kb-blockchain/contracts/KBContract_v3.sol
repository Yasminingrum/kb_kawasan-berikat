// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// =============================================================
// KBContract_v3.sol -- Arsitektur Hybrid (Hash-Only)
// =============================================================
// Perubahan dari v2 --> v3:
//   1. Tambah pencatatan SCRAP (BC 2.5):
//      - hashScrap mapping, event ScrapDikeluarkan, fungsi catatScrap()
//      - Scrap mengurangi saldo bahan baku (keluar dari KB ke kawasan pabean)
//   2. Tambah pencatatan PEMUSNAHAN (Berita Acara):
//      - hashPemusnahan mapping, event BarangDimusnahkan, fungsi catatPemusnahan()
//      - Hanya AdminBC yang berwenang (ada unsur pengawasan pejabat)
//      - Pemusnahan mengurangi saldo bahan baku
//   3. Identifikasi barang diperkuat:
//      - kodeBarangHash sekarang = keccak256(kodeBarangInternal)
//        bukan lagi keccak256(kodeHS + namaBarang)
//      - Memungkinkan pembedaan barang dengan HS code sama tapi
//        berbeda spesifikasi (mis: cat merah vs cat biru)
//   4. Enum JenisDokumenMasuk & JenisDokumenKeluar ditambahkan
//      agar event mencatat jenis dokumen (PIB/TLDDP untuk masuk,
//      PEB/BC25/LOKAL untuk keluar)
//
// Referensi regulasi:
//   Pasal 19 PER-9/BC/2021  -- IT Inventory: realtime, traceable, authorized
//   Pasal 57 PER-9/BC/2021  -- Pembekuan izin oleh Pejabat BC
//   PMK No. 65/PMK.04/2021  -- Kewajiban pencatatan barang impor/ekspor
//   PER-07/BC/2021           -- Tata cara pengeluaran barang KB (BC 2.5 & pemusnahan)
// =============================================================

contract KBContract_v3 {

    // =========================================================
    // SECTION 1: ENUM
    // =========================================================

    // Jenis dokumen untuk barang yang MASUK ke KB
    enum JenisDokumenMasuk {
        PIB,    // Pemberitahuan Impor Barang -- barang impor langsung
        TLDDP   // barang dari dalam negeri (Tempat Lain Dalam Daerah Pabean)
    }

    // Jenis dokumen untuk barang yang KELUAR dari KB
    enum JenisDokumenKeluar {
        PEB,    // Pemberitahuan Ekspor Barang -- ekspor ke luar negeri
        BC25,   // Dokumen BC 2.5 -- pengeluaran scrap ke kawasan pabean lokal
        LOKAL   // pengeluaran lokal lain (mis: ke KITE, ke KB lain)
    }

    // =========================================================
    // SECTION 2: STATE VARIABLES
    // =========================================================

    address public djbc;        // DJBC Pusat (owner MasterRegistry)
    address public adminBC;     // Pejabat BC yang mengawasi KB ini
    address public operator;    // PKB/PDKB -- operator KB
    address public auditorDJP;  // DJP -- read-only auditor

    bool    public izinAktif;       // Status izin KB (Pasal 57 PER-9/BC/2021)
    uint256 public tanggalDeploy;   // Timestamp deploy kontrak ini

    // ── Saldo Numerik ─────────────────────────────────────────
    // Disimpan on-chain karena saldo adalah data operasional inti
    // Key: keccak256(kodeBarangInternal) -- unik per item perusahaan
    mapping(bytes32 => uint256) public saldoBarang;     // bahan baku
    mapping(bytes32 => uint256) public saldoProdukJadi; // produk jadi setelah produksi

    // ── Hash Registry ─────────────────────────────────────────
    // Data lengkap disimpan di Firestore; hanya hash yang on-chain
    mapping(bytes32 => bytes32) public hashBarangMasuk;   // idDokumen --> hash
    mapping(bytes32 => bytes32) public hashBarangKeluar;  // idDokumen --> hash
    mapping(bytes32 => bytes32) public hashScrap;         // idDokumenBC25 --> hash [NEWv3]
    mapping(bytes32 => bytes32) public hashPemusnahan;    // idBeritaAcara --> hash  [NEWv3]
    mapping(bytes32 => bytes32) public hashWIP;           // idBatch --> hash
    mapping(bytes32 => bytes32) public hashHasilProduksi; // idBatch --> hash
    mapping(bytes32 => bytes32) public hashStockOpname;   // idOpname --> hash
    mapping(bytes32 => bytes32) public hashBOM;           // kodeFormula --> hash

    // ── Nonce anti-replay ─────────────────────────────────────
    mapping(bytes32 => bool) private _usedHashes;

    // =========================================================
    // SECTION 3: EVENTS
    // =========================================================
    // Events = audit trail on-chain permanen, dapat dimonitor DJBC
    // sesuai Pasal 19(d) PER-9/BC/2021

    // Barang masuk (impor via PIB atau dari TLDDP)
    event BarangMasukDicatat(
        bytes32 indexed idDokumen,          // keccak256(idKB + nomorPIB/TLDDP)
        bytes32 indexed kodeBarang,         // keccak256(kodeBarangInternal)
        JenisDokumenMasuk jenisDokumen,     // PIB atau TLDDP
        uint256 jumlah,
        bytes32 dataHash,                   // hash dokumen lengkap di Firestore
        uint256 timestamp
    );

    // Barang keluar ekspor atau lokal (via PEB atau dokumen lokal)
    event BarangKeluarDicatat(
        bytes32 indexed idDokumen,          // keccak256(idKB + nomorPEB/LOKAL)
        bytes32 indexed kodeBarang,         // keccak256(kodeBarangInternal)
        JenisDokumenKeluar jenisDokumen,    // PEB atau LOKAL
        uint256 jumlah,
        bytes32 dataHash,
        uint256 timestamp
    );

    // Scrap keluar via dokumen BC 2.5 [NEWv3]
    event ScrapDikeluarkan(
        bytes32 indexed idDokumenBC25,      // keccak256(idKB + nomorBC25)
        bytes32 indexed kodeBarang,         // keccak256(kodeBarangInternal scrap)
        uint256 jumlah,
        bytes32 dataHash,                   // hash data BC 2.5 di Firestore
        uint256 timestamp
    );

    // Barang wasted dimusnahkan, dilampiri Berita Acara [NEWv3]
    event BarangDimusnahkan(
        bytes32 indexed idBeritaAcara,      // keccak256(idKB + nomorBA)
        bytes32 indexed kodeBarang,         // keccak256(kodeBarangInternal wasted)
        uint256 jumlah,
        bytes32 dataHash,                   // hash Berita Acara di Firestore
        uint256 timestamp
    );

    // Batch WIP dimulai
    event WIPDibuat(
        bytes32 indexed idBatch,
        bytes32 dataHash,
        uint256 timestamp
    );

    // Hasil produksi selesai dicatat
    event HasilProduksiDicatat(
        bytes32 indexed idBatch,
        bytes32 indexed kodeProduk,
        uint256 jumlahOutput,
        bytes32 dataHash,
        uint256 timestamp
    );

    // Stock opname direkonsiliasi
    event StockOpnameDicatat(
        bytes32 indexed idOpname,
        bytes32 dataHash,
        uint256 timestamp
    );

    // BOM divalidasi Pejabat BC
    event BOMDivalidasi(
        bytes32 indexed kodeFormula,
        bytes32 dataHash,
        uint256 timestamp
    );

    // Status izin KB berubah
    event IzinKBDiperbarui(
        bool statusBaru,    // true = aktif, false = dibekukan
        address oleh,
        uint256 timestamp
    );

    // Saldo disesuaikan manual (hasil rekonsiliasi stock opname)
    event SaldoAdjusted(
        bytes32 indexed kodeBarang,
        uint256 saldoLama,
        uint256 saldoBaru,
        bytes32 alasanHash, // hash dokumen alasan penyesuaian
        uint256 timestamp
    );

    // =========================================================
    // SECTION 4: MODIFIERS
    // =========================================================

    modifier onlyDJBC() {
        require(msg.sender == djbc, "Akses ditolak: bukan DJBC");
        _;
    }

    modifier onlyAdminBC() {
        require(
            msg.sender == adminBC || msg.sender == djbc,
            "Akses ditolak: bukan Admin BC atau DJBC"
        );
        _;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "Akses ditolak: bukan operator KB");
        _;
    }

    modifier onlyAuditor() {
        require(
            msg.sender == auditorDJP ||
            msg.sender == djbc       ||
            msg.sender == adminBC,
            "Akses ditolak: bukan auditor yang berwenang"
        );
        _;
    }

    modifier onlyActiveKB() {
        require(izinAktif, "Operasi ditolak: izin KB sedang dibekukan");
        _;
    }

    // Anti-replay: hash yang sama tidak boleh disubmit dua kali
    modifier noReplayHash(bytes32 h) {
        require(!_usedHashes[h], "Hash sudah pernah digunakan (anti-replay)");
        _;
        _usedHashes[h] = true;
    }

    // =========================================================
    // SECTION 5: CONSTRUCTOR
    // =========================================================

    constructor(
        address _djbc,
        address _adminBC,
        address _operator,
        address _auditorDJP
    ) {
        require(_djbc    != address(0), "Alamat DJBC tidak valid");
        require(_adminBC != address(0), "Alamat Admin BC tidak valid");
        require(_operator != address(0), "Alamat Operator tidak valid");

        djbc        = _djbc;
        adminBC     = _adminBC;
        operator    = _operator;
        auditorDJP  = _auditorDJP; // boleh address(0) jika belum ditentukan
        izinAktif   = true;
        tanggalDeploy = block.timestamp;
    }

    // =========================================================
    // SECTION 6: FUNGSI OPERASIONAL -- BARANG MASUK
    // =========================================================

    /**
     * @notice Catat barang masuk impor (PIB) atau dari TLDDP
     *
     * @param idDokumen     keccak256(idKB + nomorPIB/nomorTLDDP)
     * @param kodeBarang    keccak256(kodeBarangInternal) -- unik per item perusahaan
     * @param jenisDok      0 = PIB, 1 = TLDDP
     * @param jumlah        Kuantitas dalam satuan terkecil (gram/mL/unit)
     * @param dataHash      keccak256(seluruh data dokumen di Firestore)
     *
     * @dev kodeBarangInternal disimpan lengkap di Firestore (mis: "CAT-MERAH-001")
     *      on-chain hanya menyimpan hash-nya untuk efisiensi gas
     */
    function catatBarangMasuk(
        bytes32 idDokumen,
        bytes32 kodeBarang,
        JenisDokumenMasuk jenisDok,
        uint256 jumlah,
        bytes32 dataHash
    ) external onlyOperator onlyActiveKB noReplayHash(dataHash) {
        require(jumlah > 0,              "Jumlah harus lebih dari 0");
        require(idDokumen != bytes32(0), "ID dokumen tidak valid");
        require(kodeBarang != bytes32(0),"Kode barang tidak valid");

        hashBarangMasuk[idDokumen] = dataHash;
        saldoBarang[kodeBarang] += jumlah;

        emit BarangMasukDicatat(
            idDokumen, kodeBarang, jenisDok, jumlah, dataHash, block.timestamp
        );
    }

    // =========================================================
    // SECTION 7: FUNGSI OPERASIONAL -- BARANG KELUAR (EKSPOR/LOKAL)
    // =========================================================

    /**
     * @notice Catat pengeluaran ekspor (PEB) atau pengeluaran lokal
     *
     * @param idDokumen     keccak256(idKB + nomorPEB / nomor dokumen lokal)
     * @param kodeBarang    keccak256(kodeBarangInternal produk jadi)
     * @param jenisDok      0 = PEB, 2 = LOKAL
     * @param jumlah        Kuantitas yang dikeluarkan
     * @param dataHash      Hash data dokumen PEB di Firestore
     *
     * @dev Pengeluaran scrap (BC 2.5) TIDAK melalui fungsi ini,
     *      melainkan melalui catatScrap() yang terpisah
     */
    function catatBarangKeluar(
        bytes32 idDokumen,
        bytes32 kodeBarang,
        JenisDokumenKeluar jenisDok,
        uint256 jumlah,
        bytes32 dataHash
    ) external onlyOperator onlyActiveKB noReplayHash(dataHash) {
        require(jumlah > 0, "Jumlah harus lebih dari 0");
        require(
            saldoProdukJadi[kodeBarang] >= jumlah,
            "Saldo produk jadi tidak cukup untuk pengeluaran ini"
        );
        // Pastikan tidak disalahgunakan untuk output scrap via fungsi ini
        require(
            jenisDok != JenisDokumenKeluar.BC25,
            "Scrap harus dicatat via catatScrap(), bukan catatBarangKeluar()"
        );

        hashBarangKeluar[idDokumen] = dataHash;
        saldoProdukJadi[kodeBarang] -= jumlah;

        emit BarangKeluarDicatat(
            idDokumen, kodeBarang, jenisDok, jumlah, dataHash, block.timestamp
        );
    }

    // =========================================================
    // SECTION 8: FUNGSI OPERASIONAL -- SCRAP (BC 2.5) [NEWv3]
    // =========================================================

    /**
     * @notice Catat pengeluaran scrap melalui dokumen BC 2.5
     *
     * @param idDokumenBC25 keccak256(idKB + nomorBC25)
     * @param kodeBarang    keccak256(kodeBarangInternal scrap)
     * @param jumlah        Kuantitas scrap yang dikeluarkan
     * @param dataHash      Hash data BC 2.5 lengkap di Firestore
     *                      (termasuk: nomorBC25, tanggalBC25, tujuanPengeluaran,
     *                       nilaiJual, namaBarang, kodeHS, kodeBarangInternal)
     *
     * @dev Scrap mengurangi saldo bahan baku (bukan produk jadi),
     *      karena scrap umumnya adalah sisa bahan baku / bahan gagal produksi.
     *      Jika scrap berasal dari produk jadi, ganti saldoBarang[kodeBarang]
     *      menjadi saldoProdukJadi[kodeBarang].
     */
    function catatScrap(
        bytes32 idDokumenBC25,
        bytes32 kodeBarang,
        uint256 jumlah,
        bytes32 dataHash
    ) external onlyOperator onlyActiveKB noReplayHash(dataHash) {
        require(jumlah > 0,                   "Jumlah scrap harus lebih dari 0");
        require(idDokumenBC25 != bytes32(0),   "ID dokumen BC 2.5 tidak valid");
        require(kodeBarang != bytes32(0),      "Kode barang tidak valid");
        require(
            saldoBarang[kodeBarang] >= jumlah,
            "Saldo bahan baku tidak cukup untuk scrap ini"
        );

        hashScrap[idDokumenBC25] = dataHash;
        saldoBarang[kodeBarang] -= jumlah;

        emit ScrapDikeluarkan(
            idDokumenBC25, kodeBarang, jumlah, dataHash, block.timestamp
        );
    }

    // =========================================================
    // SECTION 9: FUNGSI OPERASIONAL -- PEMUSNAHAN (BA) [NEWv3]
    // =========================================================

    /**
     * @notice Catat pemusnahan barang wasted berdasarkan Berita Acara (BA)
     *
     * @param idBeritaAcara keccak256(idKB + nomorBA)
     * @param kodeBarang    keccak256(kodeBarangInternal barang yang dimusnahkan)
     * @param jumlah        Kuantitas yang dimusnahkan
     * @param dataHash      Hash Berita Acara lengkap di Firestore
     *                      (termasuk: nomorBA, tanggalBA, metodePemusnahan,
     *                       saksiPejabatBC, namaBarang, kodeHS, kodeBarangInternal)
     *
     * @dev Hanya AdminBC yang berwenang mencatat pemusnahan --
     *      ada unsur pengawasan pejabat (bukan operator sendiri).
     *      Pemusnahan mengurangi saldo bahan baku secara permanen.
     */
    function catatPemusnahan(
        bytes32 idBeritaAcara,
        bytes32 kodeBarang,
        uint256 jumlah,
        bytes32 dataHash
    ) external onlyAdminBC onlyActiveKB noReplayHash(dataHash) {
        require(jumlah > 0,                 "Jumlah pemusnahan harus lebih dari 0");
        require(idBeritaAcara != bytes32(0),"ID Berita Acara tidak valid");
        require(kodeBarang != bytes32(0),   "Kode barang tidak valid");
        require(
            saldoBarang[kodeBarang] >= jumlah,
            "Saldo bahan baku tidak cukup untuk pemusnahan ini"
        );

        hashPemusnahan[idBeritaAcara] = dataHash;
        saldoBarang[kodeBarang] -= jumlah;

        emit BarangDimusnahkan(
            idBeritaAcara, kodeBarang, jumlah, dataHash, block.timestamp
        );
    }

    // =========================================================
    // SECTION 10: FUNGSI OPERASIONAL -- PRODUKSI (WIP)
    // =========================================================

    /**
     * @notice Buat batch Work In Process (WIP) -- mulai siklus produksi
     *
     * @param idBatch   keccak256(idKB + ID batch internal)
     * @param dataHash  Hash data batch (input bahan baku, formula BOM, output expected)
     */
    function buatWIP(
        bytes32 idBatch,
        bytes32 dataHash
    ) external onlyOperator onlyActiveKB noReplayHash(dataHash) {
        require(idBatch != bytes32(0),         "ID batch tidak valid");
        require(hashWIP[idBatch] == bytes32(0),"Batch ID sudah ada");

        hashWIP[idBatch] = dataHash;

        emit WIPDibuat(idBatch, dataHash, block.timestamp);
    }

    /**
     * @notice Catat hasil produksi selesai -- kurangi bahan baku, tambah produk jadi
     *
     * @param idBatch         keccak256(ID batch WIP)
     * @param kodeProduk      keccak256(kodeBarangInternal produk jadi)
     * @param jumlahOutput    Kuantitas produk jadi yang dihasilkan
     * @param kodeBahanBaku   Array keccak256(kodeBarangInternal) bahan baku dikonsumsi
     * @param jumlahBahan     Array jumlah bahan baku yang dikonsumsi (harus sesuai BOM)
     * @param dataHash        Hash data hasil produksi di Firestore
     *
     * @dev Auditor dapat cross-check jumlahBahan vs rasio BOM yang tersimpan di Firestore
     *      dengan menggunakan hashBOM[kodeFormula] untuk verifikasi integritas formula
     */
    function catatHasilProduksi(
        bytes32 idBatch,
        bytes32 kodeProduk,
        uint256 jumlahOutput,
        bytes32[] calldata kodeBahanBaku,
        uint256[] calldata jumlahBahan,
        bytes32 dataHash
    ) external onlyOperator onlyActiveKB noReplayHash(dataHash) {
        require(jumlahOutput > 0,               "Jumlah output harus lebih dari 0");
        require(hashWIP[idBatch] != bytes32(0), "Batch WIP tidak ditemukan");
        require(
            kodeBahanBaku.length == jumlahBahan.length,
            "Panjang array bahan baku tidak sesuai"
        );
        require(kodeBahanBaku.length > 0, "Harus ada minimal satu bahan baku");

        // Validasi saldo dan kurangi bahan baku sesuai konsumsi aktual
        for (uint256 i = 0; i < kodeBahanBaku.length; i++) {
            require(
                saldoBarang[kodeBahanBaku[i]] >= jumlahBahan[i],
                "Saldo bahan baku tidak mencukupi"
            );
            saldoBarang[kodeBahanBaku[i]] -= jumlahBahan[i];
        }

        // Tambah saldo produk jadi
        saldoProdukJadi[kodeProduk] += jumlahOutput;
        hashHasilProduksi[idBatch]   = dataHash;

        emit HasilProduksiDicatat(
            idBatch, kodeProduk, jumlahOutput, dataHash, block.timestamp
        );
    }

    // =========================================================
    // SECTION 11: FUNGSI OPERASIONAL -- BOM & STOCK OPNAME
    // =========================================================

    /**
     * @notice Validasi dan simpan hash BOM (Bill of Materials / konversi)
     *
     * @dev Hanya Pejabat BC yang berwenang memvalidasi formula konversi.
     *      Data lengkap BOM (namaBarang, kodeHS, kodeBarangInternal, rasio
     *      per komponen) disimpan di Firestore; hash-nya on-chain.
     *
     * @param kodeFormula keccak256(idKB + kodeFormula + versi)
     * @param dataHash    Hash formula BOM lengkap di Firestore
     */
    function validasiBOM(
        bytes32 kodeFormula,
        bytes32 dataHash
    ) external onlyAdminBC noReplayHash(dataHash) {
        require(kodeFormula != bytes32(0), "Kode formula tidak valid");

        hashBOM[kodeFormula] = dataHash;

        emit BOMDivalidasi(kodeFormula, dataHash, block.timestamp);
    }

    /**
     * @notice Catat stock opname (rekonsiliasi fisik vs sistem)
     *
     * @param idOpname  keccak256(idKB + ID opname + tanggal)
     * @param dataHash  Hash laporan rekonsiliasi lengkap di Firestore
     *                  (termasuk saldo sistem, saldo fisik, selisih per item)
     */
    function catatStockOpname(
        bytes32 idOpname,
        bytes32 dataHash
    ) external onlyAdminBC noReplayHash(dataHash) {
        require(idOpname != bytes32(0), "ID opname tidak valid");

        hashStockOpname[idOpname] = dataHash;

        emit StockOpnameDicatat(idOpname, dataHash, block.timestamp);
    }

    /**
     * @notice Penyesuaian saldo manual jika ada selisih dari stock opname
     *
     * @dev Hanya Admin BC yang berwenang. Setiap adjustment menghasilkan
     *      event permanen di blockchain -- tidak bisa disembunyikan.
     *
     * @param kodeBarang  keccak256(kodeBarangInternal)
     * @param saldoBaru   Saldo hasil koreksi
     * @param alasanHash  Hash dokumen alasan penyesuaian di Firestore
     */
    function adjustSaldo(
        bytes32 kodeBarang,
        uint256 saldoBaru,
        bytes32 alasanHash
    ) external onlyAdminBC {
        uint256 saldoLama = saldoBarang[kodeBarang];
        saldoBarang[kodeBarang] = saldoBaru;

        emit SaldoAdjusted(
            kodeBarang, saldoLama, saldoBaru, alasanHash, block.timestamp
        );
    }

    // =========================================================
    // SECTION 12: FUNGSI ADMINISTRATIF
    // =========================================================

    /**
     * @notice Bekukan atau aktifkan kembali izin KB (Pasal 57 PER-9/BC/2021)
     * @param statusAktif true = aktifkan, false = bekukan
     */
    function updateStatusIzin(bool statusAktif) external onlyAdminBC {
        izinAktif = statusAktif;
        emit IzinKBDiperbarui(statusAktif, msg.sender, block.timestamp);
    }

    /** @notice Ganti operator KB (jika ada pergantian personel PDKB) */
    function updateOperator(address operatorBaru) external onlyDJBC {
        require(operatorBaru != address(0), "Alamat operator tidak valid");
        operator = operatorBaru;
    }

    /** @notice Ganti Admin BC yang mengawasi KB ini */
    function updateAdminBC(address adminBCBaru) external onlyDJBC {
        require(adminBCBaru != address(0), "Alamat Admin BC tidak valid");
        adminBC = adminBCBaru;
    }

    /** @notice Set atau update alamat auditor DJP */
    function updateAuditorDJP(address auditorBaru) external onlyDJBC {
        auditorDJP = auditorBaru;
    }

    // =========================================================
    // SECTION 13: FUNGSI QUERY / VIEW
    // =========================================================

    /** @notice Ambil saldo bahan baku (kodeBarang = keccak256(kodeBarangInternal)) */
    function getSaldoBarang(bytes32 kodeBarang) external view returns (uint256) {
        return saldoBarang[kodeBarang];
    }

    /** @notice Ambil saldo produk jadi */
    function getSaldoProdukJadi(bytes32 kodeProduk) external view returns (uint256) {
        return saldoProdukJadi[kodeProduk];
    }

    /**
     * @notice Verifikasi integritas barang masuk:
     *         cocokkan hash on-chain dengan data Firestore
     * @return true jika hash cocok (data tidak dimanipulasi)
     */
    function verifikasiHashBarangMasuk(
        bytes32 idDokumen,
        bytes32 hashYangDiklaim
    ) external view returns (bool) {
        return hashBarangMasuk[idDokumen] == hashYangDiklaim;
    }

    /** @notice Verifikasi integritas barang keluar */
    function verifikasiHashBarangKeluar(
        bytes32 idDokumen,
        bytes32 hashYangDiklaim
    ) external view returns (bool) {
        return hashBarangKeluar[idDokumen] == hashYangDiklaim;
    }

    /** @notice Verifikasi integritas dokumen scrap BC 2.5 [NEWv3] */
    function verifikasiHashScrap(
        bytes32 idDokumenBC25,
        bytes32 hashYangDiklaim
    ) external view returns (bool) {
        return hashScrap[idDokumenBC25] == hashYangDiklaim;
    }

    /** @notice Verifikasi integritas Berita Acara pemusnahan [NEWv3] */
    function verifikasiHashPemusnahan(
        bytes32 idBeritaAcara,
        bytes32 hashYangDiklaim
    ) external view returns (bool) {
        return hashPemusnahan[idBeritaAcara] == hashYangDiklaim;
    }

    /** @notice Cek apakah hash pernah digunakan (anti-replay) */
    function isHashUsed(bytes32 h) external view returns (bool) {
        return _usedHashes[h];
    }

    /** @notice Info dasar kontrak untuk dashboard monitoring */
    function getInfoKontrak() external view returns (
        address _djbc,
        address _adminBC,
        address _operator,
        bool    _izinAktif,
        uint256 _tanggalDeploy
    ) {
        return (djbc, adminBC, operator, izinAktif, tanggalDeploy);
    }
}
