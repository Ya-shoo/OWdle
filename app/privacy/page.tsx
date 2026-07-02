import { ModeBreadcrumbs } from "@/components/ModeBreadcrumbs";
import { SITE_URL, modeMetadata } from "@/lib/site";

const LAST_UPDATED = "July 2, 2026";
const PRIVACY_EMAIL = "privacy@playowdle.com";

const PAGE_DESCRIPTION =
  "How OWdle handles user data — the analytics, cookies, and advertising used, and the privacy rights available under GDPR and CCPA.";

export const metadata = modeMetadata({
  slug: "privacy",
  title: "Privacy Policy",
  description: PAGE_DESCRIPTION,
});

const linkCls = "underline underline-offset-2 hover:text-accent";

export default function PrivacyPolicyPage() {
  return (
    <>
      <ModeBreadcrumbs label="Privacy" />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-6 py-14 text-[15px] leading-relaxed text-ink-soft [&_h2]:mt-10 [&_h2]:mb-2 [&_h2]:scroll-mt-24 [&_h2]:text-base [&_h2]:text-ink [&_h3]:mt-5 [&_h3]:mb-1 [&_h3]:text-ink [&_li]:[text-wrap:pretty] [&_li]:marker:text-ink-faint [&_p]:mt-3 [&_p]:[text-wrap:pretty] [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
          <h1 className="text-2xl text-ink">Privacy Policy</h1>
          <div className="mt-1 text-[13px] text-ink-faint">
            Last updated {LAST_UPDATED}
          </div>

          <h2>Site operator</h2>
          <p>
            OWdle ({SITE_URL}) is an independent, unofficial fan project
            and is not endorsed by or affiliated with Blizzard Entertainment.
            For privacy purposes, the operator of OWdle is the data
            controller and can be reached at{" "}
            <a className={linkCls} href={`mailto:${PRIVACY_EMAIL}`}>
              {PRIVACY_EMAIL}
            </a>
            .
          </p>

          <h2>Information collected</h2>
          <p>
            The site has no accounts and never requires a login. The following
            information is collected:
          </p>
          <h3>Provided by users</h3>
          <ul>
            <li>
              Feedback. If a user submits feedback, the text they provide is
              stored. Users should avoid including personal details they
              don&rsquo;t want stored.
            </li>
            <li>
              Tips. If a user tips through the embedded Ko-fi panel, the payment
              is handled entirely by Ko-fi; card details are never seen by{" "}
              OWdle.
            </li>
          </ul>
          <h3>Collected automatically</h3>
          <p>
            Standard analytics tools, including Google Analytics, are used to
            understand how the game is used. They record:
          </p>
          <ul>
            <li>
              Pages viewed, page exits, errors, and general gameplay activity.
            </li>
            <li>
              Technical and approximate-location data: IP address (used to
              estimate country/region/city), device type, browser, operating
              system, screen size, the referring page, and any campaign
              parameters.
            </li>
            <li>
              A randomly generated, anonymous identifier. Identified profiles are
              not created for anonymous visitors.
            </li>
          </ul>
          <h3>Session replay</h3>
          <p>
            Analytics may include session replay &mdash; anonymized recordings
            of on-page interactions, used to diagnose bugs and usability issues.
            When used, it captures only a sample of sessions, masks text entered
            into form fields, and never records payment information.
          </p>
          <h3>Stored in the browser</h3>
          <p>
            Puzzle progress, streaks, and game settings are saved in the
            browser&rsquo;s local storage. That data stays on the device and is
            not transmitted to OWdle.
          </p>

          <h2 id="cookies">Cookies and similar technologies</h2>
          <p>
            OWdle and its partners use cookies and similar browser storage
            for the purposes below. In the EU/UK, non-essential and advertising
            cookies are only set after the user consents through the cookie
            banner (see{" "}
            <a className={linkCls} href="#advertising">
              Advertising
            </a>
            ).
          </p>
          <ul>
            <li>
              Strictly necessary &mdash; keeping the site online and protecting
              it against abuse.
            </li>
            <li>
              Analytics &mdash; anonymous usage measurement and error reporting,
              including Google Analytics (<code>_ga</code> cookies).
            </li>
            <li>
              Advertising &mdash; Google AdSense and its partners, for
              delivering, capping, personalizing, and measuring ads (when ads
              are live).
            </li>
            <li>Payments &mdash; Ko-fi, only if the tip panel is opened.</li>
            <li>
              Local storage &mdash; saving puzzle progress and settings in the
              browser; not a cookie and not sent off the device.
            </li>
          </ul>
          <p>
            Cookies and local storage can be cleared at any time through the
            browser settings, and Google Analytics can be opted out of with
            Google&rsquo;s{" "}
            <a className={linkCls} href="https://tools.google.com/dlpage/gaoptout">
              opt-out add-on
            </a>
            .
          </p>

          <h2 id="advertising">Advertising</h2>
          <p>OWdle is supported by ads served through Google AdSense.</p>
          <p>
            Third-party vendors, including Google, use cookies to serve ads based
            on a user&rsquo;s prior visits to this and other websites.
            Google&rsquo;s advertising cookies let it and its partners select,
            deliver, cap, measure, and personalize ads. For how Google uses data
            from sites that use its advertising, see{" "}
            <a
              className={linkCls}
              href="https://policies.google.com/technologies/partner-sites"
            >
              Google&rsquo;s partner-sites notice
            </a>
            . Users can opt out of personalized advertising in{" "}
            <a className={linkCls} href="https://myadcenter.google.com/">
              Google&rsquo;s Ads Settings
            </a>
            .
          </p>
          <h3>Ad choices</h3>
          <ul>
            <li>
              EU/UK: before any advertising or non-essential cookies load, a
              consent banner appears where users can accept or reject ad
              personalization and analytics.
            </li>
            <li>
              California and other US: users can opt out of the
              &ldquo;sale/share&rdquo; of their information for personalized
              advertising &mdash; see{" "}
              <a className={linkCls} href="#do-not-sell">
                Do Not Sell or Share
              </a>
              .
            </li>
          </ul>

          <h2>How information is used</h2>
          <ul>
            <li>Run, maintain, and improve the game.</li>
            <li>
              Understand how the game is used, and diagnose errors and
              performance issues.
            </li>
            <li>Display, cap, measure, and (with consent) personalize ads.</li>
            <li>Respond to feedback.</li>
            <li>Protect the site against abuse, fraud, and security threats.</li>
          </ul>

          <h2>Legal bases (EEA / UK)</h2>
          <p>
            For users in the European Economic Area or the UK, OWdle
            relies on these legal bases under the GDPR:
          </p>
          <ul>
            <li>
              Legitimate interests &mdash; operating and securing the site and
              understanding aggregate usage.
            </li>
            <li>
              Consent &mdash; for non-essential cookies and for advertising and
              ad personalization. Consent can be withdrawn at any time.
            </li>
          </ul>

          <h2>How information is shared</h2>
          <p>
            OWdle does not sell users&rsquo; personal information for
            money. Data is shared only with the providers needed to run the site:
          </p>
          <ul>
            <li>Analytics providers, including Google.</li>
            <li>A hosting and content-delivery provider.</li>
            <li>Google AdSense and its advertising partners.</li>
            <li>Ko-fi, only if a user chooses to tip.</li>
          </ul>
          <p>
            Under California law, allowing ad partners to use this information for
            personalized advertising may be considered a &ldquo;sale&rdquo; or
            &ldquo;share.&rdquo; See{" "}
            <a className={linkCls} href="#do-not-sell">
              Do Not Sell or Share
            </a>
            .
          </p>
          <p>
            International transfers: some providers are located in the United
            States, so information may be processed there. Where required,
            transfers from the EEA/UK rely on appropriate safeguards such as
            Standard Contractual Clauses and/or the EU-US Data Privacy Framework.
          </p>

          <h2>Privacy rights</h2>
          <p>
            EEA / UK (GDPR): users have the right to access, correct, delete,
            restrict, or object to the processing of their personal data, to data
            portability, and to withdraw consent. Users may also lodge a
            complaint with their local data protection authority.
          </p>
          <p>
            California (CCPA/CPRA): California users have the right to know what
            is collected, to delete it, to correct it, to opt out of its sale or
            sharing, and not to be discriminated against for exercising these
            rights.
          </p>
          <p>
            To exercise any of these, users can email{" "}
            <a className={linkCls} href={`mailto:${PRIVACY_EMAIL}`}>
              {PRIVACY_EMAIL}
            </a>
            . Because OWdle does not maintain user accounts, much of the
            data held is anonymous and may not be linkable to a specific person;
            OWdle may request information to help locate the data or verify
            a request.
          </p>

          <h2 id="do-not-sell">Do Not Sell or Share My Personal Information</h2>
          <p>
            California residents (and users covered by a similar US state law)
            can opt out of the &ldquo;sale&rdquo; or &ldquo;sharing&rdquo; of
            their personal information for personalized advertising:
          </p>
          <ul>
            <li>
              Use the choices in the consent/privacy banner shown with the ads,
              or
            </li>
            <li>
              Enable a{" "}
              <a className={linkCls} href="https://globalprivacycontrol.org/">
                Global Privacy Control (GPC)
              </a>{" "}
              signal in the browser &mdash; a valid GPC signal is treated as a
              request to opt out, or
            </li>
            <li>
              Email{" "}
              <a className={linkCls} href={`mailto:${PRIVACY_EMAIL}`}>
                {PRIVACY_EMAIL}
              </a>
              .
            </li>
          </ul>

          <h2>Children&rsquo;s privacy</h2>
          <p>
            OWdle is intended for a general audience and is not directed to
            children under 13 (or under 16 where that is the applicable age of
            digital consent). OWdle does not knowingly collect personal
            information from children. Anyone who believes a child has provided
            information can contact{" "}
            <a className={linkCls} href={`mailto:${PRIVACY_EMAIL}`}>
              {PRIVACY_EMAIL}
            </a>{" "}
            to have it removed.
          </p>

          <h2>Data retention</h2>
          <p>
            Analytics data is retained for a limited period according to the
            analytics providers&rsquo; standard settings. Feedback is kept for as
            long as it is useful. Data stored in the browser remains until the
            user clears it.
          </p>

          <h2>Security</h2>
          <p>
            OWdle uses reasonable technical and organizational measures to
            protect the limited data it handles, including serving the site over
            HTTPS. No method of transmission or storage is completely secure, so
            absolute security cannot be guaranteed.
          </p>

          <h2>Changes to this policy</h2>
          <p>
            This policy may be updated as the site evolves. The &ldquo;Last
            updated&rdquo; date at the top will be revised, and significant
            changes will be made more prominent.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about this policy or user data can be sent to{" "}
            <a className={linkCls} href={`mailto:${PRIVACY_EMAIL}`}>
              {PRIVACY_EMAIL}
            </a>
            .
          </p>
        </div>
      </main>
    </>
  );
}
