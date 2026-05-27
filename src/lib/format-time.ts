// Tiny relative-time formatter. Avoids pulling in date-fns just to render
// "5h ago" on a couple of pages.
//
// Output buckets:
//   < 60s      → "just now"
//   < 60m      → "Nm ago"
//   < 24h      → "Nh ago"
//   < 7d       → "Nd ago"
//   otherwise  → "Mon DD" (within same year) or "Mon DD, YYYY"

export function relativeTime(when: Date | string, now: Date = new Date()): string {
  const then = typeof when === "string" ? new Date(when) : when;
  const deltaMs = now.getTime() - then.getTime();
  const deltaSec = Math.floor(deltaMs / 1000);

  if (deltaSec < 0) return "just now";
  if (deltaSec < 60) return "just now";

  const deltaMin = Math.floor(deltaSec / 60);
  if (deltaMin < 60) return `${deltaMin}m ago`;

  const deltaHr = Math.floor(deltaMin / 60);
  if (deltaHr < 24) return `${deltaHr}h ago`;

  const deltaDay = Math.floor(deltaHr / 24);
  if (deltaDay < 7) return `${deltaDay}d ago`;

  const sameYear = then.getFullYear() === now.getFullYear();
  return then.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** True when the timestamp is within the last `hours` hours of `now`. */
export function isRecent(when: Date | string, hours = 24, now: Date = new Date()): boolean {
  const then = typeof when === "string" ? new Date(when) : when;
  const deltaMs = now.getTime() - then.getTime();
  return deltaMs >= 0 && deltaMs < hours * 60 * 60 * 1000;
}
