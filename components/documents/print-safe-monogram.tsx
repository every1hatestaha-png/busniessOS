"use client";

import { useEffect, useState } from "react";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function PrintSafeMonogram({
  src,
  alt,
  className = "hidden h-14 w-14 shrink-0 object-contain print:block",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [processedSrc, setProcessedSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const image = new window.Image();
    image.decoding = "sync";

    image.onload = () => {
      try {
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        if (!width || !height) throw new Error("Invalid monogram dimensions");

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas 2D context unavailable");

        context.drawImage(image, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height);
        const data = pixels.data;

        const sample = (x: number, y: number) => {
          const index = (y * width + x) * 4;
          return [data[index], data[index + 1], data[index + 2]] as const;
        };

        const corners = [
          sample(0, 0),
          sample(width - 1, 0),
          sample(0, height - 1),
          sample(width - 1, height - 1),
        ];
        const background = corners.reduce(
          (acc, color) => [acc[0] + color[0], acc[1] + color[1], acc[2] + color[2]] as [number, number, number],
          [0, 0, 0],
        ).map((value) => value / corners.length) as [number, number, number];

        for (let index = 0; index < data.length; index += 4) {
          const red = data[index];
          const green = data[index + 1];
          const blue = data[index + 2];
          const sourceAlpha = data[index + 3] / 255;
          const distance = Math.sqrt(
            (red - background[0]) ** 2 +
            (green - background[1]) ** 2 +
            (blue - background[2]) ** 2,
          );

          const alpha = clamp((distance - 8) / 70, 0, 1) * sourceAlpha;
          data[index] = 0;
          data[index + 1] = 0;
          data[index + 2] = 0;
          data[index + 3] = Math.round(alpha * 255);
        }

        context.putImageData(pixels, 0, 0);
        const transparentPng = canvas.toDataURL("image/png");
        if (!cancelled) setProcessedSrc(transparentPng);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    image.onerror = () => {
      if (!cancelled) setFailed(true);
    };

    image.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <span
      data-print-asset-pending={!processedSrc && !failed ? "true" : "false"}
      className="contents"
    >
      {processedSrc ? (
        <img
          src={processedSrc}
          alt={alt}
          width={96}
          height={96}
          className={className}
          data-print-safe-monogram="true"
        />
      ) : failed ? (
        <span
          aria-label={alt}
          role="img"
          className="hidden h-14 w-14 shrink-0 items-center justify-center text-sm font-black text-black print:flex"
        >
          AS
        </span>
      ) : null}
    </span>
  );
}
