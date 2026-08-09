import type { OperationsDashboard } from "@asterion/contracts";

const now = "2026-08-09T08:00:00.000Z";

export const demoDashboard: OperationsDashboard = {
  totals: { open: 18, inProgress: 5, overdue: 2, atRisk: 4, unassigned: 3, completedThisWeek: 26 },
  byPriority: { critical: 2, high: 5, normal: 8, low: 3 },
  recentWorkOrders: [
    {
      id: "demo-1", organizationId: "demo", assetId: "asset-1", maintenancePlanId: null, title: "Pressure instability on boiler B-3", description: "", priority: "critical", requiredSkills: ["mechanical"], estimatedMinutes: 120, dueAt: "2026-08-09T09:10:00.000Z", status: "scheduled", risk: "at_risk", assignedTechnicianId: "tech-1", blockedReason: null, completedAt: null, version: 3, createdBy: "dispatcher", createdAt: now, updatedAt: "2026-08-09T07:54:00.000Z",
    },
    {
      id: "demo-2", organizationId: "demo", assetId: "asset-2", maintenancePlanId: null, title: "Replace extraction fan belt", description: "", priority: "high", requiredSkills: ["mechanical"], estimatedMinutes: 75, dueAt: "2026-08-09T12:00:00.000Z", status: "in_progress", risk: "on_track", assignedTechnicianId: "tech-2", blockedReason: null, completedAt: null, version: 2, createdBy: "dispatcher", createdAt: now, updatedAt: "2026-08-09T07:30:00.000Z",
    },
    {
      id: "demo-3", organizationId: "demo", assetId: "asset-3", maintenancePlanId: null, title: "Safety inspection: line 4 conveyor", description: "", priority: "high", requiredSkills: ["electrical"], estimatedMinutes: 90, dueAt: "2026-08-09T10:30:00.000Z", status: "draft", risk: "overdue", assignedTechnicianId: null, blockedReason: null, completedAt: null, version: 1, createdBy: "dispatcher", createdAt: now, updatedAt: "2026-08-09T07:12:00.000Z",
    },
    {
      id: "demo-4", organizationId: "demo", assetId: "asset-4", maintenancePlanId: null, title: "Calibrate cold-room probe", description: "", priority: "normal", requiredSkills: ["instrumentation"], estimatedMinutes: 45, dueAt: "2026-08-10T15:00:00.000Z", status: "scheduled", risk: "on_track", assignedTechnicianId: "tech-3", blockedReason: null, completedAt: null, version: 2, createdBy: "dispatcher", createdAt: now, updatedAt: "2026-08-09T06:42:00.000Z",
    },
    {
      id: "demo-5", organizationId: "demo", assetId: "asset-5", maintenancePlanId: null, title: "Inspect fire-pump seal", description: "", priority: "critical", requiredSkills: ["mechanical"], estimatedMinutes: 60, dueAt: "2026-08-09T08:30:00.000Z", status: "blocked", risk: "at_risk", assignedTechnicianId: "tech-1", blockedReason: "Awaiting isolation permit", completedAt: null, version: 4, createdBy: "dispatcher", createdAt: now, updatedAt: "2026-08-09T06:10:00.000Z",
    },
  ],
  capacity: [
    { technician: { id: "tech-1", organizationId: "demo", name: "Alex Rivera", email: "alex@example.test", skills: ["mechanical", "hydraulics"], dailyCapacityMinutes: 480, active: true, createdAt: now, updatedAt: now }, assignedMinutes: 510, utilizationPercent: 106 },
    { technician: { id: "tech-2", organizationId: "demo", name: "Lucía Vega", email: "lucia@example.test", skills: ["mechanical", "welding"], dailyCapacityMinutes: 480, active: true, createdAt: now, updatedAt: now }, assignedMinutes: 355, utilizationPercent: 74 },
    { technician: { id: "tech-3", organizationId: "demo", name: "Jordan Kim", email: "jordan@example.test", skills: ["electrical", "instrumentation"], dailyCapacityMinutes: 480, active: true, createdAt: now, updatedAt: now }, assignedMinutes: 260, utilizationPercent: 54 },
  ],
};
