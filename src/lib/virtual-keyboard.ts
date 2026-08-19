// Keeps bottom-pinned UI (the mobile bottom-sheet dialog, class
// `keyboard-aware`) above the on-screen keyboard.
//
// 1. VirtualKeyboard API (Chromium/Android): opting into `overlaysContent`
//    stops the browser from shrinking the layout viewport and instead exposes
//    the keyboard's size to CSS as `env(keyboard-inset-height)`.
// 2. Fallback (iOS Safari etc.): derive the keyboard height from the
//    VisualViewport and publish it as the `--keyboard-inset` custom property.
//
// CSS consumes both via `.keyboard-aware` in index.css.

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
  const report = (src: string, extra: Record<string, unknown>) => {
    if (!dbg) return;
    const vv = window.visualViewport;
    dbg.textContent = JSON.stringify(
      {
        src,
        ...extra,
        innerHeight: window.innerHeight,
        vvHeight: vv?.height,
        vvOffsetTop: vv?.offsetTop,
        scrollY: window.scrollY,
        inset: root.style.getPropertyValue("--keyboard-inset"),
      },
      null,
      1
    );
  };

  const setInset = (px: number) => {
    const h = Math.max(0, Math.round(px));
    root.style.setProperty("--keyboard-inset", `${h}px`);
    // Flag on <html> so CSS can drop keyboard-irrelevant spacing (e.g. the
    // safe-area padding) while the keyboard is open.
    root.classList.toggle("keyboard-open", h > 0);
  };

  const vk = (navigator as Navigator & { virtualKeyboard?: VirtualKeyboard }).virtualKeyboard;
  if (vk) {
    vk.overlaysContent = true;
    // Mirror into the custom property too, so one CSS rule covers every engine.
    vk.addEventListener("geometrychange", () => {
      setInset(vk.boundingRect.height);
      report("virtualKeyboard", { rect: vk.boundingRect.toJSON() });
    });
    return;
  }

  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    // Space below the visual viewport = keyboard (plus browser chrome, ~0 when
    // the keyboard is up). Ignore small values caused by URL-bar resizing.
    const gap = window.innerHeight - (vv.height + vv.offsetTop);
    setInset(gap > 80 ? gap : 0);
    report("visualViewport", { gap });
  };
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  update();
}
