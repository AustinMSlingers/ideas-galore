/**
 * Locked studio data. None of this changes day to day, and none of it is ever
 * generated: the daily SiteConfig may supply mood and copy, never a name, a
 * link, or the definition. Components read these values directly from here, so
 * a generated config has no path to alter them even if it tried.
 */

/** Verbatim status labels — not derived, not paraphrased. */
export type ProductStatus = "Flagship" | "Free everyday tool" | "Coming soon" | "In the studio";

export interface Product {
  id: string;
  name: string;
  /** Bare domain, shown under the name. */
  domain: string;
  href: string;
  status: ProductStatus;
  /** Locked one-liner, or null where none has been written yet. */
  description: string | null;
}

export const baseInfo = {
  name: "Rustic Clouds Studio",
  shortName: "RCS",

  /**
   * The definition. Rendered verbatim on the page and passed to the curator as
   * read-only context. Generated copy may work around it; it may never restate,
   * compress or rewrite it.
   */
  definition:
    "A self-owned product studio. We build, own, and operate our own portfolio of apps and games — designed, run, and maintained with AI at the core, on tools we built ourselves. Not an agency. Nobody hires us; people subscribe to what we make.",

  /** The definition's own opening sentence, for the one place a single line fits. */
  shortDefinition: "A self-owned product studio.",

  location: "Stephenville, Texas",
  /** Everything the site calls "today" is resolved in this zone. */
  timezone: "America/Chicago",
  coordinates: { latitude: 32.2207, longitude: -98.2023 },

  founder: {
    name: "Brad Leese",
    domain: "bradleese.com",
    href: "https://bradleese.com",
  },

  /** Closes the products grid. Locked copy — never generated. */
  productsClosingLine: "…and other projects always in play.",

  sections: {
    whatWeAre: "What We Are",
    products: "Products",
    dailyEntry: "Today's Entry",
  },
} as const;

/** Grid order is the order written here. */
export const products: Product[] = [
  {
    id: "onepageepk",
    name: "OnePageEPK",
    domain: "onepageepk.com",
    href: "https://onepageepk.com",
    status: "Flagship",
    description: "One-page electronic press kits for musicians.",
  },
  {
    id: "mypapersize",
    name: "MyPaperSize",
    domain: "mypapersize.com",
    href: "https://mypapersize.com",
    status: "Free everyday tool",
    description: null,
  },
  {
    id: "fileblazer",
    name: "FileBlazer",
    domain: "fileblazer.com",
    href: "https://fileblazer.com",
    status: "Coming soon",
    description: "Secure file transfer for creators and studios.",
  },
  {
    id: "meat-suits-and-motherboards",
    name: "Meat Suits & Motherboards",
    domain: "meatsuitsandmotherboards.com",
    href: "https://meatsuitsandmotherboards.com",
    status: "In the studio",
    description: null,
  },
];
