"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import type { Hero } from "@/lib/heroes";

// Wii-styled hero combobox: pill-shaped input, glassy panel for the
// listbox, Mii-circle portraits for each option. Same keyboard model
// as the production HeroCombobox (Up/Down/Enter/Escape). Auto-focuses
// because that's what a player wants on a daily-quiz mode page.

type Props = {
  heroes: Hero[];
  excludeKeys: Set<string>;
  onSelect: (hero: Hero) => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
};

export function WiiCombobox({
  heroes,
  excludeKeys,
  onSelect,
  disabled,
  placeholder = "Type a hero…",
  autoFocus,
}: Props) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const available = heroes
      .filter((h) => !excludeKeys.has(h.key))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return available.slice(0, 8);
    const starts: Hero[] = [];
    const contains: Hero[] = [];
    for (const h of available) {
      const name = h.name.toLowerCase();
      if (name.startsWith(q)) starts.push(h);
      else if (name.includes(q)) contains.push(h);
    }
    return [...starts, ...contains].slice(0, 8);
  }, [heroes, excludeKeys, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    if (autoFocus) {
      // small delay so the channel-route enter animation completes
      // before the keyboard pops on touch devices
      const t = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  const commit = (hero: Hero) => {
    onSelect(hero);
    setQuery("");
    setOpen(false);
    setActiveIndex(0);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filtered[activeIndex];
      if (target) commit(target);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="relative">
      <div
        className={clsx(
          "relative flex items-center overflow-hidden transition-[box-shadow,background] duration-200",
        )}
        style={{
          borderRadius: "var(--wii-radius-input)",
          background: open
            ? "linear-gradient(180deg, #2c4078 0%, var(--wii-surface) 100%)"
            : "var(--wii-surface-gradient)",
          boxShadow: open
            ? "0 0 0 2px var(--wii-blue), 0 12px 26px -10px rgba(0,0,0,0.6), 0 0 22px var(--wii-blue-glow-soft), inset 0 1px 0 rgba(255,255,255,0.18)"
            : "var(--wii-shadow-pill)",
        }}
      >
        <span
          aria-hidden
          className="grid h-12 w-12 place-items-center pl-3"
          style={{ color: open ? "var(--wii-blue)" : "var(--wii-ink-soft)" }}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="2" />
            <path d="M14.5 14.5 L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
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
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          aria-autocomplete="list"
          aria-activedescendant={
            open && filtered[activeIndex]
              ? `${id}-opt-${filtered[activeIndex].key}`
              : undefined
          }
          className="flex-1 bg-transparent px-2 py-4 pr-5 text-[17px] font-medium outline-none placeholder:opacity-60"
          style={{ color: "var(--wii-ink)" }}
        />
      </div>

      {open && filtered.length > 0 && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-3 max-h-80 overflow-y-auto p-2"
          style={{
            background: "var(--wii-surface-gradient)",
            borderRadius: "20px",
            boxShadow:
              "0 18px 36px -10px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 0 0 1px var(--wii-surface-edge)",
          }}
        >
          {filtered.map((hero, idx) => {
            const active = idx === activeIndex;
            return (
              <li
                key={hero.key}
                id={`${id}-opt-${hero.key}`}
                ref={active ? activeRef : null}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(hero);
                }}
                className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors"
                style={{
                  borderRadius: "999px",
                  background: active
                    ? "linear-gradient(180deg, rgba(108,200,255,0.32) 0%, rgba(108,200,255,0.1) 100%)"
                    : "transparent",
                  boxShadow: active
                    ? "inset 0 1px 0 rgba(255,255,255,0.22)"
                    : "none",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={hero.portrait}
                  alt=""
                  width={40}
                  height={40}
                  className="wii-mii h-10 w-10 shrink-0 object-cover"
                  loading="eager"
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-[15px] font-bold"
                    style={{ color: "var(--wii-ink)" }}
                  >
                    {hero.name}
                  </div>
                  <div
                    className="truncate text-[10px] font-bold uppercase tracking-[0.18em]"
                    style={{
                      color: active
                        ? "var(--wii-blue)"
                        : "var(--wii-ink-faint)",
                    }}
                  >
                    {hero.role}
                    {hero.subrole ? ` · ${hero.subrole}` : ""}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
