import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { useFormField } from "./form-field";

export type TextareaProps = React.ComponentProps<"textarea">;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, id, "aria-describedby": ariaDescribedBy, ...props }, ref) => {
    const field = useFormField();
    const textareaId = id ?? field.id;
    const describedBy = [
      ariaDescribedBy,
      field.hasError ? field.errorId : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

    return (
      <textarea
        ref={ref}
        id={textareaId}
        aria-invalid={field.hasError || undefined}
        aria-describedby={describedBy}
        className={cn(
          "flex min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/40",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
