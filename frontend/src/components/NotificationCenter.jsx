import { useEffect, useRef, useState } from "react";
import { Bell, Check, CheckCheck, X } from "lucide-react";
import { api, date } from "../services/api";
import { useData, ErrorBox, Loading } from "./common";
import { can } from "../utils/permissions";

const destinations = {
  orders: "orders.read",
  users: "users.manage",
  backups: "backups.manage",
  settings: null,
};

export default function NotificationCenter({ user, navigate, online }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const root = useRef(null);
  const { data, error, loading, reload } = useData(
    "/api/notifications?limit=20&page=" + page,
    15000,
  );
  const unread = data?.unread_count || 0;
  useEffect(() => {
    if (!open) return;
    const outside = (e) => {
      if (!root.current?.contains(e.target)) setOpen(false);
    };
    const escape = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        root.current?.querySelector(".notification-bell")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  async function read(id, destination, status) {
    setBusy(true);
    setActionError("");
    try {
      await api(
        id
          ? "/api/notifications/" + encodeURIComponent(id) + "/read"
          : "/api/notifications/read-all",
        { method: "POST", body: "{}" },
      );
      reload();
      if (
        destination &&
        Object.hasOwn(destinations, destination) &&
        (!destinations[destination] || can(user, destinations[destination]))
      ) {
        navigate(destination, {
          status: ["Pending", "Active", "Rejected", "Suspended"].includes(
            status,
          )
            ? status
            : "",
        });
        setOpen(false);
      }
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="notifications-root" ref={root}>
      <button
        className="icon-button notification-bell"
        aria-label={unread ? `Thông báo, ${unread} chưa đọc` : "Thông báo"}
        aria-expanded={open}
        aria-controls="notification-center"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) reload();
        }}
      >
        <Bell size={19} />
        {unread > 0 && (
          <span className="notification-count" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <section
          className="notifications-panel"
          id="notification-center"
          role="dialog"
          aria-label="Trung tâm thông báo"
        >
          <div className="notifications-heading">
            <div>
              <strong>Thông báo</strong>
              <small>
                {unread} chưa đọc · {data?.total || 0} gần đây
              </small>
            </div>
            <button
              className="icon-button"
              aria-label="Đóng trung tâm thông báo"
              onClick={() => setOpen(false)}
            >
              <X size={17} />
            </button>
          </div>
          <div className="notifications-toolbar">
            <span>Cập nhật mỗi 15 giây</span>
            <button
              className="text-button"
              disabled={busy || !unread}
              onClick={() => read()}
            >
              <CheckCheck size={15} />
              Đọc tất cả
            </button>
          </div>
          <ErrorBox error={actionError || error} retry={reload} />
          {loading ? (
            <Loading />
          ) : !data?.data.length ? (
            <p className="notifications-empty">
              Chưa có thông báo phù hợp với tài khoản của bạn.
            </p>
          ) : (
            <ul className="notifications-list">
              {data.data.map((item) => (
                <li key={item.id} className={item.read_at ? "" : "unread"}>
                  <button
                    className="notification-open"
                    disabled={busy}
                    onClick={() => read(item.id, item.page, item.filter_status)}
                  >
                    <strong>
                      {item.title}
                      {!item.read_at && (
                        <span
                          className="notification-unread-dot"
                          aria-label="Chưa đọc"
                        />
                      )}
                    </strong>
                    <span>{item.message}</span>
                    <time dateTime={item.created_at}>
                      {date(item.created_at)}
                    </time>
                  </button>
                  {!item.read_at && (
                    <button
                      className="icon-button notification-read"
                      disabled={busy}
                      aria-label={"Đánh dấu đã đọc: " + item.title}
                      onClick={() => read(item.id)}
                    >
                      <Check size={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="notifications-pagination">
            <button
              className="text-button"
              disabled={page <= 1 || busy}
              onClick={() => setPage((value) => value - 1)}
            >
              Trước
            </button>
            <span>Trang {page}</span>
            <button
              className="text-button"
              disabled={!data || page * 20 >= data.total || busy}
              onClick={() => setPage((value) => value + 1)}
            >
              Sau
            </button>
          </div>
          <p className="notifications-footer">
            Tối đa 100 thông báo trong 90 ngày.{" "}
            {online
              ? "Kết nối hệ thống ổn định."
              : "Đang kiểm tra kết nối hệ thống."}
          </p>
        </section>
      )}
    </div>
  );
}
