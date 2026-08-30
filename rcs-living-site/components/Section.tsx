/** Shared section shell: one rhythm, one heading treatment, everywhere. */
export function Section({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="px-gutter py-section">
      <div className="mx-auto w-full max-w-shell">
        <h2 className="flex items-center gap-3 text-micro font-semibold uppercase" style={{ letterSpacing: "0.18em" }}>
          <span className="h-px w-8 shrink-0" style={{ backgroundColor: "var(--accent)" }} aria-hidden="true" />
          {label}
        </h2>
        <div className="mt-stack">{children}</div>
      </div>
    </section>
  );
}
