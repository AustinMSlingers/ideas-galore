import { Section } from "@/components/Section";
import { baseInfo, products, type Product } from "@/lib/baseInfo";

/**
 * Names, domains, links, statuses and the closing line all come from
 * `baseInfo` — never from the daily config. Only the introduction above the
 * grid is generated.
 */
function ProductCard({ product }: { product: Product }) {
  return (
    <a
      href={product.href}
      className="flex h-full flex-col rounded-card border p-6 transition-colors duration-300 ease-drift hover:border-[var(--accent)]"
      style={{ borderColor: "var(--hairline)", backgroundColor: "var(--surface)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lead">{product.name}</h3>
        <span
          className="mt-1 shrink-0 rounded-pill px-2.5 py-1 text-micro uppercase"
          style={
            product.status === "Flagship"
              ? { backgroundColor: "var(--accent)", color: "var(--on-accent)" }
              : { border: "1px solid var(--hairline)", color: "var(--muted)" }
          }
        >
          {product.status}
        </span>
      </div>

      {product.description ? (
        <p className="mt-3 text-small" style={{ color: "var(--muted)" }}>
          {product.description}
        </p>
      ) : null}

      <span className="mt-auto pt-4 text-micro uppercase" style={{ color: "var(--muted)" }}>
        {product.domain}
      </span>
    </a>
  );
}

export function ProductsGrid({ copy }: { copy: string }) {
  return (
    <Section id="products" label={baseInfo.sections.products}>
      <p className="max-w-prose text-body text-pretty" style={{ color: "var(--muted)" }}>
        {copy}
      </p>

      <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <li key={product.id}>
            <ProductCard product={product} />
          </li>
        ))}
      </ul>

      {/* Locked copy, part of the grid — not the day's writing. */}
      <p className="mt-8 font-display text-lead" style={{ color: "var(--muted)" }}>
        {baseInfo.productsClosingLine}
      </p>
    </Section>
  );
}
