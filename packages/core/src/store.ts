import type {
  Asset,
  AuditEvent,
  MaintenancePlan,
  Membership,
  Organization,
  OutboxEvent,
  Technician,
  WorkOrder,
} from "@asterion/contracts";

export interface OperationsStore {
  createOrganization(organization: Organization): void;
  getOrganization(id: string): Organization | undefined;
  findOrganizationBySlug(slug: string): Organization | undefined;

  upsertMembership(membership: Membership): void;
  getMembership(organizationId: string, userId: string): Membership | undefined;
  listMemberships(organizationId: string): Membership[];

  createTechnician(technician: Technician): void;
  getTechnician(organizationId: string, technicianId: string): Technician | undefined;
  listTechnicians(organizationId: string): Technician[];
  saveTechnician(technician: Technician): void;

  createAsset(asset: Asset): void;
  getAsset(organizationId: string, assetId: string): Asset | undefined;
  findAssetByCode(organizationId: string, code: string): Asset | undefined;
  listAssets(organizationId: string): Asset[];
  saveAsset(asset: Asset): void;

  createMaintenancePlan(plan: MaintenancePlan): void;
  getMaintenancePlan(organizationId: string, planId: string): MaintenancePlan | undefined;
  listMaintenancePlans(organizationId: string): MaintenancePlan[];
  saveMaintenancePlan(plan: MaintenancePlan): void;

  createWorkOrder(workOrder: WorkOrder): void;
  getWorkOrder(organizationId: string, workOrderId: string): WorkOrder | undefined;
  listWorkOrders(organizationId: string): WorkOrder[];
  saveWorkOrder(workOrder: WorkOrder): void;

  appendAudit(event: AuditEvent): void;
  listAudit(organizationId: string, entityId?: string): AuditEvent[];
  appendOutbox(event: OutboxEvent): void;
  listOutbox(organizationId: string): OutboxEvent[];
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryOperationsStore implements OperationsStore {
  private readonly organizations = new Map<string, Organization>();
  private readonly memberships = new Map<string, Membership>();
  private readonly technicians = new Map<string, Technician>();
  private readonly assets = new Map<string, Asset>();
  private readonly plans = new Map<string, MaintenancePlan>();
  private readonly workOrders = new Map<string, WorkOrder>();
  private readonly audits: AuditEvent[] = [];
  private readonly outbox: OutboxEvent[] = [];

  public createOrganization(organization: Organization): void {
    this.organizations.set(organization.id, copy(organization));
  }

  public getOrganization(id: string): Organization | undefined {
    const value = this.organizations.get(id);
    return value ? copy(value) : undefined;
  }

  public findOrganizationBySlug(slug: string): Organization | undefined {
    return this.values(this.organizations).find((organization) => organization.slug === slug);
  }

  public upsertMembership(membership: Membership): void {
    this.memberships.set(this.memberKey(membership.organizationId, membership.userId), copy(membership));
  }

  public getMembership(organizationId: string, userId: string): Membership | undefined {
    const value = this.memberships.get(this.memberKey(organizationId, userId));
    return value ? copy(value) : undefined;
  }

  public listMemberships(organizationId: string): Membership[] {
    return this.values(this.memberships).filter((member) => member.organizationId === organizationId);
  }

  public createTechnician(technician: Technician): void {
    this.technicians.set(technician.id, copy(technician));
  }

  public getTechnician(organizationId: string, technicianId: string): Technician | undefined {
    const value = this.technicians.get(technicianId);
    return value && value.organizationId === organizationId ? copy(value) : undefined;
  }

  public listTechnicians(organizationId: string): Technician[] {
    return this.values(this.technicians).filter((technician) => technician.organizationId === organizationId);
  }

  public saveTechnician(technician: Technician): void {
    this.technicians.set(technician.id, copy(technician));
  }

  public createAsset(asset: Asset): void {
    this.assets.set(asset.id, copy(asset));
  }

  public getAsset(organizationId: string, assetId: string): Asset | undefined {
    const value = this.assets.get(assetId);
    return value && value.organizationId === organizationId ? copy(value) : undefined;
  }

  public findAssetByCode(organizationId: string, code: string): Asset | undefined {
    return this.values(this.assets).find(
      (asset) => asset.organizationId === organizationId && asset.code === code,
    );
  }

  public listAssets(organizationId: string): Asset[] {
    return this.values(this.assets).filter((asset) => asset.organizationId === organizationId);
  }

  public saveAsset(asset: Asset): void {
    this.assets.set(asset.id, copy(asset));
  }

  public createMaintenancePlan(plan: MaintenancePlan): void {
    this.plans.set(plan.id, copy(plan));
  }

  public getMaintenancePlan(organizationId: string, planId: string): MaintenancePlan | undefined {
    const value = this.plans.get(planId);
    return value && value.organizationId === organizationId ? copy(value) : undefined;
  }

  public listMaintenancePlans(organizationId: string): MaintenancePlan[] {
    return this.values(this.plans).filter((plan) => plan.organizationId === organizationId);
  }

  public saveMaintenancePlan(plan: MaintenancePlan): void {
    this.plans.set(plan.id, copy(plan));
  }

  public createWorkOrder(workOrder: WorkOrder): void {
    this.workOrders.set(workOrder.id, copy(workOrder));
  }

  public getWorkOrder(organizationId: string, workOrderId: string): WorkOrder | undefined {
    const value = this.workOrders.get(workOrderId);
    return value && value.organizationId === organizationId ? copy(value) : undefined;
  }

  public listWorkOrders(organizationId: string): WorkOrder[] {
    return this.values(this.workOrders).filter((workOrder) => workOrder.organizationId === organizationId);
  }

  public saveWorkOrder(workOrder: WorkOrder): void {
    this.workOrders.set(workOrder.id, copy(workOrder));
  }

  public appendAudit(event: AuditEvent): void {
    this.audits.push(copy(event));
  }

  public listAudit(organizationId: string, entityId?: string): AuditEvent[] {
    return this.audits
      .filter((event) => event.organizationId === organizationId && (!entityId || event.entityId === entityId))
      .map(copy)
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  }

  public appendOutbox(event: OutboxEvent): void {
    this.outbox.push(copy(event));
  }

  public listOutbox(organizationId: string): OutboxEvent[] {
    return this.outbox
      .filter((event) => event.organizationId === organizationId)
      .map(copy)
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  }

  private values<T>(map: Map<string, T>): T[] {
    return [...map.values()].map(copy);
  }

  private memberKey(organizationId: string, userId: string): string {
    return organizationId + ":" + userId;
  }
}
