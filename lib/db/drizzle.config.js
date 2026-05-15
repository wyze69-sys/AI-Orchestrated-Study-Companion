import { defineConfig } from "drizzle-kit";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

const configDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  schema: path.join(configDir, "./src/schema/index.js"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
