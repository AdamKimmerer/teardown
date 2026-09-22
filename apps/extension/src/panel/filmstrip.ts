import { cropRectInPixels } from "@teardown/core/crop";
import {
  getCaptureBlob,
  listCaptures,
  type StoredCapture,
} from "../shared/idb.js";

// The filmstrip: one thumbnail per capture in the local buffer, rendered from the Blob via
// URL.createObjectURL (never base64). A freehand capture shows its crop so the user sees what
// they chose; the original stays untouched (decisions.md #17).

const objectUrls = new Map<string, string>();

export async function renderFilmstrip(
  container: HTMLElement,
  onDelete: (id: string) => void,
): Promise<void> {
  const captures = (await listCaptures()).sort(
    (a, b) => a.tCapture - b.tCapture,
  );
  container.innerHTML = "";
  for (const [i, capture] of captures.entries()) {
    container.appendChild(await thumbnail(capture, i + 1, onDelete));
  }
}

async function thumbnail(
  capture: StoredCapture,
  n: number,
  onDelete: (id: string) => void,
): Promise<HTMLElement> {
  const el = document.createElement("div");
  el.className = "thumb" + (capture.uploaded ? "" : " pending");
  el.title = capture.uploaded
    ? capture.pageTitle
    : `${capture.pageTitle} (uploading)`;

  const img = document.createElement("img");
  img.src = await thumbnailUrl(capture);
  el.appendChild(img);

  const label = document.createElement("span");
  label.className = "n";
  label.textContent = String(n);
  el.appendChild(label);

  const remove = document.createElement("button");
  remove.className = "x";
  remove.textContent = "×";
  remove.title = "Delete this capture";
  remove.addEventListener("click", () => onDelete(capture.id));
  el.appendChild(remove);
  return el;
}

async function thumbnailUrl(capture: StoredCapture): Promise<string> {
  const cached = objectUrls.get(capture.id);
  if (cached) return cached;
  const blob = await getCaptureBlob(capture.id);
  if (!blob) return "";
  const shown =
    capture.region.mode === "freehand" && capture.region.rect
      ? await crop(blob, capture)
      : blob;
  const url = URL.createObjectURL(shown);
  objectUrls.set(capture.id, url);
  return url;
}

// Same arithmetic the server will use (core/crop.ts): CSS rect × dpr against the original.
async function crop(blob: Blob, capture: StoredCapture): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const px = cropRectInPixels(
    capture.region.rect!,
    capture.viewport.dpr,
    capture.region.padding,
    {
      w: bitmap.width,
      h: bitmap.height,
    },
  );
  const canvas = new OffscreenCanvas(px.w, px.h);
  canvas
    .getContext("2d")!
    .drawImage(bitmap, px.x, px.y, px.w, px.h, 0, 0, px.w, px.h);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/png" });
}

export function forgetThumbnail(id: string): void {
  const url = objectUrls.get(id);
  if (url) URL.revokeObjectURL(url);
  objectUrls.delete(id);
}
