# WOFHRAD-SL website

The public website of the Women's Forum for Human Rights & Democracy, Sierra Leone, with an
admin panel where staff publish stories and reports, read messages and donation pledges, and send
the newsletter.

## Project layout

```
src/                    the website's source
  *.html                one file per page (index, stories, donate, partners, reports, privacy, admin, 404)
  partials/             the parts every page shares: <head>, navigation, footer, newsletter band
  assets/               CSS, JavaScript, fonts, photos and partner logos
site.config.json        organisation name, email, phone, address and social links (used on every page)
scripts/build.mjs       turns src/ into dist/ (the folder that is actually published)
netlify/functions/      the server-side code, one file per feature
netlify/lib/            helpers shared by the functions (storage, login, email, rate limits)
api/                    thin Vercel entry points that reuse netlify/functions
test/                   automated checks
```

The navigation, footer and page header exist **once**, in `src/partials/`. Change them there and
every page updates on the next deploy. To change the email address, phone number or social links
everywhere, edit `site.config.json`.

Don't edit anything in `dist/`. It is rebuilt on every deploy.

## Hosting on Netlify (recommended)

1. Push this repository to GitHub as a whole folder (with `git push` or GitHub Desktop, not by
   dragging individual files into GitHub's web page, which flattens the folders).
2. At netlify.com: **Add new site > Import an existing project**, choose the repository, and press
   **Deploy**. `netlify.toml` already holds the right settings (build command `npm run build`,
   published folder `dist`).
3. **Site configuration > Environment variables**. Add these, then redeploy:

   | Name | Value | Needed for |
   |---|---|---|
   | `ADMIN_PASSWORD` | the main administrator's password, **at least 12 characters** | logging in (required) |
   | `SESSION_SECRET` | any long random text (40+ characters) | recommended: keeps logins secure |
   | `ADMIN_USERS` | extra staff logins, one per line: `Name:role:password` | optional, see below |
   | `RESEND_API_KEY` | key from resend.com | confirmation emails, newsletters, message alerts |
   | `NEWSLETTER_FROM` | `WOFHRAD-SL <news@yourdomain.org>` | the same |
   | `NEWSLETTER_REPLY_TO` | address that receives replies to newsletters | optional |
   | `CONTACT_TO` | address that gets an alert for each message and pledge | optional (defaults to `wofhrad95@gmail.com`) |
   | `PLAUSIBLE_DOMAIN` | your domain, if you sign up for Plausible analytics | optional |

4. Visit `your-site-address/admin.html` and log in.

Stories, photos, reports, messages and subscribers are stored by Netlify Blobs, with no extra setup.
Canonical links, social previews, `robots.txt` and the sitemap use the site's real address
automatically: Netlify supplies it to the build. When you attach your own domain in Netlify
(**Domain management**), set it as the primary domain and redeploy.

### Staff logins and roles

`ADMIN_PASSWORD` gives a login called **Admin** with full access. Add other people with
`ADMIN_USERS`, one per line:

```
Simeon:editor:a-long-password-for-simeon
Emilia:admin:another-long-password
```

- **admin**: everything, including subscribers, newsletters, donation settings and the activity log.
- **editor**: stories, messages and reports only.

Each person logs in with their own name and password, and the **Activity** tab records who did
what. Changing someone's password (and redeploying) logs them out everywhere. Passwords shorter than
12 characters are refused at login, with a message explaining why.

Five wrong passwords from one connection lock it out for 15 minutes, and 50 wrong passwords from
anywhere pause all logins for 15 minutes. That second limit means an attacker could keep logins
paused, but they could never get in. If it ever happens, wait 15 minutes.

### Email (Resend)

Collecting subscribers works without email set up, but confirmation emails, newsletters and message
alerts need Resend. Resend only sends to the public from a domain you have verified with it, so
`NEWSLETTER_FROM` must use your own domain, not Gmail.

## Hosting on Vercel (possible, not recommended)

`vercel.json` and the `api/` folder let the same code run on Vercel, but Vercel has nowhere to store
stories and subscribers. It has to reach Netlify's storage with two extra variables:
`NETLIFY_BLOBS_SITE_ID` (from Netlify **Site details**) and `NETLIFY_BLOBS_TOKEN`.

**Warning:** that token is a Netlify *personal access token*, and it gives full control of **every
site on the Netlify account**, not just this one. (An earlier version of this README said otherwise.
That was wrong.) Anyone who can read the Vercel project's settings could take over your Netlify
sites. Unless you have a strong reason, host on Netlify only. If you do use Vercel, also set
`CRON_SECRET` so the daily clean-up can run.

## Using the admin panel

- **Stories / New story:** title, optional programme, summary, the story, a cover photo and up to
  11 more photos. Publish now or save as a draft. Each published story gets its own page at
  `/stories/<id>`, which search engines can index and WhatsApp/Facebook/X preview with its photo. If
  two people edit the same story, the second save is stopped instead of silently overwriting the first.
- **Messages:** contact-form messages and donation pledges, filterable by topic (partnership,
  internship, volunteering, donation and so on). Click an email address to reply.
- **Reports:** upload PDFs (annual reports, audited accounts) for the public Reports &
  Accountability page. 5 MB at most per file.
- **Subscribers:** who has subscribed, and whether they have confirmed. New subscribers get an
  email asking them to confirm, and only confirmed subscribers receive newsletters. If people signed
  up before email was set up, press **Send confirmation emails**. You can also download the list as
  a CSV file.
- **Newsletter:** write and send. Sending happens in steps with a progress bar. If the connection
  drops or the email service has a problem, the newsletter pauses and can be resumed from the list
  below it. Nobody receives it twice.
- **Settings:** the online donation link (Flutterwave, Stripe Payment Links, Donorbox or similar),
  Orange Money and Afrimoney numbers, bank details, and the registration number. Whatever you fill
  in appears on the Donate and Reports pages straight away. Check account numbers carefully.
- **Activity:** a log of logins and changes, kept for a year.

A daily job deletes photos that were uploaded but never used in a story, and old security records.

## Donations

Until payment details are entered under **Settings**, the Donate page takes *pledges*: the donor
chooses an amount and leaves their name and email, and the pledge arrives in **Messages** (and by
email if Resend is set up) so the team can reply with payment details. No payment is taken on the
website itself.

## Checks

```
npm install
npm test
```

`npm test` builds the site and runs about 200 automated checks: logins, roles, simultaneous login
attempts, stories, photos, story pages, the sitemap, contact form and pledges, double opt-in,
newsletter sending and resuming, unsubscribe links (including links in newsletters sent before this
version), reports, settings, the activity log, the clean-up job, and every page in a simulated
browser. That browser check also confirms that each page has one main heading, alt text on every
image, no inline scripts, no third-party scripts and no broken internal links.

## Things only the organisation can do

- Enter payment details and the registration number in **Settings**.
- Upload annual reports and accounts in **Reports**.
- Confirm the figures on the homepage that come from WOFHRAD-SL's own records (90 safe spaces,
  2,250+ girls, 8 chiefdoms, 6 districts) and the 58% poverty figure, which is quoted from Trócaire.
  The Human Development Index, life expectancy and election figures were checked against UNDP,
  World Bank and Inter-Parliamentary Union sources in November 2026.
- Confirm that the partner logos may be used, and say which partners are current.
- Move to an email address on your own domain, then update `site.config.json`.
- Check the Facebook, Instagram and X links in `site.config.json` still point to your accounts.
- Have someone review the privacy policy (`src/privacy.html`).
