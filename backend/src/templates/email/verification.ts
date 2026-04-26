import { renderEmailLayout } from "./layout";

export function renderVerificationEmail(params: { verifyUrl: string }): string {
  return renderEmailLayout({
    title: "Verify your email",
    preheader: "Confirm your email address to finish setting up your account.",
    bodyHtml: `
      <p>Thanks for signing up for StellarMarket.</p>
      <p>Click the button below to verify your email address.</p>
    `,
    actionUrl: params.verifyUrl,
    actionLabel: "Verify email",
  });
}

