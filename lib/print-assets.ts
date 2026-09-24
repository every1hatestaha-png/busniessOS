export async function waitForPrintableAssets() {
  const images = Array.from(
    document.querySelectorAll<HTMLImageElement>("[data-print-surface] img, [data-document] img"),
  );

  await Promise.all(
    images.map(async (image) => {
      if (!image.complete) {
        await Promise.race([
          new Promise<void>((resolve) => {
            const done = () => resolve();
            image.addEventListener("load", done, { once: true });
            image.addEventListener("error", done, { once: true });
          }),
          new Promise<void>((resolve) => window.setTimeout(resolve, 3000)),
        ]);
      }

      if (typeof image.decode === "function" && image.complete && image.naturalWidth > 0) {
        await image.decode().catch(() => undefined);
      }
    }),
  );

  if ("fonts" in document) {
    await document.fonts.ready.catch(() => undefined);
  }

  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}
