import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth-context";
import { AuthGate } from "@/components/auth/auth-gate";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center neumorph p-10">
        <h1 className="text-7xl font-display font-bold text-gradient">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Halaman yang Anda cari tidak ada atau telah dipindahkan.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02]"
            style={{ background: "var(--gradient-neon)" }}
          >
            Kembali ke Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center neumorph p-10">
        <h1 className="text-xl font-semibold text-foreground">Halaman gagal dimuat</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Terjadi kesalahan. Silakan coba muat ulang.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-medium text-primary-foreground"
            style={{ background: "var(--gradient-neon)" }}
          >
            Coba lagi
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-border bg-card/60 px-5 py-2 text-sm font-medium text-foreground"
          >
            Ke Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "AA Creative Studio" },
      { name: "description", content: "Operating system untuk creator: command center, riset, workflow, project memory, dan realtime tasks dalam satu dashboard." },
      { name: "author", content: "AA Creative Studio" },
      { name: "theme-color", content: "#0b1024" },
      { property: "og:title", content: "AA Creative Studio" },
      { property: "og:description", content: "Operating system untuk creator: command center, riset, workflow, project memory, dan realtime tasks dalam satu dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "AA Creative Studio" },
      { name: "twitter:description", content: "Operating system untuk creator: command center, riset, workflow, project memory, dan realtime tasks dalam satu dashboard." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "https://drive.google.com/thumbnail?id=1X9sHtl0_OwVYcZIXwPmreKiOt70bnDc4&sz=w256" },
      { rel: "shortcut icon", type: "image/png", href: "https://drive.google.com/thumbnail?id=1X9sHtl0_OwVYcZIXwPmreKiOt70bnDc4&sz=w256" },
      { rel: "apple-touch-icon", href: "https://drive.google.com/thumbnail?id=1X9sHtl0_OwVYcZIXwPmreKiOt70bnDc4&sz=w256" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className="dark">
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
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate>
          <Outlet />
        </AuthGate>
        <Toaster theme="dark" position="top-right" richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
}
