import type { Role } from "../App";

const ROLE_LABELS: Record<Role, string> = {
  djbc: "DJBC Pusat",
  pejabat_bc: "Pejabat Bea Cukai",
  operator_kb: "Operator KB",
  djp: "DJP",
};

export default function Navbar({
  role, account, onLogout,
}: {
  role: Role; account: string; onLogout: () => void;
}) {
  const short = account
    ? `${account.slice(0, 6)}...${account.slice(-4)}`
    : "";
  const initials = role === "djbc" ? "DJ"
    : role === "pejabat_bc" ? "BC"
    : role === "operator_kb" ? "OP" : "DP";

  return (
    <nav className="navbar">
      <div className="navbar-logo">KB</div>
      <div className="navbar-title">
        Sistem IT Inventory Kawasan Berikat
      </div>
      <span className="navbar-badge">{ROLE_LABELS[role]}</span>
      <div className="navbar-user">
        <div className="navbar-avatar">{initials}</div>
        <span className="navbar-addr">{short}</span>
      </div>
      <button className="navbar-logout" onClick={onLogout}>Keluar</button>
    </nav>
  );
}
