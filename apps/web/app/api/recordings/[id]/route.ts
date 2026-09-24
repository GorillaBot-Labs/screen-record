import { deleteRecordingById } from "@/lib/recording-delete";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const result = await deleteRecordingById(id);
  if (result.ok) revalidatePath("/");

  const status = result.ok
    ? 200
    : result.error === "Recording not found"
      ? 404
      : 500;
  return NextResponse.json(result, { status });
}
