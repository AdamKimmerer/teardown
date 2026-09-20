// Object keys, all starting with the user id so delete-account is a prefix listing per bucket.
// originals and crops share a key (same capture, different bucket).

export function originalKey(
  userId: string,
  sessionId: string,
  captureId: string,
): string {
  return `${userId}/${sessionId}/${captureId}.png`;
}

export function cropKey(
  userId: string,
  sessionId: string,
  captureId: string,
): string {
  return `${userId}/${sessionId}/${captureId}.png`;
}

export function chunkKey(
  userId: string,
  sessionId: string,
  offsetMs: number,
): string {
  return `${userId}/${sessionId}/chunks/${offsetMs}.webm`;
}

export function exportKey(
  userId: string,
  jobId: string,
  extension: string,
): string {
  return `${userId}/exports/${jobId}.${extension}`;
}

// Everything a session owns in the originals, crops and audio buckets lives under this prefix.
export function sessionPrefix(userId: string, sessionId: string): string {
  return `${userId}/${sessionId}`;
}
