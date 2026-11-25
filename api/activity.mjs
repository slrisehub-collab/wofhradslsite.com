// Vercel entry point. The real logic lives once, in netlify/functions/activity.mjs.
import handler from "../netlify/functions/activity.mjs";

export default { fetch: handler };
