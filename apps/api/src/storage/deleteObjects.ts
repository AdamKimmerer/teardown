import { storage, type Bucket } from "./client.js";

// Deletes specific objects. Missing objects are not an error: a capture whose upload never
// finished has a row but no bytes, and deleting it must still succeed.
export async function deleteObjects(
  bucket: Bucket,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await storage.from(bucket).remove(paths);
  if (error) {
    throw new Error(`Could not delete from ${bucket}: ${error.message}`);
  }
}

// Deletes everything under a prefix, walking sub-folders, in one bucket. Storage's list() is
// one level deep and reports folders as entries without an id, hence the recursion.
export async function deletePrefix(
  bucket: Bucket,
  prefix: string,
): Promise<number> {
  const paths = await listPrefix(bucket, prefix);
  await deleteObjects(bucket, paths);
  return paths.length;
}

async function listPrefix(bucket: Bucket, prefix: string): Promise<string[]> {
  const { data, error } = await storage
    .from(bucket)
    .list(prefix, { limit: 1000 });
  if (error) {
    throw new Error(`Could not list ${bucket}/${prefix}: ${error.message}`);
  }
  const paths: string[] = [];
  for (const entry of data ?? []) {
    const path = `${prefix}/${entry.name}`;
    if (entry.id === null) {
      paths.push(...(await listPrefix(bucket, path)));
    } else {
      paths.push(path);
    }
  }
  return paths;
}
