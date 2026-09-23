import { config as loadEnv } from "dotenv";
import path from "node:path";
import { afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";

loadEnv({ path: path.resolve(__dirname, "../../.env.test") });

async function deleteAllFolders() {
  while (true) {
    const leafFolders = await prisma.folder.findMany({
      where: { children: { none: {} } },
      select: { id: true },
    });
    if (leafFolders.length === 0) break;
    await prisma.folder.deleteMany({
      where: { id: { in: leafFolders.map((folder) => folder.id) } },
    });
  }
}

beforeEach(async () => {
  await prisma.recordingComment.deleteMany();
  await prisma.recording.deleteMany();
  await deleteAllFolders();
  await prisma.project.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
