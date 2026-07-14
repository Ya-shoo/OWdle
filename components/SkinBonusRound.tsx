"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import type { Skin } from "@/lib/heroes";

// Spotlight bonus, LoLdle-style: after the player names the hero, they get
// one shot at typing the (now fully revealed) skin's name and hitting
// Guess. A typeahead dropdown over the hero's full skin list helps with
// spelling — picking a suggestion fills the input, it never auto-submits.
// Suggestions are name + rarity only; we never show skin art (players
// would just visually match the revealed splash instead of knowing the
// name).
//
// `selected` reported to the parent is an index into the hero's skins[]
// (stable across reloads since skins.json order is fixed); -1 means the
// guessed text matched none of them.
export function SkinBonusRound({
  skins,
  correctSkinKey,
  saved,
  onSelect,
}: {
  skins: Skin[];
  correctSkinKey: string;
  saved: { selected: number; correct: boolean | null } | undefined;
  onSelect: (selectedIndex: number, correct: boolean | null) => void;
}) {
  const answered = saved != null;
  const correctSkin = skins.find((s) => s.key === correctSkinKey);
  const pickedSkin =
    saved != null && saved.selected >= 0 ? skins[saved.selected] : null;

  const handleGuess = (text: string) => {
    if (answered) return;
    const q = fold(text.trim());
    if (!q) return;
    const idx = skins.findIndex((s) => fold(s.name) === q);
    if (idx >= 0) {
      onSelect(idx, skins[idx].key === correctSkinKey);
    } else {
      // Free-text miss — counts as the one shot, like LoLdle.
      onSelect(-1, false);
    }
  };

  const eyebrowText = answered
    ? saved!.correct
      ? "Bonus · Correct"
      : "Bonus · Missed"
    : "Bonus question";

  const eyebrowColor = answered
    ? saved!.correct
      ? "text-correct"
      : "text-far"
    : "text-accent-soft";

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="rounded-(--radius-card) border border-line bg-card p-5 text-center sm:p-6"
    >
      <p
        className={clsx(
          "utility-label text-[10px]",
          eyebrowColor,
        )}
      >
        {eyebrowText}
      </p>

      <p className="mx-auto mt-2 mb-5 max-w-md font-soft text-2xl leading-snug text-ink sm:text-3xl">
        {answered
          ? saved!.correct
            ? `It's the ${correctSkin?.name ?? "right"} skin!`
            : `It's the ${correctSkin?.name ?? "daily"} skin.`
          : "What is the skin name?"}
      </p>

      {answered ? (
        <div className="flex flex-wrap items-center justify-center gap-2 utility-label text-[11px]">
          {correctSkin && (
            <>
              <span
                className={
                  correctSkin.rarity === "legendary"
                    ? "text-accent-soft"
                    : "text-info"
                }
              >
                {correctSkin.rarity}
              </span>
              <span className="text-ink-soft">·</span>
              <span className="text-ink">{correctSkin.name}</span>
            </>
          )}
          {!saved!.correct && (
            <span className="text-ink-faint">
              {pickedSkin
                ? `(you guessed ${pickedSkin.name})`
                : "(no match)"}
            </span>
          )}
        </div>
      ) : (
        <SkinGuessInput skins={skins} onGuess={handleGuess} />
      )}
    </motion.section>
  );
}

// Lowercase + strip diacritics, mirroring HeroCombobox so "lu" matches
// "Lúcio"-style accented skin names too.
const fold = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function SkinGuessInput({
  skins,
  onGuess,
}: {
  skins: Skin[];
  onGuess: (text: string) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  const filtered = useMemo(() => {
    const q = fold(query.trim());
    const sorted = [...skins].sort((a, b) => a.name.localeCompare(b.name));
    // Empty query previews the first few skins alphabetically, mirroring
    // the hero combobox in Classic — tapping the field immediately shows
    // what kind of answers it expects.
    if (!q) return sorted.slice(0, 8);
    const starts: Skin[] = [];
    const contains: Skin[] = [];
    for (const s of sorted) {
      const name = fold(s.name);
      if (name.startsWith(q)) starts.push(s);
      else if (name.includes(q)) contains.push(s);
    }
    return [...starts, ...contains].slice(0, 8);
  }, [skins, query]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // Picking a suggestion fills the input — Guess is always the explicit
  // commit so a stray click can't burn the one shot.
  const fill = (skin: Skin) => {
    setQuery(skin.name);
    setOpen(false);
    setActiveIndex(0);
    inputRef.current?.focus();
  };

  const submit = () => {
    if (!query.trim()) return;
    setOpen(false);
    onGuess(query);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Enter fills the highlighted suggestion while the list is open;
      // with the list closed (or nothing matching) it submits the guess.
      if (open && filtered[activeIndex]) {
        fill(filtered[activeIndex]);
      } else {
        submit();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4">
      <div className="relative w-full">
        <div
          className={clsx(
            "flex items-center border bg-surface transition-colors",
            "rounded-(--radius-card)",
            open && filtered.length > 0 ? "border-accent" : "border-line",
          )}
        >
          <input
            ref={inputRef}
            id={id}
            type="text"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActiveIndex(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKeyDown}
            placeholder="Type the skin name…"
            role="combobox"
            aria-expanded={open && filtered.length > 0}
            aria-controls={`${id}-listbox`}
            aria-autocomplete="list"
            className="flex-1 bg-transparent px-4 py-3.5 text-center text-base text-ink placeholder:text-ink-faint outline-none focus-visible:outline-none"
          />
        </div>

        {open && filtered.length > 0 && (
          <ul
            id={`${id}-listbox`}
            role="listbox"
            className={clsx(
              "absolute left-0 right-0 z-50 mt-2 max-h-64 overflow-y-auto text-left sm:max-h-80",
              "border border-line bg-surface",
              "rounded-(--radius-card) shadow-2xl shadow-black/10",
            )}
          >
            {filtered.map((skin, idx) => {
              const active = idx === activeIndex;
              return (
                <li
                  key={skin.key}
                  ref={active ? activeRef : null}
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    fill(skin);
                  }}
                  className={clsx(
                    "flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition-colors sm:py-2.5",
                    active ? "bg-muted" : "hover:bg-muted",
                  )}
                >
                  <span className="truncate font-medium text-ink">
                    {skin.name}
                  </span>
                  <span
                    className={clsx(
                      "shrink-0 utility-label text-[10px]",
                      skin.rarity === "legendary"
                        ? "text-accent-soft"
                        : "text-info",
                    )}
                  >
                    {skin.rarity}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={!query.trim()}
        className={clsx(
          "rounded-(--radius-card) border px-10 py-3 utility-label text-xs transition-all",
          query.trim()
            ? "border-accent bg-accent text-on-accent hover:bg-accent-soft active:scale-[0.98]"
            : "cursor-not-allowed border-line bg-muted text-ink-faint",
        )}
      >
        Guess
      </button>
    </div>
  );
}
