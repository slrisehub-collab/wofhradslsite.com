// Vercel entry point. The real logic lives once, in netlify/functions/account.mjs.
import handler from "../netlify/functions/account.mjs";

export default { fetch: handler };
