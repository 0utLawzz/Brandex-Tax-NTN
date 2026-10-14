import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCode,
  paymentState,
  balance,
  escapeHtml,
} from "../src/domain.js";
test("legacy Client Codes have one identity", () => {
  for (const c of ["X881", "x-881", "X 881", "X-0881"])
    assert.equal(normalizeCode(c), "X-881");
  assert.throws(() => normalizeCode("881"));
});
test("payment state does not depend on filing state", () => {
  assert.equal(paymentState(5000, 0), "Unpaid");
  assert.equal(paymentState(5000, 2000), "Part paid");
  assert.equal(paymentState(5000, 5000), "Paid");
  assert.equal(paymentState(0, 0), "Not charged");
  assert.equal(balance(5000, 2000), 3000);
});
test("client text cannot create HTML", () =>
  assert.equal(escapeHtml('<script>"&'), "&lt;script&gt;&quot;&amp;"));
