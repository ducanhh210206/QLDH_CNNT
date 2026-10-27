import {
  Package,
  Clock,
  CheckCheck,
  ArrowUpRight,
  Plus,
  ArrowRight,
  Banknote,
  XCircle,
  ShieldCheck,
} from "lucide-react";
import {
  useData,
  PageHeading,
  Panel,
  Empty,
  Loading,
  ErrorBox,
  Badge,
  Refresh,
} from "../components/common";
import { money, date } from "../services/api";
export default function Dashboard({ navigate }) {
  const summary = useData("/api/dashboard/summary"),
    stats = useData("/api/dashboard/order-statistics"),
    recent = useData("/api/orders?limit=5");
  const s = summary.data;
  const max = Math.max(1, ...(stats.data || []).map((d) => d.count));
  return (
    <>
      <PageHeading
        title="Tổng quan vận hành"
        description="Mọi đơn hàng, mọi tín hiệu. Trong một không gian."
      >
        {" "}
        <Refresh
          onClick={() => {
            summary.reload();
            stats.reload();
            recent.reload();
          }}
        />
        <button className="button primary" onClick={() => navigate("create")}>
          <Plus size={17} />
          Tạo đơn hàng
        </button>
      </PageHeading>
      <div className="overview-banner">
        <div>
          <span className="banner-icon">
            <ShieldCheck size={24} />
          </span>
          <div>
            <strong>Dữ liệu chính xác. Vận hành an tâm.</strong>
            <p>Doanh thu chỉ ghi nhận từ đơn hàng đã hoàn tất.</p>
          </div>
        </div>
        <span className="outline-tag">
          PRIMARY WORKSPACE <ArrowUpRight size={14} />
        </span>
      </div>
      <ErrorBox error={summary.error} retry={summary.reload} />
      <div className="stats-grid">
        {[
          [Package, "Tổng đơn hàng", s?.total, "Tất cả đơn được lưu"],
          [
            Banknote,
            "Doanh thu hoàn tất",
            s ? money(s.revenue) : null,
            "Đơn vị tiền tệ · VND",
          ],
          [Clock, "Đang chờ xử lý", s?.pending, "Cần theo dõi tiến độ"],
          [CheckCheck, "Đã hoàn tất", s?.completed, "Giao dịch đã hoàn thành"],
        ].map(([Icon, label, value, sub], i) => (
          <div className="stat-card" key={label}>
            <div className="stat-top">
              <span>{label}</span>
              <Icon size={19} />
            </div>
            <strong>{value ?? "—"}</strong>
            <div className="stat-bottom">
              <span className={"stat-dot dot-" + i} />
              {sub}
            </div>
          </div>
        ))}
      </div>
      <div className="chart-grid">
        <Panel
          title="Nhịp độ đơn hàng"
          subtitle="Số đơn theo ngày · 30 ngày gần nhất"
          action={<span className="soft-tag">30 ngày</span>}
        >
          {stats.loading ? (
            <Loading />
          ) : stats.error ? (
            <ErrorBox error={stats.error} />
          ) : !stats.data?.length ? (
            <Empty text="Chưa có đơn hàng trong 30 ngày" />
          ) : (
            <div className="bar-chart">
              {stats.data.map((d) => (
                <div
                  className="bar-col"
                  key={d.day}
                  title={d.day + ": " + d.count + " đơn"}
                >
                  <span>{d.count}</span>
                  <div style={{ height: Math.max(6, (d.count / max) * 155) }} />
                  <small>{String(d.day).slice(5, 10)}</small>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel
          title="Trạng thái đơn hàng"
          subtitle="Phân bố trên toàn bộ dữ liệu"
        >
          {s?.total ? (
            <div className="distribution">
              <div
                className="donut"
                style={{
                  background: `conic-gradient(var(--teal) 0 ${(s.completed / s.total) * 100}%,#e6ac4a ${(s.completed / s.total) * 100}% ${((Number(s.completed) + Number(s.pending)) / s.total) * 100}%,#c2cbd3 0)`,
                }}
              >
                <div>
                  <strong>{s.total}</strong>
                  <small>TỔNG ĐƠN</small>
                </div>
              </div>
              <div className="legend">
                {[
                  ["Completed", s.completed],
                  ["Pending", s.pending],
                  ["Cancelled", s.cancelled],
                ].map(([status, n]) => (
                  <div key={status}>
                    <Badge status={status} />
                    <strong>{n}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Empty text="Chưa có phân bố trạng thái" />
          )}
        </Panel>
      </div>
      <Panel
        title="Đơn hàng gần đây"
        subtitle="Những giao dịch mới nhất của bạn"
        action={
          <button className="text-button" onClick={() => navigate("orders")}>
            Xem tất cả <ArrowRight size={15} />
          </button>
        }
      >
        {recent.error ? (
          <ErrorBox error={recent.error} />
        ) : recent.loading ? (
          <Loading />
        ) : !recent.data?.data?.length ? (
          <Empty text="Sẵn sàng cho đơn hàng đầu tiên">
            <button
              className="button secondary"
              onClick={() => navigate("create")}
            >
              <Plus size={16} />
              Tạo đơn hàng
            </button>
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>MÃ ĐƠN</th>
                  <th>KHÁCH HÀNG / SẢN PHẨM</th>
                  <th>TỔNG TIỀN</th>
                  <th>TRẠNG THÁI</th>
                  <th>THỜI GIAN TẠO</th>
                </tr>
              </thead>
              <tbody>
                {recent.data.data.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <span className="order-code">
                        #{o.id.slice(0, 8).toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <strong>{o.customer_name}</strong>
                      <small>{o.product_name}</small>
                    </td>
                    <td>{money(o.total_amount)}</td>
                    <td>
                      <Badge status={o.status} />
                    </td>
                    <td className="muted">{date(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
