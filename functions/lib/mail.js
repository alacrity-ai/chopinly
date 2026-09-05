// Mailgun outbound — one fetch per send, no SDK (ported from kbRelay's
// apps/api/src/services/mailgun.ts). Unconfigured (no MAILGUN_KEY) → logs and
// reports ok, so local dev needs no inbox.
export async function sendMail(env, { to, subject, text, html, tags = [] }) {
  if (!env.MAILGUN_KEY || !env.MAILGUN_DOMAIN) {
    console.log(`[mail] short-circuit to=${to} subject=${subject}`);
    return { ok: true, skipped: true };
  }
  const form = new FormData();
  form.append("from", env.MAIL_FROM ?? `Chopinly <chopinly@${env.MAILGUN_DOMAIN}>`);
  form.append("to", to);
  form.append("subject", subject);
  form.append("text", text);
  if (html) form.append("html", html);
  for (const t of tags) form.append("o:tag", t);
  try {
    const res = await fetch(`https://api.mailgun.net/v3/${env.MAILGUN_DOMAIN}/messages`, {
      method: "POST", headers: { authorization: `Basic ${btoa(`api:${env.MAILGUN_KEY}`)}` }, body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.message ?? `Mailgun returned ${res.status}` };
    }
    const body = await res.json();
    return { ok: true, id: body.id };
  } catch (e) {
    return { ok: false, error: e?.message ?? "network error" };
  }
}

/** The sign-in code mail: plain text first, minimal HTML in the app's palette, no links. */
export function codeMail(code) {
  const pretty = `${code.slice(0, 3)} ${code.slice(3)}`;
  return {
    subject: `Your Chopinly code: ${pretty}`,
    text: `Your Chopinly sign-in code is ${pretty}\n\nIt works for 10 minutes. If you didn't ask for it, ignore this email — nothing happens without the code.\n\n— Chopinly, practice assistant`,
    html: `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#191410;color:#eee5d3;font-family:Georgia,'Times New Roman',serif;">
<div style="max-width:420px;margin:0 auto;">
<p style="font-size:22px;margin:0 0 4px;color:#eee5d3;">Chopinly</p>
<p style="font-size:14px;margin:0 0 28px;color:#a2947d;font-style:italic;">practice assistant</p>
<p style="font-size:15px;margin:0 0 12px;color:#eee5d3;">Your sign-in code</p>
<p style="font-size:40px;letter-spacing:6px;margin:0 0 20px;color:#c9a35c;font-variant-numeric:tabular-nums;">${pretty}</p>
<p style="font-size:13px;line-height:1.5;margin:0;color:#a2947d;">It works for 10 minutes. If you didn't ask for it, ignore this email &mdash; nothing happens without the code.</p>
</div></body></html>`,
    tags: ["chopinly-code"],
  };
}
