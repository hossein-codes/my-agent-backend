"use client";

import * as React from "react";
import { useId } from "react";
import { cn } from "@/lib/utils/cn";
import { Label } from "./label";

interface FormFieldContextValue {
  id: string;
  errorId: string;
  hasError: boolean;
}

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

export function useFormField(): FormFieldContextValue {
  const fallbackId = useId();
  const ctx = React.useContext(FormFieldContext);
  // Components may be used standalone (no field wrapper) — fall back to a
  // generated id without error association.
  return ctx ?? { id: fallbackId, errorId: "", hasError: false };
}

interface FormFieldProps {
  label?: React.ReactNode;
  error?: string | null;
  helperText?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
  /** `id` forwarded to the label's htmlFor / control. */
  id?: string;
}

/**
 * Accessible field wrapper: associates a label, optional helper text and an
 * error message with the control via aria-describedby/aria-invalid.
 * Works with Input/Textarea/Select/Checkbox/Radio.
 */
export function FormField({
  label,
  error,
  helperText,
  required,
  className,
  children,
  id: providedId,
}: FormFieldProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;
  const hasError = Boolean(error);

  return (
    <FormFieldContext.Provider value={{ id, errorId, hasError }}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        {label ? (
          <Label htmlFor={id}>
            {label}
            {required ? <span className="text-destructive"> *</span> : null}
          </Label>
        ) : null}
        {children}
        {helperText && !hasError ? (
          <p id={helperId} className="text-xs text-muted-foreground">
            {helperText}
          </p>
        ) : null}
        {hasError ? (
          <p
            id={errorId}
            role="alert"
            className="text-xs font-medium text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>
    </FormFieldContext.Provider>
  );
}
