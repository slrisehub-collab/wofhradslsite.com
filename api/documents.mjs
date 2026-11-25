// Vercel entry point. The real logic lives once, in netlify/functions/documents.mjs.
import handler from "../netlify/functions/documents.mjs";

export default { fetch: handler };
