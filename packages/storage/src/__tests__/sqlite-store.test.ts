import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { OperationsService } from "@asterion/core";
import { SqliteOperationsStore } from "../index.js";

test("persists a complete operations snapshot across store restarts", () => {
  const directory = mkdtempSync(join(tmpdir(), "asterion-store-"));
  const path = join(directory, "state.db");
  try {
    const first = new SqliteOperationsStore(path);
    const service = new OperationsService(first, { now: () => new Date("2026-08-09T08:00:00.000Z") });
    const owner = { userId: "owner", displayName: "Owner" };
    const dispatcher = { userId: "dispatcher", displayName: "Dispatcher" };
    const organization = service.createOrganization({ slug: "durable-plant", name: "Durable Plant" }, owner);
    service.addMembership(organization.id, { userId: dispatcher.userId, displayName: dispatcher.displayName, role: "dispatcher" }, owner);
    const asset = service.createAsset(
      organization.id,
      { code: "MOTOR-5", name: "Motor 5", location: "Bay A", criticality: "production" },
      dispatcher,
    );
    service.createWorkOrder(
      organization.id,
      { assetId: asset.id, title: "Inspect motor", priority: "normal", estimatedMinutes: 45 },
      dispatcher,
    );
    first.close();

    const second = new SqliteOperationsStore(path);
    assert.equal(second.getOrganization(organization.id)?.slug, "durable-plant");
    assert.equal(second.listAssets(organization.id)[0]?.code, "MOTOR-5");
    assert.equal(second.listWorkOrders(organization.id).length, 1);
    assert.equal(second.listAudit(organization.id).length, 4);
    second.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
