"use client";

import { createFolder } from "@/app/actions/projects";
import { PromptModal } from "@/app/components/PromptModal";
import { FolderPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";

type ProjectPageActionsProps = {
  projectId: string;
  parentFolderId?: string | null;
};

export function ProjectPageActions({ projectId, parentFolderId = null }: ProjectPageActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isSubfolder = Boolean(parentFolderId);

  const handleConfirm = useCallback(
    async (name: string) => {
      setOpen(false);
      const result = await createFolder({ projectId, name, parentFolderId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Created folder “${result.name}”`);
      router.refresh();
    },
    [parentFolderId, projectId, router],
  );

  return (
    <>
      <PromptModal
        open={open}
        title={isSubfolder ? "New subfolder" : "New folder"}
        label={isSubfolder ? "Subfolder name" : "Folder name"}
        onConfirm={(name) => void handleConfirm(name)}
        onCancel={() => setOpen(false)}
      />
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface"
      >
        <FolderPlus className="h-4 w-4" aria-hidden />
        {isSubfolder ? "New subfolder" : "New folder"}
      </button>
    </>
  );
}
