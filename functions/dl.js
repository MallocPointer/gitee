export async function onRequest(context) {
  const { request } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const url = new URL(request.url);
  const target = url.searchParams.get("url") || "";

  if (!target || !(target.startsWith("https://") || target.startsWith("http://"))) {
    return new Response(JSON.stringify({ error: "Invalid or missing url param" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  // Forward a minimal set of headers (Range helps for video)
  const h = new Headers();
  const range = request.headers.get("Range");
  if (range) h.set("Range", range);

  const upstream = await fetch(target, { method: "GET", headers: h, redirect: "follow" });

  const respHeaders = new Headers(upstream.headers);
  for (const [k, v] of Object.entries(corsHeaders())) respHeaders.set(k, v);
  // Some hosts send restrictive headers; loosen for download/view
  respHeaders.delete("Content-Security-Policy");
  respHeaders.delete("X-Frame-Options");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400",
  };
}
