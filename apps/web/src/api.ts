import type { OperationsDashboard } from "@asterion/contracts";

export interface LiveSnapshot {
  dashboard: OperationsDashboard;
}

export async function loadLiveSnapshot(options: { baseUrl: string; organizationId: string; apiKey: string }): Promise<LiveSnapshot> {
  const response = await fetch(options.baseUrl.replace(/\/$/, "") + "/v1/organizations/" + options.organizationId + "/dashboard", {
    headers: { "x-api-key": options.apiKey },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message || "Unable to load the Asterion dashboard (HTTP " + response.status + ")");
  }
  const payload = (await response.json()) as { data: OperationsDashboard };
  return { dashboard: payload.data };
}
