// Keeps bottom-pinned UI (the mobile bottom-sheet dialog, class
// `keyboard-aware`) above the on-screen keyboard.
//
// Derives the keyboard height from VisualViewport: the space between the
// bottom of the visual viewport and the bottom of the layout viewport is the
// keyboard (plus browser chrome, which the `gap > 80` threshold filters out).
// Published as the `--keyboard-inset` custom property, consumed by
// `.keyboard-aware` in index.css.
//
// Tried the VirtualKeyboard API's `boundingRect`/`geometrychange` first, but
// on real hardware (Pixel 6, Chrome 151) it fired once with an implausible,
// never-updating rect (e.g. {y:49, height:322} against innerHeight:812) —
// unusable as a data source. VisualViewport is the well-established,
// reliable technique, so it's used unconditionally here rather than only as
// an iOS fallback.

export function initVirtualKeyboard() {
  const root = document.documentElement;
  const debug = import.meta.env.DEV && location.search.includes("kbdebug");
  const dbg = debug ? document.createElement("pre") : null;
  if (dbg) {
    dbg.style.cssText =
      "position:fixed;top:0;left:0;z-index:9999;margin:0;padding:4px;font:11px monospace;background:#000c;color:#0f0;pointer-events:none";
    document.body.appendChild(dbg);
  }

  const vv = window.visualViewport;
  if (!vv) return;

  const update = () => {
    const gap = window.innerHeight - (vv.height + vv.offsetTop);
    const h = gap > 80 ? Math.round(gap) : 0;
    root.style.setProperty("--keyboard-inset", `${h}px`);
    // Flag on <html> so CSS can drop keyboard-irrelevant spacing (e.g. the
    // safe-area padding) while the keyboard is open.
    root.classList.toggle("keyboard-open", h > 0);
    if (dbg) {
      dbg.textContent = JSON.stringify(
        {
          gap,
          inset: h,
          innerHeight: window.innerHeight,
          vvHeight: vv.height,
          vvOffsetTop: vv.offsetTop,
        },
        null,
        1
      );
    }
  };
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  update();
}
