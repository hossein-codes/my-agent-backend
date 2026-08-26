import { Lock, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { Container } from "@/components/layout/container";

const ITEMS = [
  { icon: Truck, title: "ارسال سریع", text: "سراسر کشور" },
  { icon: ShieldCheck, title: "ضمانت اصالت", text: "کالای اورجینال" },
  { icon: Lock, title: "پرداخت امن", text: "درگاه معتبر" },
  { icon: RotateCcw, title: "۷ روز بازگشت", text: "بدون قید و شرط" },
] as const;

/**
 * Trust strip under the hero — the four promises every Iranian shopper looks
 * for before scrolling further.
 */
export function TrustStrip() {
  return (
    <Container>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {ITEMS.map(({ icon: Icon, title, text }) => (
          <li
            key={title}
            className="flex items-center gap-2.5 rounded-2xl border border-border/60 bg-surface p-3"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Icon className="size-[18px]" aria-hidden="true" />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-xs font-bold sm:text-[13px]">{title}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{text}</span>
            </span>
          </li>
        ))}
      </ul>
    </Container>
  );
}
