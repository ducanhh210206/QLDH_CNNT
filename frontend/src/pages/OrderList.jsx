import { useState, useEffect } from "react";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
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
import OrderDetail from "./OrderDetail";
export default function OrderList({ navigate, notify, initialSearch = "" }) {
  const [search, setSearch] = useState(initialSearch),
    [query, setQuery] = useState(initialSearch),
    [status, setStatus] = useState(""),
    [sort, setSort] = useState("desc"),
    [page, setPage] = useState(1),
    [id, setId] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setSearch(initialSearch), [initialSearch]);
  const { data, error, loading, reload } = useData(
    "/api/orders?" +
      new URLSearchParams({
        page,
        limit: 10,
        search: query,
        sort,
        ...(status ? { status } : {}),
      }),
  );
  return (
    <>
      <PageHeading
        title="Quản lý đơn hàng"
        description="Tra cứu giao dịch, theo dõi tiến độ và cập nhật trạng thái."
      >
        <Refresh onClick={reload} />
        <button className="button primary" onClick={() => navigate("create")}>
          <Plus size={16} />
          Tạo đơn hàng
        </button>
      </PageHeading>
      <Panel
        title="Tất cả đơn hàng"
        subtitle={
          data
            ? data.total + " đơn hàng trong hệ thống"
            : "Dữ liệu trực tiếp từ MySQL"
        }
      >
        <div className="filters">
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="Tìm đơn hàng"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm mã đơn, tên khách hàng…"
            />
          </div>
          <select
            aria-label="Lọc trạng thái"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="Pending">Đang chờ</option>
            <option value="Completed">Hoàn tất</option>
            <option value="Cancelled">Đã hủy</option>
          </select>
          <select
            aria-label="Sắp xếp"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="desc">Mới nhất trước</option>
            <option value="asc">Cũ nhất trước</option>
          </select>
        </div>
        <ErrorBox error={error} retry={reload} />
        {loading ? (
          <Loading />
        ) : error ? null : !data?.data.length ? (
          <Empty
            text={
              query || status
                ? "Không tìm thấy đơn phù hợp"
                : "Chưa có đơn hàng nào"
            }
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>MÃ ĐƠN</th>
                  <th>KHÁCH HÀNG</th>
                  <th>SẢN PHẨM</th>
                  <th>SL</th>
                  <th>TỔNG TIỀN</th>
                  <th>TRẠNG THÁI</th>
                  <th>NGÀY TẠO / CẬP NHẬT</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.data.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <button
                        className="order-code text-button"
                        onClick={() => setId(o.id)}
                      >
                        #{o.id.slice(0, 8).toUpperCase()}
                      </button>
                    </td>
                    <td>
                      <div className="customer">
                        <span className="avatar small">
                          {o.customer_name.slice(0, 1)}
                        </span>
                        <strong>{o.customer_name}</strong>
                      </div>
                    </td>
                    <td>{o.product_name}</td>
                    <td>{o.quantity}</td>
                    <td className="nowrap">{money(o.total_amount)}</td>
                    <td>
                      <Badge status={o.status} />
                    </td>
                    <td className="muted nowrap">
                      {date(o.created_at)}
                      <small>{date(o.updated_at)}</small>
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label="Xem chi tiết"
                        onClick={() => setId(o.id)}
                      >
                        <ArrowUpRight size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            {data ? data.total + " kết quả" : "—"} · Trang {page}
          </span>
          <div>
            <button
              className="icon-button"
              aria-label="Trang trước"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <span>{page}</span>
            <button
              className="icon-button"
              aria-label="Trang sau"
              disabled={!data || page * 10 >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </Panel>
      {id && (
        <OrderDetail
          id={id}
          onClose={() => setId(null)}
          onChanged={reload}
          notify={notify}
        />
      )}
    </>
  );
}
