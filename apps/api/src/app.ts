import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { isCriticality, isPriority, isRole, type Actor, type Role } from "@asterion/contracts";
import { DomainError, OperationsService } from "@asterion/core";
import { SqliteOperationsStore } from "@asterion/storage";
import { z } from "zod";
import { loadConfig, type ApiConfig } from "./config.js";

export interface CreateAppOptions {
  config?: Partial<ApiConfig>;
  service?: OperationsService;
}

const organizationBody = z.object({
  slug: z.string().min(3).max(48),
  name: z.string().min(1).max(120),
  timezone: z.string().min(1).max(80).optional(),
});
const membershipBody = z.object({
  userId: z.string().min(1).max(120),
  displayName: z.string().min(1).max(120),
  role: z.enum(["owner", "dispatcher", "technician", "viewer"]),
});
const technicianBody = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  skills: z.array(z.string().min(1).max(60)).max(40),
  dailyCapacityMinutes: z.number().int().min(60).max(1_440),
});
const assetBody = z.object({
  code: z.string().min(2).max(60),
  name: z.string().min(1).max(160),
  location: z.string().min(1).max(200),
  criticality: z.enum(["safety", "production", "customer", "standard"]),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
});
const planBody = z.object({
  assetId: z.string().uuid(),
  title: z.string().min(1).max(160),
  description: z.string().max(2_000).optional(),
  frequencyDays: z.number().int().min(1).max(730),
  priority: z.enum(["critical", "high", "normal", "low"]),
  requiredSkills: z.array(z.string().min(1).max(60)).max(20).optional(),
  estimatedMinutes: z.number().int().min(15).max(1_440),
});
const workOrderBody = z.object({
  assetId: z.string().uuid(),
  title: z.string().min(1).max(180),
  description: z.string().max(4_000).optional(),
  priority: z.enum(["critical", "high", "normal", "low"]),
  requiredSkills: z.array(z.string().min(1).max(60)).max(20).optional(),
  estimatedMinutes: z.number().int().min(15).max(1_440),
  dueAt: z.string().datetime().optional(),
  assignedTechnicianId: z.string().uuid().optional(),
});
const dispatchBody = z.object({
  technicianId: z.string().uuid(),
  expectedVersion: z.number().int().min(1),
});
const blockBody = z.object({ reason: z.string().min(1).max(500) });
const plannerBody = z.object({ organizationId: z.string().uuid() });

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new DomainError("validation", result.error.issues[0]?.message || "Invalid request body");
  return result.data;
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function organizationId(request: FastifyRequest): string {
  const value = (request.params as { organizationId?: string }).organizationId;
  if (!value) throw new DomainError("validation", "organizationId is required");
  return value;
}

function parameter(request: FastifyRequest, key: "workOrderId"): string {
  const value = (request.params as Record<string, string | undefined>)[key];
  if (!value) throw new DomainError("validation", key + " is required");
  return value;
}

export function createApp(options: CreateAppOptions = {}): FastifyInstance {
  const loaded = loadConfig();
  const config: ApiConfig = {
    port: options.config?.port ?? loaded.port,
    databasePath: options.config?.databasePath ?? loaded.databasePath,
    webOrigin: options.config?.webOrigin ?? loaded.webOrigin,
    workerToken: options.config?.workerToken ?? loaded.workerToken,
    apiKeys: options.config?.apiKeys ?? loaded.apiKeys,
  };
  const store = options.service ? undefined : new SqliteOperationsStore(config.databasePath);
  const service = options.service ?? new OperationsService(store!);
  const app = Fastify({
    logger: true,
    bodyLimit: 1_048_576,
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
  });
  app.addHook("onClose", () => store?.close());
  void app.register(cors, { origin: config.webOrigin, methods: ["GET", "POST"] });

  function actor(request: FastifyRequest): Actor {
    const key = header(request, "x-api-key");
    const found = key ? config.apiKeys.get(key) : undefined;
    if (!found) throw new DomainError("forbidden", "A valid x-api-key header is required");
    return found;
  }

  app.get("/healthz", async () => ({ status: "ok", service: "asterion-api" }));

  app.post("/v1/organizations", async (request, reply) => {
    const organization = service.createOrganization(parse(organizationBody, request.body), actor(request));
    return reply.status(201).send({ data: organization });
  });

  app.post("/v1/organizations/:organizationId/members", async (request, reply) => {
    const body = parse(membershipBody, request.body);
    if (!isRole(body.role)) throw new DomainError("validation", "Invalid member role");
    const member = service.addMembership(organizationId(request), body as { userId: string; displayName: string; role: Role }, actor(request));
    return reply.status(201).send({ data: member });
  });

  app.get("/v1/organizations/:organizationId/dashboard", async (request) => ({
    data: service.dashboard(organizationId(request), actor(request)),
  }));

  app.get("/v1/organizations/:organizationId/assets", async (request) => ({
    data: service.listAssets(organizationId(request), actor(request)),
  }));

  app.post("/v1/organizations/:organizationId/assets", async (request, reply) => {
    const body = parse(assetBody, request.body);
    if (!isCriticality(body.criticality)) throw new DomainError("validation", "Invalid criticality");
    return reply.status(201).send({ data: service.createAsset(organizationId(request), body, actor(request)) });
  });

  app.get("/v1/organizations/:organizationId/technicians", async (request) => ({
    data: service.listTechnicians(organizationId(request), actor(request)),
  }));

  app.post("/v1/organizations/:organizationId/technicians", async (request, reply) =>
    reply.status(201).send({
      data: service.createTechnician(organizationId(request), parse(technicianBody, request.body), actor(request)),
    }),
  );

  app.post("/v1/organizations/:organizationId/maintenance-plans", async (request, reply) => {
    const body = parse(planBody, request.body);
    if (!isPriority(body.priority)) throw new DomainError("validation", "Invalid priority");
    return reply.status(201).send({ data: service.createMaintenancePlan(organizationId(request), body, actor(request)) });
  });

  app.get("/v1/organizations/:organizationId/work-orders", async (request) => ({
    data: service.listWorkOrders(organizationId(request), actor(request)),
  }));

  app.post("/v1/organizations/:organizationId/work-orders", async (request, reply) => {
    const body = parse(workOrderBody, request.body);
    if (!isPriority(body.priority)) throw new DomainError("validation", "Invalid priority");
    return reply.status(201).send({ data: service.createWorkOrder(organizationId(request), body, actor(request)) });
  });

  app.get("/v1/organizations/:organizationId/work-orders/:workOrderId", async (request) => ({
    data: service.getWorkOrder(organizationId(request), parameter(request, "workOrderId"), actor(request)),
  }));

  app.get("/v1/organizations/:organizationId/work-orders/:workOrderId/recommendations", async (request) => ({
    data: service.recommendDispatch(organizationId(request), parameter(request, "workOrderId"), actor(request)),
  }));

  app.post("/v1/organizations/:organizationId/work-orders/:workOrderId/dispatch", async (request) => ({
    data: service.dispatchWorkOrder(
      organizationId(request),
      parameter(request, "workOrderId"),
      parse(dispatchBody, request.body),
      actor(request),
    ),
  }));

  app.post("/v1/organizations/:organizationId/work-orders/:workOrderId/start", async (request) => ({
    data: service.startWorkOrder(organizationId(request), parameter(request, "workOrderId"), actor(request)),
  }));

  app.post("/v1/organizations/:organizationId/work-orders/:workOrderId/block", async (request) => ({
    data: service.blockWorkOrder(
      organizationId(request),
      parameter(request, "workOrderId"),
      parse(blockBody, request.body).reason,
      actor(request),
    ),
  }));

  app.post("/v1/organizations/:organizationId/work-orders/:workOrderId/complete", async (request) => ({
    data: service.completeWorkOrder(organizationId(request), parameter(request, "workOrderId"), actor(request)),
  }));

  app.post("/internal/planner/tick", async (request) => {
    if (header(request, "x-worker-token") !== config.workerToken) {
      throw new DomainError("forbidden", "A valid x-worker-token header is required");
    }
    const body = parse(plannerBody, request.body);
    return { data: service.runPlanningCycle(body.organizationId) };
  });

  app.setErrorHandler((error, request, reply) => {
    const known = error instanceof DomainError ? error : undefined;
    const statusCode =
      known?.code === "validation"
        ? 400
        : known?.code === "forbidden"
          ? 403
          : known?.code === "not_found"
            ? 404
            : known?.code === "conflict"
              ? 409
              : known?.code === "invalid_state"
                ? 422
                : 500;
    if (!known) request.log.error({ err: error }, "Unhandled request error");
    void reply.status(statusCode).send({
      error: { code: known?.code || "internal_error", message: known ? known.message : "Internal server error", requestId: request.id },
    });
  });

  return app;
}
