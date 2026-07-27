import Link from "next/link";
import { ModeBreadcrumbs } from "@/components/ModeBreadcrumbs";
import {
  CONTACT_EMAIL,
  SITE_NAME,
  SITE_URL,
  modeMetadata,
} from "@/lib/site";

// Plain contact route, styled like /privacy/ and /guides/. Deliberately
// bare: an address, what it reaches, and the two existing channels. No
// invented voice copy — anything with a voice is Yash's to write.

const PAGE_DESCRIPTION =
  "How to get in touch with OWdle, the daily Overwatch guessing game.";

export const metadata = modeMetadata({
  slug: "contact",
  title: "Contact",
  seoTitle: "Contact OWdle",
  description: PAGE_DESCRIPTION,
});

const PAGE_URL = `${SITE_URL}/contact/`;

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "@id": `${PAGE_URL}#breadcrumbs`,
  itemListElement: [
    { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Contact", item: PAGE_URL },
  ],
};

const linkCls = "underline underline-offset-2 hover:text-accent";

export default function ContactPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <ModeBreadcrumbs label="Contact" />
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-6 py-14 text-[15px] leading-relaxed text-ink-soft">
          <h1 className="text-2xl text-ink">Contact</h1>

          <p className="mt-4">
            OWdle is made by one person. Email{" "}
            <a className={linkCls} href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>{" "}
            for anything to do with the site: bugs, wrong answers, takedown
            or licensing questions, or press.
          </p>

          <section className="mt-8">
            <h2 className="text-lg text-ink">Reporting a problem with a puzzle</h2>
            <p className="mt-2">
              Every mode has a feedback button in the page footer. That goes
              straight through with the puzzle and day attached, which makes
              it faster to act on than an email.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-lg text-ink">Requesting a game or a mode</h2>
            <p className="mt-2">
              Suggestions and votes for what gets built next live on{" "}
              <Link href="/whats-next/" className={linkCls}>
                what&rsquo;s next
              </Link>
              .
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-lg text-ink">Privacy and data requests</h2>
            <p className="mt-2">
              Data access and deletion requests are handled at the same
              address. See the{" "}
              <Link href="/privacy/" className={linkCls}>
                privacy policy
              </Link>{" "}
              for what OWdle stores and how long it keeps it.
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
