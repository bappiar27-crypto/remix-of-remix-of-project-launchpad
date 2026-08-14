// Public client portal — modern shareable URL: /client/<UNIQUE_ID> (e.g. /client/MNG017).
// Backward-compat: old /portal/<slug> links keep working (same component, different file).
// The data fetcher accepts both client_code and slug, so we forward `code` as `slug`.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PortalDashboard } from "./portal.$slug";

const searchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute("/client/$code")({
  validateSearch: (s: Record<string, unknown>) => searchSchema.parse(s),
  head: ({ params }) => ({
    meta: [
      { title: `${params.code} — Live Ads Dashboard` },
      {
        name: "description",
        content: `Live Facebook Ads performance dashboard for ${params.code}.`,
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ClientPortalPage,
});

function ClientPortalPage() {
  const { code } = Route.useParams();
  const { token } = Route.useSearch();
  // PortalDashboard accepts either a slug or a client_code via the same `slug` prop.
  return <PortalDashboard slug={code} token={token} />;
}
