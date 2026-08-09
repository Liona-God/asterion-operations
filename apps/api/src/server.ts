import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = createApp({ config });

async function start(): Promise<void> {
  await app.listen({ host: "0.0.0.0", port: config.port });
}

void start();
