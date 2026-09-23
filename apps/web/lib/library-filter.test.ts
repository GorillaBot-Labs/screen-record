import { describe, expect, it } from "vitest";
import {
  collectLibraryTags,
  filterLibraryRecordings,
  sortLibraryRecordings,
} from "@/lib/library-filter";
import type { LibraryRecording } from "@/lib/library-types";

function recording(overrides: Partial<LibraryRecording> = {}): LibraryRecording {
  return {
    id: "1",
    title: "Quarterly review",
    gcsObjectName: "recordings/2024/q1-review.mp4",
    publicUrl: "https://example.com/q1-review.mp4",
    createdAt: "2024-06-15T12:00:00.000Z",
    notes: "Walkthrough for stakeholders",
    tags: ["product"],
    durationSeconds: 120,
    commentCount: 2,
    ...overrides,
  };
}

describe("filterLibraryRecordings", () => {
  const library = [
    recording({ id: "1", title: "Quarterly review", tags: ["product"], commentCount: 2 }),
    recording({
      id: "2",
      title: "Bug bash",
      gcsObjectName: "recordings/bug-bash.mp4",
      tags: ["engineering"],
      commentCount: 0,
      notes: null,
    }),
  ];

  it("matches recordings by title, filename, tags, or notes", () => {
    expect(filterLibraryRecordings(library, { query: "bug", tag: null, hasComments: false })).toEqual([
      library[1],
    ]);
    expect(filterLibraryRecordings(library, { query: "product", tag: null, hasComments: false })).toEqual([
      library[0],
    ]);
    expect(
      filterLibraryRecordings(library, { query: "stakeholders", tag: null, hasComments: false }),
    ).toEqual([library[0]]);
  });

  it("filters by tag and comment presence", () => {
    expect(
      filterLibraryRecordings(library, { query: "", tag: "engineering", hasComments: false }),
    ).toEqual([library[1]]);

    expect(
      filterLibraryRecordings(library, { query: "", tag: null, hasComments: true }),
    ).toEqual([library[0]]);
  });
});

describe("sortLibraryRecordings", () => {
  const library = [
    recording({
      id: "old",
      createdAt: "2024-01-01T00:00:00.000Z",
      durationSeconds: 30,
      commentCount: 1,
    }),
    recording({
      id: "new",
      createdAt: "2024-12-01T00:00:00.000Z",
      durationSeconds: 300,
      commentCount: 5,
    }),
  ];

  it("sorts newest first by default", () => {
    expect(sortLibraryRecordings(library, "newest").map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("sorts by oldest, longest, and most commented", () => {
    expect(sortLibraryRecordings(library, "oldest").map((r) => r.id)).toEqual(["old", "new"]);
    expect(sortLibraryRecordings(library, "longest").map((r) => r.id)).toEqual(["new", "old"]);
    expect(sortLibraryRecordings(library, "most-commented").map((r) => r.id)).toEqual(["new", "old"]);
  });
});

describe("collectLibraryTags", () => {
  it("returns unique tags sorted alphabetically", () => {
    const tags = collectLibraryTags([
      recording({ tags: ["zebra", "Alpha"] }),
      recording({ tags: ["alpha", "Beta"] }),
    ]);

    expect(tags).toEqual(["Alpha", "Beta", "zebra"]);
  });
});
