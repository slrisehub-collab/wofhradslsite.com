// Vercel entry point. The real logic lives once, in netlify/functions/sitemap.mjs.
import handler from "../netlify/functions/sitemap.mjs";

export default { fetch: handler };
