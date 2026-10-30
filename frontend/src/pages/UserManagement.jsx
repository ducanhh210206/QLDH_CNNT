import { useState, useEffect } from "react";
import {
  Users,
  UserPlus,
  ShieldCheck,
  Search,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api, date } from "../services/api";
import {
  useData,
  PageHeading,
  Panel,
  ErrorBox,
  Empty,
  Loading,
  Modal,
  Refresh,
  Badge,
} from "../components/common";
import {
  permissionLabels,
  accountLabel,
  roleLabel,
} from "../utils/permissions";
function togglePermissions(permissions, key, checked) {
  let next = checked
    ? [...permissions, key]
    : permissions.filter((p) => p !== key);
  if (checked && key === "products.create") next.push("products.read");
  if (checked && ["orders.create", "orders.update"].includes(key))
    next.push("orders.read");
  if (!checked && key === "products.read")
    next = next.filter((p) => p !== "products.create");
  if (!checked && key === "orders.read")
    next = next.filter((p) => !["orders.create", "orders.update"].includes(p));
  return [...new Set(next)];
}
function CreateStaff({ onClose, onSaved }) {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    username: "",
    password: "",
    confirm: "",
    note: "",
  });
  const [permissions, setPermissions] = useState(Object.keys(permissionLabels));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm({ ...form, [key]: e.target.value }),
  });
  async function save(e) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { confirm, ...data } = form;
      const created = await api("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ ...data, permissions }),
      });
      onSaved(created);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Cấp tài khoản nhân viên" onClose={busy ? () => {} : onClose}>
      <form onSubmit={save}>
        <ErrorBox error={error} />
        <div className="notice">
          <ShieldCheck size={18} />
          Tài khoản được tạo với vai trò Nhân viên và có thể đăng nhập ngay theo
          quyền bạn chọn.
        </div>
        <label>
          Họ và tên
          <input
            {...field("full_name")}
            required
            maxLength={120}
            autoComplete="name"
          />
        </label>
        <label>
          Email
          <input
            {...field("email")}
            type="email"
            required
            maxLength={254}
            autoComplete="off"
          />
        </label>
        <label>
          Tên đăng nhập
          <input
            {...field("username")}
            required
            minLength={3}
            maxLength={100}
            pattern="[A-Za-z0-9._\-]{3,100}"
            autoComplete="off"
          />
          <small>
            3–100 ký tự: chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.
          </small>
        </label>
        <div className="two-fields">
          <label>
            Mật khẩu ban đầu
            <input
              {...field("password")}
              type="password"
              required
              minLength={12}
              maxLength={256}
              autoComplete="new-password"
            />
          </label>
          <label>
            Xác nhận mật khẩu
            <input
              {...field("confirm")}
              type="password"
              required
              minLength={12}
              maxLength={256}
              autoComplete="new-password"
            />
          </label>
        </div>
        <fieldset className="permission-grid">
          <legend>Quyền sử dụng chức năng</legend>
          {Object.entries(permissionLabels).map(([key, label]) => (
            <label key={key} className="checkbox-label">
              <input
                type="checkbox"
                checked={permissions.includes(key)}
                onChange={(e) =>
                  setPermissions(
                    togglePermissions(permissions, key, e.target.checked),
                  )
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
        <label>
          Ghi chú cấp tài khoản
          <textarea {...field("note")} maxLength={500} />
        </label>
        <p className="muted">
          Bạn tự bàn giao tên đăng nhập và mật khẩu cho nhân viên qua kênh
          riêng. Hệ thống không tự gửi email.
        </p>
        <div className="form-footer">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Hủy
          </button>
          <button className="button primary" disabled={busy}>
            <UserPlus size={16} />
            {busy ? "Đang tạo…" : "Tạo & cấp quyền"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Review({ target, onClose, onSaved }) {
  const [role, setRole] = useState(target.role),
    [status, setStatus] = useState(
      target.account_status === "Pending" ? "Active" : target.account_status,
    ),
    [permissions, setPermissions] = useState(
      target.account_status === "Pending"
        ? Object.keys(permissionLabels)
        : target.permissions.filter((k) => k in permissionLabels),
    ),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const history = useData("/api/admin/users/" + target.id + "/history");
  const toggle = (key, checked) =>
    setPermissions(togglePermissions(permissions, key, checked));
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/users/" + target.id + "/access", {
        method: "PATCH",
        body: JSON.stringify({
          role,
          account_status: status,
          permissions: role === "Admin" ? [] : permissions,
          note,
          version: target.access_version,
        }),
      });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Duyệt tài khoản & cấp quyền" onClose={onClose}>
      <div className="review-identity">
        <span className="avatar">
          {(target.full_name || target.username).slice(0, 1)}
        </span>
        <div>
          <strong>{target.full_name}</strong>
          <p>
            {target.username} · {target.email || "Chưa có email"}
          </p>
          <small>
            {target.auth_provider === "Google"
              ? "Tài khoản Google · Email đã xác minh"
              : "Tài khoản mật khẩu"}
          </small>
        </div>
      </div>
      <div className="account-metadata">
        <p>
          <strong>Ngày tạo:</strong> {date(target.created_at)}
        </p>
        <p>
          <strong>Duyệt/cấp quyền gần nhất:</strong>{" "}
          {target.reviewed_at ? date(target.reviewed_at) : "Chưa ghi nhận"}
        </p>
        {target.review_note && (
          <p>
            <strong>Ghi chú hiện tại:</strong> {target.review_note}
          </p>
        )}
      </div>
      <form onSubmit={save}>
        <ErrorBox error={error} />
        <div className="two-fields">
          <label>
            Vai trò
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="Staff">Nhân viên</option>
              <option value="Admin">Quản lý</option>
            </select>
          </label>
          <label>
            Trạng thái
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="Active">Duyệt / Cho phép sử dụng</option>
              <option value="Rejected">Từ chối</option>
              <option value="Suspended">Tạm khóa</option>
            </select>
          </label>
        </div>
        {role === "Admin" ? (
          <div className="notice">
            <ShieldCheck size={18} />
            Quản lý có toàn bộ quyền nghiệp vụ, duyệt nhân viên, sao lưu và phục
            hồi dữ liệu.
          </div>
        ) : (
          <fieldset className="permission-grid">
            <legend>Quyền sử dụng chức năng</legend>
            {Object.entries(permissionLabels).map(([key, label]) => (
              <label key={key} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={permissions.includes(key)}
                  onChange={(e) => toggle(key, e.target.checked)}
                />
                {label}
              </label>
            ))}
          </fieldset>
        )}
        <label>
          Ghi chú xét duyệt
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Lý do duyệt, từ chối hoặc thay đổi quyền…"
          />
        </label>
        <div className="notice">
          Thay đổi quyền sẽ kết thúc phiên đăng nhập cũ của tài khoản này. Người
          dùng cần đăng nhập lại.
        </div>
        <div className="form-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Đóng
          </button>
          <button className="button primary" disabled={busy}>
            <Check size={16} />
            {busy
              ? "Đang lưu…"
              : status === "Active"
                ? "Lưu & cấp quyền"
                : "Lưu quyết định"}
          </button>
        </div>
      </form>
      <h3 className="section-title">Lịch sử xét duyệt</h3>
      <ErrorBox error={history.error} />
      {history.data?.length ? (
        <ol className="timeline">
          {history.data.map((h) => (
            <li key={h.id}>
              <strong>{h.actor}</strong>
              <p>
                {h.note || "Cập nhật quyền truy cập"} · {date(h.created_at)}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="panel-padding muted">Chưa có lần xét duyệt trước đó.</p>
      )}
    </Modal>
  );
}
export default function UserManagement({ user, notify }) {
  const [status, setStatus] = useState("Active"),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState(null),
    [creating, setCreating] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  const { data, error, loading, reload } = useData(
    "/api/admin/users?" +
      new URLSearchParams({
        page,
        limit: 20,
        search: query,
        ...(status ? { status } : {}),
      }),
    15000,
  );
  return (
    <>
      <PageHeading
        title="Nhân viên & phê duyệt"
        description="Duyệt tài khoản mới, cấp quyền và kiểm soát truy cập dữ liệu."
      >
        <Refresh onClick={reload} />
        <button className="button primary" onClick={() => setCreating(true)}>
          <UserPlus size={17} />
          Cấp tài khoản nhân viên
        </button>
      </PageHeading>
      <div className="notice">
        <ShieldCheck size={19} />
        Nhân viên tự đăng ký phải chờ Quản lý phê duyệt. Tài khoản do Quản lý
        cấp được sử dụng ngay theo quyền đã chọn. Quản lý không thể tự thay đổi
        quyền tài khoản đang đăng nhập.
      </div>
      <Panel
        title={
          status === "Active"
            ? "Tài khoản đã cấp"
            : status === "Pending"
              ? "Tài khoản chờ duyệt"
              : "Danh sách người dùng"
        }
        subtitle={
          data ? data.total + " tài khoản phù hợp" : "Đang tải tài khoản"
        }
      >
        <div className="filters">
          <div className="search-field">
            <Search size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tên, email hoặc tài khoản…"
              aria-label="Tìm nhân viên"
            />
          </div>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label="Trạng thái tài khoản"
          >
            <option value="Active">Đã cấp / Đang hoạt động</option>
            <option value="Pending">Chờ duyệt</option>
            <option value="">Tất cả tài khoản</option>
            {["Rejected", "Suspended"].map((s) => (
              <option key={s} value={s}>
                {accountLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <ErrorBox error={error} retry={reload} />
        {loading ? (
          <Loading />
        ) : !data?.data.length ? (
          <Empty text="Không có tài khoản trong danh sách này" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>NHÂN VIÊN</th>
                  <th>EMAIL / ĐĂNG NHẬP</th>
                  <th>VAI TRÒ</th>
                  <th>TRẠNG THÁI</th>
                  <th>QUYỀN ĐƯỢC CẤP</th>
                  <th>NGÀY TẠO / CẤP QUYỀN</th>
                  <th>GHI CHÚ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.data.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.full_name}</strong>
                      <small>{item.username}</small>
                    </td>
                    <td>
                      {item.email || "—"}
                      <small>
                        {item.auth_provider === "Google"
                          ? "Google"
                          : "Mật khẩu"}
                      </small>
                    </td>
                    <td>{roleLabel(item)}</td>
                    <td>
                      <Badge
                        status={item.account_status}
                        label={accountLabel(item.account_status)}
                      />
                    </td>
                    <td className="account-permissions">
                      {item.role === "Admin" ? (
                        <span>Toàn bộ quyền quản lý</span>
                      ) : item.permissions.length ? (
                        <details>
                          <summary>
                            {item.permissions.length} quyền chức năng
                          </summary>
                          <ul>
                            {item.permissions
                              .filter((key) => key in permissionLabels)
                              .map((key) => (
                                <li key={key}>{permissionLabels[key]}</li>
                              ))}
                          </ul>
                        </details>
                      ) : (
                        <span>Chưa được cấp quyền</span>
                      )}
                    </td>
                    <td>
                      <span>Tạo: {date(item.created_at)}</span>
                      <small>
                        {item.reviewed_at
                          ? "Cấp/cập nhật quyền: " + date(item.reviewed_at)
                          : "Chưa ghi nhận lần cấp quyền"}
                      </small>
                    </td>
                    <td className="account-note">{item.review_note || "—"}</td>
                    <td>
                      <button
                        className="button secondary"
                        disabled={item.id === user.id}
                        onClick={() => setSelected(item)}
                      >
                        {item.id === user.id
                          ? "Tài khoản của bạn"
                          : item.account_status === "Pending"
                            ? "Xét duyệt"
                            : "Quyền truy cập"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>Trang {page}</span>
          <div>
            <button
              className="icon-button"
              disabled={page <= 1}
              aria-label="Trang trước"
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon-button"
              disabled={!data || page * 20 >= data.total}
              aria-label="Trang sau"
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </Panel>
      {creating && (
        <CreateStaff
          onClose={() => setCreating(false)}
          onSaved={(created) => {
            setCreating(false);
            setStatus("Active");
            setSearch("");
            setQuery("");
            setPage(1);
            reload();
            notify(
              "Đã cấp tài khoản " +
                created.username +
                ". Nhân viên có thể đăng nhập ngay.",
            );
          }}
        />
      )}
      {selected && (
        <Review
          key={selected.id}
          target={selected}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            reload();
            notify("Đã lưu quyết định và cập nhật quyền truy cập.");
          }}
        />
      )}
    </>
  );
}
