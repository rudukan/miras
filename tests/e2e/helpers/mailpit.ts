import { MAILPIT_URL } from './stack';

interface MailpitSearch {
  messages: Array<{ ID: string }>;
}

/** Alıcıya gelen SON mailden /auth/confirm linkini ayıklar (500ms aralıkla 15 sn'ye kadar bekler).
 *  Testler benzersiz e-posta ürettiği için paralel koşuda karışma olmaz. */
export async function waitForAuthLink(email: string, kind: 'email' | 'recovery'): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const res = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    );
    if (res.ok) {
      const { messages } = (await res.json()) as MailpitSearch;
      if (messages.length > 0) {
        const msgRes = await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`);
        const body = (await msgRes.json()) as { HTML: string; Text: string };
        const html = body.HTML || body.Text;
        const m = html.match(
          new RegExp(`href="([^"]*/auth/confirm\\?[^"]*type=${kind}[^"]*)"`),
        );
        if (m) return m[1].replace(/&amp;/g, '&');
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${email} için ${kind} maili 15 sn içinde Mailpit'e düşmedi`);
}
