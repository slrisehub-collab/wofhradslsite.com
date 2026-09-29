# WOFHRAD-SL website: stories, admin login and newsletter

## What went wrong before, in plain terms
The last upload to GitHub was done by dragging individual files into GitHub's "Add files" web
page. That only accepts files, not folders, so every file landed in one flat list instead of in
its proper folder. Two things happened because of that:

1. **Netlify couldn't find anything.** `netlify.toml` tells Netlify "the website is in the
   `public` folder, the server code is in the `netlify/functions` folder." Neither folder existed
   any more, so Netlify had no website to publish and no server code to run. That is why the
   deployed site did not work.
2. **Vercel found the pages but not their files.** Vercel just serves whatever is in the
   repository, so `index.html` still loaded. But that page asks for its logo images at
   `assets/partners/trocaire.jpg` and so on. With everything flattened, the real file was just
   `trocaire.jpg` at the top level, one folder short of where the page was looking, so every logo
   (and the stylesheet, and the newsletter script) quietly failed to load.
3. Two files were even named `subscribers.mjs` — one for the admin page's subscriber list, one a
   small shared helper. Flattening them into the same folder meant the second one silently
   replaced the first, deleting the actual subscriber-list feature. It has been rebuilt from
   scratch here.

**Everything is now back in its proper folders** (see the layout below), and going forward, please
upload this project as a whole folder — with GitHub Desktop, `git push`, or by dragging the
top-level project folder itself (not its contents) into GitHub — so the structure survives.

## Project layout
```
public/                 the website itself (what a visitor's browser loads)
  assets/               shared CSS, JS, and the partner logos
netlify/
  functions/            the server-side code, one file per feature (login, posts, newsletter...)
  lib/                  small helpers shared by every function (database, auth, etc.)
api/                    thin Vercel entry points; each one just re-uses the matching file in
                         netlify/functions so the real logic exists in exactly one place
test/                   automated checks (see "Checks" below)
netlify.toml            tells Netlify where the site and functions live
vercel.json             tells Vercel the same thing, in Vercel's own format
```

## Where this can be hosted
The website works the same either way. Pick one as your main address, or run both — they can
share the same stories and subscribers if you do the one extra step below.

### Netlify (simplest — one thing to set up)
1. Push this folder to GitHub as-is (see the note above about not flattening it).
2. At netlify.com: **Add new site > Import an existing project**, choose the repository, and
   press **Deploy**. `netlify.toml` already has the right settings.
3. **Site configuration > Environment variables**, add:

   | Name | Value | Needed for |
   |---|---|---|
   | `ADMIN_PASSWORD` | your chosen admin password | logging in (required) |
   | `SESSION_SECRET` | any long random text | optional, makes logins more secure |
   | `RESEND_API_KEY` | key from resend.com | sending newsletters |
   | `NEWSLETTER_FROM` | `WOFHRAD-SL <news@yourdomain.org>` | sending newsletters |
   | `NEWSLETTER_REPLY_TO` | `wofhrad95@gmail.com` | optional |
   | `CONTACT_TO` | email that gets an alert for each contact-form message | optional (defaults to `wofhrad95@gmail.com`) |

4. **Deploys > Trigger deploy**, then visit `your-site-address/admin.html` and log in.

On Netlify, story text, photos and subscriber emails are stored automatically with no extra
setup (a built-in feature called Netlify Blobs).

### Vercel (needs one extra step, because Vercel has no equivalent to Netlify Blobs)
Steps 1–2 are the same idea as above (import the repository; `vercel.json` already has the
settings). The admin password and newsletter variables from the table above are set the same
way, under **Project Settings > Environment Variables**.

The one extra step: Vercel has no built-in place to store stories and subscribers, so this
project points it at the same storage Netlify uses, with a key that only allows access to this
one site:
1. In Netlify: **User settings > Applications > Personal access tokens > New access token.**
   Copy it.
2. In Netlify: **Site configuration > General > Site details**, copy the **Site ID**.
3. In Vercel, add two more environment variables:

   | Name | Value |
   |---|---|
   | `NETLIFY_BLOBS_SITE_ID` | the Site ID from step 2 |
   | `NETLIFY_BLOBS_TOKEN` | the token from step 1 |

Without this step, the Vercel copy of the site will still look and work correctly, but admin
login and the newsletter/contact forms will show a plain error instead of silently failing, since
there is nowhere for them to save anything yet.

## Using it
- **Stories tab / New story:** write a title and story, add a cover photo and more photos, then
  choose Publish now or Save as draft. Published stories show on `stories.html` and the newest
  three on the homepage.
- **Sharing:** every story has WhatsApp, Facebook, X and Copy link buttons. They use a `/share/`
  link so the story's title and photo show up in the preview.
- **Messages tab:** everything visitors send through the homepage contact form. Reply by clicking
  their email address.
- **Subscribers tab:** see everyone who subscribed, remove people, or download the list as a CSV
  file.
- **Newsletter tab:** write a message and send it to all subscribers. Each email has an
  unsubscribe link.

## Contact form
Messages are saved on the server and appear in the **Messages** tab, even if email is not set up.
If you add the Resend settings above, each message is also emailed to `CONTACT_TO`, and replying
goes straight to the visitor.

## Newsletter sending
Collecting subscribers works straight away. Sending needs an email service; this uses Resend
(free plan available). Resend only lets you send to the public from a domain you have verified
with them. If you do not want to set that up, download the CSV and send from your own email
program (put addresses in BCC).

## Please read
- **Choose a strong admin password** and keep it only in `ADMIN_PASSWORD` on each platform — never
  in the code. Five wrong tries in a row lock that visitor out for 15 minutes, but a longer,
  less-guessable password is still the main protection.
- If you host on both platforms without the Vercel storage step above, treat Netlify as the one
  place admin work happens, since that is where stories and subscribers are actually stored.
- Update the address in the `canonical` and `og:url` tags of each page (they still say
  `wofhrad-sl.github.io`) once you know your real address.
- Photos are shrunk in the browser to 1600 pixels before upload. iPhone HEIC photos are not
  accepted; choose "Most Compatible" in the camera settings or share as JPG.

## Checks
`npm install` then `npm test` runs 87 automated checks covering the login, stories, images,
contact form, newsletter and every page.

This project was also build-checked directly with both platforms' own tools before being handed
over: `netlify build --offline` and `vercel build` (with a stand-in local project link, since
signing in was not possible from here) both completed with no errors, and the Vercel output was
inspected directly to confirm all ten API functions and every page, stylesheet and logo were
included correctly.
