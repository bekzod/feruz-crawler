import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./packages/db/src/schema.js",
  out: "./packages/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://feruz:feruz@localhost:5432/feruz" }
});
