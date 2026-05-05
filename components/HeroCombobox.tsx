"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import type { Hero } from "@/lib/heroes";

type Props = {
  heroes: Hero[];
  excludeKeys: Set<string>;
  onSelect: (hero: Hero) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function HeroCombobox({
  heroes,
  excludeKeys,
  onSelect,
  disabled,
  placeholder = "Enter a hero…",
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
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <div
        className={clsx(
          "flex items-center border bg-surface transition-colors",
          "rounded-(--radius-card)",
          open ? "border-accent" : "border-line",
          disabled && "opacity-60",
        )}
      >
        <span aria-hidden className="pl-4 text-ink-faint">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12.5 12.5 L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
          className="flex-1 bg-transparent px-3 py-3.5 text-base text-ink placeholder:text-ink-faint outline-none focus-visible:outline-none"
        />
      </div>

      {open && filtered.length > 0 && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className={clsx(
            "absolute left-0 right-0 z-50 mt-2 max-h-80 overflow-y-auto",
            "border border-line bg-surface",
            "rounded-(--radius-card) shadow-2xl shadow-black/10",
          )}
        >
          {filtered.map((hero, idx) => {
            const active = idx === activeIndex;
            return (
              <li
                key={hero.key}
                ref={active ? activeRef : null}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(hero);
                }}
                className={clsx(
                  "flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors",
                  active ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={hero.portrait}
                  alt=""
                  width={36}
                  height={36}
                  className="h-9 w-9 shrink-0 rounded-full bg-muted object-cover"
                  loading="lazy"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-ink">{hero.name}</div>
                  <div className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                    {hero.role}
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
