import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so a checkout nested in another (factory
  // worktrees in .worktrees/) doesn't resolve the outer repo's lockfile.
  turbopack: { root: path.join(__dirname, "../..") },
};

export default nextConfig;
