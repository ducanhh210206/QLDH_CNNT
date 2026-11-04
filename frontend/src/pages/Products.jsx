import { useState, useEffect } from "react";
import {
  PackagePlus,
  Search,
  ChevronLeft,
  ChevronRight,
  Save,
} from "lucide-react";
import { api, money, date } from "../services/api";
import {
  useData,
  PageHeading,
  Panel,
  Empty,
  Loading,
  ErrorBox,
  Refresh,
} from "../components/common";
import { can } from "../utils/permissions";
export default function Products({ user, notify }) {
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [stockBusy, setStockBusy] = useState(null),
    [stockError, setStockError] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  const list = useData(
    "/api/products?" + new URLSearchParams({ page, limit: 20, search: query }),
  );
  async function receiveStock(e, id) {
    e.preventDefault();
    const form = e.currentTarget;
    const quantity = Number(new FormData(form).get("quantity"));
    setStockBusy(id);
    setStockError("");
    try {
      await api("/api/products/" + id + "/stock", {
        method: "POST",
        body: JSON.stringify({ quantity }),
      });
      form.reset();
      list.reload();
      notify("Đã nhập thêm " + quantity + " sản phẩm vào kho.");
    } catch (e) {
      setStockError(
        e.uncertain
          ? "Chưa xác định kết quả nhập kho. Hãy làm mới và kiểm tra số lượng trước khi nhập lại."
          : e.message,
      );
      list.reload();
    } finally {
      setStockBusy(null);
    }
  }
  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError("");
    try {
      await api("/api/products", {
        method: "POST",
        body: JSON.stringify({
          ...body,
          stock_quantity: Number(body.stock_quantity),
        }),
      });
      form.reset();
      list.reload();
      notify("Đã thêm sản phẩm vào danh mục.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="Danh mục sản phẩm"
        description="Thông tin sản phẩm thống nhất cho cả đội ngũ."
      >
        <Refresh onClick={list.reload} />
      </PageHeading>
      <div
        className={can(user, "products.create") ? "form-grid" : "single-column"}
      >
        <Panel
          title="Sản phẩm hiện có"
          subtitle={
            list.data ? list.data.total + " sản phẩm" : "Danh mục dùng chung"
          }
        >
          <div className="filters">
            <div className="search-field">
              <Search size={17} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm mã hoặc tên sản phẩm…"
                aria-label="Tìm sản phẩm"
              />
            </div>
          </div>
          <ErrorBox error={stockError} />
          <ErrorBox error={list.error} retry={list.reload} />
          {list.loading ? (
            <Loading />
          ) : !list.data?.data.length ? (
            <Empty text="Chưa có sản phẩm phù hợp" />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>MÃ SẢN PHẨM</th>
                    <th>TÊN SẢN PHẨM</th>
                    <th>GIÁ BÁN</th>
                    <th>TỒN KHO</th>
                    <th>NGÀY THÊM</th>
                    {can(user, "products.create") && <th>NHẬP KHO</th>}
                  </tr>
                </thead>
                <tbody>
                  {list.data.data.map((item) => (
                    <tr key={item.id}>
                      <td className="order-code">{item.sku}</td>
                      <td>
                        <strong>{item.name}</strong>
                        <small>{item.description}</small>
                      </td>
                      <td className="nowrap">{money(item.unit_price)}</td>
                      <td>
                        <strong>
                          {Number(item.stock_quantity).toLocaleString("vi-VN")}
                        </strong>
                        <small>
                          {Number(item.stock_quantity) === 0
                            ? "Hết hàng"
                            : "Có thể đặt"}
                        </small>
                      </td>
                      <td>{date(item.created_at)}</td>
                      {can(user, "products.create") && (
                        <td>
                          <form
                            className="stock-form"
                            onSubmit={(e) => receiveStock(e, item.id)}
                          >
                            <input
                              name="quantity"
                              type="number"
                              min="1"
                              max="1000000000"
                              step="1"
                              required
                              aria-label={"Số lượng nhập kho " + item.sku}
                              placeholder="Số lượng"
                              disabled={stockBusy !== null}
                            />
                            <button
                              className="button secondary"
                              disabled={stockBusy !== null}
                            >
                              {stockBusy === item.id
                                ? "Đang nhập…"
                                : "Nhập kho"}
                            </button>
                          </form>
                        </td>
                      )}
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
                onClick={() => setPage((p) => p - 1)}
                aria-label="Trang trước"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className="icon-button"
                disabled={!list.data || page * 20 >= list.data.total}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Trang sau"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </Panel>
        {can(user, "products.create") && (
          <Panel
            title="Thêm sản phẩm"
            subtitle="Mã sản phẩm là duy nhất"
            action={<PackagePlus size={20} />}
          >
            <form className="order-form" onSubmit={submit}>
              <ErrorBox error={error} />
              <fieldset disabled={busy}>
                <label>
                  Mã sản phẩm
                  <input
                    name="sku"
                    required
                    maxLength={64}
                    pattern="[A-Za-z0-9._\-]+"
                    placeholder="Ví dụ: SP-001"
                  />
                </label>
                <label>
                  Tên sản phẩm
                  <input
                    name="name"
                    required
                    maxLength={200}
                    placeholder="Nhập tên sản phẩm"
                  />
                </label>
                <label>
                  Giá bán (VND)
                  <input
                    name="unit_price"
                    type="number"
                    min="0"
                    max="999999999999.99"
                    step="0.01"
                    required
                    placeholder="0"
                  />
                </label>
                <label>
                  Số lượng tồn kho ban đầu
                  <input
                    name="stock_quantity"
                    type="number"
                    min="0"
                    max="1000000000"
                    step="1"
                    required
                    defaultValue="0"
                  />
                </label>
                <label>
                  Mô tả
                  <textarea
                    name="description"
                    maxLength={1000}
                    placeholder="Ghi chú về sản phẩm…"
                  />
                </label>
              </fieldset>
              <button className="button primary wide" disabled={busy}>
                <Save size={16} />
                {busy ? "Đang lưu…" : "Thêm sản phẩm"}
              </button>
            </form>
          </Panel>
        )}
      </div>
    </>
  );
}
