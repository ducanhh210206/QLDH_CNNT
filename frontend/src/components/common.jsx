import { useState, useEffect } from "react";
import { AlertCircle, PackageOpen, RefreshCw, X } from "lucide-react";
import { api, statusName } from "../services/api";
export function useData(path, interval = 0) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load() {
      try {
        const r = await api(path, { signal: controller.signal });
        if (active) {
          setData(r);
          setError("");
        }
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    setLoading(true);
    load();
    const timer = interval ? setInterval(load, interval) : null;
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [path, revision, interval]);
  return { data, error, loading, reload: () => setRevision((n) => n + 1) };
}
export const Badge = ({ status }) => (
  <span className={"badge " + status?.replaceAll(" ", "-")}>
    <i />
    {statusName(status)}
  </span>
);
export const ErrorBox = ({ error, retry }) =>
  error && (
    <div className="error-box" role="alert">
      <AlertCircle size={18} />
      <span>{error}</span>
      {retry && (
        <button className="text-button" onClick={retry}>
          Thử lại
        </button>
      )}
    </div>
  );
export const Empty = ({ text = "Chưa có dữ liệu", children }) => (
  <div className="empty">
    <div className="empty-icon">
      <PackageOpen size={30} />
    </div>
    <h3>{text}</h3>
    <p>Dữ liệu sẽ xuất hiện sau khi kết nối và ghi nhận thành công.</p>
    {children}
  </div>
);
export const Loading = () => (
  <div className="skeletons" aria-label="Đang tải">
    <div />
    <div />
    <div />
  </div>
);
export function Panel({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={"panel " + className}>
      <div className="panel-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function PageHeading({
  eyebrow = "WORKSPACE / PRIMARY",
  title,
  description,
  children,
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export const Refresh = ({ onClick }) => (
  <button className="button secondary" onClick={onClick}>
    <RefreshCw size={16} />
    Làm mới
  </button>
);
export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="panel-head">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Đóng" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
