import { useState, useEffect } from "react";
import {
  ArrowUpRight,
  ShieldCheck,
  Boxes,
  Activity,
  Database,
  ArrowRight,
  Clock3,
} from "lucide-react";
import { api } from "../services/api";
import { ErrorBox, useData } from "../components/common";
const resultMessages = {
  pending:
    "Tài khoản đã được ghi nhận. Vui lòng chờ quản lý duyệt và cấp quyền trước khi đăng nhập.",
  disabled:
    "Tài khoản đang bị từ chối hoặc tạm khóa. Vui lòng liên hệ quản lý.",
  link_required:
    "Email này đã có tài khoản mật khẩu. Hãy đăng nhập bằng mật khẩu đã đăng ký.",
  cancelled: "Bạn đã hủy đăng nhập Google.",
  not_configured: "Đăng nhập Google chưa được quản lý cấu hình.",
  google_failed: "Không xác minh được đăng nhập Google. Vui lòng thử lại.",
};
export default function Login({ onLogin }) {
  const [mode, setMode] = useState("login"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(
      () =>
        resultMessages[
          new URLSearchParams(window.location.search).get("auth_result")
        ] || "",
    );
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("auth_result")) {
      url.searchParams.delete("auth_result");
      window.history.replaceState(
        null,
        "",
        url.pathname + url.search + url.hash,
      );
    }
  }, []);
  const health = useData("/health/ready", 15000),
    providers = useData("/api/auth/providers");
  async function submit(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    if (mode === "register" && data.password !== data.confirm_password) {
      setError("Mật khẩu xác nhận chưa trùng khớp.");
      return;
    }
    delete data.confirm_password;
    setBusy(true);
    try {
      if (mode === "register") {
        const r = await api("/api/auth/register", {
          method: "POST",
          body: JSON.stringify(data),
        });
        setMessage(r.message);
        setMode("pending");
      } else {
        onLogin(
          await api("/api/auth/login", {
            method: "POST",
            body: JSON.stringify(data),
          }),
        );
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function switchMode(next) {
    setMode(next);
    setError("");
    setMessage("");
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
          Cùng một không gian làm việc.
          <br />
          Đúng người, đúng quyền, dữ liệu an toàn.
        </p>
        <div className="system-graphic">
          <div>
            <Database />
            <span>QUẢN LÝ ĐƠN</span>
            <small>Giao dịch rõ ràng</small>
          </div>
          <span className="graphic-line" />
          <div>
            <ShieldCheck />
            <span>PHÂN QUYỀN</span>
            <small>Quản lý phê duyệt</small>
          </div>
          <span className="graphic-line" />
          <div>
            <Activity />
            <span>SAO LƯU</span>
            <small>Dữ liệu vẹn toàn</small>
          </div>
        </div>
        <footer>
          Được thiết kế cho sự tin cậy.
          <ArrowUpRight size={17} />
        </footer>
      </div>
      <div className="login-form-wrap">
        <div className="login-top">
          KHÔNG GIAN LÀM VIỆC <span>OMDRS</span>
        </div>
        <form className="login-form" onSubmit={submit} key={mode}>
          <div className="login-shield">
            {mode === "pending" ? (
              <Clock3 size={25} />
            ) : (
              <ShieldCheck size={25} />
            )}
          </div>
          <div className="eyebrow">
            {mode === "register"
              ? "THAM GIA ĐỘI NGŨ"
              : mode === "pending"
                ? "CHỜ QUẢN LÝ PHÊ DUYỆT"
                : "CHÀO MỪNG TRỞ LẠI"}
          </div>
          <h2>
            {mode === "register"
              ? "Đăng ký nhân viên"
              : mode === "pending"
                ? "Đã gửi yêu cầu"
                : "Đăng nhập workspace"}
          </h2>
          <p>
            {mode === "register"
              ? "Tài khoản mới cần được quản lý duyệt và cấp quyền."
              : mode === "pending"
                ? "Bạn có thể đăng nhập sau khi được cấp quyền."
                : "Quản lý đơn hàng và làm việc theo quyền được cấp."}
          </p>
          <ErrorBox error={error} />
          {message && (
            <div className="success-notice" role="status">
              <Clock3 size={18} />
              <span>{message}</span>
            </div>
          )}
          {mode !== "pending" && (
            <>
              {mode === "register" && (
                <>
                  <label>
                    Họ và tên
                    <input
                      name="full_name"
                      required
                      maxLength={120}
                      autoComplete="name"
                      placeholder="Nguyễn Minh Anh"
                    />
                  </label>
                  <label>
                    Email
                    <input
                      name="email"
                      type="email"
                      required
                      maxLength={254}
                      autoComplete="email"
                      placeholder="ban@gmail.com"
                    />
                  </label>
                </>
              )}
              <label>
                {mode === "register"
                  ? "Tên đăng nhập"
                  : "Tên đăng nhập hoặc email"}
                <input
                  name="username"
                  required
                  autoComplete="username"
                  minLength={mode === "register" ? 3 : 1}
                  maxLength={mode === "register" ? 100 : 254}
                  pattern={
                    mode === "register" ? "[A-Za-z0-9._\-]{3,100}" : undefined
                  }
                  placeholder={
                    mode === "register"
                      ? "Chữ, số, dấu chấm, gạch dưới"
                      : "Tên tài khoản hoặc email của bạn"
                  }
                />
              </label>
              <label>
                Mật khẩu
                <input
                  name="password"
                  type="password"
                  required
                  minLength={mode === "register" ? 12 : 1}
                  maxLength={256}
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                  placeholder={
                    mode === "register" ? "Tối thiểu 12 ký tự" : "Nhập mật khẩu"
                  }
                />
              </label>
              {mode === "register" && (
                <label>
                  Nhập lại mật khẩu
                  <input
                    name="confirm_password"
                    type="password"
                    required
                    minLength={12}
                    maxLength={256}
                    autoComplete="new-password"
                  />
                </label>
              )}
              <button className="button primary wide" disabled={busy}>
                {busy
                  ? "Đang xử lý…"
                  : mode === "register"
                    ? "Gửi yêu cầu đăng ký"
                    : "Đăng nhập"}
                <ArrowRight size={18} />
              </button>
              <div className="auth-divider">
                <span>hoặc</span>
              </div>
              <button
                type="button"
                className="button secondary wide google-button"
                disabled={busy || !providers.data?.google?.enabled}
                onClick={() =>
                  window.location.assign(
                    (import.meta.env.VITE_API_BASE || "") + "/api/auth/google",
                  )
                }
              >
                <span className="google-letter">G</span>Tiếp tục với Google /
                Gmail
              </button>
              {!providers.loading && !providers.data?.google?.enabled && (
                <p className="auth-hint">
                  Đăng nhập Google chưa được quản lý cấu hình.
                </p>
              )}
            </>
          )}
          <div className="auth-switch">
            {mode === "login" ? (
              <>
                Chưa có tài khoản?{" "}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => switchMode("register")}
                >
                  Đăng ký nhân viên
                </button>
              </>
            ) : (
              <button
                type="button"
                className="text-button"
                onClick={() => switchMode("login")}
              >
                Quay lại đăng nhập
              </button>
            )}
          </div>
          <div className="login-status">
            <span className={"pulse " + (health.data ? "" : "offline")} />
            {health.data ? "Hệ thống sẵn sàng" : "Hệ thống chưa sẵn sàng"}
            <span className="local-tag">BẢO MẬT</span>
          </div>
        </form>
        <footer>
          <ShieldCheck size={14} /> Quyền truy cập được quản lý phê duyệt
        </footer>
      </div>
    </div>
  );
}
