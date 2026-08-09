import { runPlannerTick } from "./client.js";
import { loadWorkerConfig } from "./config.js";

const config = loadWorkerConfig();

async function tick(): Promise<void> {
  try {
    const result = await runPlannerTick(config);
    console.info(JSON.stringify({ event: "planner.tick", ...result }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Planner tick failed");
  }
}

void tick();
setInterval(() => void tick(), config.intervalMs);
