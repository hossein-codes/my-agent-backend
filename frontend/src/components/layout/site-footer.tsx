import Link from "next/link";
import { Lock, Mail, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { Container } from "@/components/layout/container";
import { LuminaLogo } from "./lumina-logo";

/**
 * Storefront footer (tablet/desktop). On phones the bottom MobileNav covers
 * navigation, so the footer stays hidden there — content, not chrome.
 */
const COLUMNS: Array<{ title: string; links: Array<[label: string, href: string]> }> = [
  {
    title: "خرید از لومینا",
    links: [
      ["پوشاک زنانه", "/categories/women"],
      ["پوشاک مردانه", "/categories/men"],
      ["کفش", "/categories/shoes"],
      ["اکسسوری", "/categories/accessories"],
    ],
  },
  {
    title: "خدمات مشتریان",
    links: [
      ["پیگیری سفارش", "/account/orders"],
      ["علاقه‌مندی‌ها", "/wishlist"],
      ["حساب کاربری", "/account"],
    ],
  },
];

const TRUST = [
  { icon: Truck, label: "ارسال سریع" },
  { icon: ShieldCheck, label: "ضمانت اصالت" },
  { icon: Lock, label: "پرداخت امن" },
  { icon: RotateCcw, label: "۷ روز بازگشت" },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-10 hidden border-t border-border/70 bg-surface sm:block">
      <Container className="py-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3 sm:col-span-2">
            <LuminaLogo />
            <p className="max-w-sm text-xs leading-6 text-muted-foreground">
              فروشگاه آنلاین پوشاک و اکسسوری — انتخابی curated از برندهای منتخب،
              با ضمانت اصالت کالا و بازگشت هفت‌روزه.
            </p>
            <ul className="flex flex-wrap gap-x-4 gap-y-2">
              {TRUST.map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                >
                  <Icon className="size-3.5 text-accent" aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title} className="space-y-3">
              <h3 className="text-[13px] font-bold">{col.title}</h3>
              <ul className="space-y-2.5">
                {col.links.map(([label, href]) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-5 text-[11px] text-muted-foreground sm:flex-row">
          <p>© ۱۴۰۵ لومینا — تمام حقوق محفوظ است.</p>
          <p className="flex items-center gap-1.5">
            <Mail className="size-3.5" aria-hidden="true" />
            support@lumina.shop
          </p>
        </div>
      </Container>
    </footer>
  );
}
