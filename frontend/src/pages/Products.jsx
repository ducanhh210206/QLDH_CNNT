import { useState, useEffect } from "react";
import {
  PackagePlus,
  Search,
  ChevronLeft,
  ChevronRight,
  Save,
  Pencil,
  Trash2,
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
  Modal,
} from "../components/common";
import { can } from "../utils/permissions";
export default function Products({ user, notify }) {
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(null),
    [editBusy, setEditBusy] = useState(false),
    [editError, setEditError] = useState(""),
    [deleting, setDeleting] = useState(null),
    [deleteBusy, setDeleteBusy] = useState(false),
    [deleteError, setDeleteError] = useState(""),
    [pageError, setPageError] = useState("");
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
  function openEditor(item) {
    setEditError("");
    setPageError("");
    setEditing({ ...item, stock_quantity: Number(item.stock_quantity) });
  }
  async function deleteProduct(e) {
    e.preventDefault();
    if (deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await api("/api/products/" + deleting.id, {
        method: "DELETE",
        body: JSON.stringify({ version: deleting.version }),
      });
      setDeleting(null);
      if (list.data.data.length === 1 && page > 1) setPage(page - 1);
      else list.reload();
      notify("Đã xoá sản phẩm " + deleting.sku + ".");
    } catch (e) {
      setDeleteError(e.uncertain
        ? "Chưa xác định kết quả xoá. Đóng cửa sổ và làm mới danh mục để kiểm tra."
        : e.message);
      list.reload();
    } finally {
      setDeleteBusy(false);
    }
  }
  async function saveEdit(e) {
    e.preventDefault();
    if (editBusy) return;
    setEditBusy(true);
    setEditError("");
    try {
      await api("/api/products/" + editing.id, {
        method: "PATCH",
        body: JSON.stringify({
          name: editing.name,
          unit_price: editing.unit_price,
          stock_quantity: Number(editing.stock_quantity),
          version: editing.version,
        }),
      });
      setEditing(null);
      list.reload();
      notify("Đã cập nhật tên, giá bán và số lượng sản phẩm.");
    } catch (e) {
      if (e.status === 409) {
        setEditing(null);
        setPageError(e.message);
        list.reload();
      } else
        setEditError(
          e.uncertain
            ? "Chưa xác định kết quả lưu. Đóng cửa sổ, làm mới danh mục và kiểm tra trước khi sửa lại."
            : e.message,
        );
    } finally {
      setEditBusy(false);
    }
  }
  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError("");
    try {
      const created = await api("/api/products", {
        method: "POST",
        body: JSON.stringify({
          ...body,
          stock_quantity: Number(body.stock_quantity),
        }),
      });
      form.reset();
      list.reload();
      notify("Đã thêm sản phẩm " + created.sku + " vào danh mục.");
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
          <ErrorBox error={pageError} retry={list.reload} />
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
                    {can(user, "products.create") && <th>THAO TÁC</th>}
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
                          <button
                            type="button"
                            className="button secondary"
                            onClick={() => openEditor(item)}
                            aria-label={"Sửa sản phẩm " + item.sku}
                          >
                            <Pencil size={15} />
                            Sửa
                          </button>
                          <button
                            type="button"
                            className="button danger"
                            onClick={() => { setDeleteError(""); setDeleting(item); }}
                            aria-label={"Xoá sản phẩm " + item.sku}
                          >
                            <Trash2 size={15} />
                            Xoá
                          </button>
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
            subtitle="Mã sản phẩm được tạo tự động khi lưu"
            action={<PackagePlus size={20} />}
          >
            <form className="order-form" onSubmit={submit}>
              <ErrorBox error={error} />
              <fieldset disabled={busy}>
                <p className="product-code-hint">
                  Mã sản phẩm: <strong>Tự động tạo</strong>
                </p>
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
                  Số lượng sản phẩm
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
      {editing && (
        <Modal
          title="Sửa sản phẩm"
          onClose={() => {
            if (!editBusy) setEditing(null);
          }}
        >
          <form className="order-form product-edit-form" onSubmit={saveEdit}>
            <p className="muted">Mã sản phẩm: {editing.sku}</p>
            <ErrorBox error={editError} />
            <fieldset disabled={editBusy}>
              <label>
                Tên sản phẩm
                <input
                  name="name"
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  required
                  maxLength={200}
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
                  value={editing.unit_price}
                  onChange={(e) =>
                    setEditing({ ...editing, unit_price: e.target.value })
                  }
                />
              </label>
              <label>
                Số lượng tồn kho
                <input
                  name="stock_quantity"
                  type="number"
                  min="0"
                  max="1000000000"
                  step="1"
                  required
                  value={editing.stock_quantity}
                  onChange={(e) =>
                    setEditing({ ...editing, stock_quantity: e.target.value })
                  }
                />
                <small>
                  Số lượng hiện có sau khi lưu, không cộng thêm vào tồn kho cũ.
                </small>
              </label>
            </fieldset>
            <div className="form-footer">
              <button
                type="button"
                className="button secondary"
                disabled={editBusy}
                onClick={() => setEditing(null)}
              >
                Hủy
              </button>
              <button className="button primary" disabled={editBusy}>
                <Save size={16} />
                {editBusy ? "Đang lưu…" : "Lưu thay đổi"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal title="Xoá sản phẩm" onClose={() => { if (!deleteBusy) setDeleting(null); }}>
          <form className="order-form product-edit-form" onSubmit={deleteProduct}>
            <p>Bạn muốn xoá <strong>{deleting.name}</strong> ({deleting.sku}) khỏi danh mục?</p>
            <p className="muted">Thao tác này không thể hoàn tác. Sản phẩm đã có trong đơn hàng sẽ không được xoá để giữ lịch sử giao dịch.</p>
            <ErrorBox error={deleteError} />
            <div className="form-footer">
              <button type="button" className="button secondary" disabled={deleteBusy} onClick={() => setDeleting(null)}>Huỷ</button>
              <button className="button danger" disabled={deleteBusy || !!deleteError}>
                <Trash2 size={16} />{deleteBusy ? "Đang xoá…" : "Xác nhận xoá"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
