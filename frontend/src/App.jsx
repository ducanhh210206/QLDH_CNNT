import { useEffect, useState } from "react";
import {
  Boxes,
  LayoutDashboard,
  ShoppingBag,
  Plus,
  Activity,
  TriangleAlert,
  Database,
  Settings,
  Search,
  Bell,
  Sun,
  Moon,
  LogOut,
  ChevronDown,
  Menu,
  X,
  ArrowUpRight,
  ShieldCheck,
  Users,
  PackagePlus,
  History,
} from "lucide-react";
import { api } from "./services/api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import OrderList from "./pages/OrderList";
import CreateOrder from "./pages/CreateOrder";
import SystemMonitoring from "./pages/SystemMonitoring";
import IncidentManagement from "./pages/IncidentManagement";
import BackupRestore from "./pages/BackupRestore";
import SettingsPage from "./pages/Settings";
import Products from "./pages/Products";
import TransactionHistory from "./pages/TransactionHistory";
import UserManagement from "./pages/UserManagement";
import { can, roleLabel } from "./utils/permissions";
const nav = [
  ["dashboard", "Thống kê", LayoutDashboard, "statistics.read"],
  ["products", "Sản phẩm", PackagePlus, "products.read"],
  ["orders", "Quản lý đơn hàng", ShoppingBag, "orders.read"],
  ["create", "Tạo đơn hàng", Plus, "orders.create"],
  ["transactions", "Lịch sử giao dịch", History, "transactions.read"],
  ["users", "Nhân viên & phê duyệt", Users, "users.manage"],
  ["backups", "Sao lưu & phục hồi", Database, "backups.manage"],
  ["monitoring", "Giám sát hệ thống", Activity, "system.manage"],
  ["incidents", "Quản lý sự cố", TriangleAlert, "system.manage"],
  ["settings", "Tài khoản", Settings, null],
];
export default function App() {
  const [user, setUser] = useState(null),
    [checking, setChecking] = useState(true),
    [page, setPage] = useState("dashboard"),
    [theme, setTheme] = useState(
      localStorage.getItem("omdrs-theme") || "light",
    ),
    [toast, setToast] = useState(""),
    [mobile, setMobile] = useState(false),
    [online, setOnline] = useState(null),
    [search, setSearch] = useState(""),
    [orderSearch, setOrderSearch] = useState(""),
    [notices, setNotices] = useState(false);
  useEffect(() => {
    api("/api/auth/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const refresh = async () => {
      try {
        const latest = await api("/api/auth/me");
        if (active) setUser(latest);
      } catch (e) {
        if (active && [401, 403].includes(e.status)) {
          setUser(null);
          setPage("dashboard");
          setToast(
            "Phiên hoặc quyền truy cập đã thay đổi. Vui lòng đăng nhập lại.",
          );
        }
      }
    };
    const timer = setInterval(refresh, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [user?.id]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("omdrs-theme", theme);
  }, [theme]);
  useEffect(() => {
    let active = true;
    const check = () =>
      api("/health/ready", { signal: AbortSignal.timeout(6000) })
        .then(() => active && setOnline(true))
        .catch(() => active && setOnline(false));
    check();
    const t = setInterval(check, 15000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  function navigate(p) {
    setPage(p);
    setMobile(false);
  }
  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST", body: "{}" });
      setUser(null);
      setPage("dashboard");
    } catch (e) {
      setToast(e.message);
    }
  }
  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  if (checking)
    return (
      <div className="boot">
        <Boxes size={30} />
        <p>Đang tải workspace…</p>
      </div>
    );
  if (!user) return <Login onLogin={setUser} />;
  const allowedNav = nav.filter((n) => !n[3] || can(user, n[3]));
  const currentPage = allowedNav.some((n) => n[0] === page)
    ? page
    : allowedNav[0][0];
  const props = { navigate, notify: setToast, user, theme, toggleTheme };
  return (
    <div className="app-shell">
      {mobile && (
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <div className="brand">
          <span className="brand-mark">
            <Boxes size={24} />
          </span>
          <span>
            omdrs<span className="brand-dot">.</span>
          </span>
          <span className="brand-version">
            {user.role === "Admin" ? "QUẢN LÝ" : "NHÂN VIÊN"}
          </span>
        </div>
        <div className="workspace-switch">
          <span className="workspace-icon">O</span>
          <div>
            <strong>Order Workspace</strong>
            <small>Local environment</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-label">KHÔNG GIAN LÀM VIỆC</div>
        <nav>
          {allowedNav.map(([key, label, Icon], i) => (
            <button
              key={key}
              onClick={() => navigate(key)}
              className={
                (currentPage === key ? "active " : "") +
                (key === "monitoring" ? "nav-separated" : "")
              }
            >
              <Icon size={18} />
              <span>{label}</span>
              {currentPage === key && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {user.role === "Admin" && (
            <div className="trust-card">
              <ShieldCheck size={20} />
              <strong>Sẵn sàng phục hồi</strong>
              <p>Kiểm chứng bản sao lưu trước khi đưa dữ liệu vào vận hành.</p>
              <button
                onClick={() =>
                  navigate(user.role === "Admin" ? "backups" : "dashboard")
                }
              >
                Khám phá workspace <ArrowUpRight size={14} />
              </button>
            </div>
          )}
          <button className="profile" onClick={logout} title="Đăng xuất">
            <span className="avatar">
              {(user.full_name || user.username).slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{user.full_name || user.username}</strong>
              <small>{roleLabel(user)}</small>
            </div>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Mở menu"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <span>/</span>
            <strong>{nav.find((n) => n[0] === currentPage)?.[1]}</strong>
          </div>
          <div className="top-actions">
            {can(user, "orders.read") && (
              <form
                className="global-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  setOrderSearch(search);
                  navigate("orders");
                }}
              >
                <Search size={16} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm đơn hàng…"
                  aria-label="Tìm kiếm toàn cục"
                />
                <kbd>↵</kbd>
              </form>
            )}
            <span
              className={
                "connection " + (online ? "connected" : "disconnected")
              }
            >
              <span className="pulse" />
              {online
                ? "Đã kết nối"
                : online === null
                  ? "Đang kiểm tra"
                  : "Mất kết nối"}
            </span>
            <button
              className="icon-button"
              onClick={toggleTheme}
              aria-label="Đổi giao diện"
            >
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              className="icon-button"
              onClick={() => setNotices((n) => !n)}
              aria-label="Thông báo"
            >
              <Bell size={19} />
            </button>
          </div>
        </header>
        {notices && (
          <div className="notification-pop">
            <strong>Thông báo hệ thống</strong>
            <p>
              {online
                ? "Backend và MySQL vừa phản hồi kiểm tra readiness."
                : "Kết nối chưa sẵn sàng. Vui lòng thử lại hoặc liên hệ quản lý."}
            </p>
            <small>Kiểm tra định kỳ 15 giây</small>
          </div>
        )}
        <div className="page-content" key={user.id}>
          {currentPage === "dashboard" ? (
            <Dashboard {...props} />
          ) : currentPage === "products" ? (
            <Products {...props} />
          ) : currentPage === "transactions" ? (
            <TransactionHistory {...props} />
          ) : currentPage === "users" ? (
            <UserManagement {...props} />
          ) : currentPage === "orders" ? (
            <OrderList {...props} initialSearch={orderSearch} />
          ) : currentPage === "create" ? (
            <CreateOrder {...props} />
          ) : currentPage === "monitoring" ? (
            <SystemMonitoring {...props} />
          ) : currentPage === "incidents" ? (
            <IncidentManagement {...props} />
          ) : currentPage === "backups" ? (
            <BackupRestore {...props} />
          ) : (
            <SettingsPage {...props} />
          )}
          <footer className="page-footer">
            <span>OMDRS · Order Management & Disaster Recovery</span>
            <span>
              MySQL 8.4 <i /> Primary workspace
            </span>
          </footer>
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          <ShieldCheck size={19} />
          <span>{toast}</span>
          <button aria-label="Đóng thông báo" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
