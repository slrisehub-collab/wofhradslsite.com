import { isId, wrap } from "../lib/util.mjs";

// Older share links (/share/<id>) now point to the story's own page.
export default wrap(async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || url.pathname.split("/").filter(Boolean).pop();
  const to = isId(id) ? `/stories/${id}` : "/stories.html";
  return new Response(null, { status: 301, headers: { location: to, "cache-control": "public, max-age=86400" } });
});

export const config = { path: "/share/*" };
