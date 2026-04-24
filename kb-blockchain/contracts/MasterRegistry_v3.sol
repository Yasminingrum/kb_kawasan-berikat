// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./KBContract_v3.sol";

// =============================================================
// MasterRegistry_v3.sol -- Registry induk untuk semua KB
// =============================================================
// Perubahan dari v2 --> v3:
//   - Import diupdate ke KBContract_v3
//   - Tidak ada perubahan logika di MasterRegistry sendiri;
//     seluruh perubahan ada di KBContract_v3 (scrap, pemusnahan,
//     kodeBarangInternal, enum jenis dokumen)
//
// Arsitektur: Factory Pattern
//   DJBC deploy MasterRegistry_v3 SATU kali.
//   Setiap KB baru di-deploy otomatis via registerKawasanBerikat().
//   Setiap KB memiliki KBContract_v3 tersendiri yang terisolasi.
//
// Referensi regulasi:
//   Pasal 19 PER-9/BC/2021  -- IT Inventory: realtime, traceable, authorized
//   PMK No. 65/PMK.04/2021  -- Kewajiban pencatatan barang impor/ekspor
// =============================================================

contract MasterRegistry_v3 is Ownable {

    // =========================================================
    // SECTION 1: STRUCT
    // =========================================================

    struct InfoKB {
        string  namaPerusahaan;   // nama PKB/PDKB
        string  nomorIzin;        // nomor SK izin DJBC
        uint256 tanggalIzin;      // timestamp izin diterbitkan
        address alamatKontrak;    // alamat KBContract_v3 yang di-deploy
        bool    terdaftar;        // flag eksistensi
    }

    // =========================================================
    // SECTION 2: STATE VARIABLES
    // =========================================================

    mapping(string => InfoKB) private registriKB;  // idKB --> InfoKB
    string[] private daftarIdKB;                    // array semua idKB
    mapping(address => bool) private pejabatBC;     // whitelist Pejabat BC

    // =========================================================
    // SECTION 3: EVENTS
    // =========================================================

    event KBDidaftarkan(
        string  indexed idKB,
        string  namaPerusahaan,
        address alamatKontrak,
        address adminBC,
        address operator,
        uint256 timestamp
    );

    event PejabatBCDitambahkan(address indexed wallet, uint256 timestamp);
    event PejabatBCDihapus(address indexed wallet, uint256 timestamp);

    // =========================================================
    // SECTION 4: MODIFIERS
    // =========================================================

    modifier onlyBCOfficer() {
        require(
            pejabatBC[msg.sender] || msg.sender == owner(),
            "Akses ditolak: bukan pejabat BC"
        );
        _;
    }

    modifier kbBelumTerdaftar(string memory idKB) {
        require(!registriKB[idKB].terdaftar, "KB dengan ID ini sudah terdaftar");
        _;
    }

    modifier kbSudahTerdaftar(string memory idKB) {
        require(registriKB[idKB].terdaftar, "KB dengan ID ini tidak ditemukan");
        _;
    }

    // =========================================================
    // SECTION 5: CONSTRUCTOR
    // =========================================================

    constructor() Ownable(msg.sender) {}

    // =========================================================
    // SECTION 6: MANAJEMEN PEJABAT BC
    // =========================================================

    /**
     * @notice Tambahkan wallet Pejabat BC ke whitelist
     * @dev Hanya owner (DJBC) yang bisa menambah pejabat BC
     */
    function tambahPejabatBC(address wallet) external onlyOwner {
        require(wallet != address(0), "Alamat tidak valid");
        pejabatBC[wallet] = true;
        emit PejabatBCDitambahkan(wallet, block.timestamp);
    }

    /**
     * @notice Cabut akses Pejabat BC dari whitelist
     */
    function hapusPejabatBC(address wallet) external onlyOwner {
        pejabatBC[wallet] = false;
        emit PejabatBCDihapus(wallet, block.timestamp);
    }

    // =========================================================
    // SECTION 7: REGISTRASI KB (FACTORY PATTERN)
    // =========================================================

    /**
     * @notice Daftarkan KB baru + deploy KBContract_v3 otomatis
     *
     * @param idKB           Kode unik KB, misal "KB-SBY-001"
     * @param namaPerusahaan Nama PKB/PDKB
     * @param nomorIzin      Nomor SK izin DJBC
     * @param tanggalIzin    Timestamp izin diterbitkan (Unix epoch)
     * @param adminBC        Wallet Pejabat BC yang mengawasi KB ini
     * @param operator       Wallet PKB/PDKB (operator KB)
     * @param auditorDJP     Wallet auditor DJP (boleh address(0))
     *
     * @dev Setiap KB mendapat KBContract_v3 tersendiri yang terisolasi.
     *      Registrasi hanya bisa dilakukan oleh Pejabat BC atau owner DJBC.
     */
    function registerKawasanBerikat(
        string memory idKB,
        string memory namaPerusahaan,
        string memory nomorIzin,
        uint256 tanggalIzin,
        address adminBC,
        address operator,
        address auditorDJP
    )
        external
        onlyBCOfficer
        kbBelumTerdaftar(idKB)
    {
        require(adminBC   != address(0), "Alamat Admin BC tidak valid");
        require(operator  != address(0), "Alamat Operator tidak valid");

        // Deploy KBContract_v3 baru untuk KB ini
        KBContract_v3 kontrakBaru = new KBContract_v3(
            owner(),    // DJBC = owner MasterRegistry
            adminBC,
            operator,
            auditorDJP
        );

        registriKB[idKB] = InfoKB({
            namaPerusahaan: namaPerusahaan,
            nomorIzin:      nomorIzin,
            tanggalIzin:    tanggalIzin,
            alamatKontrak:  address(kontrakBaru),
            terdaftar:      true
        });

        daftarIdKB.push(idKB);

        emit KBDidaftarkan(
            idKB,
            namaPerusahaan,
            address(kontrakBaru),
            adminBC,
            operator,
            block.timestamp
        );
    }

    // =========================================================
    // SECTION 8: FUNGSI READ / VIEW
    // =========================================================

    /** @notice Ambil alamat kontrak KBContract_v3 dari suatu KB */
    function getAlamatKontrak(string memory idKB)
        external view kbSudahTerdaftar(idKB) returns (address)
    {
        return registriKB[idKB].alamatKontrak;
    }

    /** @notice Ambil semua info registri KB (nama, nomor izin, tgl, alamat kontrak) */
    function getInfoKB(string memory idKB)
        external view kbSudahTerdaftar(idKB) returns (InfoKB memory)
    {
        return registriKB[idKB];
    }

    /** @notice Ambil daftar semua idKB yang terdaftar */
    function getDaftarSemuaKB() external view returns (string[] memory) {
        return daftarIdKB;
    }

    /** @notice Cek apakah suatu wallet termasuk whitelist Pejabat BC */
    function isPejabatBC(address wallet) external view returns (bool) {
        return pejabatBC[wallet];
    }
}
