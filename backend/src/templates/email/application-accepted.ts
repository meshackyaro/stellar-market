import { renderEmailLayout } from "./layout";

export function renderApplicationAcceptedEmail(params: {
  title: string;
  message: string;
  actionUrl?: string;
}): string {
  return renderEmailLayout({
    title: params.title,
    preheader: "Your application was accepted.",
    bodyHtml: `
      <p>${params.message}</p>
      <p>You can follow up in the app to coordinate next steps.</p>
    `,
    actionUrl: params.actionUrl,
    actionLabel: params.actionUrl ? "Open StellarMarket" : undefined,
  });
}

