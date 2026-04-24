// ItemPicker.tsx
// =============================================================
// Komponen input barang yang terhubung ke katalog.
//
// Fitur:
//   1. Dropdown pilih dari katalog (semua barang yang sudah terdaftar)
//   2. Bisa juga ketik kode langsung → muncul suggestion (autocomplete)
//   3. Saat kode dipilih/diketik, nama + kodeHS + satuan auto-fill
//   4. Kode yang belum ada di katalog TETAP bisa dipakai
//      (akan di-auto-register saat form utama submit)
//   5. Indikator visual: hijau = ada di katalog, abu = baru
// =============================================================

import { useState, useRef, useEffect } from "react";
import type { KatalogItem } from "../service/katalogService";

// ── Props ────────────────────────────────────────────────────

interface ItemPickerProps {
  /** State saat ini dari form parent */
  value: {
    kodeBarangInternal: string;
    namaBarang: string;
    kodeHS: string;
    satuan: string;
  };
  /** Daftar katalog yang sudah di-load di parent */
  katalog: KatalogItem[];
  /** Callback saat user memilih / mengetik */
  onChange: (val: {
    kodeBarangInternal: string;
    namaBarang: string;
    kodeHS: string;
    satuan: string;
  }) => void;
  /** Apakah field ini required? */
  required?: boolean;
  /** Label untuk kode barang (default: "Kode Barang Internal") */
  labelKode?: string;
  /** Tampilkan field satuan? (default: true) */
  showSatuan?: boolean;
  /** Tampilkan field kodeHS? (default: true) */
  showKodeHS?: boolean;
  /** disabled state */
  disabled?: boolean;
}

// ── Komponen ─────────────────────────────────────────────────

export default function ItemPicker({
  value,
  katalog,
  onChange,
  required = true,
  labelKode = "Kode Barang Internal",
  showSatuan = true,
  showKodeHS = true,
  disabled = false,
}: ItemPickerProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [query, setQuery] = useState(value.kodeBarangInternal);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync query jika value berubah dari luar (mis: reset form)
  useEffect(() => {
    setQuery(value.kodeBarangInternal);
  }, [value.kodeBarangInternal]);

  // Tutup dropdown kalau klik di luar
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter katalog berdasarkan query
  const suggestions = query.trim().length === 0
    ? katalog.slice(0, 10) // tampilkan 10 pertama kalau kosong
    : katalog.filter(item =>
        item.kodeBarangInternal.toLowerCase().includes(query.toLowerCase()) ||
        item.namaBarang.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8);

  const adaDiKatalog = katalog.some(
    k => k.kodeBarangInternal.toLowerCase() === value.kodeBarangInternal.toLowerCase()
  );

  function pilihItem(item: KatalogItem) {
    setQuery(item.kodeBarangInternal);
    onChange({
      kodeBarangInternal: item.kodeBarangInternal,
      namaBarang: item.namaBarang,
      kodeHS: item.kodeHS,
      satuan: item.satuan,
    });
    setShowDropdown(false);
  }

  function handleKodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const kode = e.target.value;
    setQuery(kode);
    // Cek apakah cocok persis dengan katalog
    const match = katalog.find(
      k => k.kodeBarangInternal.toLowerCase() === kode.toLowerCase()
    );
    if (match) {
      onChange({
        kodeBarangInternal: match.kodeBarangInternal,
        namaBarang: match.namaBarang,
        kodeHS: match.kodeHS,
        satuan: match.satuan,
      });
    } else {
      // Belum ada di katalog — update kode saja, nama/HS tetap
      onChange({ ...value, kodeBarangInternal: kode });
    }
    setShowDropdown(true);
  }

  const satunOptions = ["kg", "meter", "liter", "pcs", "unit", "lembar", "roll", "ton", "gram"];

  return (
    <div ref={containerRef}>
      {/* ── Baris 1: Kode barang dengan autocomplete ── */}
      <div className="form-group" style={{ position: "relative", marginBottom: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {labelKode}
          {value.kodeBarangInternal && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 99,
              background: adaDiKatalog ? "#dcfce7" : "#fef9c3",
              color: adaDiKatalog ? "#166534" : "#854d0e",
            }}>
              {adaDiKatalog ? "✓ katalog" : "⚡ baru"}
            </span>
          )}
        </label>

        <div style={{ display: "flex", gap: 6 }}>
          {/* Input kode dengan autocomplete */}
          <div style={{ flex: 1, position: "relative" }}>
            <input
              value={query}
              onChange={handleKodeChange}
              onFocus={() => setShowDropdown(true)}
              placeholder="Ketik kode atau pilih..."
              required={required}
              disabled={disabled}
              style={{ width: "100%" }}
              autoComplete="off"
            />
            {/* Dropdown suggestions */}
            {showDropdown && suggestions.length > 0 && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
                background: "#fff", border: "1px solid #e2e8f0",
                borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                maxHeight: 200, overflowY: "auto",
              }}>
                {query.trim() === "" && (
                  <div style={{
                    padding: "6px 12px", fontSize: 11,
                    color: "#94a3b8", borderBottom: "1px solid #f1f5f9",
                  }}>
                    Katalog barang KB ini
                  </div>
                )}
                {suggestions.map(item => (
                  <div
                    key={item.kodeBarangInternal}
                    onMouseDown={() => pilihItem(item)}
                    style={{
                      padding: "8px 12px", cursor: "pointer", fontSize: 13,
                      borderBottom: "1px solid #f8fafc",
                      display: "flex", flexDirection: "column", gap: 2,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#f0f4ff")}
                    onMouseLeave={e => (e.currentTarget.style.background = "")}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{
                        fontFamily: "monospace", fontWeight: 600, fontSize: 12,
                        color: "#0c2d6b", background: "#eff6ff",
                        padding: "1px 6px", borderRadius: 4,
                      }}>
                        {item.kodeBarangInternal}
                      </span>
                      <span style={{ fontSize: 11, color: "#64748b" }}>
                        {item.satuan}
                      </span>
                    </div>
                    <div style={{ color: "#374151", fontSize: 12 }}>{item.namaBarang}</div>
                    <div style={{ color: "#94a3b8", fontSize: 11 }}>HS: {item.kodeHS}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tombol buka dropdown penuh */}
          <button
            type="button"
            disabled={disabled}
            title="Pilih dari katalog"
            onClick={() => setShowDropdown(v => !v)}
            style={{
              padding: "0 10px", background: "#f0f4ff", border: "1px solid #bfdbfe",
              borderRadius: 6, cursor: "pointer", fontSize: 16, color: "#1e40af",
              flexShrink: 0,
            }}
          >
            ▾
          </button>
        </div>
      </div>

      {/* ── Baris 2: Nama barang ── */}
      <div className="form-group" style={{ marginBottom: 8 }}>
        <label>Nama Barang</label>
        <input
          value={value.namaBarang}
          onChange={e => onChange({ ...value, namaBarang: e.target.value })}
          placeholder="Otomatis dari katalog, atau isi manual"
          required={required}
          disabled={disabled}
          style={{
            background: adaDiKatalog && value.namaBarang ? "#f0fdf4" : undefined,
          }}
        />
      </div>

      {/* ── Baris 3: Kode HS + Satuan (opsional) ── */}
      {(showKodeHS || showSatuan) && (
        <div className="two-col" style={{ marginBottom: 0 }}>
          {showKodeHS && (
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label>Kode HS</label>
              <input
                value={value.kodeHS}
                onChange={e => onChange({ ...value, kodeHS: e.target.value })}
                placeholder="0000.00.00"
                required={required}
                disabled={disabled}
                style={{
                  background: adaDiKatalog && value.kodeHS ? "#f0fdf4" : undefined,
                  fontFamily: "monospace",
                }}
              />
            </div>
          )}
          {showSatuan && (
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label>Satuan</label>
              <select
                value={value.satuan}
                onChange={e => onChange({ ...value, satuan: e.target.value })}
                disabled={disabled}
              >
                {satunOptions.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* ── Info kalau barang baru ── */}
      {value.kodeBarangInternal && !adaDiKatalog && (
        <div style={{
          fontSize: 11, color: "#92400e", background: "#fef9c3",
          border: "1px solid #fde68a", borderRadius: 6,
          padding: "5px 10px", marginBottom: 8,
        }}>
          ⚡ Kode baru — akan otomatis didaftarkan ke katalog saat Anda submit.
        </div>
      )}
    </div>
  );
}
