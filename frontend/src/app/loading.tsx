import { Spinner } from "@/components/ui/spinner";

export default function RootLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-live="polite">
      <Spinner className="size-8 text-muted-foreground" />
      <span className="sr-only">در حال بارگذاری…</span>
    </div>
  );
}
