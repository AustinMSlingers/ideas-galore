import { readableOn } from "@/lib/color";
import type { HexColor } from "@/types/siteConfig";

/**
 * Slim bar above the sky. Rendered only when `announcement` is non-null.
 * The foreground is derived from the accent rather than configured, so the
 * banner stays legible whatever accent the day gets.
 */
export function AnnouncementBanner({
  announcement,
  accentColor,
}: {
  announcement: string;
  accentColor: HexColor;
}) {
  return (
    <div
      className="relative z-20 px-gutter py-2.5 text-center text-small font-medium tracking-wide"
      style={{ backgroundColor: accentColor, color: readableOn(accentColor) }}
      role="status"
    >
      <p className="mx-auto max-w-shell text-balance">{announcement}</p>
    </div>
  );
}
