import { storage, type Bucket } from "./client.js";

// Reads a whole object into memory; for the workers, which need the bytes rather than a URL.
export async function downloadObject(
  bucket: Bucket,
  path: string,
): Promise<Blob> {
  const { data, error } = await storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`Could not download ${bucket}/${path}: ${error?.message}`);
  }
  return data;
}
