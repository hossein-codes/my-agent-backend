import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface SpinnerProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export const Spinner = React.forwardRef<SVGSVGElement, SpinnerProps>(
  ({ className, size = 20, ...props }, ref) => (
    <Loader2
      ref={ref}
      width={size}
      height={size}
      className={cn("animate-spin", className)}
      aria-hidden="true"
      {...props}
    />
  ),
);
Spinner.displayName = "Spinner";
