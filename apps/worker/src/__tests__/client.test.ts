import assert from "node:assert/strict";
import test from "node:test";
import { runPlannerTick } from "../client.js";

test("posts a scoped planning tick with the worker credential", async () => {
  let request: Request | undefined;
  const result = await runPlannerTick(
    { apiBaseUrl: "https://api.example.test", workerToken: "worker-secret", organizationId: "org-1", intervalMs: 60_000 },
    async (input, init) => {
      request = new Request(input, init);
      return new Response(JSON.stringify({ data: { generated: 2, riskUpdated: 3 } }), { status: 200 });
    },
  );
  assert.deepEqual(result, { generated: 2, riskUpdated: 3 });
  assert.equal(request?.url, "https://api.example.test/internal/planner/tick");
  assert.equal(request?.headers.get("x-worker-token"), "worker-secret");
  assert.deepEqual(await request?.json(), { organizationId: "org-1" });
});

test("surfaces unsuccessful planner responses", async () => {
  await assert.rejects(
    () => runPlannerTick({ apiBaseUrl: "https://api.example.test", workerToken: "x", organizationId: "org-1", intervalMs: 1 }, async () => new Response(null, { status: 503 })),
    /HTTP 503/,
  );
});
