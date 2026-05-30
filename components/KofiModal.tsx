"use client";

// Themed "Tip on Ko-fi" trigger that opens a native <dialog> containing
// Ko-fi's official panel iframe. Keeps our header/buttons on-brand while
// the third-party UI stays contained inside a modal. Iframe is rendered
// lazily — only when the dialog has been opened — so we don't pay Ko-fi's
// page weight for visitors who never tip.

import { useEffect, useRef, useState } from "react";

type Props = {
  username: string;
};

export function KofiModal({ username }: Props) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
      setHasOpened(true);
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  const onBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) setOpen(false);
  };

  return (
    <>
      {/* Use Ko-fi's official button image so it's instantly recognizable
          as a Ko-fi tip jar without users needing to read the label. We
          override the click to open our embedded modal rather than letting
          the image link redirect away — this is why it's a <button>, not
          an <a>. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-block cursor-pointer border-0 bg-transparent p-0 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.04] active:scale-[0.98]"
        aria-label="Open Ko-fi tip panel"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://storage.ko-fi.com/cdn/kofi3.png?v=3"
          alt="Support me on Ko-fi"
          width={297}
          height={58}
          style={{ display: "block", border: 0, height: 58, width: 297 }}
        />
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={onBackdropClick}
        className="m-auto w-[min(440px,92vw)] max-h-[90vh] max-w-[92vw] border border-line bg-surface p-0 text-ink backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-info">
            Tip on Ko-fi
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="-mr-1 px-2 py-1 font-mono text-base leading-none text-ink-soft transition-colors hover:text-ink"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="relative h-[680px] max-h-[78vh]">
          {hasOpened && !loaded ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface font-mono text-[11px] uppercase tracking-[0.22em] text-ink-faint">
              Loading Ko-fi…
            </div>
          ) : null}
          {hasOpened ? (
            <iframe
              title={`Support ${username} on Ko-fi`}
              src={`https://ko-fi.com/${username}/?hidefeed=true&widget=true&embed=true&preview=true`}
              onLoad={() => setLoaded(true)}
              style={{
                border: "none",
                width: "100%",
                height: "100%",
                background: "#f9f9f9",
              }}
            />
          ) : null}
        </div>
      </dialog>
    </>
  );
}

