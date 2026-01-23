/**
 * Standalone Cloudflare Worker proxy (optional).
 * If you deploy this Worker, set frontend BASE to your worker URL and call /v1/* through it.
 * This file is NOT required if you use Cloudflare Pages Functions in /functions.
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Example mapping:
    // Worker URL: https://your-worker.example.workers.dev
    // Client requests: /v1/async/images/edits  -> forwards to https://ai.gitee.com/v1/async/images/edits
    // Client requests: /dl?url=... -> forwards to that URL
    if (url.pathname.startsWith("/dl")) {
      const target = url.searchParams.get("url") || "";
      if (!target || !(target.startsWith("https://") || target.startsWith("http://"))) {
        return new Response(JSON.stringify({ error: "Invalid or missing url param" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }
      const h = new Headers();
      const range = request.headers.get("Range");
      if (range) h.set("Range", range);
      const upstream = await fetch(target, { method:"GET", headers:h, redirect:"follow" });
      const respHeaders = new Headers(upstream.headers);
      applyCors(respHeaders);
      return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
    }

    if (!url.pathname.startsWith("/v1/")) {
      return new Response("Not Found", { status: 404, headers: corsHeaders() });
    }

    const targetUrl = new URL("https://ai.gitee.com" + url.pathname);
    targetUrl.search = url.search;

    const headers = new Headers(request.headers);
    headers.delete("host");

    const init = { method: request.method, headers, redirect:"manual" };
    if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;

    const upstream = await fetch(targetUrl.toString(), init);
    const respHeaders = new Headers(upstream.headers);
    applyCors(respHeaders);

    return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400",
  };
}
function applyCors(h) {
  for (const [k,v] of Object.entries(corsHeaders())) h.set(k,v);
}
