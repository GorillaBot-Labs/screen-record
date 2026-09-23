"use client";

import {
  LIBRARY_SORT_LABELS,
  type LibrarySort,
} from "@/lib/library-types";
import { ArrowDownUp, MessageSquare, Search, X } from "lucide-react";

type LibraryToolbarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  sort: LibrarySort;
  onSortChange: (value: LibrarySort) => void;
  tags: string[];
  tagFilter: string | null;
  onTagFilterChange: (tag: string | null) => void;
  hasCommentsOnly: boolean;
  onHasCommentsOnlyChange: (value: boolean) => void;
  resultLabel?: string;
};

export function LibraryToolbar({
  query,
  onQueryChange,
  sort,
  onSortChange,
  tags,
  tagFilter,
  onTagFilterChange,
  hasCommentsOnly,
  onHasCommentsOnlyChange,
  resultLabel,
}: LibraryToolbarProps) {
  return (
    <div className="-mx-4 border-b border-border bg-surface/70 px-4 pb-2 pt-0.5 md:-mx-6 md:px-6">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search recordings…"
            className="h-8 w-full rounded-md border-0 bg-background py-0 pl-8 pr-8 text-sm text-foreground ring-1 ring-border/80 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-accent-soft"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted transition-colors hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </label>

        <div className="flex shrink-0 items-center gap-1.5">
          <label className="relative inline-flex items-center">
            <ArrowDownUp
              className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted"
              aria-hidden
            />
            <select
              value={sort}
              onChange={(event) => onSortChange(event.target.value as LibrarySort)}
              aria-label="Sort recordings"
              className="h-8 appearance-none rounded-md border-0 bg-background py-0 pl-8 pr-7 text-sm text-foreground ring-1 ring-border/80 outline-none focus:ring-2 focus:ring-accent-soft"
            >
              {(Object.keys(LIBRARY_SORT_LABELS) as LibrarySort[]).map((key) => (
                <option key={key} value={key}>
                  {LIBRARY_SORT_LABELS[key]}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => onHasCommentsOnlyChange(!hasCommentsOnly)}
            aria-pressed={hasCommentsOnly}
            className={`inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors ${
              hasCommentsOnly
                ? "bg-accent text-white"
                : "bg-background text-muted ring-1 ring-border/80 hover:text-foreground"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
            Comments
          </button>
        </div>
      </div>

      {tags.length > 0 ? (
        <div className="mt-1.5 flex items-center gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => onTagFilterChange(null)}
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
              tagFilter === null
                ? "bg-foreground text-background"
                : "text-muted hover:text-foreground"
            }`}
          >
            All
          </button>
          {tags.map((tag) => {
            const active = tagFilter?.toLowerCase() === tag.toLowerCase();
            return (
              <button
                key={tag}
                type="button"
                onClick={() => onTagFilterChange(active ? null : tag)}
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  active ? "bg-accent text-white" : "text-muted hover:text-foreground"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      ) : null}

      {resultLabel ? (
        <p className="mt-1.5 text-[11px] tabular-nums text-muted">{resultLabel}</p>
      ) : null}
    </div>
  );
}
