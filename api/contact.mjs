// Vercel entry point. The real logic lives once, in netlify/functions/contact.mjs,
// and runs unchanged on both platforms: both accept a Web standard Request and
// return a Web standard Response. This file only adapts Vercel's calling convention
// (an object with a "fetch" method) to that shared handler.
import handler from "../netlify/functions/contact.mjs";

export default { fetch: handler };
