import { store, readAll, update } from "../lib/db.mjs";
import { requireUser } from "../lib/auth.mjs";
import { logActivity } from "../lib/activity.mjs";
import { emailLayout, mailConfigured, paragraphs, sendMail } from "../lib/mail.mjs";
import { listSubscribers, statusOf, subKey } from "../lib/subscribers.mjs";
import { HttpError, esc, isId, json, newId, randomToken, readJson, sha256hex, sleep, wrap } from "../lib/util.mjs";

// A newsletter is sent as a "campaign": a saved record of the message, the list of
// recipients at the moment it was created, and who has already been sent it.
// The admin page calls "continue" repeatedly; each call sends for a few seconds and
// saves progress after every batch. So:
//   - a long list never runs into the function time limit,
//   - closing the tab or losing the connection just pauses it (press Resume later),
//   - nobody is sent the same newsletter twice, even if a request is retried, because
//     each batch carries an idempotency key and sent addresses are recorded.
const BATCH = 50;
const TIME_BUDGET_MS = 7000;
const LEASE_MS = 20000;

const summaryOf = (c) => ({
  id: c.id, subject: c.subject, createdAt: c.createdAt, createdBy: c.createdBy, status: c.status,
  total: c.recipients.length, sent: c.sent.length, skipped: c.skipped.length, error: c.error || null, finishedAt: c.finishedAt || null,
});

function buildEmail(c, email, token, origin) {
  const unsubUrl = `${origin}/api/unsubscribe?e=${encodeURIComponent(email)}&t=${token}`;
  return {
    from: process.env.NEWSLETTER_FROM,
    to: [email],
    subject: c.subject,
    html: emailLayout(paragraphs(c.message), `<a href="${esc(unsubUrl)}" style="color:#1565C0">Unsubscribe</a>`),
    text: `${c.message}\n\n--\nUnsubscribe: ${unsubUrl}`,
    headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    ...(process.env.NEWSLETTER_REPLY_TO ? { reply_to: process.env.NEWSLETTER_REPLY_TO } : {}),
  };
}

async function continueCampaign(id, origin) {
  const campaigns = store("campaigns");
  const lease = randomToken();
  // Only one request may send a campaign at a time.
  const c0 = await update(campaigns, id, (c) => {
    if (!c) throw new HttpError(404, "Newsletter not found.");
    if (c.status === "sent") return undefined;
    if (c.leaseUntil > Date.now()) throw new HttpError(409, "This newsletter is already being sent from another window.");
    return { ...c, status: "sending", error: null, lease, leaseUntil: Date.now() + LEASE_MS };
  });
  if (c0.status === "sent") return summaryOf(c0);

  const started = Date.now();
  const done = new Set([...c0.sent, ...c0.skipped]);
  let todo = c0.recipients.filter((e) => !done.has(e));
  let error = null;

  while (todo.length && Date.now() - started < TIME_BUDGET_MS) {
    const chunk = todo.slice(0, BATCH);
    const subs = store("subscribers");
    const messages = [], sentNow = [], skippedNow = [];
    for (const email of chunk) {
      // Someone who unsubscribed after the campaign was created is skipped.
      const rec = await update(subs, subKey(email), (r) => (r && !r.token ? { ...r, token: randomToken() } : undefined));
      if (!rec || statusOf(rec) !== "confirmed") { skippedNow.push(email); continue; }
      messages.push(buildEmail(c0, email, rec.token, origin));
      sentNow.push(email);
    }
    if (messages.length) {
      try {
        await sendMail(messages, `${id}-${sha256hex(sentNow.join(",")).slice(0, 32)}`);
      } catch (e) {
        error = String(e.message || e).slice(0, 300);
        sentNow.length = 0;
      }
    }
    await update(campaigns, id, (c) => ({ ...c, sent: [...c.sent, ...sentNow], skipped: [...c.skipped, ...skippedNow], leaseUntil: Date.now() + LEASE_MS }));
    if (error) break;
    todo = todo.slice(chunk.length);
    if (todo.length) await sleep(600); // the email service allows only a few requests per second
  }

  const finished = await update(campaigns, id, (c) => {
    const complete = c.sent.length + c.skipped.length >= c.recipients.length;
    return { ...c, status: complete ? "sent" : error ? "paused" : "sending", error, leaseUntil: 0, finishedAt: complete ? new Date().toISOString() : null };
  });
  return summaryOf(finished);
}

export default wrap(async (req) => {
  const user = await requireUser(req, "admin");
  const campaigns = store("campaigns");

  if (req.method === "GET") {
    const all = (await readAll(campaigns)).map(summaryOf).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json({ campaigns: all });
  }

  if (req.method !== "POST") throw new HttpError(405, "Method not allowed.");
  if (!mailConfigured()) {
    throw new HttpError(501, "Sending is not set up yet. Add RESEND_API_KEY and NEWSLETTER_FROM in Netlify, or download the subscriber list instead.");
  }
  const data = await readJson(req, 60000);
  const origin = new URL(req.url).origin;

  if (data.action === "continue") {
    if (!isId(data.id)) throw new HttpError(400, "Invalid newsletter.");
    const result = await continueCampaign(data.id, origin);
    if (result.status === "sent") await logActivity(user, "Finished sending a newsletter", `${result.subject} (${result.sent} sent)`);
    return json(result);
  }

  const subject = String(data.subject ?? "").trim();
  const message = String(data.message ?? "").replace(/\r\n/g, "\n").trim();
  if (!subject || subject.length > 150) throw new HttpError(400, "Please add a subject (150 characters or fewer).");
  if (!message) throw new HttpError(400, "Please write the newsletter.");
  const recipients = (await listSubscribers()).filter((s) => statusOf(s) === "confirmed").map((s) => s.email);
  if (!recipients.length) throw new HttpError(400, "There are no confirmed subscribers yet.");

  const c = { id: newId(), subject, message, recipients, sent: [], skipped: [], status: "sending", createdAt: new Date().toISOString(), createdBy: user.name, leaseUntil: 0 };
  await campaigns.setJSON(c.id, c);
  await logActivity(user, "Started sending a newsletter", `${subject} (${recipients.length} recipients)`);
  return json(await continueCampaign(c.id, origin), 201);
});

export const config = { path: "/api/newsletter" };
