// Client-side share helpers. Captures a DOM node to a PNG blob via
// modern-screenshot, then attempts the native Web Share API. The caller
// (ShareButton) decides what to do on failure — typically open the
// ShareModal for explicit Copy / Download options. We deliberately do
// NOT layer a clipboard-write fallback inside this helper: that produced
// "two identical images pasted" surprises on desktop where the share
// sheet itself was already writing to the clipboard, and the second
// write only confused the OS payload further.

import { domToBlob } from "modern-screenshot";

export type NativeShareOutcome = "shared" | "canceled" | "unavailable" | "failed";

export async function captureNodePng(node: HTMLElement): Promise<Blob> {
  return domToBlob(node, {
    type: "image/png",
    // Retina-quality output. modern-screenshot multiplies the layout box,
    // so we get a 2160px-tall image from a 1080-tall card.
    scale: 2,
    backgroundColor: "#0a0e14",
  });
}

export async function tryNativeShare(opts: {
  blob: Blob;
  filename: string;
  url: string;
  text: string;
  title?: string;
}): Promise<NativeShareOutcome> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return "unavailable";
  }
  const file = new File([opts.blob], opts.filename, { type: "image/png" });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
  };
  if (typeof nav.canShare !== "function" || !nav.canShare({ files: [file] })) {
    return "unavailable";
  }
  try {
    await navigator.share({
      files: [file],
      url: opts.url,
      text: opts.text,
      title: opts.title,
    });
    return "shared";
  } catch (err) {
    // AbortError is the user dismissing the share sheet — not a failure
    // to escalate. Anything else is the OS or browser refusing the
    // payload; we report "failed" so the caller can open the modal.
    if (err instanceof DOMException && err.name === "AbortError") {
      return "canceled";
    }
    return "failed";
  }
}
