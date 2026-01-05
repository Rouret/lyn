export const setupValidEnv = () => {
  Bun.env.DATABASE_USER = "user";
  Bun.env.DATABASE_PASSWORD = "password";
  Bun.env.DATABASE_HOST = "localhost";
  Bun.env.DATABASE_PORT = "5432";
  Bun.env.DATABASE_NAME = "mydb";
};
