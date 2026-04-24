import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
config({ path: join(scriptDir, "..", ".env") });

function printConnectionHints(message: string): void {
  if (!/dns|srv|resolution|\.lan|mongodb\._tcp/i.test(message)) return;
  console.error(`
Database connection failed (often DNS / SRV related).

If the error mentions "mongodb.net.lan" or SRV lookup:
  Your network is appending a DNS search domain (e.g. ".lan") to Atlas hostnames.
  Fix: macOS System Settings → Network → your interface → Details → DNS → remove
  bogus "Search Domains", or use a resolver that does not rewrite external names.

Also confirm DATABASE_URL uses the full Atlas host from the Atlas UI, e.g.
  mongodb+srv://...@cluster0.<deployment-id>.mongodb.net/...
not the placeholder "cluster0.mongodb.net" from examples.

Workaround: in Atlas → Connect → Drivers, use the "Standard connection string"
(mongodb://...) instead of mongodb+srv:// if SRV keeps failing on your network.
`);
}

async function main() {
  const { reconcileRecordingsFromGcs } = await import("../lib/gcs-reconcile");
  const { prisma } = await import("../lib/prisma");

  try {
    await prisma.$connect();
    const stats = await reconcileRecordingsFromGcs(prisma);
    console.log(JSON.stringify({ ok: true, ...stats }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  console.error(message);
  printConnectionHints(message);
  process.exitCode = 1;
});
