// Vercel entry point. The real logic lives once, in netlify/functions/story.mjs.
import handler from "../netlify/functions/story.mjs";

export default { fetch: handler };
