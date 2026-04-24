import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";

export interface MetaMaskState {
  account: string | null;
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
  connected: boolean;
  connecting: boolean;
  error: string;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export function useMetaMask(): MetaMaskState {
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError("MetaMask tidak ditemukan. Silakan install MetaMask terlebih dahulu.");
      return;
    }
    setConnecting(true);
    setError("");
    try {
      const prov = new ethers.BrowserProvider(window.ethereum);
      await prov.send("eth_requestAccounts", []);
      const sign = await prov.getSigner();
      const addr = await sign.getAddress();
      setProvider(prov);
      setSigner(sign);
      setAccount(addr.toLowerCase());
    } catch (err: any) {
      setError(err?.message || "Koneksi dibatalkan");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAccount(null);
    setProvider(null);
    setSigner(null);
  }, []);

  // Deteksi perubahan akun dari MetaMask
  useEffect(() => {
    if (!window.ethereum) return;
    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
      } else {
        setAccount(accounts[0].toLowerCase());
      }
    };
    window.ethereum.on("accountsChanged", handleAccountsChanged);
    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
    };
  }, [disconnect]);

  return {
    account,
    provider,
    signer,
    connected: !!account,
    connecting,
    error,
    connect,
    disconnect,
  };
}