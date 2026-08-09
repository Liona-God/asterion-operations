/** Shared domain contracts for Asterion Operations. */

export const roles = ["owner", "dispatcher", "technician", "viewer"] as const;
export type Role = (typeof roles)[number];

export const priorities = ["critical", "high", "normal", "low"] as const;
export type Priority = (typeof priorities)[number];

export const criticalities = ["safety", "production", "customer", "standard"] as const;
export type Criticality = (typeof criticalities)[number];

export const workOrderStatuses = [
  "draft",
  "scheduled",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
] as const;
export type WorkOrderStatus = (typeof workOrderStatuses)[number];

export type RiskBand = "on_track" | "at_risk" | "overdue";

export interface Actor {
  userId: string;
  displayName: string;
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  createdAt: string;
}

export interface Membership {
  organizationId: string;
  userId: string;
  displayName: string;
  role: Role;
  createdAt: string;
}

export interface Technician {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  skills: string[];
  dailyCapacityMinutes: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  location: string;
  criticality: Criticality;
  tags: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenancePlan {
  id: string;
  organizationId: string;
  assetId: string;
  title: string;
  description: string;
  frequencyDays: number;
  priority: Priority;
  requiredSkills: string[];
  estimatedMinutes: number;
  active: boolean;
  lastGeneratedFor: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrder {
  id: string;
  organizationId: string;
  assetId: string;
  maintenancePlanId: string | null;
  title: string;
  description: string;
  priority: Priority;
  requiredSkills: string[];
  estimatedMinutes: number;
  dueAt: string;
  status: WorkOrderStatus;
  risk: RiskBand;
  assignedTechnicianId: string | null;
  blockedReason: string | null;
  completedAt: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DispatchRecommendation {
  workOrderId: string;
  technicianId: string;
  score: number;
  rationale: string[];
  projectedLoadMinutes: number;
}

export interface AuditEvent {
  id: string;
  organizationId: string;
  actorId: string;
  entityType: "organization" | "asset" | "technician" | "maintenance_plan" | "work_order";
  entityId: string;
  action: string;
  data: Record<string, unknown>;
  occurredAt: string;
}

export interface OutboxEvent {
  id: string;
  organizationId: string;
  topic: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  publishedAt: string | null;
}

export interface WorkOrderView {
  workOrder: WorkOrder;
  asset: Asset;
  technician: Technician | null;
  audit: AuditEvent[];
}

export interface OperationsDashboard {
  totals: {
    open: number;
    inProgress: number;
    overdue: number;
    atRisk: number;
    unassigned: number;
    completedThisWeek: number;
  };
  byPriority: Record<Priority, number>;
  recentWorkOrders: WorkOrder[];
  capacity: Array<{
    technician: Technician;
    assignedMinutes: number;
    utilizationPercent: number;
  }>;
}

export function isRole(value: string): value is Role {
  return (roles as readonly string[]).includes(value);
}

export function isPriority(value: string): value is Priority {
  return (priorities as readonly string[]).includes(value);
}

export function isCriticality(value: string): value is Criticality {
  return (criticalities as readonly string[]).includes(value);
}
