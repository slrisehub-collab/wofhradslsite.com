# WOFHRAD-SL website

The public website of the Women's Forum for Human Rights & Democracy, Sierra Leone, with an
admin panel where staff publish stories and reports, read messages and donation pledges, and send
the newsletter.

## Project layout

```
content/stories/        the stories carried over from the old website, one text file each
src/                    the website's source
  *.html                one file per page (index, about, stories, donate, partners, reports, privacy, admin...)
  programmes/           one page per programme
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

### Stories from the old website

All 18 stories from the old WordPress site (2013 to 2023) were edited and moved into
`content/stories/`, with their photos in `src/assets/content/`. Nothing on this site links back to
the old site, so it can be switched off. Each file looks like this:

```
---
title: The road to Kamakwie
date: 2013-10-23
programme: peacebuilding          (optional: icsp, girls-circle, people-to-people, gesa, peacebuilding)
excerpt: One or two sentences shown on story cards.
cover: dscf0747                   (optional: one of the images below)
images:
  - dscf0747 | Alt text describing the photo for people who can't see it
---
The story. A blank line starts a new paragraph. ## starts a heading, - starts a bullet point.
```

These stories appear alongside the ones staff write in the admin panel (in lists, search, the
sitemap and the RSS feed), but they are edited here, in the repository, not in the admin panel.
New stories should be written in the admin panel.

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

### The team, staff accounts and profiles

Every staff member has a public profile at `/team/<their-name>`. Visitors reach it by clicking
the person's photo or name on the About page. The team is managed in the admin panel's
**Team** tab (administrators only):

- **Add a staff member** with their full name, email address, job title and what they can do.
  Tick *Send invitation*: they get an email with a link that shows them their name, email and job
  title to confirm, and lets them choose a password. If email isn't set up yet, the Team tab shows
  the link so you can send it by WhatsApp. Links work once and expire after 7 days.
- **What they can do:** *Staff* can edit their own profile only. *Editors* can also write
  stories, read messages and publish reports. *Administrators* can do everything, including
  managing the team.
- **Staff manage their own profile** in the *My profile* tab: their bio and profile photo
  (cropped to a square), and their password. Names, emails and job titles are set by an
  administrator, so they can't be mistyped.
- **Forgot password:** the login page emails a reset link. An administrator can also press
  *Send reset link* in the Team tab.
- **Hide** someone (untick *Show on website*) to take their profile off the site temporarily, for
  example during leave. **Remove** someone who has left: their account stops working at once,
  and their profile and photo are deleted. Stories they wrote stay on the site.
- Changing someone's password, access level or email ends their existing logins.

The team started from the list on the old site (without Fatima D. Kamara), so everyone already
has a profile. Invite each person from the Team tab to give them an account.

**Main administrator login.** `ADMIN_PASSWORD` (Netlify environment variable) still gives a
login called **Admin** with full access, as a way back in if every other administrator is locked
out. Type `Admin` in the login box. Staff log in with their email address.
`ADMIN_USERS` still works for extra environment logins but is no longer needed.

**Set `SESSION_SECRET`.** Now that staff accounts exist, add a long random `SESSION_SECRET` in
Netlify (any 40+ random characters). It protects every login.

Five wrong passwords from one connection lock it out for 15 minutes, and 50 wrong passwords from
anywhere pause all logins for 15 minutes.

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
  Orange Money and Afrimoney numbers, bank details, a WhatsApp number (adds "Chat on WhatsApp"
  links), and the registration number. Whatever you fill
  in appears on the Donate and Reports pages straight away. Check account numbers carefully.
- **Team:** add, invite, edit, hide and remove staff (see above).
- **My profile:** every staff member edits their own bio, photo and password.
- **Activity:** a log of logins and changes, kept for a year.

Story text in the admin panel can use simple formatting: a line starting with `##` becomes a
heading, lines starting with `-` become bullet points, and `**words**` become bold.

A daily job deletes photos that were uploaded but never used in a story, and old security records.

## Features at a glance

- Programme pages with photo galleries (photos open full-size in a viewer, no new tab).
- Story search, year and programme filters, reading time, related stories, print button.
- An RSS feed of stories at `/feed.xml` for partners and journalists.
- Works on slow or interrupted connections: once someone has visited, pages and photos they have
  seen still open offline, and the site can be added to a phone's home screen.
- Every page tested at phone width, with keyboard access, alt text and readable contrast.

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
- Move to an email address on your own domain, then update `site.config.json`.
- The Facebook, Instagram and X links were taken from the old site's footer. Check they are still
  your accounts.
- Invite each staff member from the Team tab, and check their job titles there (the old site gave
  Manty Koroma and Benjamin Fornah the title Field Officer).
- Have someone review the privacy policy (`src/privacy.html`).
