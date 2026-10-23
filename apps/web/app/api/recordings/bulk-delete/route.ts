import { isGallerySignedIn } from "@/lib/gallery-auth";
import { galleryUnauthorizedResponse } from "@/lib/gallery-http";
import { deleteRecordingsByIds } from "@/lib/recording-delete";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (!(await isGallerySignedIn())) {
    return galleryUnauthorizedResponse({ deleted: 0, deletedIds: [] });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const ids =
    typeof body === "object" && body !== null && "ids" in body && Array.isArray(body.ids)
      ? body.ids.map(String)
      : [];

  const result = await deleteRecordingsByIds(ids);
  if (result.ok || result.deleted > 0) revalidatePath("/");

  const status = result.ok ? 200 : result.deleted > 0 ? 207 : 400;
  return NextResponse.json(result, { status });
}
