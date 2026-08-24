// Netlify Function: sends an order-confirmation email to the buyer via Gmail SMTP.
// Credentials live only in the server environment — never in the browser.
//
// Caller (payment webhook / thank-you page)
//   ->  POST /api/send-order-confirmation  { buyer_name, buyer_email, title, amount, currency, lang }
//   ->  this function  ->  Gmail SMTP  ->  buyer's inbox
//   <-  { ok: true, id }              <-
//
// Why Gmail SMTP: the site has no custom domain. Sending THROUGH Pablo's own
// Gmail means Google signs the mail (SPF/DKIM), so it passes DMARC and actually
// lands in inboxes — and it can reach any recipient, free, no service signup.
// The "from" is whatever Google account we authenticate; to switch the sender
// later, just point GMAIL_USER + GMAIL_APP_PASSWORD at a different Google account.
//
// Setup (one-time, on the Google account used as GMAIL_USER):
//   1. Turn ON 2-Step Verification (Google Account → Security).
//   2. Create an App Password (Security → App passwords) — a 16-char code.
//   3. In Netlify env vars set:
//        GMAIL_USER          = pabloarturodriozola@gmail.com
//        GMAIL_APP_PASSWORD  = the 16-char app password (no spaces)
//        GMAIL_FROM_NAME     = Pablo Odriozola   (optional)
//      Then redeploy so the function picks them up.

import nodemailer from 'nodemailer';

const DEFAULT_FROM_NAME = 'Pablo Odriozola';

// Addresses BCC'd on every confirmation so the seller(s) are notified of each
// sale. Hidden from the buyer (BCC). Override via the ORDER_NOTIFY_BCC env var
// (comma-separated) without touching code.
const NOTIFY_BCC = (
  process.env.ORDER_NOTIFY_BCC ||
  'pabloarturodriozola@gmail.com'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Bilingual copy. lang defaults to Spanish (Pablo's primary audience).
const COPY = {
  es: {
    subject: (title) => `Confirmación de compra — ${title}`,
    heading: 'Gracias por tu compra',
    intro: (name) => `Hola ${name}, recibimos tu pago. Aquí están los detalles:`,
    painting: 'Obra',
    total: 'Total',
    shipping:
      'Pablo se pondrá en contacto con vos en breve para coordinar el envío.',
    signoff: 'Saludos cordiales,\nPablo Odriozola',
  },
  en: {
    subject: (title) => `Purchase confirmation — ${title}`,
    heading: 'Thank you for your purchase',
    intro: (name) => `Hi ${name}, we received your payment. Here are the details:`,
    painting: 'Painting',
    total: 'Total',
    shipping: 'Pablo will contact you shortly to arrange shipping.',
    signoff: 'Best regards,\nPablo Odriozola',
  },
};

// "usd" -> "US$ 1,200" / "ars" -> "AR$ 1.200.000"
function formatMoney(amount, currency) {
  const code = (currency || '').toLowerCase();
  const locale = code === 'ars' ? 'es-AR' : 'en-US';
  const symbol = code === 'ars' ? 'AR$' : 'US$';
  const num = Number(amount);
  const formatted = Number.isFinite(num)
    ? num.toLocaleString(locale, { maximumFractionDigits: 0 })
    : amount;
  return `${symbol} ${formatted}`;
}

function buildHtml(t, { name, title, amount, currency }) {
  const price = formatMoney(amount, currency);
  return `<!doctype html>
<html>
  <body style="margin:0;background:#faf9f6;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9f6;padding:32px 0;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #ece9e2;border-radius:8px;overflow:hidden;">
          <tr><td style="padding:36px 36px 8px;">
            <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:400;color:#1a1a1a;">${t.heading}</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3a3a3a;">${t.intro(name)}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ece9e2;border-bottom:1px solid #ece9e2;">
              <tr>
                <td style="padding:14px 0;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#8a8a8a;">${t.painting}</td>
                <td align="right" style="padding:14px 0;font-size:15px;color:#1a1a1a;">${title}</td>
              </tr>
              <tr>
                <td style="padding:14px 0;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#8a8a8a;border-top:1px solid #f2efe9;">${t.total}</td>
                <td align="right" style="padding:14px 0;font-size:17px;font-weight:600;color:#c4622d;border-top:1px solid #f2efe9;">${price}</td>
              </tr>
            </table>
            <p style="margin:24px 0 8px;font-size:15px;line-height:1.6;color:#3a3a3a;">${t.shipping}</p>
          </td></tr>
          <tr><td style="padding:24px 36px 36px;">
            <p style="margin:0;font-size:15px;line-height:1.6;color:#3a3a3a;white-space:pre-line;">${t.signoff}</p>
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
      {
        error:
          'Server misconfigured: set GMAIL_USER and GMAIL_APP_PASSWORD in Netlify env vars.',
      },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    buyer_name,
    buyer_email,
    title,
    amount,
    currency,
    lang = 'es',
  } = body || {};

  // buyer_email and title are the minimum needed to send a meaningful email.
  if (!buyer_email || !title) {
    return Response.json(
      { error: 'Missing required fields: buyer_email and title' },
      { status: 400 }
    );
  }

  const t = COPY[lang] || COPY.es;
  const name = buyer_name || (lang === 'en' ? 'there' : 'hola');
  const fromName = process.env.GMAIL_FROM_NAME || DEFAULT_FROM_NAME;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  try {
    const info = await transporter.sendMail({
      from: `${fromName} <${user}>`,
      to: buyer_email,
      bcc: NOTIFY_BCC,
      subject: t.subject(title),
      html: buildHtml(t, { name, title, amount, currency }),
    });

    return Response.json({ ok: true, id: info?.messageId });
  } catch (err) {
    // Common cause: wrong app password, or 2-Step Verification not enabled.
    return Response.json(
      { error: err?.message || 'Unexpected error sending email' },
      { status: 502 }
    );
  }
};

export const config = { path: '/api/send-order-confirmation' };
