// Client-side share-image capture. Snapshots a DOM node to a PNG blob
// via modern-screenshot — consumed by ShareModal's Download path (and
// its no-OG preview fallback). The old file-based native-share helper
// is gone: shares are link-first now (navigator.share({ url }) /
// clipboard link), and attaching a file to the OS sheet was exactly
// what made share targets drop the URL on the floor.

import { domToBlob } from "modern-screenshot";

export async function captureNodePng(node: HTMLElement): Promise<Blob> {
  return domToBlob(node, {
    type: "image/png",
    // Retina-quality output. modern-screenshot multiplies the layout box,
    // so we get a 2160px-tall image from a 1080-tall card.
    scale: 2,
    // No backgroundColor fill: the chip-style cards have rounded
    // corners, and the area outside the radius must stay transparent
    // in the PNG instead of being squared off with dark fill. (Square
    // cards paint their own background, so they're unaffected.)
  });
}
