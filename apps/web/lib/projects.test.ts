import { describe, expect, it } from "vitest";
import { normalizeProjectName, normalizeFolderName } from "@/lib/projects";

describe("normalizeProjectName", () => {
  it("trims and rejects empty project names", () => {
    expect(normalizeProjectName("  Client work  ")).toBe("Client work");
    expect(normalizeProjectName("   ")).toBeNull();
  });
});

describe("normalizeFolderName", () => {
  it("trims and rejects empty folder names", () => {
    expect(normalizeFolderName("  Sprint demos  ")).toBe("Sprint demos");
    expect(normalizeFolderName("")).toBeNull();
  });
});
