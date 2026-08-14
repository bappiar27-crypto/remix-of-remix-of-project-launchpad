import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // App-wide auto-refresh: every useQuery in the app refetches every 60s,
  // including while the tab is in the background. Combined with the per-minute
  // pg_cron sync, this makes every page (dashboard, campaigns, ad sets, ads,
  // clients, portal) auto-pull fresh data without any user action.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchInterval: 60_000,
        refetchIntervalInBackground: true,
        refetchOnWindowFocus: true,
        staleTime: 30_000,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
