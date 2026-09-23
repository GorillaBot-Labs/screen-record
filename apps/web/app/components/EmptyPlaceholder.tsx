import type { LucideIcon } from "lucide-react";

type EmptyPlaceholderProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  compact?: boolean;
};

export function EmptyPlaceholder({
  icon: Icon,
  title,
  description,
  compact = false,
}: EmptyPlaceholderProps) {
  if (compact) {
    return (
      <div className="flex flex-col items-center px-4 py-8 text-center">
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted ring-1 ring-border">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-background text-muted ring-1 ring-border">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted">{description}</p> : null}
    </div>
  );
}
