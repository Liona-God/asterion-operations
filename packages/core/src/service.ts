import { randomUUID } from "node:crypto";
import type {
  Actor,
  Asset,
  AuditEvent,
  Criticality,
  MaintenancePlan,
  Membership,
  OperationsDashboard,
  Organization,
  OutboxEvent,
  Priority,
  RiskBand,
  Role,
  Technician,
  WorkOrder,
  WorkOrderStatus,
  WorkOrderView,
} from "@asterion/contracts";
import { DomainError } from "./errors.js";
import type { OperationsStore } from "./store.js";

export interface Clock {
  now(): Date;
}

const systemClock: Clock = { now: () => new Date() };
const terminalStatuses = new Set<WorkOrderStatus>(["completed", "cancelled"]);

function at(clock: Clock): string {
  return clock.now().toISOString();
}

function requireText(value: string, label: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new DomainError("validation", label + " must be between 1 and " + maximum + " characters");
  }
  return normalized;
}

function normalizedList(values: string[], label: string, maximum: number): string[] {
  if (!Array.isArray(values) || values.length > maximum) {
    throw new DomainError("validation", label + " must contain at most " + maximum + " items");
  }
  const result = [...new Set(values.map((value) => requireText(value, label + " item", 60).toLowerCase()))];
  return result.sort();
}

function priorityDueHours(priority: Priority): number {
  return priority === "critical" ? 4 : priority === "high" ? 24 : priority === "normal" ? 72 : 168;
}

function riskWindowHours(priority: Priority): number {
  return priority === "critical" ? 2 : priority === "high" ? 8 : priority === "normal" ? 24 : 48;
}

function addHours(value: Date, hours: number): string {
  return new Date(value.getTime() + hours * 3_600_000).toISOString();
}

function addDays(value: string, days: number): string {
  const date = new Date(value + "T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function day(value: string): string {
  return value.slice(0, 10);
}

function roleRank(role: Role): number {
  return role === "owner" ? 4 : role === "dispatcher" ? 3 : role === "technician" ? 2 : 1;
}

function matchesSkills(technician: Technician, requiredSkills: string[]): boolean {
  const available = new Set(technician.skills);
  return requiredSkills.every((skill) => available.has(skill));
}

function calculateRisk(workOrder: WorkOrder, now: Date): RiskBand {
  if (terminalStatuses.has(workOrder.status)) {
    return "on_track";
  }
  const remainingHours = (new Date(workOrder.dueAt).getTime() - now.getTime()) / 3_600_000;
  if (remainingHours <= 0) {
    return "overdue";
  }
  return remainingHours <= riskWindowHours(workOrder.priority) ? "at_risk" : "on_track";
}

function validTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  const transitions: Record<WorkOrderStatus, WorkOrderStatus[]> = {
    draft: ["scheduled", "cancelled"],
    scheduled: ["in_progress", "blocked", "cancelled"],
    in_progress: ["blocked", "completed"],
    blocked: ["scheduled", "cancelled"],
    completed: [],
    cancelled: [],
  };
  return transitions[from].includes(to);
}

export class OperationsService {
  public constructor(
    private readonly store: OperationsStore,
    private readonly clock: Clock = systemClock,
  ) {}

  public createOrganization(
    input: { slug: string; name: string; timezone?: string },
    actor: Actor,
  ): Organization {
    const slug = input.slug.trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]{2,47}$/.test(slug)) {
      throw new DomainError("validation", "Organization slug must contain 3-48 lowercase letters, digits, or hyphens");
    }
    if (this.store.findOrganizationBySlug(slug)) {
      throw new DomainError("conflict", "Organization slug is already in use");
    }
    const now = at(this.clock);
    const organization: Organization = {
      id: randomUUID(),
      slug,
      name: requireText(input.name, "Organization name", 120),
      timezone: requireText(input.timezone || "UTC", "Timezone", 80),
      createdAt: now,
    };
    this.store.createOrganization(organization);
    this.store.upsertMembership({
      organizationId: organization.id,
      userId: actor.userId,
      displayName: requireText(actor.displayName, "Actor name", 120),
      role: "owner",
      createdAt: now,
    });
    this.audit(organization.id, actor.userId, "organization", organization.id, "organization.created", { slug });
    return organization;
  }

  public addMembership(
    organizationId: string,
    input: { userId: string; displayName: string; role: Role },
    actor: Actor,
  ): Membership {
    this.requireRole(organizationId, actor, "owner");
    const membership: Membership = {
      organizationId,
      userId: requireText(input.userId, "Member userId", 120),
      displayName: requireText(input.displayName, "Member name", 120),
      role: input.role,
      createdAt: at(this.clock),
    };
    this.store.upsertMembership(membership);
    this.audit(organizationId, actor.userId, "organization", organizationId, "membership.upserted", {
      userId: membership.userId,
      role: membership.role,
    });
    return membership;
  }

  public createTechnician(
    organizationId: string,
    input: { name: string; email: string; skills: string[]; dailyCapacityMinutes: number },
    actor: Actor,
  ): Technician {
    this.requireRole(organizationId, actor, "dispatcher");
    const capacity = input.dailyCapacityMinutes;
    if (!Number.isInteger(capacity) || capacity < 60 || capacity > 1_440) {
      throw new DomainError("validation", "dailyCapacityMinutes must be an integer from 60 to 1440");
    }
    const now = at(this.clock);
    const technician: Technician = {
      id: randomUUID(),
      organizationId,
      name: requireText(input.name, "Technician name", 120),
      email: requireText(input.email, "Technician email", 200).toLowerCase(),
      skills: normalizedList(input.skills, "Skills", 40),
      dailyCapacityMinutes: capacity,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    this.store.createTechnician(technician);
    this.audit(organizationId, actor.userId, "technician", technician.id, "technician.created", {
      skills: technician.skills,
    });
    return technician;
  }

  public createAsset(
    organizationId: string,
    input: { code: string; name: string; location: string; criticality: Criticality; tags?: string[] },
    actor: Actor,
  ): Asset {
    this.requireRole(organizationId, actor, "dispatcher");
    const code = requireText(input.code, "Asset code", 60).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{1,59}$/.test(code)) {
      throw new DomainError("validation", "Asset code may contain uppercase letters, digits, and hyphens");
    }
    if (this.store.findAssetByCode(organizationId, code)) {
      throw new DomainError("conflict", "Asset code is already in use");
    }
    const now = at(this.clock);
    const asset: Asset = {
      id: randomUUID(),
      organizationId,
      code,
      name: requireText(input.name, "Asset name", 160),
      location: requireText(input.location, "Asset location", 200),
      criticality: input.criticality,
      tags: normalizedList(input.tags || [], "Tags", 20),
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    this.store.createAsset(asset);
    this.audit(organizationId, actor.userId, "asset", asset.id, "asset.created", { code });
    return asset;
  }

  public createMaintenancePlan(
    organizationId: string,
    input: {
      assetId: string;
      title: string;
      description?: string;
      frequencyDays: number;
      priority: Priority;
      requiredSkills?: string[];
      estimatedMinutes: number;
    },
    actor: Actor,
  ): MaintenancePlan {
    this.requireRole(organizationId, actor, "dispatcher");
    this.requireAsset(organizationId, input.assetId);
    if (!Number.isInteger(input.frequencyDays) || input.frequencyDays < 1 || input.frequencyDays > 730) {
      throw new DomainError("validation", "frequencyDays must be an integer from 1 to 730");
    }
    this.requireDuration(input.estimatedMinutes);
    const now = at(this.clock);
    const plan: MaintenancePlan = {
      id: randomUUID(),
      organizationId,
      assetId: input.assetId,
      title: requireText(input.title, "Plan title", 160),
      description: (input.description || "").trim().slice(0, 2_000),
      frequencyDays: input.frequencyDays,
      priority: input.priority,
      requiredSkills: normalizedList(input.requiredSkills || [], "Required skills", 20),
      estimatedMinutes: input.estimatedMinutes,
      active: true,
      lastGeneratedFor: null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.createMaintenancePlan(plan);
    this.audit(organizationId, actor.userId, "maintenance_plan", plan.id, "maintenance_plan.created", {
      assetId: plan.assetId,
      frequencyDays: plan.frequencyDays,
    });
    return plan;
  }

  public createWorkOrder(
    organizationId: string,
    input: {
      assetId: string;
      title: string;
      description?: string;
      priority: Priority;
      requiredSkills?: string[];
      estimatedMinutes: number;
      dueAt?: string;
      assignedTechnicianId?: string;
    },
    actor: Actor,
  ): WorkOrder {
    this.requireRole(organizationId, actor, "dispatcher");
    this.requireAsset(organizationId, input.assetId);
    this.requireDuration(input.estimatedMinutes);
    const now = this.clock.now();
    const dueAt = input.dueAt ? this.requireFutureDate(input.dueAt) : addHours(now, priorityDueHours(input.priority));
    const requiredSkills = normalizedList(input.requiredSkills || [], "Required skills", 20);
    let assignedTechnicianId: string | null = null;
    let status: WorkOrderStatus = "draft";
    if (input.assignedTechnicianId) {
      const technician = this.requireTechnician(organizationId, input.assignedTechnicianId);
      this.requireEligible(technician, requiredSkills);
      assignedTechnicianId = technician.id;
      status = "scheduled";
    }
    const timestamp = now.toISOString();
    const provisional: WorkOrder = {
      id: randomUUID(),
      organizationId,
      assetId: input.assetId,
      maintenancePlanId: null,
      title: requireText(input.title, "Work order title", 180),
      description: (input.description || "").trim().slice(0, 4_000),
      priority: input.priority,
      requiredSkills,
      estimatedMinutes: input.estimatedMinutes,
      dueAt,
      status,
      risk: "on_track",
      assignedTechnicianId,
      blockedReason: null,
      completedAt: null,
      version: 1,
      createdBy: actor.userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const workOrder = { ...provisional, risk: calculateRisk(provisional, now) };
    this.store.createWorkOrder(workOrder);
    this.audit(organizationId, actor.userId, "work_order", workOrder.id, "work_order.created", {
      assetId: workOrder.assetId,
      priority: workOrder.priority,
      assignedTechnicianId,
    });
    this.outbox(organizationId, "work_order.created", workOrder.id, { workOrderId: workOrder.id });
    return workOrder;
  }

  public recommendDispatch(organizationId: string, workOrderId: string, actor: Actor): Array<{
    technician: Technician;
    score: number;
    projectedLoadMinutes: number;
    rationale: string[];
  }> {
    this.requireRole(organizationId, actor, "dispatcher");
    const workOrder = this.requireWorkOrder(organizationId, workOrderId);
    if (terminalStatuses.has(workOrder.status)) {
      throw new DomainError("invalid_state", "Completed or cancelled work orders cannot be dispatched");
    }
    const activeOrders = this.store
      .listWorkOrders(organizationId)
      .filter((order) => !terminalStatuses.has(order.status) && order.assignedTechnicianId);
    return this.store
      .listTechnicians(organizationId)
      .filter((technician) => technician.active && matchesSkills(technician, workOrder.requiredSkills))
      .map((technician) => {
        const assignedMinutes = activeOrders
          .filter((order) => order.assignedTechnicianId === technician.id)
          .reduce((total, order) => total + order.estimatedMinutes, 0);
        const projectedLoadMinutes = assignedMinutes + workOrder.estimatedMinutes;
        const utilization = projectedLoadMinutes / technician.dailyCapacityMinutes;
        const extraSkills = technician.skills.filter((skill) => !workOrder.requiredSkills.includes(skill)).length;
        const score = Math.round(160 - utilization * 80 + Math.min(extraSkills, 8) * 2);
        const rationale = [
          "Matches all required skills",
          "Projected utilization " + Math.round(utilization * 100) + "%",
        ];
        if (utilization > 1) rationale.push("Projected capacity exceeds daily target");
        if (workOrder.priority === "critical") rationale.push("Prioritized for critical response");
        return { technician, score, projectedLoadMinutes, rationale };
      })
      .sort((left, right) => right.score - left.score || left.technician.name.localeCompare(right.technician.name));
  }

  public dispatchWorkOrder(
    organizationId: string,
    workOrderId: string,
    input: { technicianId: string; expectedVersion: number },
    actor: Actor,
  ): WorkOrder {
    this.requireRole(organizationId, actor, "dispatcher");
    const workOrder = this.requireWorkOrder(organizationId, workOrderId);
    if (workOrder.version !== input.expectedVersion) {
      throw new DomainError("conflict", "Work order changed; refresh before dispatching");
    }
    if (!["draft", "scheduled", "blocked"].includes(workOrder.status)) {
      throw new DomainError("invalid_state", "Only draft, scheduled, or blocked work orders can be dispatched");
    }
    const technician = this.requireTechnician(organizationId, input.technicianId);
    this.requireEligible(technician, workOrder.requiredSkills);
    const now = at(this.clock);
    const updated: WorkOrder = {
      ...workOrder,
      assignedTechnicianId: technician.id,
      status: "scheduled",
      blockedReason: null,
      risk: calculateRisk(workOrder, this.clock.now()),
      version: workOrder.version + 1,
      updatedAt: now,
    };
    this.store.saveWorkOrder(updated);
    this.audit(organizationId, actor.userId, "work_order", updated.id, "work_order.dispatched", {
      technicianId: technician.id,
      version: updated.version,
    });
    this.outbox(organizationId, "work_order.dispatched", updated.id, {
      workOrderId: updated.id,
      technicianId: technician.id,
    });
    return updated;
  }

  public startWorkOrder(organizationId: string, workOrderId: string, actor: Actor): WorkOrder {
    this.requireRole(organizationId, actor, "technician");
    const workOrder = this.requireWorkOrder(organizationId, workOrderId);
    if (!workOrder.assignedTechnicianId) {
      throw new DomainError("invalid_state", "A work order must be assigned before it can start");
    }
    return this.transition(organizationId, workOrder, "in_progress", actor, {});
  }

  public blockWorkOrder(
    organizationId: string,
    workOrderId: string,
    reason: string,
    actor: Actor,
  ): WorkOrder {
    this.requireRole(organizationId, actor, "technician");
    const workOrder = this.requireWorkOrder(organizationId, workOrderId);
    return this.transition(organizationId, workOrder, "blocked", actor, {
      blockedReason: requireText(reason, "Block reason", 500),
    });
  }

  public completeWorkOrder(organizationId: string, workOrderId: string, actor: Actor): WorkOrder {
    this.requireRole(organizationId, actor, "technician");
    const workOrder = this.requireWorkOrder(organizationId, workOrderId);
    return this.transition(organizationId, workOrder, "completed", actor, {
      completedAt: at(this.clock),
    });
  }

  public cancelWorkOrder(organizationId: string, workOrderId: string, actor: Actor): WorkOrder {
    this.requireRole(organizationId, actor, "dispatcher");
    return this.transition(organizationId, this.requireWorkOrder(organizationId, workOrderId), "cancelled", actor, {});
  }

  public getWorkOrder(organizationId: string, workOrderId: string, actor: Actor): WorkOrderView {
    this.requireRole(organizationId, actor, "viewer");
    const workOrder = this.requireWorkOrder(organizationId, workOrderId);
    return {
      workOrder,
      asset: this.requireAsset(organizationId, workOrder.assetId),
      technician: workOrder.assignedTechnicianId
        ? this.requireTechnician(organizationId, workOrder.assignedTechnicianId)
        : null,
      audit: this.store.listAudit(organizationId, workOrderId),
    };
  }

  public listWorkOrders(organizationId: string, actor: Actor): WorkOrder[] {
    this.requireRole(organizationId, actor, "viewer");
    return this.store
      .listWorkOrders(organizationId)
      .sort((left, right) => left.dueAt.localeCompare(right.dueAt) || right.priority.localeCompare(left.priority));
  }

  public listAssets(organizationId: string, actor: Actor): Asset[] {
    this.requireRole(organizationId, actor, "viewer");
    return this.store.listAssets(organizationId).sort((left, right) => left.code.localeCompare(right.code));
  }

  public listTechnicians(organizationId: string, actor: Actor): Technician[] {
    this.requireRole(organizationId, actor, "viewer");
    return this.store.listTechnicians(organizationId).sort((left, right) => left.name.localeCompare(right.name));
  }

  public dashboard(organizationId: string, actor: Actor): OperationsDashboard {
    this.requireRole(organizationId, actor, "viewer");
    const orders = this.store.listWorkOrders(organizationId);
    const open = orders.filter((order) => !terminalStatuses.has(order.status));
    const weekAgo = this.clock.now().getTime() - 7 * 24 * 3_600_000;
    const byPriority: Record<Priority, number> = { critical: 0, high: 0, normal: 0, low: 0 };
    for (const workOrder of open) byPriority[workOrder.priority] += 1;
    const capacity = this.store.listTechnicians(organizationId).map((technician) => {
      const assignedMinutes = open
        .filter((order) => order.assignedTechnicianId === technician.id)
        .reduce((total, order) => total + order.estimatedMinutes, 0);
      return {
        technician,
        assignedMinutes,
        utilizationPercent: Math.round((assignedMinutes / technician.dailyCapacityMinutes) * 100),
      };
    });
    return {
      totals: {
        open: open.length,
        inProgress: open.filter((order) => order.status === "in_progress").length,
        overdue: open.filter((order) => order.risk === "overdue").length,
        atRisk: open.filter((order) => order.risk === "at_risk").length,
        unassigned: open.filter((order) => !order.assignedTechnicianId).length,
        completedThisWeek: orders.filter(
          (order) => order.completedAt && new Date(order.completedAt).getTime() >= weekAgo,
        ).length,
      },
      byPriority,
      recentWorkOrders: [...orders]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 12),
      capacity: capacity.sort((left, right) => right.utilizationPercent - left.utilizationPercent),
    };
  }

  public runPlanningCycle(organizationId: string): { generated: number; riskUpdated: number } {
    this.requireOrganization(organizationId);
    const today = day(at(this.clock));
    let generated = 0;
    for (const plan of this.store.listMaintenancePlans(organizationId).filter((candidate) => candidate.active)) {
      const due = !plan.lastGeneratedFor || addDays(plan.lastGeneratedFor, plan.frequencyDays) <= today;
      if (!due) continue;
      const timestamp = at(this.clock);
      const provisional: WorkOrder = {
        id: randomUUID(),
        organizationId,
        assetId: plan.assetId,
        maintenancePlanId: plan.id,
        title: "Preventive: " + plan.title,
        description: plan.description,
        priority: plan.priority,
        requiredSkills: plan.requiredSkills,
        estimatedMinutes: plan.estimatedMinutes,
        dueAt: addHours(this.clock.now(), priorityDueHours(plan.priority)),
        status: "draft",
        risk: "on_track",
        assignedTechnicianId: null,
        blockedReason: null,
        completedAt: null,
        version: 1,
        createdBy: "system",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const workOrder = { ...provisional, risk: calculateRisk(provisional, this.clock.now()) };
      this.store.createWorkOrder(workOrder);
      this.store.saveMaintenancePlan({ ...plan, lastGeneratedFor: today, updatedAt: timestamp });
      this.audit(organizationId, "system", "work_order", workOrder.id, "work_order.generated", {
        maintenancePlanId: plan.id,
      });
      this.outbox(organizationId, "work_order.generated", workOrder.id, { workOrderId: workOrder.id });
      generated += 1;
    }
    let riskUpdated = 0;
    for (const workOrder of this.store.listWorkOrders(organizationId)) {
      const risk = calculateRisk(workOrder, this.clock.now());
      if (risk === workOrder.risk) continue;
      const updated = { ...workOrder, risk, version: workOrder.version + 1, updatedAt: at(this.clock) };
      this.store.saveWorkOrder(updated);
      this.audit(organizationId, "system", "work_order", updated.id, "work_order.risk_changed", { risk });
      this.outbox(organizationId, "work_order.risk_changed", updated.id, { workOrderId: updated.id, risk });
      riskUpdated += 1;
    }
    return { generated, riskUpdated };
  }

  private transition(
    organizationId: string,
    workOrder: WorkOrder,
    status: WorkOrderStatus,
    actor: Actor,
    changes: Partial<Pick<WorkOrder, "blockedReason" | "completedAt">>,
  ): WorkOrder {
    if (!validTransition(workOrder.status, status)) {
      throw new DomainError("invalid_state", "Cannot transition " + workOrder.status + " to " + status);
    }
    const timestamp = at(this.clock);
    const updated: WorkOrder = {
      ...workOrder,
      ...changes,
      status,
      risk: status === "completed" || status === "cancelled" ? "on_track" : calculateRisk(workOrder, this.clock.now()),
      version: workOrder.version + 1,
      updatedAt: timestamp,
    };
    this.store.saveWorkOrder(updated);
    this.audit(organizationId, actor.userId, "work_order", updated.id, "work_order." + status, {});
    this.outbox(organizationId, "work_order." + status, updated.id, { workOrderId: updated.id });
    return updated;
  }

  private requireRole(organizationId: string, actor: Actor, minimum: Role): Membership {
    this.requireOrganization(organizationId);
    const membership = this.store.getMembership(organizationId, actor.userId);
    if (!membership || roleRank(membership.role) < roleRank(minimum)) {
      throw new DomainError("forbidden", "This role cannot perform the requested operation");
    }
    return membership;
  }

  private requireOrganization(organizationId: string): Organization {
    const organization = this.store.getOrganization(organizationId);
    if (!organization) throw new DomainError("not_found", "Organization was not found");
    return organization;
  }

  private requireAsset(organizationId: string, assetId: string): Asset {
    const asset = this.store.getAsset(organizationId, assetId);
    if (!asset) throw new DomainError("not_found", "Asset was not found");
    return asset;
  }

  private requireTechnician(organizationId: string, technicianId: string): Technician {
    const technician = this.store.getTechnician(organizationId, technicianId);
    if (!technician) throw new DomainError("not_found", "Technician was not found");
    if (!technician.active) throw new DomainError("invalid_state", "Technician is inactive");
    return technician;
  }

  private requireWorkOrder(organizationId: string, workOrderId: string): WorkOrder {
    const workOrder = this.store.getWorkOrder(organizationId, workOrderId);
    if (!workOrder) throw new DomainError("not_found", "Work order was not found");
    return workOrder;
  }

  private requireEligible(technician: Technician, requiredSkills: string[]): void {
    if (!matchesSkills(technician, requiredSkills)) {
      throw new DomainError("validation", "Technician is missing required skills");
    }
  }

  private requireDuration(minutes: number): void {
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > 1_440) {
      throw new DomainError("validation", "estimatedMinutes must be an integer from 15 to 1440");
    }
  }

  private requireFutureDate(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= this.clock.now().getTime()) {
      throw new DomainError("validation", "dueAt must be a valid future ISO timestamp");
    }
    return parsed.toISOString();
  }

  private audit(
    organizationId: string,
    actorId: string,
    entityType: AuditEvent["entityType"],
    entityId: string,
    action: string,
    data: Record<string, unknown>,
  ): void {
    this.store.appendAudit({
      id: randomUUID(),
      organizationId,
      actorId,
      entityType,
      entityId,
      action,
      data: structuredClone(data),
      occurredAt: at(this.clock),
    });
  }

  private outbox(
    organizationId: string,
    topic: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ): void {
    this.store.appendOutbox({
      id: randomUUID(),
      organizationId,
      topic,
      aggregateId,
      payload: structuredClone(payload),
      occurredAt: at(this.clock),
      publishedAt: null,
    });
  }
}
