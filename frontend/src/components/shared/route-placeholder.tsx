import { Construction } from "lucide-react";
import { Container } from "@/components/layout/container";

/**
 * Placeholder for routes whose UI belongs to the next phase. Documents the
 * intended route without pretending to implement business logic.
 */
export function RoutePlaceholder({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <Container className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <Construction className="size-10 text-muted-foreground" />
      <h1 className="text-lg font-semibold">{title}</h1>
      {description ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground/70">
        این بخش در فاز بعدی پیاده‌سازی می‌شود.
      </p>
    </Container>
  );
}
