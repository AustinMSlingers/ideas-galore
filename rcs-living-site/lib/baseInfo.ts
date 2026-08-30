/**
 * Locked base data. Unlike SiteConfig, none of this changes day to day — it is
 * the part of the site that stays true whatever the weather.
 *
 * The product list below is a PLACEHOLDER. Replace `products` wholesale with
 * the real catalogue; the shape is what the grid renders against.
 */

export type ProductStatus = "live" | "in-build" | "concept";

export interface Product {
  id: string;
  name: string;
  /** One line, shown under the name in the grid. */
  tagline: string;
  status: ProductStatus;
  /** External link, or null while there is nothing to link to yet. */
  href: string | null;
}

export const baseInfo = {
  name: "Rustic Clouds Studio",
  shortName: "RCS",
  /** Sits under the hero line; brand-level, never generated. */
  tagline: "A small studio building software, games and quiet machines.",
  location: "Kentucky, USA",
  foundedYear: 2025,
  /** Public contact address only — no keys or secrets ever live in this repo. */
  contactEmail: "hello@rusticclouds.studio",
  sections: {
    whatWeAre: "What We Are",
    products: "Products",
    dailyEntry: "Today's Entry",
  },
} as const;

// PLACEHOLDER — swap for the real product list.
export const products: Product[] = [
  {
    id: "placeholder-one",
    name: "Product One",
    tagline: "Placeholder tagline — replace with the real product.",
    status: "live",
    href: null,
  },
  {
    id: "placeholder-two",
    name: "Product Two",
    tagline: "Placeholder tagline — replace with the real product.",
    status: "live",
    href: null,
  },
  {
    id: "placeholder-three",
    name: "Product Three",
    tagline: "Placeholder tagline — replace with the real product.",
    status: "in-build",
    href: null,
  },
  {
    id: "placeholder-four",
    name: "Product Four",
    tagline: "Placeholder tagline — replace with the real product.",
    status: "concept",
    href: null,
  },
];
