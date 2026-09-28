# WOFHRAD-SL website: stories, admin login and newsletter

## Why this needs Netlify
Posting stories, logging in and collecting newsletter emails all need a server and a database.
GitHub Pages (where the site was) cannot do that. Netlify is free for a site this size and runs
everything in this folder. The `public` folder is the website. The `netlify` folder is the server side.

## Set-up (about 15 minutes)
1. Create a free GitHub repository and upload everything in this folder to it.
2. Create a free account at netlify.com. Choose **Add new site > Import an existing project**, pick the
   repository, and press **Deploy**. Nothing else needs changing; `netlify.toml` has the settings.
3. In Netlify open **Site configuration > Environment variables** and add:

   | Name | Value | Needed for |
   |---|---|---|
   | `ADMIN_PASSWORD` | the admin password | logging in (required) |
   | `SESSION_SECRET` | any long random text | optional, makes logins more secure |
   | `RESEND_API_KEY` | key from resend.com | sending newsletters |
   | `NEWSLETTER_FROM` | `WOFHRAD-SL <news@yourdomain.org>` | sending newsletters |
   | `NEWSLETTER_REPLY_TO` | `wofhrad95@gmail.com` | optional |
   | `CONTACT_TO` | email that gets an alert for each contact-form message | optional (defaults to `wofhrad95@gmail.com`) |

4. Press **Deploys > Trigger deploy** so the new settings take effect.
5. Go to `your-site-address/admin.html` and log in.

The password is stored only in Netlify. It is never in the web pages, so visitors cannot find it.

## Using it
- **Stories tab / New story:** write a title and story, add a cover photo and more photos, then choose
  Publish now or Save as draft. Published stories show on `stories.html` and the newest three on the homepage.
- **Sharing:** every story has WhatsApp, Facebook, X and Copy link buttons. They use a `/share/` link
  so the story's title and photo show up in the preview.
- **Messages tab:** everything visitors send through the homepage contact form. Reply by clicking their email address.
- **Subscribers tab:** see everyone who subscribed, remove people, or download the list as a CSV file.
- **Newsletter tab:** write a message and send it to all subscribers. Each email has an unsubscribe link.

## Contact form
Messages are saved on the server and appear in the **Messages** tab, even if email is not set up. If you add the
Resend settings below, each message is also emailed to `CONTACT_TO`, and replying goes straight to the visitor.

## Newsletter sending
Collecting subscribers works straight away. Sending needs an email service; this uses Resend (free plan
available). Resend only lets you send to the public from a domain you have verified with them. If you do
not want to set that up, download the CSV and send from your own email program (put addresses in BCC).

## Please read
- **Choose a stronger password.** `@2006` is the year the organisation was founded, so it is easy to guess.
  Five wrong tries lock an address out for 15 minutes, but a longer password is much safer. Any password
  works: just put it in `ADMIN_PASSWORD`.
- Netlify shares stories and subscribers between the live site and preview deploys. Test on the live site
  carefully.
- Update the address in the `canonical` and `og:url` tags of each page (they still say `wofhrad-sl.github.io`).
- Photos are shrunk in the browser to 1600 pixels before upload. iPhone HEIC photos are not accepted;
  choose "Most Compatible" in the camera settings or share as JPG.

## Checks
`npm install` then `npm test` runs 87 automated checks on the login, stories, images, contact form, newsletter and pages.
