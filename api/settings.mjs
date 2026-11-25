// Vercel entry point. The real logic lives once, in netlify/functions/settings.mjs.
import handler from "../netlify/functions/settings.mjs";

export default { fetch: handler };
