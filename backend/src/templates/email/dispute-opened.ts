import { renderEmailLayout } from "./layout";

export function renderDisputeOpenedEmail(params: {
  title: string;
  message: string;
  actionUrl?: string;
}): string {
  return renderEmailLayout({
    title: params.title,
    preheader: "A dispute was opened on your job.",
    bodyHtml: `
      <p>${params.message}</p>
      <p>Please review the details and respond as soon as possible.</p>
    `,
    actionUrl: params.actionUrl,
    actionLabel: params.actionUrl ? "View dispute" : undefined,
  });
}

