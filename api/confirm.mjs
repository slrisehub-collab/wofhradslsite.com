// Vercel entry point. The real logic lives once, in netlify/functions/confirm.mjs.
import handler from "../netlify/functions/confirm.mjs";

export default { fetch: handler };
