// Netlify Function: delivers a contact-form message to Pablo via Gmail SMTP.
// Credentials live only in the server environment — never in the browser.
//
//   Browser (contact.html / contact.js)
//     ->  POST /api/contact  { name, email, message, company, lang }
//     ->  this function  ->  Gmail SMTP  ->  Pablo's inbox
//     <-  { ok: true }
//
// Same sending setup as send-order-confirmation.js (see that file's header for
// the one-time Gmail App Password steps). Env vars reused:
//   GMAIL_USER, GMAIL_APP_PASSWORD, GMAIL_FROM_NAME
// Recipients default to the same seller addresses; override with CONTACT_TO
// (comma-separated) without touching code.
//
// The visitor's address is set as Reply-To, so Pablo just hits "Reply".

import nodemailer from 'nodemailer';

const DEFAULT_FROM_NAME = 'Pablo Odriozola';

const CONTACT_TO = (
  process.env.CONTACT_TO ||
  process.env.ORDER_NOTIFY_BCC ||
  'pabloarturodriozola@gmail.com'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const COPY = {
  es: {
    subject: (name) => `Nuevo mensaje de contacto — ${name}`,
    heading: 'Nuevo mensaje desde el sitio',
    from: 'De',
    email: 'Email',
    message: 'Mensaje',
  },
  en: {
    subject: (name) => `New contact message — ${name}`,
    heading: 'New message from the site',
    from: 'From',
    email: 'Email',
    message: 'Message',
  },
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function buildHtml(t, { name, email, message }) {
  // Preserve the visitor's line breaks in the HTML body.
  const messageHtml = esc(message).replace(/\n/g, '<br />');
  return `<!doctype html>
<html>
  <body style="margin:0;background:#faf9f6;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9f6;padding:32px 0;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #ece9e2;border-radius:8px;overflow:hidden;">
          <tr><td style="padding:36px 36px 8px;">
            <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:400;color:#1a1a1a;">${t.heading}</h1>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ece9e2;border-bottom:1px solid #ece9e2;">
              <tr>
                <td style="padding:14px 0;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#8a8a8a;">${t.from}</td>
                <td align="right" style="padding:14px 0;font-size:15px;color:#1a1a1a;">${esc(name)}</td>
              </tr>
              <tr>
                <td style="padding:14px 0;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#8a8a8a;border-top:1px solid #f2efe9;">${t.email}</td>
                <td align="right" style="padding:14px 0;font-size:15px;color:#1a1a1a;border-top:1px solid #f2efe9;">${esc(email)}</td>
              </tr>
            </table>
            <p style="margin:24px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#8a8a8a;">${t.message}</p>
            <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#3a3a3a;">${messageHtml}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export default async (request) => {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return Response.json(
      { error: 'Server misconfigured: set GMAIL_USER and GMAIL_APP_PASSWORD in Netlify env vars.' },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, email, message, company, lang = 'es' } = body || {};

  // Honeypot: real visitors leave "company" empty. If it's filled, silently
  // accept (so the bot sees success) but send nothing.
  if (company && String(company).trim()) {
    return Response.json({ ok: true });
  }

  const validEmail = typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  if (!name || !String(name).trim() || !validEmail || !message || !String(message).trim()) {
    return Response.json(
      { error: 'Missing or invalid fields: name, email, message are required.' },
      { status: 400 }
    );
  }

  const t = COPY[lang] || COPY.es;
  const fromName = process.env.GMAIL_FROM_NAME || DEFAULT_FROM_NAME;
  const cleanName = String(name).trim();
  const cleanEmail = String(email).trim();
  const cleanMessage = String(message).trim();

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from: `${fromName} <${user}>`,    // must be the authenticated Gmail account
      to: CONTACT_TO,
      replyTo: `${cleanName} <${cleanEmail}>`,
      subject: t.subject(cleanName),
      html: buildHtml(t, { name: cleanName, email: cleanEmail, message: cleanMessage }),
    });

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err?.message || 'Unexpected error sending email' },
      { status: 502 }
    );
  }
};

export const config = { path: '/api/contact' };
