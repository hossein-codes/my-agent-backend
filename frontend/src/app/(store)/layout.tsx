import { StoreHeader } from "@/components/layout/store-header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { PromoBar } from "@/components/layout/promo-bar";
import { SiteFooter } from "@/components/layout/site-footer";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Storefront mobile shell.
 *
 * The promo bar and header form ONE sticky block pinned to the top: both stay
 * visible while scrolling, the promo bar always stacking above the header,
 * and the composition restores naturally when returning to the top. The
 * wrapper fills the viewport (min-h-dvh) so the `fixed bottom-0` mobile nav
 * anchors correctly on short pages.
 */
export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative flex min-h-dvh flex-col">
        <div className="sticky top-0 z-40">
          <PromoBar />
          <StoreHeader />
        </div>
        <main className="flex-1 pb-28 pt-1 sm:pb-8">{children}</main>
        <SiteFooter />
        <MobileNav />
      </div>
    </TooltipProvider>
  );
}
