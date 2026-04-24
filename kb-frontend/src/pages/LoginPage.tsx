import type { Role } from "../App";

const ROLES = [
  { id: "djbc" as Role, emoji: "🏛", name: "DJBC Pusat", desc: "Contract owner" },
  { id: "pejabat_bc" as Role, emoji: "⚖", name: "Pejabat BC", desc: "Pengawas KB" },
  { id: "operator_kb" as Role, emoji: "🏭", name: "Operator KB", desc: "PKB / PDKB" },
  { id: "djp" as Role, emoji: "📊", name: "DJP", desc: "Read-only" },
];

interface Props {
  onConnect: () => void;
  connecting: boolean;
  error: string;
  account: string | null;
  detecting?: boolean;
}

export default function LoginPage({ onConnect, connecting, error, account, detecting }: Props) {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">KB</div>
          <h1>IT Inventory Kawasan Berikat</h1>
          <p>Direktorat Jenderal Bea dan Cukai · Republik Indonesia</p>
        </div>

        {account && detecting && (
          <div className="wallet-connected">
            <div className="wallet-dot" style={{ background: "#f59e0b" }} />
            <div>
              <div style={{ fontSize: 11, color: "#64748b" }}>Wallet terhubung</div>
              <div className="wallet-addr">
                {account.slice(0, 10)}...{account.slice(-8)}
              </div>
              <div style={{ fontSize: 11, color: "#92400e", marginTop: 2 }}>
                ⏳ Mengidentifikasi role dari blockchain...
              </div>
            </div>
          </div>
        )}

        {account && !detecting && (
          <div className="wallet-connected">
            <div className="wallet-dot" />
            <div>
              <div style={{ fontSize: 11, color: "#64748b" }}>Wallet terhubung</div>
              <div className="wallet-addr">
                {account.slice(0, 10)}...{account.slice(-8)}
              </div>
              <div style={{ fontSize: 11, color: "#dc2626", marginTop: 2 }}>
                Wallet ini tidak terdaftar dalam sistem. Gunakan akun yang terdaftar sebagai operator KB, Pejabat BC, DJBC, atau DJP.
              </div>
            </div>
          </div>
        )}

        {!account && (
          <div style={{
            background: "#f8fafc", border: "0.5px solid #e2e8f0",
            borderRadius: 8, padding: "10px 14px", marginBottom: 16,
            fontSize: 12, color: "#64748b",
          }}>
            Hubungkan wallet MetaMask yang terdaftar dalam sistem untuk masuk
          </div>
        )}

        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>
          Role yang tersedia
        </div>
        <div className="role-select-grid">
          {ROLES.map(r => (
            <div key={r.id} className="role-card">
              <div className="role-emoji">{r.emoji}</div>
              <div className="role-name">{r.name}</div>
              <div className="role-desc">{r.desc}</div>
            </div>
          ))}
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}

        <button
          className="metamask-btn"
          onClick={onConnect}
          disabled={connecting}
        >
          {connecting ? "Menghubungkan..." : "Hubungkan MetaMask"}
        </button>

        <div style={{
          marginTop: 16, padding: "10px 14px",
          background: "#f0f4ff", borderRadius: 6,
          fontSize: 11, color: "#1e3a6e",
        }}>
        </div>
      </div>
    </div>
  );
}