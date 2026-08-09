import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryOperationsStore, OperationsService } from "@asterion/core";
import { createApp } from "../app.js";

const headers = (key: string): Record<string, string> => ({ "x-api-key": key });

test("exposes an authenticated operational workflow from asset intake to completion", async () => {
  const service = new OperationsService(new InMemoryOperationsStore(), { now: () => new Date("2026-08-09T08:00:00.000Z") });
  const app = createApp({ service, config: { workerToken: "worker-token" } });
  try {
    const created = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      headers: headers("dev-owner-key"),
      payload: { slug: "api-plant", name: "API Plant", timezone: "America/Santiago" },
    });
    assert.equal(created.statusCode, 201);
    const organizationId = (created.json() as { data: { id: string } }).data.id;

    for (const member of [
      { userId: "dispatcher-1", displayName: "Dispatcher", role: "dispatcher" },
      { userId: "technician-1", displayName: "Technician", role: "technician" },
      { userId: "viewer-1", displayName: "Viewer", role: "viewer" },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/organizations/" + organizationId + "/members",
        headers: headers("dev-owner-key"),
        payload: member,
      });
      assert.equal(response.statusCode, 201);
    }

    const assetResponse = await app.inject({
      method: "POST",
      url: "/v1/organizations/" + organizationId + "/assets",
      headers: headers("dev-dispatcher-key"),
      payload: { code: "FAN-10", name: "Extraction fan", location: "Roof", criticality: "production", tags: ["air"] },
    });
    const assetId = (assetResponse.json() as { data: { id: string } }).data.id;
    const technicianResponse = await app.inject({
      method: "POST",
      url: "/v1/organizations/" + organizationId + "/technicians",
      headers: headers("dev-dispatcher-key"),
      payload: { name: "Alex", email: "alex@example.test", skills: ["mechanical"], dailyCapacityMinutes: 480 },
    });
    const technicianId = (technicianResponse.json() as { data: { id: string } }).data.id;
    const workOrderResponse = await app.inject({
      method: "POST",
      url: "/v1/organizations/" + organizationId + "/work-orders",
      headers: headers("dev-dispatcher-key"),
      payload: { assetId, title: "Repair extraction fan", priority: "high", requiredSkills: ["mechanical"], estimatedMinutes: 90 },
    });
    assert.equal(workOrderResponse.statusCode, 201);
    const workOrder = (workOrderResponse.json() as { data: { id: string; version: number } }).data;

    const recommendation = await app.inject({
      method: "GET",
      url: "/v1/organizations/" + organizationId + "/work-orders/" + workOrder.id + "/recommendations",
      headers: headers("dev-dispatcher-key"),
    });
    assert.equal((recommendation.json() as { data: unknown[] }).data.length, 1);
    const dispatched = await app.inject({
      method: "POST",
      url: "/v1/organizations/" + organizationId + "/work-orders/" + workOrder.id + "/dispatch",
      headers: headers("dev-dispatcher-key"),
      payload: { technicianId, expectedVersion: workOrder.version },
    });
    assert.equal(dispatched.statusCode, 200);
    const started = await app.inject({
      method: "POST",
      url: "/v1/organizations/" + organizationId + "/work-orders/" + workOrder.id + "/start",
      headers: headers("dev-technician-key"),
    });
    assert.equal(started.json().data.status, "in_progress");
    const completed = await app.inject({
      method: "POST",
      url: "/v1/organizations/" + organizationId + "/work-orders/" + workOrder.id + "/complete",
      headers: headers("dev-technician-key"),
    });
    assert.equal(completed.json().data.status, "completed");

    const dashboard = await app.inject({
      method: "GET",
      url: "/v1/organizations/" + organizationId + "/dashboard",
      headers: headers("dev-viewer-key"),
    });
    assert.equal(dashboard.statusCode, 200);
    assert.equal(dashboard.json().data.totals.completedThisWeek, 1);

    const forbidden = await app.inject({ method: "GET", url: "/v1/organizations/" + organizationId + "/dashboard" });
    assert.equal(forbidden.statusCode, 403);
  } finally {
    await app.close();
  }
});

test("protects the internal planning endpoint with a separate worker token", async () => {
  const app = createApp({ service: new OperationsService(new InMemoryOperationsStore()), config: { workerToken: "worker-token" } });
  try {
    const response = await app.inject({ method: "POST", url: "/internal/planner/tick", payload: { organizationId: crypto.randomUUID() } });
    assert.equal(response.statusCode, 403);
  } finally {
    await app.close();
  }
});
