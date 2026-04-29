import { renderEmailLayout } from "./layout";

export function renderMilestoneApprovedEmail(params: {
  title: string;
  message: string;
  actionUrl?: string;
}): string {
  return renderEmailLayout({
    title: params.title,
    preheader: "A milestone was approved.",
    bodyHtml: `
      <p>${params.message}</p>
    `,
    actionUrl: params.actionUrl,
    actionLabel: params.actionUrl ? "View job" : undefined,
  });
}

