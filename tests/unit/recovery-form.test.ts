import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RecoveryForm from "@/components/auth/recovery-form";

describe("recovery notice initialization", () => {
  it("shows the old-link notice on the first render without an effect state update", () => {
    const html = renderToStaticMarkup(createElement(RecoveryForm, { activationByOldLink: true }));
    expect(html).toContain("That older activation link has been replaced");
    expect(html).toContain("Send verification code");
  });
  it("does not treat a verified query parameter as an authenticated recovery session", () => {
    const html = renderToStaticMarkup(createElement(RecoveryForm, { verifiedByOldLink: true }));
    expect(html).toContain("Send verification code");
    expect(html).not.toContain("That older activation link has been replaced");
  });
});
