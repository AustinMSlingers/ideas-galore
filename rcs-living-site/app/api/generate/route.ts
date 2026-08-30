import { createHash, timingSafeEqual } from "node:crypto";

import { requireCronSecret } from "@/lib/env";
import { runGeneration } from "@/lib/runGeneration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Three curator attempts plus retries can outlast the default 10s ceiling. */
export const maxDuration = 60;

/** Compares digests so the check takes the same time whatever the input. */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`, so that is the shape
 * this accepts. With CRON_SECRET unset the route refuses to run at all rather
 * than falling open.
 */
function authorize(request: Request): Response | null {
  let expected: string;
  try {
    expected = requireCronSecret();
  } catch (cause) {
    return Response.json({ ok: false, error: (cause as Error).message }, { status: 500 });
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!provided || !secretMatches(provided, expected)) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  return null;
}

async function handle(request: Request): Promise<Response> {
  const rejection = authorize(request);
  if (rejection) return rejection;

  try {
    const summary = await runGeneration();

    // A miss is a handled outcome, but the cron dashboard should still show red —
    // a day that quietly failed to regenerate is exactly what you want to notice.
    return Response.json(summary, { status: summary.ok ? 200 : 502 });
  } catch (cause) {
    // Anything runGeneration could not handle itself — a missing env var, an
    // unreachable database. Report it as JSON; an opaque 500 in a cron log is
    // no help at 6am.
    const error = cause instanceof Error ? cause.message : String(cause);
    console.error(`[generate] unrecoverable: ${error}`);
    return Response.json({ ok: false, saved: false, error }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
