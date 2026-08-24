"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "./dialog";

/**
 * Mobile bottom sheet. Thin wrapper over Dialog with `display="sheet"`.
 * On mobile it slides up from the bottom; use this instead of a centered
 * modal for filter panels, action menus, and mobile forms.
 */
const BottomSheet = Dialog;
const BottomSheetTrigger = DialogTrigger;
const BottomSheetClose = DialogClose;

const BottomSheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogContent>,
  React.ComponentPropsWithoutRef<typeof DialogContent>
>(({ className, children, ...props }, ref) => (
  <DialogContent
    ref={ref}
    display="sheet"
    className={cn("gap-0", className)}
    {...props}
  >
    <div
      className="mx-auto my-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30"
      aria-hidden="true"
    />
    {children}
  </DialogContent>
));
BottomSheetContent.displayName = "BottomSheetContent";

function BottomSheetHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 px-5 pb-3 pt-1 text-start",
        className,
      )}
      {...props}
    />
  );
}

const BottomSheetTitle = DialogTitle;
const BottomSheetDescription = DialogDescription;
const BottomSheetFooter = DialogFooter;

export {
  BottomSheet,
  BottomSheetTrigger,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetDescription,
  BottomSheetFooter,
};
