import * as React from "react";
import { Button, type ButtonProps } from "./button";

export interface IconButtonProps extends Omit<ButtonProps, "size" | "children"> {
  /** Accessible name is REQUIRED for icon-only buttons. */
  "aria-label": string;
  children: React.ReactNode;
  size?: "icon" | "icon-sm";
}

/**
 * Icon-only button. Enforces an accessible label and guarantees a minimum
 * 40px touch target on mobile (the `icon` size is 44px).
 */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = "icon", ...props }, ref) => (
    <Button ref={ref} size={size} {...props} />
  ),
);
IconButton.displayName = "IconButton";
