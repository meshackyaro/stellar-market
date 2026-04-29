import { renderEmailLayout } from "./layout";

export function renderPasswordResetEmail(params: { resetUrl: string }): string {
  return renderEmailLayout({
    title: "Reset your password",
    preheader: "Use this link to reset your StellarMarket password.",
    bodyHtml: `
      <p>You requested a password reset for your StellarMarket account.</p>
      <p>This link expires in 1 hour.</p>
    `,
    actionUrl: params.resetUrl,
    actionLabel: "Reset password",
  });
}

