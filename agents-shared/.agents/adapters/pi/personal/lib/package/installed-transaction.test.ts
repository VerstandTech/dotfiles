import { describe, expect, test } from "bun:test";
import { createInstalledTransactionFromReadyV1, planAuthorizedDisableV1, planAuthorizedRollbackV1 } from "./canonical-plan";

describe("PKG-01 installed transaction authority", () => {
  test("structural copies cannot authorize lifecycle actions", () => {
    expect(() => createInstalledTransactionFromReadyV1({ status: "ready" }, "tx-1")).toThrow("apply-evidence-required");
    expect(planAuthorizedDisableV1({ transactionId: "tx-1" })).toEqual({ ok: false, status: "blocked", code: "apply-evidence-required" });
    expect(planAuthorizedRollbackV1({ transactionId: "tx-1" })).toEqual({ ok: false, status: "blocked", code: "apply-evidence-required" });
  });
});
