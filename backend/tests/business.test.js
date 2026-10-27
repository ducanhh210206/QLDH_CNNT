import test from "node:test";
import assert from "node:assert/strict";
import {
  orderSchema,
  listParams,
  parse,
} from "../src/middlewares/validateOrder.js";
import { assertTransition } from "../src/repositories/orderRepository.js";
import { compareOrders, digest } from "../src/utils/integrity.js";
import { hashPassword, verifyPassword } from "../src/services/authService.js";
const valid = {
  customer_name: " Nguyễn An ",
  product_name: "Sản phẩm",
  quantity: 2,
  total_amount: "25000000.50",
};
test("order: trim, default Pending, preserve decimal", () => {
  const o = parse(orderSchema, valid);
  assert.equal(o.customer_name, "Nguyễn An");
  assert.equal(o.status, "Pending");
  assert.equal(o.total_amount, "25000000.50");
});
test("order: reject invalid business data", () => {
  for (const patch of [
    { quantity: 0 },
    { quantity: 1.5 },
    { total_amount: -1 },
    { total_amount: "1.001" },
    { total_amount: 1.001 },
    { customer_name: "  " },
    { status: "Other" },
    { total_amount: "1e3" },
    { total_amount: "1000000000000" },
  ])
    assert.throws(
      () => parse(orderSchema, { ...valid, ...patch }),
      (e) => e.status === 400,
    );
});
test("list: bounded pagination and whitelisted SQL ordering", () => {
  assert.throws(() => listParams({ sort: "desc; DELETE FROM orders" }));
  assert.throws(() => listParams({ limit: 10000 }));
  assert.equal(listParams({}).limit, 10);
});
test("status: enforce terminal states and optimistic version", () => {
  assert.doesNotThrow(() =>
    assertTransition({ status: "Pending", version: 1 }, "Completed", 1),
  );
  for (const old of ["Completed", "Cancelled"])
    assert.throws(
      () => assertTransition({ status: old, version: 1 }, "Pending", 1),
      (e) => e.code === "INVALID_TRANSITION",
    );
  assert.throws(
    () => assertTransition({ status: "Pending", version: 2 }, "Completed", 1),
    (e) => e.code === "VERSION_CONFLICT",
  );
});
test("integrity: equal counts do not hide changed, missing or substituted records", () => {
  const a = [
      { id: "a", status: "Pending", total_amount: "12.00" },
      { id: "b", status: "Completed" },
    ],
    b = [
      { id: "a", status: "Completed", total_amount: "12.00" },
      { id: "c", status: "Completed" },
    ];
  const r = compareOrders(a, b);
  assert.equal(r.test_result, "FAIL");
  assert.deepEqual(r.changed_orders, ["a"]);
  assert.deepEqual(r.missing_orders, ["b"]);
  assert.deepEqual(r.unexpected_orders, ["c"]);
  assert.equal(compareOrders(a, [...a].reverse()).test_result, "PASS");
  assert.equal(digest(a), digest([...a].reverse()));
  assert.equal(r.rpo, null);
});
test("password: salted hash and constant-time verification", async () => {
  const h = await hashPassword("a-strong-password");
  assert.ok(await verifyPassword("a-strong-password", h));
  assert.equal(await verifyPassword("wrong", h), false);
  assert.notEqual(await hashPassword("a-strong-password"), h);
});
