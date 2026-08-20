// Keeps bottom-pinned UI (the mobile bottom-sheet dialog, class
// `keyboard-aware`) above the on-screen keyboard.
//
// Uses the VirtualKeyboard API (Chromium/Android): opting into
// `overlaysContent` stops the browser from shrinking the layout viewport, and
// `vk.boundingRect.height` gives the keyboard's size, which we publish as the
// `--keyboard-inset` custom property for `.keyboard-aware` in index.css.
// No-op on engines without the API (e.g. iOS Safari).

type VirtualKeyboard = EventTarget & {
  overlaysContent: boolean;
  boundingRect: DOMRect;
};

export function initVirtualKeyboard() {
  const root = document.documentElement;
  const debug = import.meta.env.DEV && location.search.includes("kbdebug");
  const dbg = debug ? document.createElement("pre") : null;
  if (dbg) {
    dbg.style.cssText =
      "position:fixed;top:0;left:0;z-index:9999;margin:0;padding:4px;font:11px monospace;background:#000c;color:#0f0;pointer-events:none";
    document.body.appendChild(dbg);
  }

  const vk = (navigator as Navigator & { virtualKeyboard?: VirtualKeyboard }).virtualKeyboard;
  if (!vk) return;

  vk.overlaysContent = true;

  const apply = () => {
    const h = Math.max(0, Math.round(vk.boundingRect.height));
    root.style.setProperty("--keyboard-inset", `${h}px`);
    // Flag on <html> so CSS can drop keyboard-irrelevant spacing (e.g. the
    // safe-area padding) while the keyboard is open.
    root.classList.toggle("keyboard-open", h > 0);
    if (dbg) {
      dbg.textContent = JSON.stringify(
        { rect: vk.boundingRect.toJSON(), innerHeight: window.innerHeight },
        null,
        1
      );
    }
  };

  vk.addEventListener("geometrychange", () => {
    apply();
    // On Android Chrome, opening the keyboard also retracts the bottom URL
    // bar; when that reflow lands after this event, boundingRect briefly
    // under-reports the keyboard height. Re-sample once it settles.
    setTimeout(apply, 150);
  });
}
