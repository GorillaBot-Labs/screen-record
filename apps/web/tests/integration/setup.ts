import { config as loadEnv } from "dotenv";
import path from "node:path";
import { afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";

loadEnv({ path: path.resolve(__dirname, "../../.env.test") });

beforeEach(async () => {
  await prisma.recordingComment.deleteMany();
  await prisma.recording.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
