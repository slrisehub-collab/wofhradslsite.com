// Vercel entry point for the daily clean-up (scheduled in vercel.json "crons").
// Vercel sends "Authorization: Bearer <CRON_SECRET>" on scheduled calls; anything else is refused.
import { cleanup } from "../netlify/functions/cleanup.mjs";

export default {
  async fetch(req) {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Forbidden", { status: 403 });
    return Response.json(await cleanup());
  },
};
