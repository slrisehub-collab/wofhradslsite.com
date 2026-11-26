// Vercel entry point. The real logic lives once, in netlify/functions/team.mjs.
import handler from "../netlify/functions/team.mjs";

export default { fetch: handler };
