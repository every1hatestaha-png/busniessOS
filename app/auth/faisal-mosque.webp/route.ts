import visual0 from "../../sign-in/[[...sign-in]]/login-visual-v2-0";
import visual1 from "../../sign-in/[[...sign-in]]/login-visual-v2-1";
import visual2 from "../../sign-in/[[...sign-in]]/login-visual-v2-2";
import visual3 from "../../sign-in/[[...sign-in]]/login-visual-v2-3";

const imageBytes = Buffer.from(`${visual0}${visual1}${visual2}${visual3}`, "base64");

export const dynamic = "force-static";

export function GET() {
  if (
    imageBytes.length < 12 ||
    imageBytes.toString("ascii", 0, 4) !== "RIFF" ||
    imageBytes.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return new Response("Invalid authentication image", {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return new Response(imageBytes, {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
