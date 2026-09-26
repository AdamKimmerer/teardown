import type { Rect } from "@teardown/core/schemas/capture";

// The persistent freehand region (spine §8.2): draw it by dragging, then move it with its grip,
// resize it from any edge or corner, remove it with its ×. It stays put on screen while the page
// scrolls, is clamped to the window, and persists across captures until changed or removed.
// Resizing means a region never has to be right in one stroke (no running out of trackpad).

export type RegionEditor = {
  region: () => Rect | null;
  // When the user last started choosing the region, on the session clock; read once per capture.
  takePickStart: () => number | null;
  isArmed: () => boolean;
  arm: () => void;
  disarm: () => void;
  clear: () => void;
};

type Adjust = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const MIN_SIZE = 16;

export function createRegionEditor(
  shadow: ShadowRoot,
  sessionNowMs: () => Promise<number>,
  onChange: (state: { hasRegion: boolean; armed: boolean }) => void,
): RegionEditor {
  const glass = shadow.querySelector(".glass") as HTMLDivElement;
  const rectEl = shadow.querySelector(".rect") as HTMLDivElement;
  const grip = shadow.querySelector(".grip") as HTMLButtonElement;
  const close = shadow.querySelector(".close") as HTMLButtonElement;

  let region: Rect | null = null;
  let pickStart: number | null = null;
  let armed = false;
  let drawStart: { x: number; y: number } | null = null;
  let adjusting: {
    kind: Adjust;
    from: Rect;
    pointer: { x: number; y: number };
  } | null = null;

  const notify = () => onChange({ hasRegion: region !== null, armed });
  const markPickStart = () =>
    void sessionNowMs()
      .then((t) => (pickStart = t))
      .catch(() => {});

  function show(r: Rect): void {
    Object.assign(rectEl.style, {
      left: `${r.x}px`,
      top: `${r.y}px`,
      width: `${r.w}px`,
      height: `${r.h}px`,
      display: "block",
    });
    // The grip and × sit outside the box, unless that would put them off-screen.
    grip.classList.toggle("inside", r.y < 34);
    close.classList.toggle("inside-top", r.y < 14);
    close.classList.toggle("inside-right", r.x + r.w > innerWidth - 14);
  }

  function setRegion(r: Rect | null): void {
    region = r;
    if (r) show(r);
    else rectEl.style.display = "none";
    notify();
  }

  // ---- drawing ------------------------------------------------------------------------------
  glass.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    glass.setPointerCapture(e.pointerId);
    drawStart = { x: e.clientX, y: e.clientY };
    markPickStart();
  });
  glass.addEventListener("pointermove", (e) => {
    if (drawStart)
      show(rectFromPoints(drawStart, { x: e.clientX, y: e.clientY }));
  });
  glass.addEventListener("pointerup", (e) => {
    if (!drawStart) return;
    const r = rectFromPoints(drawStart, { x: e.clientX, y: e.clientY });
    drawStart = null;
    editor.disarm();
    // A click rather than a drag leaves any existing region as it was.
    setRegion(r.w >= MIN_SIZE && r.h >= MIN_SIZE ? r : region);
  });

  // ---- moving and resizing --------------------------------------------------------------------
  rectEl.addEventListener("pointerdown", (e) => {
    const target = e.target as HTMLElement;
    const kind = target.dataset.adjust as Adjust | undefined;
    if (!kind || !region) return;
    e.preventDefault();
    e.stopPropagation();
    target.setPointerCapture(e.pointerId);
    adjusting = { kind, from: region, pointer: { x: e.clientX, y: e.clientY } };
    markPickStart();
  });
  rectEl.addEventListener("pointermove", (e) => {
    if (!adjusting) return;
    const dx = e.clientX - adjusting.pointer.x;
    const dy = e.clientY - adjusting.pointer.y;
    show(adjusted(adjusting.from, adjusting.kind, dx, dy));
  });
  rectEl.addEventListener("pointerup", (e) => {
    if (!adjusting) return;
    const dx = e.clientX - adjusting.pointer.x;
    const dy = e.clientY - adjusting.pointer.y;
    setRegion(adjusted(adjusting.from, adjusting.kind, dx, dy));
    adjusting = null;
  });
  close.addEventListener("click", (e) => {
    e.stopPropagation();
    editor.clear();
  });

  // Esc cancels whatever is in progress: a drawing, or a move or resize (which snaps back).
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || (!armed && !adjusting && !drawStart)) return;
      e.preventDefault();
      e.stopPropagation();
      drawStart = null;
      adjusting = null;
      editor.disarm();
      setRegion(region);
    },
    true,
  );

  const editor: RegionEditor = {
    region: () => region,
    takePickStart: () => {
      const t = pickStart;
      pickStart = null;
      return t;
    },
    isArmed: () => armed,
    arm: () => {
      armed = true;
      glass.style.display = "block";
      notify();
    },
    disarm: () => {
      armed = false;
      glass.style.display = "none";
      notify();
    },
    clear: () => {
      pickStart = null;
      editor.disarm();
      setRegion(null);
    },
  };
  return editor;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

// The rect between two points, clamped to the window.
function rectFromPoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
): Rect {
  const x1 = clamp(Math.min(a.x, b.x), 0, innerWidth);
  const y1 = clamp(Math.min(a.y, b.y), 0, innerHeight);
  const x2 = clamp(Math.max(a.x, b.x), 0, innerWidth);
  const y2 = clamp(Math.max(a.y, b.y), 0, innerHeight);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// The region after dragging a handle by (dx, dy): moving keeps its size; an edge or corner moves
// only its own sides. Always inside the window and at least MIN_SIZE on each side.
function adjusted(from: Rect, kind: Adjust, dx: number, dy: number): Rect {
  if (kind === "move") {
    return {
      ...from,
      x: clamp(from.x + dx, 0, innerWidth - from.w),
      y: clamp(from.y + dy, 0, innerHeight - from.h),
    };
  }
  let left = from.x;
  let top = from.y;
  let right = from.x + from.w;
  let bottom = from.y + from.h;
  if (kind.includes("w")) left = clamp(left + dx, 0, right - MIN_SIZE);
  if (kind.includes("e"))
    right = clamp(right + dx, left + MIN_SIZE, innerWidth);
  if (kind.includes("n")) top = clamp(top + dy, 0, bottom - MIN_SIZE);
  if (kind.includes("s"))
    bottom = clamp(bottom + dy, top + MIN_SIZE, innerHeight);
  return { x: left, y: top, w: right - left, h: bottom - top };
}
