import type { Capture } from "@teardown/core/schemas/capture";
import { BUCKETS, type Bucket } from "../storage/client.js";

// Which stored object is "the image" for a capture: its derived crop when a region was chosen,
// otherwise the untouched original (a viewport capture is its own image).
export function imageSource(capture: Capture): {
  bucket: Bucket;
  path: string;
} {
  if (capture.cropPath !== null)
    return { bucket: BUCKETS.crops, path: capture.cropPath };
  if (capture.originalPath === null)
    throw new Error(`capture ${capture.id} has no original`);
  return { bucket: BUCKETS.originals, path: capture.originalPath };
}
