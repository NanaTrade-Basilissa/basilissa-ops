import "server-only";
import { z } from "zod";
import { scoped } from "@/lib/platform/logger";
import { PermanentJobError, type JobContext } from "@/lib/platform/jobs";
import { processLowResPreview } from "./processor";

const log = scoped("files.jobs");

export const FILES_PROCESS_PREVIEW = "files.process_preview";

export const fileProcessPreviewPayload = z.object({
  fileId: z.string().min(1),
  title: z.string().optional(),
});

export async function handleFileProcessPreview(
  payload: unknown,
  _context?: JobContext,
): Promise<void> {
  const { fileId, title } = fileProcessPreviewPayload.parse(payload);
  log.info("Processing file preview background job", { fileId, title });

  const success = await processLowResPreview(fileId);
  if (!success) {
    throw new PermanentJobError(
      `Failed to generate progressive preview for file ${fileId} (${title || "untitled"}). Verify object storage credentials and file integrity.`,
    );
  }

  log.info("Completed file preview background job successfully", { fileId, title });
}
