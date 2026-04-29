import { EmailService } from "../services/email.service";

export async function sendPasswordResetEmail(
  to: string,
  token: string,
): Promise<void> {
  await EmailService.sendPasswordResetEmail(to, token);
}

export async function sendVerificationEmail(
  to: string,
  token: string,
): Promise<void> {
  await EmailService.sendVerificationEmail(to, token);
}
