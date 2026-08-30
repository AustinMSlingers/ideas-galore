import { Section } from "@/components/Section";
import { baseInfo, products, type Product } from "@/lib/baseInfo";

const STATUS_LABEL: Record<Product["status"], string> = {
  live: "Live",
  "in-build": "In build",
  concept: "Concept",
};

function ProductCard({ product }: { product: Product }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lead">{product.name}</h3>
        <span
          className="mt-0.5 shrink-0 rounded-pill px-2.5 py-1 text-micro uppercase"
          style={
            product.status === "live"
              ? { backgroundColor: "var(--accent)", color: "var(--on-accent)" }
              : { border: "1px solid var(--hairline)", color: "var(--muted)" }
          }
        >
          {STATUS_LABEL[product.status]}
        </span>
      </div>
      <p className="mt-3 text-small" style={{ color: "var(--muted)" }}>
        {product.tagline}
      </p>
    </>
  );

  const className =
    "block rounded-card border p-6 transition-colors duration-300 ease-drift";
  const style = { borderColor: "var(--hairline)", backgroundColor: "var(--surface)" };

  return product.href ? (
    <a href={product.href} className={`${className} hover:border-[var(--accent)]`} style={style}>
      {body}
    </a>
  ) : (
    <article className={className} style={style}>
      {body}
    </article>
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
    </Section>
  );
}
