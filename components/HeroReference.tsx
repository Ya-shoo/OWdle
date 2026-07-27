"use client";

import { useMemo, useState } from "react";
import { type Hero, type Role } from "@/lib/heroes";

// Interactive hero lookup for /heroes/. This is a client island, but it is
// crawl-safe by construction: its FIRST render (empty query) shows every
// hero, and under `output: "export"` the first render is exactly what gets
// baked into the static HTML. So the full roster and all attribute rows ship
// in the built page just as they did when this was a pure server component;
// the search only ever HIDES rows on the client after hydration, never adds
// content that a crawler would miss. (Same first-render principle as
// components/ModeIntro.tsx.)
//
// The tables, cap()/overrides, and TH/TD styling moved here verbatim from
// app/heroes/page.tsx so the rendered markup is unchanged.

const ROLE_ORDER: Role[] = ["tank", "damage", "support"];
const ROLE_LABEL: Record<Role, string> = {
  tank: "Tank",
  damage: "Damage",
  support: "Support",
};

const byName = (a: Hero, b: Hero) => a.name.localeCompare(b.name);

// Title-case for display. "ai" is an initialism, not a word, so it gets an
// explicit override rather than rendering as "Ai" (Echo's species).
const DISPLAY_OVERRIDES: Record<string, string> = { ai: "AI" };

const cap = (s: string | null) => {
  if (!s) return "Unknown";
  return DISPLAY_OVERRIDES[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
};

const TH =
  "whitespace-nowrap px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint";
const TD = "whitespace-nowrap px-3 py-2 text-ink-soft";

// Fold accents so "lucio" matches "Lúcio" and "torbjorn" matches "Torbjörn".
const fold = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// The text a query is matched against: name plus the identity attributes
// people actually look heroes up by. Gender/role are left out on purpose —
// they return half the roster and make for a poor lookup, and role is already
// the section grouping.
const haystack = (h: Hero) =>
  fold([h.name, h.country, h.affiliation, h.species].filter(Boolean).join(" "));

function RoleTable({ role, heroes }: { role: Role; heroes: Hero[] }) {
  if (heroes.length === 0) return null;
  return (
    <section className="mt-12">
      <header className="mb-4 flex items-baseline justify-between border-b border-line pb-3">
        <h2 className="font-display display-headline text-2xl uppercase text-ink">
          {ROLE_LABEL[role]}
        </h2>
        <span className="font-mono text-xs text-ink-faint">
          {heroes.length} {heroes.length === 1 ? "hero" : "heroes"}
        </span>
      </header>

      {/* Wide table: scrolls inside its own container so the page body never
          scrolls horizontally on mobile. */}
      <div className="overflow-x-auto rounded-(--radius-card) border border-line bg-card">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={TH}>Hero</th>
              <th scope="col" className={TH}>Origin</th>
              <th scope="col" className={TH}>Affiliation</th>
              <th scope="col" className={TH}>Species</th>
              <th scope="col" className={TH}>Gender</th>
              <th scope="col" className={TH}>Age</th>
              <th scope="col" className={TH}>Year</th>
              <th scope="col" className={TH}>HP</th>
            </tr>
          </thead>
          <tbody>
            {heroes.map((h) => (
              <tr key={h.key} className="border-b border-line last:border-b-0">
                <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-semibold text-ink">
                  {h.name}
                </th>
                <td className={TD}>{h.country ?? "Unknown"}</td>
                <td className={TD}>{h.affiliation ?? "None"}</td>
                <td className={TD}>{cap(h.species)}</td>
                <td className={TD}>{cap(h.gender)}</td>
                <td className={TD}>{h.age ?? "Unknown"}</td>
                <td className={TD}>{h.release_year ?? "Unknown"}</td>
                <td className={TD}>{h.hp ?? "Unknown"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function HeroReference({ heroes }: { heroes: Hero[] }) {
  const [query, setQuery] = useState("");
  const q = fold(query.trim());

  const matches = useMemo(
    () => (q === "" ? heroes : heroes.filter((h) => haystack(h).includes(q))),
    [q, heroes],
  );

  const byRole = useMemo(() => {
    const sorted = [...matches].sort(byName);
    return ROLE_ORDER.map((role) => ({
      role,
      heroes: sorted.filter((h) => h.role === role),
    }));
  }, [matches]);

  const withAffiliationNotes = useMemo(
    () => matches.filter((h) => h.affiliation_explanation).sort(byName),
    [matches],
  );

  const searching = q !== "";

  return (
    <div className="mt-10">
      <label htmlFor="hero-search" className="sr-only">
        Search heroes
      </label>
      <div className="flex items-center rounded-(--radius-card) border border-line bg-surface transition-colors focus-within:border-accent">
        <span aria-hidden className="pl-4 text-ink-faint">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12.5 12.5 L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
        <input
          id="hero-search"
          type="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search heroes by name, origin, or affiliation…"
          className="flex-1 bg-transparent px-3 py-3.5 text-base text-ink placeholder:text-ink-faint outline-none focus-visible:outline-none"
        />
        {searching && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="pr-4 text-ink-faint transition-colors hover:text-ink"
            aria-label="Clear search"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 4 L12 12 M12 4 L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      <p className="mt-3 text-sm text-ink-faint" aria-live="polite">
        {searching
          ? `${matches.length} of ${heroes.length} heroes`
          : "Search by name, origin, affiliation, or species."}
      </p>

      {matches.length === 0 ? (
        <p className="mt-12 rounded-(--radius-card) border border-line bg-card px-5 py-8 text-center text-ink-soft">
          No heroes match &ldquo;{query.trim()}&rdquo;. Try a name, an origin
          like Egypt, or an affiliation like Overwatch.
        </p>
      ) : (
        <>
          {byRole.map(({ role, heroes: roleHeroes }) => (
            <RoleTable key={role} role={role} heroes={roleHeroes} />
          ))}

          {withAffiliationNotes.length > 0 && (
            <section className="mt-16">
              <header className="mb-4 border-b border-line pb-3">
                <h2 className="font-display display-headline text-2xl uppercase text-ink">
                  Affiliations
                </h2>
              </header>
              <p className="mb-6 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
                Why each hero is filed under the affiliation the Classic tile
                checks.
              </p>
              <dl className="flex flex-col gap-px border border-line bg-line">
                {withAffiliationNotes.map((h) => (
                  <div key={h.key} className="bg-card px-5 py-4">
                    <dt className="font-semibold text-ink">
                      {h.name}
                      <span className="ml-2 font-mono text-xs font-normal uppercase tracking-[0.14em] text-ink-faint">
                        {h.affiliation ?? "None"}
                      </span>
                    </dt>
                    <dd className="mt-1 text-sm leading-relaxed text-ink-soft">
                      {h.affiliation_explanation}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </>
      )}
    </div>
  );
}
