import assert from "node:assert/strict";
import test from "node:test";
import type { Actor } from "@asterion/contracts";
import { DomainError, InMemoryOperationsStore, OperationsService, type Clock } from "../index.js";

class MutableClock implements Clock {
  public constructor(private value: Date) {}

  public now(): Date {
    return new Date(this.value);
  }

  public advanceHours(hours: number): void {
    this.value = new Date(this.value.getTime() + hours * 3_600_000);
  }

  public advanceDays(days: number): void {
    this.advanceHours(days * 24);
  }
}

const owner: Actor = { userId: "owner", displayName: "Marta Owner" };
const dispatcher: Actor = { userId: "dispatcher", displayName: "Diego Dispatch" };
const technicianActor: Actor = { userId: "technician", displayName: "Tania Technician" };

function setup(): {
  service: OperationsService;
  clock: MutableClock;
  organizationId: string;
} {
  const clock = new MutableClock(new Date("2026-08-09T08:00:00.000Z"));
  const service = new OperationsService(new InMemoryOperationsStore(), clock);
  const organization = service.createOrganization({ slug: "north-plant", name: "North Plant" }, owner);
  service.addMembership(organization.id, { userId: dispatcher.userId, displayName: dispatcher.displayName, role: "dispatcher" }, owner);
  service.addMembership(organization.id, { userId: technicianActor.userId, displayName: technicianActor.displayName, role: "technician" }, owner);
  return { service, clock, organizationId: organization.id };
}

test("dispatches a skilled technician with optimistic concurrency and records audit events", () => {
  const { service, organizationId } = setup();
  const asset = service.createAsset(
    organizationId,
    { code: "PUMP-17", name: "Process water pump", location: "Line 2", criticality: "production", tags: ["water"] },
    dispatcher,
  );
  const qualified = service.createTechnician(
    organizationId,
    { name: "Alex Rivera", email: "alex@example.test", skills: ["mechanical", "electrical"], dailyCapacityMinutes: 480 },
    dispatcher,
  );
  service.createTechnician(
    organizationId,
    { name: "Nora Diaz", email: "nora@example.test", skills: ["electrical"], dailyCapacityMinutes: 480 },
    dispatcher,
  );
  const workOrder = service.createWorkOrder(
    organizationId,
    {
      assetId: asset.id,
      title: "Inspect vibration anomaly",
      priority: "high",
      requiredSkills: ["mechanical"],
      estimatedMinutes: 90,
    },
    dispatcher,
  );

  const recommendations = service.recommendDispatch(organizationId, workOrder.id, dispatcher);
  assert.equal(recommendations.length, 1);
  assert.equal(recommendations[0]?.technician.id, qualified.id);

  const scheduled = service.dispatchWorkOrder(
    organizationId,
    workOrder.id,
    { technicianId: qualified.id, expectedVersion: 1 },
    dispatcher,
  );
  assert.equal(scheduled.status, "scheduled");
  assert.equal(scheduled.version, 2);
  assert.throws(
    () => service.dispatchWorkOrder(organizationId, workOrder.id, { technicianId: qualified.id, expectedVersion: 1 }, dispatcher),
    (error: unknown) => error instanceof DomainError && error.code === "conflict",
  );

  const started = service.startWorkOrder(organizationId, workOrder.id, technicianActor);
  const completed = service.completeWorkOrder(organizationId, started.id, technicianActor);
  assert.equal(completed.status, "completed");
  assert.ok(completed.completedAt);
  assert.equal(service.getWorkOrder(organizationId, workOrder.id, owner).audit.length, 4);
});

test("generates preventive work only once per cadence and recalculates risk", () => {
  const { service, clock, organizationId } = setup();
  const asset = service.createAsset(
    organizationId,
    { code: "BOILER-3", name: "Steam boiler", location: "Utility room", criticality: "safety" },
    dispatcher,
  );
  service.createMaintenancePlan(
    organizationId,
    {
      assetId: asset.id,
      title: "Weekly safety inspection",
      frequencyDays: 7,
      priority: "critical",
      requiredSkills: ["mechanical"],
      estimatedMinutes: 120,
    },
    dispatcher,
  );
  const manual = service.createWorkOrder(
    organizationId,
    {
      assetId: asset.id,
      title: "Immediate pressure audit",
      priority: "critical",
      estimatedMinutes: 30,
      dueAt: "2026-08-09T09:00:00.000Z",
    },
    dispatcher,
  );

  assert.deepEqual(service.runPlanningCycle(organizationId), { generated: 1, riskUpdated: 0 });
  assert.deepEqual(service.runPlanningCycle(organizationId), { generated: 0, riskUpdated: 0 });
  clock.advanceHours(2);
  assert.deepEqual(service.runPlanningCycle(organizationId), { generated: 0, riskUpdated: 2 });
  assert.equal(service.getWorkOrder(organizationId, manual.id, owner).workOrder.risk, "overdue");
  clock.advanceDays(7);
  assert.equal(service.runPlanningCycle(organizationId).generated, 1);
});

test("enforces role boundaries and rejects duplicated assets", () => {
  const { service, organizationId } = setup();
  const viewer: Actor = { userId: "viewer", displayName: "Vera Viewer" };
  service.addMembership(organizationId, { userId: viewer.userId, displayName: viewer.displayName, role: "viewer" }, owner);
  assert.throws(
    () => service.createAsset(organizationId, { code: "CHILLER-1", name: "Chiller", location: "Roof", criticality: "standard" }, viewer),
    (error: unknown) => error instanceof DomainError && error.code === "forbidden",
  );
  service.createAsset(
    organizationId,
    { code: "CHILLER-1", name: "Chiller", location: "Roof", criticality: "standard" },
    dispatcher,
  );
  assert.throws(
    () => service.createAsset(organizationId, { code: "chiller-1", name: "Second", location: "Roof", criticality: "standard" }, dispatcher),
    (error: unknown) => error instanceof DomainError && error.code === "conflict",
  );
});
