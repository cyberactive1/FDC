/**
 * POST /api/inquiries — receives the contact form and the tour/demo modal.
 *
 * Delivery is configured with environment variables. Pick one:
 *
 *   RESEND_API_KEY + INQUIRY_TO [+ INQUIRY_FROM]
 *       Emails the inquiry. INQUIRY_FROM must be on a domain verified in
 *       Resend; it defaults to onboarding@resend.dev, which only delivers to
 *       the address that owns the Resend account.
 *
 *   INQUIRY_WEBHOOK_URL
 *       POSTs the payload verbatim. Slack/Teams incoming webhooks, Zapier,
 *       Make, or an internal CRM endpoint.
 *
 * Both may be set; both then run and the request succeeds if either does.
 *
 * With NEITHER set this function answers 503 rather than 200. That is
 * deliberate: a silent 200 would show the reader "Received — reference
 * FDC-K3X9QM" for an inquiry that reached nobody, which is the exact failure
 * this endpoint exists to remove. A 503 makes the form show its fallback
 * message with a real address to email instead.
 *
 * Runtime: Node on Vercel, CommonJS, zero dependencies (global fetch, Node 18+).
 */

const MAX_BODY_BYTES = 32 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function readJson(req) {
  // Vercel usually parses JSON into req.body, but not for every content-type,
  // so fall back to reading the stream. Cap it: an unbounded body is a free
  // way to burn function memory.
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('body is not valid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

/** Re-validate everything. The client checks are for the reader's benefit; a
 *  direct POST never ran them. */
function clean(payload) {
  const out = {
    form: str(payload.form, 40) || 'contact',
    reference: str(payload.reference, 40),
    name: str(payload.name, 200),
    company: str(payload.company, 200),
    email: str(payload.email, 320),
    phone: str(payload.phone, 60),
    message: str(payload.message, 5000),
    request: str(payload.request, 200),
    summary: str(payload.summary, 8000),
    submittedAt: str(payload.submittedAt, 40),
    interests: Array.isArray(payload.interests)
      ? payload.interests.slice(0, 20).map((i) => str(i, 80)).filter(Boolean)
      : [],
    focusAreas: Array.isArray(payload.focusAreas)
      ? payload.focusAreas.slice(0, 20).map((i) => str(i, 80)).filter(Boolean)
      : [],
    route: payload.route && typeof payload.route === 'object'
      ? { id: str(payload.route.id, 40), label: str(payload.route.label, 80), email: str(payload.route.email, 320) }
      : null,
  };
  if (!out.name) return { error: 'name is required' };
  if (!EMAIL_RE.test(out.email)) return { error: 'a valid email is required' };
  return { value: out };
}

function textOf(d) {
  const lines = [
    d.request ? `Request: ${d.request}` : null,
    `Name: ${d.name}`,
    d.company ? `Company: ${d.company}` : null,
    `Email: ${d.email}`,
    d.phone ? `Phone: ${d.phone}` : null,
    d.interests.length ? `Interested in: ${d.interests.join(', ')}` : null,
    d.focusAreas.length ? `Focus areas: ${d.focusAreas.join(', ')}` : null,
    d.route ? `Routed to: ${d.route.label} <${d.route.email}>` : null,
    `Reference: ${d.reference}`,
    `Submitted: ${d.submittedAt}`,
    '',
    d.message || '(no message)',
  ];
  return lines.filter((l) => l !== null).join('\n');
}

async function sendEmail(d) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.INQUIRY_TO;
  if (!key || !to) return null;
  const subject = `[Freedom${d.route ? ' · ' + d.route.label : ''}] ${d.request || 'Website inquiry'} — ${d.name}`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.INQUIRY_FROM || 'onboarding@resend.dev',
      to: to.split(',').map((s) => s.trim()).filter(Boolean),
      reply_to: d.email,
      subject,
      text: textOf(d),
    }),
  });
  if (!res.ok) throw new Error(`resend responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return 'email';
}

async function sendWebhook(d) {
  const url = process.env.INQUIRY_WEBHOOK_URL;
  if (!url) return null;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: textOf(d), inquiry: d }),
  });
  if (!res.ok) throw new Error(`webhook responded ${res.status}`);
  return 'webhook';
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  let payload;
  try {
    payload = await readJson(req);
  } catch (err) {
    return res.status(err.status || 400).json({ ok: false, error: err.message });
  }

  // Honeypot. Answer 200 so a bot cannot distinguish rejection from acceptance
  // and learn to leave the field blank.
  if (str(payload.website, 200)) {
    console.log('[inquiries] honeypot triggered, discarded');
    return res.status(200).json({ ok: true });
  }

  const { value: data, error } = clean(payload);
  if (error) return res.status(422).json({ ok: false, error });

  const configured = !!(process.env.RESEND_API_KEY && process.env.INQUIRY_TO)
    || !!process.env.INQUIRY_WEBHOOK_URL;
  if (!configured) {
    console.error(
      '[inquiries] NO DELIVERY CONFIGURED — inquiry rejected, not lost silently.\n'
      + 'Set RESEND_API_KEY + INQUIRY_TO, or INQUIRY_WEBHOOK_URL, in the Vercel\n'
      + 'project environment variables. Payload follows so it is at least in the logs:\n'
      + textOf(data)
    );
    return res.status(503).json({ ok: false, error: 'delivery not configured' });
  }

  const results = await Promise.allSettled([sendEmail(data), sendWebhook(data)]);
  const delivered = results
    .filter((r) => r.status === 'fulfilled' && r.value)
    .map((r) => r.value);
  const failures = results.filter((r) => r.status === 'rejected');

  for (const f of failures) console.error('[inquiries] delivery failed:', f.reason && f.reason.message);

  if (!delivered.length) {
    // Log the payload so a configuration error does not also destroy the lead.
    console.error('[inquiries] ALL CHANNELS FAILED, payload follows:\n' + textOf(data));
    return res.status(502).json({ ok: false, error: 'delivery failed' });
  }

  console.log(`[inquiries] ${data.reference} delivered via ${delivered.join(' + ')}`
    + (failures.length ? ` (${failures.length} channel(s) failed)` : ''));
  return res.status(200).json({ ok: true, reference: data.reference, delivered });
};
