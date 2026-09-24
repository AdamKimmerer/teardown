import { storage, type Bucket } from "./client.js";

// Writes an object from the server side (derived crops, export files). Upsert, because a derived
// object is always safe to regenerate over an earlier copy.
export async function uploadObject(
  bucket: Bucket,
  path: string,
  bytes: Buffer,
  contentType: string,
): Promise<void> {
  const { error } = await storage
    .from(bucket)
    .upload(path, bytes, { contentType, upsert: true });
  if (error)
    throw new Error(`Could not upload ${bucket}/${path}: ${error.message}`);
}
