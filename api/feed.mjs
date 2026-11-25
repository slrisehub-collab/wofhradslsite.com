// Vercel entry point. The real logic lives once, in netlify/functions/feed.mjs.
import handler from "../netlify/functions/feed.mjs";

export default { fetch: handler };
