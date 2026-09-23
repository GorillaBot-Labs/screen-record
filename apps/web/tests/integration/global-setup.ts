import { execSync } from "node:child_process";
import path from "node:path";
import { config as loadEnv } from "dotenv";

export default async function globalSetup() {
  loadEnv({ path: path.resolve(__dirname, "../../.env.test") });

  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is missing. Copy apps/web/.env.test.example to apps/web/.env.test and start Mongo with: npm run test:db:up",
    );
  }

  execSync("npx prisma db push --skip-generate", {
    cwd: path.resolve(__dirname, "../.."),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
