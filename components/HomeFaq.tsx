import { HOME_FAQ, type FaqItem } from "@/lib/faq";

// FAQ block. Native <details>/<summary> so the answer copy is always
// present in the DOM (crawlable) and the toggle works with zero JS. Styled
// flat — solid surfaces, hairline separators, no gradients — to match the
// de-gradiented UI. The matching FAQPage JSON-LD is emitted from the page
// off the SAME source array, so the visible copy and the structured data
// never drift. Each question is an <h3> under the section <h2>, which also
// makes the target-keyword phrasing part of the page's heading outline.
//
// Defaults to the home FAQ; pass `items`/`heading` to reuse the exact same
// visible+structured pairing on a mode page (e.g. Melee → MELEE_FAQ).
export function HomeFaq({
  items = HOME_FAQ,
  heading = "Frequently asked questions",
}: {
  items?: FaqItem[];
  heading?: string;
} = {}) {
  return (
    <section className="mx-auto max-w-3xl px-6 pb-20 pt-4">
      <div className="mb-6 border-b border-line pb-3">
        <h2 className="font-soft text-2xl font-bold text-ink">{heading}</h2>
      </div>

      <ul className="flex flex-col gap-px border border-line bg-line">
        {items.map(({ q, a }, i) => (
          <li key={q}>
            <details className="group bg-canvas" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted [&::-webkit-details-marker]:hidden">
                <h3 className="font-soft text-lg font-semibold text-ink">
                  {q}
                </h3>
                {/* plus → x on open */}
                <svg
                  aria-hidden
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  className="shrink-0 text-ink-faint transition-transform duration-200 group-open:rotate-45"
                >
                  <path
                    d="M7 1 V13 M1 7 H13"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="square"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5 pt-0">
                <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
                  {a}
                </p>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
