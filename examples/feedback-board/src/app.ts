import { Lyn } from "@rouret/lyn";
import * as schema from "./db/schema";
import { registerBoardRoutes } from "./routes/boards";
import { registerPostRoutes } from "./routes/posts";

const envConfig = {
  allowedOrigins: { name: "ALLOWED_ORIGINS", type: "string" },
} as const;

export type App = Lyn<typeof envConfig, typeof schema>;
export type Db = App["db"];

// TODO(lyn): the `cors` option can't use the typed `app.env`, so the
// origins are read from Bun.env a second time, unvalidated.
const allowedOriginsFromEnv = () =>
  (Bun.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

export const createApp = ({ databaseUrl }: { databaseUrl?: string } = {}) => {
  const app: App = new Lyn({
    env: envConfig,
    database: { schema, url: databaseUrl },
    cors: { origin: allowedOriginsFromEnv() },
  });
  return registerPostRoutes(registerBoardRoutes(app));
};
