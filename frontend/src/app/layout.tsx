import type { Metadata, Viewport } from "next";
import { AppProviders } from "@/providers/app-providers";
import { publicConfig } from "@/lib/config/env";
import {
  getServerLocale,
  getServerDirection,
} from "@/lib/i18n/server";
import "@fontsource/vazirmatn/400.css";
import "@fontsource/vazirmatn/500.css";
import "@fontsource/vazirmatn/600.css";
import "@fontsource/vazirmatn/700.css";
import "@fontsource/vazirmatn/arabic-400.css";
import "@fontsource/vazirmatn/arabic-500.css";
import "@fontsource/vazirmatn/arabic-700.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: {
    default: publicConfig.appName,
    template: `%s | ${publicConfig.appName}`,
  },
  description: "فروشگاه آنلاین",
  openGraph: {
    type: "website",
    title: publicConfig.appName,
    locale: "fa_IR",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // The visual viewport shrinking behind the keyboard would leave the fixed
  // search overlay's input bar stranded under it; resizing the layout keeps
  // the dvh-based overlay (and its input row) fully visible while typing.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1020" },
  ],
};

// The root layout reads the locale cookie to set dir/lang server-side, avoiding
// a hydration flash. The client I18nProvider takes over for in-app switching.
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getServerLocale();
  const dir = getServerDirection(locale);

  return (
    <html
      lang={locale}
      dir={dir}
      className="h-full bg-background"
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background font-sans text-foreground antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
