import type { Actor } from "@asterion/contracts";

export interface ApiConfig {
  port: number;
  databasePath: string;
  webOrigin: string;
  workerToken: string;
  apiKeys: Map<string, Actor>;
}

const defaultApiKeys = new Map<string, Actor>([
  ["dev-owner-key", { userId: "owner-1", displayName: "Dev Owner" }],
  ["dev-dispatcher-key", { userId: "dispatcher-1", displayName: "Dev Dispatcher" }],
  ["dev-technician-key", { userId: "technician-1", displayName: "Dev Technician" }],
  ["dev-viewer-key", { userId: "viewer-1", displayName: "Dev Viewer" }],
]);

function port(value: string | undefined): number {
  const parsed = Number(value || "4020");
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("ASTERION_PORT must be an integer between 1 and 65535");
  }
  return parsed;
}

function keys(value: string | undefined): Map<string, Actor> {
  if (!value) return new Map(defaultApiKeys);
  const raw = JSON.parse(value) as Record<string, unknown>;
  const result = new Map<string, Actor>();
  for (const [key, candidate] of Object.entries(raw)) {
    if (!candidate || typeof candidate !== "object") throw new Error("Invalid ASTERION_API_KEYS_JSON");
    const actor = candidate as Record<string, unknown>;
    if (typeof actor.userId !== "string" || typeof actor.displayName !== "string") {
      throw new Error("Each API key actor needs userId and displayName");
    }
    result.set(key, { userId: actor.userId, displayName: actor.displayName });
  }
  if (!result.size) throw new Error("ASTERION_API_KEYS_JSON cannot be empty");
  return result;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    port: port(environment.ASTERION_PORT),
    databasePath: environment.ASTERION_DATABASE_PATH || "./state/asterion.db",
    webOrigin: environment.ASTERION_WEB_ORIGIN || "http://localhost:5174",
    workerToken: environment.ASTERION_WORKER_TOKEN || "dev-worker-token-change-me",
    apiKeys: keys(environment.ASTERION_API_KEYS_JSON),
  };
}
