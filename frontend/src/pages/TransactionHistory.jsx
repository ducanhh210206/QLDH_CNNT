import { useState, useEffect } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { money, date, statusName } from "../services/api";
import {
  useData,
  PageHeading,
  Panel,
  Empty,
  Loading,
  ErrorBox,
  Refresh,
  Badge,
} from "../components/common";
export default function TransactionHistory() {
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  const { data, error, loading, reload } = useData(
    "/api/transactions?" +
      new URLSearchParams({
        page,
        limit: 20,
        search: query,
        ...(status ? { status } : {}),
      }),
  );
  return (
    <>
      <PageHeading
        title="Lịch sử giao dịch"
        description="Theo dõi thời điểm tạo và thay đổi trạng thái của từng đơn hàng."
      >
        <Refresh onClick={reload} />
      </PageHeading>
      <Panel
        title="Nhật ký giao dịch đơn hàng"
        subtitle="Ghi nhận thao tác đã lưu thành công; không phải lịch sử thanh toán ngân hàng"
      >
        <div className="filters">
          <div className="search-field">
            <Search size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm mã đơn, khách hàng, sản phẩm…"
              aria-label="Tìm lịch sử giao dịch"
            />
          </div>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label="Trạng thái giao dịch"
          >
            <option value="">Tất cả trạng thái</option>
            {["Pending", "Completed", "Cancelled"].map((s) => (
              <option key={s} value={s}>
                {statusName(s)}
              </option>
            ))}
          </select>
        </div>
        <ErrorBox error={error} retry={reload} />
        {loading ? (
          <Loading />
        ) : !data?.data.length ? (
          <Empty text="Chưa có giao dịch phù hợp" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>THỜI ĐIỂM</th>
                  <th>MÃ ĐƠN / KHÁCH HÀNG</th>
                  <th>SẢN PHẨM</th>
                  <th>GIÁ TRỊ ĐƠN</th>
                  <th>THAY ĐỔI</th>
                  <th>NGƯỜI THỰC HIỆN</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((row) => (
                  <tr key={row.id}>
                    <td className="nowrap">{date(row.created_at)}</td>
                    <td>
                      <strong className="order-code">
                        #{row.order_id.slice(0, 8).toUpperCase()}
                      </strong>
                      <small>{row.customer_name}</small>
                    </td>
                    <td>
                      {row.product_name}
                      <small>Số lượng: {row.quantity}</small>
                    </td>
                    <td className="nowrap">{money(row.total_amount)}</td>
                    <td>
                      {row.old_status && (
                        <small>{statusName(row.old_status)} →</small>
                      )}
                      <Badge status={row.new_status} />
                      {!row.old_status && <small>Tạo đơn mới</small>}
                    </td>
                    <td>{row.username}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            {data?.total || 0} giao dịch · Trang {page}
          </span>
          <div>
            <button
              className="icon-button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Trang trước"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon-button"
              disabled={!data || page * 20 >= data.total}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Trang sau"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </Panel>
    </>
  );
}
