import { StoreHeader } from "@/components/layout/store-header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Storefront mobile shell.
 * The wrapper fills the viewport (min-h-dvh) so the `fixed bottom-0` mobile
 * nav truly anchors to the bottom of the screen even when a page has little
 * content (e.g. while skeletons load).
 */
export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative flex min-h-dvh flex-col">
        <StoreHeader />
        <main className="flex-1 pb-28 pt-1 sm:pb-8">{children}</main>
        <MobileNav />
      </div>
    </TooltipProvider>
  );
}
