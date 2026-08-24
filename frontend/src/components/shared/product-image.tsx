"use client";

import * as React from "react";
import Image from "next/image";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface ProductImageProps {
  src: string | null;
  alt: string | null;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
  sizes?: string;
  fill?: boolean;
  width?: number;
  height?: number;
}

/**
 * Image with graceful fallback. Product images come from the backend
 * (`media.url`); when missing, renders a neutral placeholder.
 */
export function ProductImage({
  src,
  alt,
  className,
  imgClassName,
  priority = false,
  sizes,
  fill,
  width,
  height,
}: ProductImageProps) {
  const [errored, setErrored] = React.useState(false);

  if (!src || errored) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground",
          className,
        )}
        role="img"
        aria-label={alt ?? "تصویر محصول"}
      >
        <ImageOff className="size-8" />
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <Image
        src={src}
        alt={alt ?? "تصویر محصول"}
        className={cn("object-cover", imgClassName)}
        fill={fill}
        width={fill ? undefined : width}
        height={fill ? undefined : height}
        sizes={sizes}
        priority={priority}
        onError={() => setErrored(true)}
      />
    </div>
  );
}
