import "server-only";
import { headers } from "next/headers";
import nodemailer, { type Transporter } from "nodemailer";

// Email goes out through any SMTP server (e.g. the mailbox that comes with your
// Infomaniak hosting). Without SMTP settings the app still works: whoever sends
// an invitation gets its link to pass on themselves.

let transport: Transporter | null | undefined;

function smtp(): Transporter | null {
  if (transport !== undefined) return transport;
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return (transport = null);
  const port = Number(process.env.SMTP_PORT) || 465;
  transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" } : undefined,
  });
  return transport;
}

export const mailEnabled = () => Boolean(process.env.SMTP_HOST?.trim());

/** Sends one email. Returns false (and logs why) instead of throwing, so callers can fall back to a link. */
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const t = smtp();
  if (!t) return false;
  try {
    await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text });
    return true;
  } catch (e) {
    console.error("Email not sent:", e instanceof Error ? e.message : e);
    return false;
  }
}

/** This site's address for links in emails: KOUIZE_PUBLIC_URL, else what the host's proxy says. */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.KOUIZE_PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || "http";
  return `${proto}://${host}`;
}
