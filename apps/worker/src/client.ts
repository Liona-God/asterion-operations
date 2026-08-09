import type { WorkerConfig } from "./config.js";

export interface PlannerResult {
  generated: number;
  riskUpdated: number;
}

export async function runPlannerTick(
  config: WorkerConfig,
  request: typeof fetch = fetch,
): Promise<PlannerResult> {
  const response = await request(config.apiBaseUrl + "/internal/planner/tick", {
    method: "POST",
    headers: { "content-type": "application/json", "x-worker-token": config.workerToken },
    body: JSON.stringify({ organizationId: config.organizationId }),
  });
  if (!response.ok) throw new Error("Planner tick failed with HTTP " + response.status);
  const payload = (await response.json()) as { data: PlannerResult };
  return payload.data;
}
