import clsx from "clsx";

// "OWdle" branded wordmark. Display font, with the "OW" treated as the
// emphatic glyph (like the franchise logo) and "dle" as the soft suffix.
export function Brand({
  size = "md",
  as: Tag = "span",
  className,
}: {
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
}) {
  const sizeClasses = {
    sm: "text-lg",
    md: "text-2xl",
    lg: "text-4xl",
    xl: "text-6xl",
    "2xl": "text-8xl",
  }[size];

  return (
    <Tag
      className={clsx(
        // Saira Condensed carries the wordmark now — no negative tracking
        // (condensed faces close up on their own; tight tracking clogs the
        // counters at display sizes).
        "font-display display-headline",
        sizeClasses,
        className,
      )}
    >
      <span className="text-ink">OW</span>
      <span className="text-accent">dle</span>
    </Tag>
  );
}
