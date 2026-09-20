import { AppError } from "../appError.js";
import { storage, type Bucket } from "./client.js";

// A short-lived URL for reading a private object (document images, export downloads).
export async function signedDownload(
  bucket: Bucket,
  path: string,
  expiresInSeconds: number,
): Promise<string> {
  const { data, error } = await storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    throw new AppError(
      "storage_error",
      502,
      `Could not sign download: ${error?.message}`,
    );
  }
  return data.signedUrl;
}
