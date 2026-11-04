import test, { after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../src/config/database.js";
import { create } from "../src/repositories/productRepository.js";
import { productSchema } from "../src/services/productService.js";
import { parse } from "../src/middlewares/validateOrder.js";
after(() => pool.end());
const input = {
  name: "Sản phẩm tự sinh mã",
  unit_price: "123.45",
  stock_quantity: 3,
  description: "",
};
test("product SKU is optional in input and generated on the server; collisions retry safely", async (t) => {
  assert.equal(parse(productSchema, input).sku, undefined);
  const inserts = [];
  t.mock.method(pool, "execute", async (sql, args) => {
    if (sql.startsWith("INSERT")) {
      inserts.push(args);
      if (inserts.length === 1)
        throw Object.assign(new Error("collision"), { code: "ER_DUP_ENTRY" });
      return [{ affectedRows: 1 }];
    }
    const saved = inserts.at(-1);
    return [[{ id: saved[0], sku: saved[1], name: saved[2] }]];
  });
  const result = await create(
    { ...input, sku: "DO-NOT-USE-CLIENT-SKU" },
    "test-user",
  );
  assert.equal(inserts.length, 2);
  for (const row of inserts) {
    assert.match(row[1], /^SP-[A-F0-9]{12}$/);
    assert.notEqual(row[1], "DO-NOT-USE-CLIENT-SKU");
  }
  assert.notEqual(inserts[0][1], inserts[1][1]);
  assert.equal(result.sku, inserts[1][1]);
});
test("product SKU retries are bounded and ordinary database failures are not swallowed", async (t) => {
  let attempts = 0;
  const mock = t.mock.method(pool, "execute", async () => {
    attempts++;
    throw Object.assign(new Error("collision"), { code: "ER_DUP_ENTRY" });
  });
  await assert.rejects(
    () => create(input, "test-user"),
    (e) => e.code === "SKU_GENERATION_FAILED",
  );
  assert.equal(attempts, 5);
  mock.mock.mockImplementation(async () => {
    throw Object.assign(new Error("database offline"), {
      code: "ECONNREFUSED",
    });
  });
  await assert.rejects(
    () => create(input, "test-user"),
    (e) => e.code === "ECONNREFUSED",
  );
});
