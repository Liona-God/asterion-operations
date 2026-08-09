import { DatabaseSync } from "node:sqlite";
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
import type { OperationsStore } from "@asterion/core";

interface Snapshot {
  organizations: Organization[];
  memberships: Membership[];
  technicians: Technician[];
  assets: Asset[];
  plans: MaintenancePlan[];
  workOrders: WorkOrder[];
  audits: AuditEvent[];
  outbox: OutboxEvent[];
}

const emptySnapshot = (): Snapshot => ({
  organizations: [],
  memberships: [],
  technicians: [],
  assets: [],
  plans: [],
  workOrders: [],
  audits: [],
  outbox: [],
});

function copy<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Single-node durable adapter. Every aggregate change is committed as a SQLite
 * transaction, while the accompanying PostgreSQL migration captures the
 * normalized multi-node target schema.
 */
export class SqliteOperationsStore implements OperationsStore {
  private snapshot: Snapshot;

  public constructor(path: string) {
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS asterion_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        snapshot_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    const row = this.database.prepare("SELECT snapshot_json FROM asterion_state WHERE id = 1").get() as
      | { snapshot_json: string }
      | undefined;
    if (!row) {
      this.snapshot = emptySnapshot();
      this.database
        .prepare("INSERT INTO asterion_state(id, snapshot_json, updated_at) VALUES (1, ?, ?)")
        .run(JSON.stringify(this.snapshot), new Date().toISOString());
    } else {
      this.snapshot = JSON.parse(row.snapshot_json) as Snapshot;
    }
  }

  private readonly database: DatabaseSync;

  public close(): void {
    this.database.close();
  }

  public createOrganization(organization: Organization): void {
    this.mutate((state) => state.organizations.push(copy(organization)));
  }

  public getOrganization(id: string): Organization | undefined {
    return this.find(this.snapshot.organizations, (item) => item.id === id);
  }

  public findOrganizationBySlug(slug: string): Organization | undefined {
    return this.find(this.snapshot.organizations, (item) => item.slug === slug);
  }

  public upsertMembership(membership: Membership): void {
    this.mutate((state) => this.upsert(state.memberships, membership, (item) => item.organizationId + ":" + item.userId));
  }

  public getMembership(organizationId: string, userId: string): Membership | undefined {
    return this.find(
      this.snapshot.memberships,
      (item) => item.organizationId === organizationId && item.userId === userId,
    );
  }

  public listMemberships(organizationId: string): Membership[] {
    return this.filter(this.snapshot.memberships, (item) => item.organizationId === organizationId);
  }

  public createTechnician(technician: Technician): void {
    this.mutate((state) => state.technicians.push(copy(technician)));
  }

  public getTechnician(organizationId: string, technicianId: string): Technician | undefined {
    return this.find(
      this.snapshot.technicians,
      (item) => item.organizationId === organizationId && item.id === technicianId,
    );
  }

  public listTechnicians(organizationId: string): Technician[] {
    return this.filter(this.snapshot.technicians, (item) => item.organizationId === organizationId);
  }

  public saveTechnician(technician: Technician): void {
    this.mutate((state) => this.upsert(state.technicians, technician, (item) => item.id));
  }

  public createAsset(asset: Asset): void {
    this.mutate((state) => state.assets.push(copy(asset)));
  }

  public getAsset(organizationId: string, assetId: string): Asset | undefined {
    return this.find(this.snapshot.assets, (item) => item.organizationId === organizationId && item.id === assetId);
  }

  public findAssetByCode(organizationId: string, code: string): Asset | undefined {
    return this.find(
      this.snapshot.assets,
      (item) => item.organizationId === organizationId && item.code === code,
    );
  }

  public listAssets(organizationId: string): Asset[] {
    return this.filter(this.snapshot.assets, (item) => item.organizationId === organizationId);
  }

  public saveAsset(asset: Asset): void {
    this.mutate((state) => this.upsert(state.assets, asset, (item) => item.id));
  }

  public createMaintenancePlan(plan: MaintenancePlan): void {
    this.mutate((state) => state.plans.push(copy(plan)));
  }

  public getMaintenancePlan(organizationId: string, planId: string): MaintenancePlan | undefined {
    return this.find(this.snapshot.plans, (item) => item.organizationId === organizationId && item.id === planId);
  }

  public listMaintenancePlans(organizationId: string): MaintenancePlan[] {
    return this.filter(this.snapshot.plans, (item) => item.organizationId === organizationId);
  }

  public saveMaintenancePlan(plan: MaintenancePlan): void {
    this.mutate((state) => this.upsert(state.plans, plan, (item) => item.id));
  }

  public createWorkOrder(workOrder: WorkOrder): void {
    this.mutate((state) => state.workOrders.push(copy(workOrder)));
  }

  public getWorkOrder(organizationId: string, workOrderId: string): WorkOrder | undefined {
    return this.find(
      this.snapshot.workOrders,
      (item) => item.organizationId === organizationId && item.id === workOrderId,
    );
  }

  public listWorkOrders(organizationId: string): WorkOrder[] {
    return this.filter(this.snapshot.workOrders, (item) => item.organizationId === organizationId);
  }

  public saveWorkOrder(workOrder: WorkOrder): void {
    this.mutate((state) => this.upsert(state.workOrders, workOrder, (item) => item.id));
  }

  public appendAudit(event: AuditEvent): void {
    this.mutate((state) => state.audits.push(copy(event)));
  }

  public listAudit(organizationId: string, entityId?: string): AuditEvent[] {
    return this.filter(
      this.snapshot.audits,
      (item) => item.organizationId === organizationId && (!entityId || item.entityId === entityId),
    ).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  }

  public appendOutbox(event: OutboxEvent): void {
    this.mutate((state) => state.outbox.push(copy(event)));
  }

  public listOutbox(organizationId: string): OutboxEvent[] {
    return this.filter(this.snapshot.outbox, (item) => item.organizationId === organizationId).sort(
      (left, right) => left.occurredAt.localeCompare(right.occurredAt),
    );
  }

  private mutate(mutator: (snapshot: Snapshot) => void): void {
    const next = copy(this.snapshot);
    mutator(next);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare("UPDATE asterion_state SET snapshot_json = ?, updated_at = ? WHERE id = 1")
        .run(JSON.stringify(next), new Date().toISOString());
      this.database.exec("COMMIT");
      this.snapshot = next;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  private upsert<T>(items: T[], value: T, key: (item: T) => string): void {
    const index = items.findIndex((item) => key(item) === key(value));
    if (index < 0) items.push(copy(value));
    else items[index] = copy(value);
  }

  private find<T>(items: T[], predicate: (item: T) => boolean): T | undefined {
    const item = items.find(predicate);
    return item ? copy(item) : undefined;
  }

  private filter<T>(items: T[], predicate: (item: T) => boolean): T[] {
    return items.filter(predicate).map(copy);
  }
}
