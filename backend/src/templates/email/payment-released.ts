import { renderEmailLayout } from "./layout";

export function renderPaymentReleasedEmail(params: {
  title: string;
  message: string;
  actionUrl?: string;
}): string {
  return renderEmailLayout({
    title: params.title,
    preheader: "A payment was released to you.",
    bodyHtml: `
      <p>${params.message}</p>
    `,
    actionUrl: params.actionUrl,
    actionLabel: params.actionUrl ? "View details" : undefined,
  });
}

