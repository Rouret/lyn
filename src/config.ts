export type LynCliConfig = {
  database?: {
    /** Drizzle schema file, relative to the project root. Defaults to `src/db/schema.ts`. */
    schema?: string;
    /** Folder of the generated SQL migrations. Defaults to `drizzle`. */
    migrations?: string;
  };
};

export const defineConfig = (config: LynCliConfig): LynCliConfig => config;
