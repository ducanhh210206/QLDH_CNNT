import { useState } from "react";
import {
  ArrowUpRight,
  ShieldCheck,
  Boxes,
  Activity,
  Database,
  ArrowRight,
} from "lucide-react";
import { api } from "../services/api";
import { ErrorBox, Badge, useData } from "../components/common";
export default function Login({ onLogin }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const health = useData("/health/ready", 15000);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      onLogin(
        await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify(Object.fromEntries(form)),
        }),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-story">
        <div className="brand">
          <span className="brand-mark">
            <Boxes size={24} />
          </span>
          <span>
            omdrs<span className="brand-dot">.</span>
          </span>
        </div>
        <span className="login-label">
          <span className="pulse" /> ORDER MANAGEMENT & DISASTER RECOVERY
        </span>
        <h1>
          Mỗi đơn hàng.
          <br />
          Một cam kết
          <br />
          <em>vẹn toàn.</em>
        </h1>
        <p>
          Quản lý vận hành tập trung. Giám sát liên tục.
          <br />
          Sẵn sàng cho những điều không mong đợi.
        </p>
        <div className="system-graphic">
          <div>
            <Database />
            <span>MYSQL PRIMARY</span>
            <small>Lưu trữ bền vững</small>
          </div>
          <span className="graphic-line" />
          <div>
            <ShieldCheck />
            <span>RECOVERY</span>
            <small>Kiểm chứng dữ liệu</small>
          </div>
          <span className="graphic-line" />
          <div>
            <Activity />
            <span>MONITORING</span>
            <small>Giám sát độc lập</small>
          </div>
        </div>
        <footer>
          Được thiết kế cho sự tin cậy.
          <ArrowUpRight size={17} />
        </footer>
      </div>
      <div className="login-form-wrap">
        <div className="login-top">
          HỆ THỐNG QUẢN TRỊ <span>v1.0</span>
        </div>
        <form className="login-form" onSubmit={submit}>
          <div className="login-shield">
            <ShieldCheck size={25} />
          </div>
          <div className="eyebrow">CHÀO MỪNG TRỞ LẠI</div>
          <h2>Đăng nhập workspace</h2>
          <p>Tiếp tục quản lý đơn hàng và theo dõi hệ thống.</p>
          <ErrorBox error={error} />
          <label>
            Tên đăng nhập
            <input
              name="username"
              required
              autoComplete="username"
              placeholder="Tên tài khoản của bạn"
              maxLength={100}
            />
          </label>
          <label>
            Mật khẩu
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Nhập mật khẩu"
              maxLength={256}
            />
          </label>
          <button className="button primary wide" disabled={busy}>
            {busy ? "Đang xác thực…" : "Đăng nhập"}
            <ArrowRight size={18} />
          </button>
          <div className="login-status">
            <span className={"pulse " + (health.data ? "" : "offline")} />
            {health.data
              ? "Backend và MySQL sẵn sàng"
              : "Chưa xác nhận kết nối MySQL"}
            <span className="local-tag">LOCAL</span>
          </div>
          <details className="setup-help">
            <summary>Thiết lập lần đầu</summary>
            <p>
              Cấu hình backend/.env, khởi tạo schema trên database rỗng rồi tạo
              tài khoản bằng hướng dẫn trong README. Không có tài khoản hoặc mật
              khẩu mặc định.
            </p>
            <p>Docker Engine cần hoạt động trước khi kết nối MySQL.</p>
          </details>
        </form>
        <footer>
          <ShieldCheck size={14} /> Phiên đăng nhập được bảo vệ · Phân quyền tại
          máy chủ
        </footer>
      </div>
    </div>
  );
}
