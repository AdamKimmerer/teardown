import type { PresignResponse } from "@teardown/core/api-contract";
import { AppError } from "../appError.js";
import { storage, type Bucket } from "./client.js";

// A URL the client can PUT bytes to directly, so large bodies never pass through the API.
// upsert: true is what makes a retried upload replace the object instead of failing with 409
// (spike B, docs/spikes.md). Signed upload URLs are valid for two hours.
export async function signedUpload(
  bucket: Bucket,
  path: string,
): Promise<PresignResponse> {
  const { data, error } = await storage
    .from(bucket)
    .createSignedUploadUrl(path, { upsert: true });
  if (error || !data) {
    throw new AppError(
      "storage_error",
      502,
      `Could not presign upload: ${error?.message}`,
    );
  }
  return { uploadUrl: data.signedUrl, token: data.token, path: data.path };
}
