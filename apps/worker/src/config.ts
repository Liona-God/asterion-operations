export interface WorkerConfig {
  apiBaseUrl: string;
  workerToken: string;
  organizationId: string;
  intervalMs: number;
}

export function loadWorkerConfig(environment: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const intervalMs = Number(environment.ASTERION_WORKER_INTERVAL_MS || "30000");
  if (!Number.isInteger(intervalMs) || intervalMs < 5_000 || intervalMs > 3_600_000) {
    throw new Error("ASTERION_WORKER_INTERVAL_MS must be an integer from 5000 to 3600000");
  }
  const organizationId = environment.ASTERION_ORGANIZATION_ID;
  if (!organizationId) throw new Error("ASTERION_ORGANIZATION_ID is required");
  return {
    apiBaseUrl: (environment.ASTERION_API_URL || "http://localhost:4020").replace(/\/$/, ""),
    workerToken: environment.ASTERION_WORKER_TOKEN || "dev-worker-token-change-me",
    organizationId,
    intervalMs,
  };
}
