import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { ThemeProvider } from "@/lib/theme-context";
import { I18nProvider } from "@/lib/i18n-context";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-card max-w-md p-10 text-center">
        <h1 className="text-7xl font-bold gradient-text">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          এই page টা পাওয়া যায়নি বা সরিয়ে ফেলা হয়েছে।
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-card max-w-md p-10 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "GrowVibe Ads Solution — Command Center" },
      {
        name: "description",
        content:
          "Real-time Facebook Ads analytics command center. Track every campaign, every client, every dollar in real time.",
      },
      { name: "author", content: "GrowVibe Ads Solution" },
      { property: "og:title", content: "GrowVibe Ads Solution — Command Center" },
      { property: "og:description", content: "Real-time Facebook Ads analytics command center." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    let subscription: ReturnType<typeof supabase.auth.onAuthStateChange> | null = null;

    try {
      const result = supabase.auth.onAuthStateChange((event) => {
        if (!isMounted) return;
        if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;

        try {
          router.invalidate();
          if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
        } catch (error) {
          console.error(
            "[Auth] State change handling failed:",
            error instanceof Error ? error.message : String(error),
          );
        }
      });
      subscription = result;
    } catch (error) {
      console.error(
        "[Auth] Failed to set up state change listener:",
        error instanceof Error ? error.message : String(error),
      );
    }

    return () => {
      isMounted = false;
      try {
        subscription?.data?.subscription?.unsubscribe?.();
      } catch (error) {
        console.error(
          "[Auth] Failed to unsubscribe:",
          error instanceof Error ? error.message : String(error),
        );
      }
    };
  }, [queryClient, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <Outlet />
          <Toaster position="top-right" richColors theme="dark" />
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
