// The in-page controls' markup and styles, rendered inside a closed shadow root so the page's
// CSS cannot reach in and ours cannot leak out (spine §8.3).
export const CONTROLS_HTML = `
  <style>
    :host { all: initial; }
    * { box-sizing: border-box; }
    .bar {
      position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%);
      display: flex; gap: 6px; align-items: center; padding: 8px 10px;
      background: #111; color: #fff; border-radius: 12px;
      font: 13px/1.2 system-ui, sans-serif; box-shadow: 0 4px 16px rgba(0,0,0,.4);
      pointer-events: auto; user-select: none;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #e33; animation: pulse 1.6s infinite; }
    @keyframes pulse { 50% { opacity: .35; } }
    button { all: initial; font: inherit; color: inherit; cursor: pointer; }
    .bar button { background: #333; padding: 7px 11px; border-radius: 8px; }
    .bar button:hover { background: #555; }
    .bar button.primary { background: #2a7; font-weight: 600; }
    .bar button.primary:hover { background: #3b8; }
    .bar button.on { background: #2a7; }
    .hint { opacity: .7; min-width: 120px; }

    /* Drawing a region: a full-window layer that takes the drag. */
    .glass { position: fixed; inset: 0; cursor: crosshair; pointer-events: auto; user-select: none; display: none; }

    /* The region. Its inside stays click-through so the page under it can still be used; only
       its edges, corners, grip and close button take the pointer. */
    .rect { position: fixed; border: 2px dashed #2a7; background: rgba(34,170,119,.06); pointer-events: none; display: none; }
    .edge { position: absolute; pointer-events: auto; }
    .edge.n { top: -6px; left: 8px; right: 8px; height: 12px; cursor: ns-resize; }
    .edge.s { bottom: -6px; left: 8px; right: 8px; height: 12px; cursor: ns-resize; }
    .edge.e { right: -6px; top: 8px; bottom: 8px; width: 12px; cursor: ew-resize; }
    .edge.w { left: -6px; top: 8px; bottom: 8px; width: 12px; cursor: ew-resize; }
    .corner {
      position: absolute; width: 12px; height: 12px; pointer-events: auto;
      background: #fff; border: 2px solid #2a7; border-radius: 3px; box-shadow: 0 1px 3px rgba(0,0,0,.3);
    }
    .corner.nw { top: -7px; left: -7px; cursor: nwse-resize; }
    .corner.se { bottom: -7px; right: -7px; cursor: nwse-resize; }
    .corner.ne { top: -7px; right: -7px; cursor: nesw-resize; }
    .corner.sw { bottom: -7px; left: -7px; cursor: nesw-resize; }
    .grip {
      position: absolute; left: 50%; top: -30px; transform: translateX(-50%); pointer-events: auto;
      padding: 4px 10px; border-radius: 999px; background: #2a7; color: #fff;
      font: 600 12px/1.2 system-ui, sans-serif; cursor: move; white-space: nowrap;
      box-shadow: 0 1px 4px rgba(0,0,0,.3);
    }
    .grip.inside { top: 6px; }
    .close {
      position: absolute; top: -12px; right: -12px; width: 24px; height: 24px; pointer-events: auto;
      border-radius: 50%; background: #111; color: #fff; text-align: center;
      font: 16px/24px system-ui, sans-serif; box-shadow: 0 1px 4px rgba(0,0,0,.4);
    }
    .close:hover { background: #d33; }
    .close.inside-top { top: 6px; }
    .close.inside-right { right: 6px; }
  </style>
  <div class="glass"></div>
  <div class="rect">
    <div class="edge n" data-adjust="n"></div>
    <div class="edge s" data-adjust="s"></div>
    <div class="edge e" data-adjust="e"></div>
    <div class="edge w" data-adjust="w"></div>
    <div class="corner nw" data-adjust="nw"></div>
    <div class="corner ne" data-adjust="ne"></div>
    <div class="corner se" data-adjust="se"></div>
    <div class="corner sw" data-adjust="sw"></div>
    <button class="grip" data-adjust="move" title="Drag to move the region">⠿ Move</button>
    <button class="close" title="Remove region" aria-label="Remove region">×</button>
  </div>
  <div class="bar">
    <span class="dot" title="Teardown is recording"></span>
    <button class="primary" data-act="capture">Capture</button>
    <button data-act="freehand">Region</button>
    <button data-act="clear" hidden>Clear</button>
    <span class="hint">⌘⇧S captures</span>
  </div>
`;
