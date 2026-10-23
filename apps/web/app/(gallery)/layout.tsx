import { isGallerySignedIn } from "@/lib/gallery-auth";
import { AppShell } from "@/app/components/AppShell";
import {
  GALLERY_PATH_HEADER,
  GALLERY_SEARCH_HEADER,
  unsignedVisitorOutcome,
} from "@/lib/gallery-session";
import { loadProjectTree } from "@/lib/projects";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function GalleryLayout({ children }: { children: React.ReactNode }) {
  if (!(await isGallerySignedIn())) {
    const headerStore = await headers();
    const outcome = unsignedVisitorOutcome({
      pathname: headerStore.get(GALLERY_PATH_HEADER) ?? "/",
      method: "GET",
      search: headerStore.get(GALLERY_SEARCH_HEADER) ?? "",
    });
    redirect(typeof outcome === "object" ? outcome.login : "/login");
  }

  const projectTree = await loadProjectTree();
  return <AppShell projectTree={projectTree}>{children}</AppShell>;
}
