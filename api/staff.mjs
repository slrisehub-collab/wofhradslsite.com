// Vercel entry point. The real logic lives once, in netlify/functions/staff.mjs.
import handler from "../netlify/functions/staff.mjs";

export default { fetch: handler };
