// useBlockchain.ts — v3
// =============================================================
// React hook yang membungkus semua interaksi blockchain + hybrid.
// Menyediakan fungsi submit yang aman (loading state, error handling)
// ke seluruh komponen frontend.
//
// Perubahan v2 --> v3:
//   1. Import tambah: catatScrap, catatPemusnahan dari hybridService
//   2. Import tambah: DataScrap, DataPemusnahan dari hashService
//   3. BlockchainState interface tambah:
//      - submitScrap: (data: DataScrap) => Promise<HybridResult>
//      - submitPemusnahan: (data: DataPemusnahan) => Promise<HybridResult>
//   4. Implementasi hook tambah:
//      - submitScrap (useCallback)
//      - submitPemusnahan (useCallback)
//   5. Return object tambah kedua fungsi baru
//
// Arsitektur tetap sama:
//   - withLoading: deps KOSONG, referensi stabil → tidak ada render loop
//   - Semua fungsi query panggil service langsung (bukan via state)
//   - useRef untuk setError agar tidak masuk deps array
// =============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { NETWORK_CONFIG } from "../config/contracts";
import { setProvider } from "../service/blockchainService";
import {
  catatBarangMasuk,
  catatBarangKeluar,
  catatScrap,          // v3
  catatPemusnahan,     // v3
  buatWIP,
  catatHasilProduksi,
  validasiBOM,
  catatStockOpname,
  HybridError,
  type HybridResult,
} from "../service/hybridService";
import {
  bcGetDaftarSemuaKB,
  bcGetInfoKB,
  bcGetInfoKontrak,
  bcGetSaldoBarang,
  bcUpdateStatusIzin,
  bcRegisterKawasanBerikat,
  bcValidasiBOM,
  type TxResult,
} from "../service/blockchainService";
import type {
  DataBarangMasuk,
  DataBarangKeluar,
  DataScrap,           // v3
  DataPemusnahan,      // v3
  DataWIP,
  DataHasilProduksi,
  DataBOM,
  DataStockOpname,
} from "../service/hashService";

// =============================================================
// SECTION 1: TIPE
// =============================================================

export interface InfoKB {
  namaPerusahaan: string;
  nomorIzin:      string;
  tanggalIzin:    bigint;
  alamatKontrak:  string;
  terdaftar:      boolean;
}

export interface KontrakInfo {
  djbc:          string;
  adminBC:       string;
  operator:      string;
  izinAktif:     boolean;
  tanggalDeploy: bigint;
}

export interface BlockchainState {
  // Status koneksi
  ready:      boolean;
  networkOk:  boolean;
  error:      string | null;
  isLoading:  boolean;
  lastTx:     HybridResult | null;

  // Fungsi tulis — semua mengembalikan HybridResult
  submitBarangMasuk:   (data: DataBarangMasuk)   => Promise<HybridResult>;
  submitBarangKeluar:  (data: DataBarangKeluar)  => Promise<HybridResult>;
  submitScrap:         (data: DataScrap)          => Promise<HybridResult>; // v3
  submitPemusnahan:    (data: DataPemusnahan)     => Promise<HybridResult>; // v3
  submitWIP:           (data: DataWIP)            => Promise<HybridResult>;
  submitHasilProduksi: (data: DataHasilProduksi) => Promise<HybridResult>;
  submitValidasiBOM:   (data: DataBOM)            => Promise<HybridResult>;
  approveBOMOnChain:   (idKB: string, kodeFormula: string, dataHash: string) => Promise<TxResult>; // approval langsung ke blockchain
  submitStockOpname:   (data: DataStockOpname)    => Promise<HybridResult>;
  submitRegisterKB: (
    idKB: string, namaPerusahaan: string, nomorIzin: string,
    tanggalIzin: number,
    adminBC: string, operator: string, auditorDJP: string
  ) => Promise<HybridResult>;

  // Fungsi read-only
  getDaftarKB:     ()                                      => Promise<string[]>;
  getInfoKB:       (idKB: string)                          => Promise<InfoKB>;
  getInfoKontrak:  (idKB: string)                          => Promise<KontrakInfo>;
  getSaldoBarang:  (idKB: string, kodeBarangHash: string)  => Promise<bigint>;
  updateStatusIzin:(idKB: string, aktif: boolean)          => Promise<HybridResult>;
  getIdKBByWallet: (wallet: string)                        => string | null;
}

// =============================================================
// SECTION 2: HOOK
// =============================================================

export function useBlockchain(
  metamaskProvider: ethers.BrowserProvider | null,
  metamaskSigner:   ethers.JsonRpcSigner | null
): BlockchainState {

  const [ready,     setReady]     = useState(false);
  const [networkOk, setNetworkOk] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastTx,    setLastTx]    = useState<HybridResult | null>(null);

  // Ref untuk setter — tidak masuk deps array → tidak trigger re-render
  const setErrorRef = useRef(setError);
  setErrorRef.current = setError;

  // ── Inisialisasi provider ─────────────────────────────────────

  useEffect(() => {
    if (!metamaskProvider || !metamaskSigner) {
      setReady(false);
      setNetworkOk(false);
      return;
    }

    let cancelled = false;

    async function init() {
      try {
        const network = await metamaskProvider!.getNetwork();
        const chainId = Number(network.chainId);

        if (chainId !== NETWORK_CONFIG.chainId) {
          if (!cancelled) {
            setErrorRef.current(
              `Network salah. Diharapkan chain ID ${NETWORK_CONFIG.chainId} (Hardhat), ` +
              `tapi MetaMask terhubung ke chain ID ${chainId}. Ganti network di MetaMask.`
            );
            setNetworkOk(false);
            setReady(false);
          }
          return;
        }

        setProvider(metamaskProvider!, metamaskSigner!);

        if (!cancelled) {
          setNetworkOk(true);
          setReady(true);
          setErrorRef.current(null);
        }
      } catch {
        if (!cancelled) {
          setErrorRef.current(
            "Gagal terhubung ke blockchain. Pastikan Hardhat node berjalan."
          );
          setReady(false);
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, [metamaskProvider, metamaskSigner]);

  // ── withLoading — deps KOSONG, referensi stabil selamanya ────
  // Kunci untuk mencegah render loop:
  //   withLoading stabil → semua useCallback stabil
  //   → tidak ada cascade setState → tidak ada infinite re-render

  const withLoading = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      setIsLoading(true);
      setErrorRef.current(null);
      try {
        return await fn();
      } catch (e) {
        if (e instanceof HybridError) {
          setErrorRef.current(`[${e.step.toUpperCase()}] ${e.message}`);
        } else if (e instanceof Error) {
          // Coba ekstrak pesan revert dari Solidity
          const revertMsg = e.message.match(/reason="([^"]+)"/)?.[1];
          setErrorRef.current(revertMsg || e.message);
        } else {
          setErrorRef.current("Terjadi kesalahan tidak diketahui");
        }
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [] // intentionally empty: withLoading tidak bergantung pada state apapun
  );

  // ── Fungsi tulis hybrid ───────────────────────────────────────
  // Setiap fungsi: withLoading → hybrid service → setLastTx → return result

  const submitBarangMasuk = useCallback(
    (data: DataBarangMasuk) =>
      withLoading(async () => {
        const result = await catatBarangMasuk(data);
        setLastTx(result);
        return result;
      }),
    [withLoading]
  );

  const submitBarangKeluar = useCallback(
    (data: DataBarangKeluar) =>
      withLoading(async () => {
        const result = await catatBarangKeluar(data);
        setLastTx(result);
        return result;
      }),
    [withLoading]
  );

  // v3: submit scrap (BC 2.5)
  const submitScrap = useCallback(
    (data: DataScrap) =>
      withLoading(async () => {
        const result = await catatScrap(data);
        setLastTx(result);
        return result;
      }),
    [withLoading]
  );

  // v3: submit pemusnahan (Berita Acara)
  const submitPemusnahan = useCallback(
    (data: DataPemusnahan) =>
      withLoading(async () => {
        const result = await catatPemusnahan(data);
        setLastTx(result);
        return result;
      }),
    [withLoading]
  );

  const submitWIP = useCallback(
    (data: DataWIP) =>
      withLoading(async () => {
        const result = await buatWIP(data);
        setLastTx(result);
        return result;
      }),
    [withLoading]
  );

  const submitHasilProduksi = useCallback(
    (data: DataHasilProduksi) =>
      withLoading(async () => {
        const result = await catatHasilProduksi(data);
        setLastTx(result);
        return result;
      }),
    [withLoading]
  );

  const submitValidasiBOM = useCallback(
    (data: DataBOM) =>
      withLoading(async () => {
        const result = await validasiBOM(data);
        setLastTx(result);
        return result;
      }),
    [withLoading]
  );

  // Approval BOM oleh Pejabat BC: langsung ke blockchain, TANPA simpan Firestore baru.
  // Firestore diupdate terpisah via approveBOM() di firestoreService.
  const approveBOMOnChain = useCallback(
    (idKB: string, kodeFormula: string, dataHash: string) =>
      withLoading(async () => {
        return await bcValidasiBOM(idKB, kodeFormula, dataHash);
      }),
    [withLoading]
  );

  const submitStockOpname = useCallback(
    (data: DataStockOpname) =>
      withLoading(async () => {
        const result = await catatStockOpname(data);
        setLastTx(result);
        return result;
      }),
    [withLoading]
  );

  const submitRegisterKB = useCallback(
    (idKB: string, namaPerusahaan: string, nomorIzin: string,
     tanggalIzin: number,
     adminBC: string, operator: string, auditorDJP: string) =>
      withLoading(async () => {
        const txResult = await bcRegisterKawasanBerikat(
          idKB, namaPerusahaan, nomorIzin, tanggalIzin, adminBC, operator, auditorDJP
        );
        const result: HybridResult = {
          firestoreId: "-",
          txHash:      txResult.txHash,
          blockNumber: txResult.blockNumber,
          dataHash:    "-",
        };
        setLastTx(result);
        return result;
      }),
    [withLoading]
  );

  // ── Fungsi read-only ─────────────────────────────────────────
  // Panggil service langsung — tidak ada state di deps → stabil

  const getDaftarKB = useCallback(
    () => withLoading(() => bcGetDaftarSemuaKB()),
    [withLoading]
  );

  const getInfoKB = useCallback(
    (idKB: string) => withLoading(() => bcGetInfoKB(idKB)),
    [withLoading]
  );

  const getInfoKontrak = useCallback(
    (idKB: string) => withLoading(() => bcGetInfoKontrak(idKB)),
    [withLoading]
  );

  const getSaldoBarang = useCallback(
    (idKB: string, kodeBarangHash: string) =>
      withLoading(() => bcGetSaldoBarang(idKB, kodeBarangHash)),
    [withLoading]
  );

  const updateStatusIzin = useCallback(
    (idKB: string, aktif: boolean) =>
      withLoading(async () => {
        const txResult = await bcUpdateStatusIzin(idKB, aktif);
        const result: HybridResult = {
          firestoreId:  "-",
          txHash:       txResult.txHash,
          blockNumber:  txResult.blockNumber,
          dataHash:     "-",
        };
        setLastTx(result);
        return result;
      }),
    [withLoading]
  );

  // getIdKBByWallet: tidak lagi dipakai sejak deteksi role dinamis di App.tsx
  const getIdKBByWallet = useCallback(
    (_wallet: string) => null,
    []
  );

  // =============================================================
  // RETURN
  // =============================================================

  return {
    ready,
    networkOk,
    error,
    isLoading,
    lastTx,
    submitBarangMasuk,
    submitBarangKeluar,
    submitScrap,          // v3
    submitPemusnahan,     // v3
    submitWIP,
    submitHasilProduksi,
    submitValidasiBOM,
    approveBOMOnChain,
    submitStockOpname,
    submitRegisterKB,
    getDaftarKB,
    getInfoKB,
    getInfoKontrak,
    getSaldoBarang,
    updateStatusIzin,
    getIdKBByWallet,
  };
}
