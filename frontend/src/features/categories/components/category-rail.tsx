import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { SectionHeader } from "@/components/shared/section-header";
import type { Category } from "@/types/domain";

interface CategoryRailProps {
  categories: Category[];
  className?: string;
}

/** Deterministic gradient pair per category so visuals are stable. */
const GRADIENTS = [
  "from-violet-500/30 to-indigo-500/10",
  "from-fuchsia-500/25 to-purple-500/10",
  "from-sky-500/25 to-blue-500/10",
  "from-rose-500/25 to-pink-500/10",
  "from-emerald-500/25 to-teal-500/10",
  "from-amber-500/25 to-orange-500/10",
];

function initials(name: string): string {
  const clean = name.trim().replace(/\s+/g, " ");
  const parts = clean.split(" ");
  if (parts.length >= 2) return parts[0]![0]! + parts[1]![0]!;
  return clean.slice(0, 2);
}

function flatten(root: Category[]): Category[] {
  const out: Category[] = [];
  const walk = (nodes: Category[]) => {
    for (const n of nodes) {
      out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(root);
  return out;
}

/**
 * Horizontal circular category rail. Circular avatars use a tonal gradient +
 * monogram because the backend category model carries no image. RTL-aware via
 * normal horizontal scroll; the first item sits at the inline-start edge.
 */
export function CategoryRail({ categories, className }: CategoryRailProps) {
  const flat = flatten(categories).slice(0, 12);
  if (flat.length === 0) return null;

  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <SectionHeader title="دسته‌بندی‌ها" viewAllHref="/categories" />
      <div
        dir="rtl"
        className="no-scrollbar flex gap-4 overflow-x-auto px-4 pb-1"
      >
        {flat.map((c, i) => (
          <Link
            key={c.id}
            href={`/categories/${c.slug}`}
            className="tap-highlight-transparent flex w-16 shrink-0 flex-col items-center gap-2"
          >
            <span
              className={cn(
                "flex size-16 items-center justify-center rounded-full border border-border/70 bg-gradient-to-br text-sm font-bold uppercase text-foreground/90",
                GRADIENTS[i % GRADIENTS.length],
              )}
            >
              {initials(c.name)}
            </span>
            <span className="line-clamp-1 text-center text-[11px] text-muted-foreground">
              {c.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
