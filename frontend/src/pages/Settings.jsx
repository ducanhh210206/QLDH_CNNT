import { Shield, Monitor, Database } from "lucide-react";
import { PageHeading, Panel } from "../components/common";
import { roleLabel, permissionLabels } from "../utils/permissions";
export default function Settings({ user, theme, toggleTheme }) {
  return (
    <>
      <PageHeading
        title="Cài đặt workspace"
        description="Thông tin tài khoản và tùy chọn hiển thị."
      />
      <div className="form-grid">
        <Panel title="Tài khoản hiện tại" action={<Shield size={20} />}>
          <dl className="settings-list">
            <div>
              <dt>Tên đăng nhập</dt>
              <dd>{user.username}</dd>
            </div>
            <div>
              <dt>Vai trò</dt>
              <dd>{roleLabel(user)}</dd>
            </div>
            <div>
              <dt>Phiên đăng nhập</dt>
              <dd>8 giờ · Cookie HttpOnly</dd>
            </div>
          </dl>
        </Panel>
        <Panel title="Giao diện" action={<Monitor size={20} />}>
          <div className="panel-padding">
            <p>Chế độ hiện tại: {theme === "dark" ? "Tối" : "Sáng"}</p>
            <button className="button secondary" onClick={toggleTheme}>
              Chuyển chế độ hiển thị
            </button>
          </div>
        </Panel>
      </div>
      {user.role === "Admin" && (
        <Panel
          title="Cấu hình vận hành"
          subtitle="Các thay đổi cần thực hiện ở tệp cấu hình máy chủ"
        >
          <dl className="settings-list">
            <div>
              <dt>Kết nối database</dt>
              <dd>backend/.env · DB_HOST / DB_PORT / DB_NAME</dd>
            </div>
            <div>
              <dt>Lịch sao lưu</dt>
              <dd>BACKUP_INTERVAL_HOURS · 0 = tắt</dd>
            </div>
            <div>
              <dt>Lưu trữ backup</dt>
              <dd>BACKUP_RETENTION_DAYS · Mặc định 30 ngày</dd>
            </div>
            <div>
              <dt>Giám sát</dt>
              <dd>monitoring/.env · Mỗi 10 giây mặc định</dd>
            </div>
            <div>
              <dt>Standby / replication</dt>
              <dd>Chưa được xác minh trên hai máy</dd>
            </div>
          </dl>
        </Panel>
      )}
      {user.role === "Staff" && (
        <Panel title="Quyền được quản lý cấp">
          <div className="panel-padding">
            {user.permissions.length ? (
              user.permissions.map((p) => (
                <span className="soft-tag permission-tag" key={p}>
                  {permissionLabels[p] || p}
                </span>
              ))
            ) : (
              <p>
                Bạn chưa được cấp quyền chức năng. Vui lòng liên hệ quản lý.
              </p>
            )}
          </div>
        </Panel>
      )}
    </>
  );
}
