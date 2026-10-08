import { createApp } from "../src/app";
import { seedDemoBoard } from "../src/seed";

const app = createApp();
const board = await seedDemoBoard(app.db);
await app.stop();
console.log(`Seeded board "${board.slug}"`);
