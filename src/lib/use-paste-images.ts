import { useEffect } from "react";

// Global paste listener for screenshot uploads: when the clipboard carries one
// or more images (e.g. a screenshot copied straight from the OS's snip tool),
// hand them to the caller as Files, same shape as a <input type="file"> pick.
// Ordinary text paste is untouched — clipboardData only exposes a "file" kind
// item when actual image/file data is attached, so a normal Cmd+V into the
// Name/Description fields never reaches here.
export function usePasteImages(onFiles: (files: File[]) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length) {
        // Only swallow the paste once we know it's image data — a caption
        // typed alongside the screenshot still lands in its text field.
        e.preventDefault();
        onFiles(files);
      }
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFiles, enabled]);
}
