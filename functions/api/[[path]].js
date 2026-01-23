export async function onRequest(context) {
  const { request, params } = context;

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  // Proxy to https://ai.gitee.com/v1/<path...>
  const path = (params.path || []).join("/");
  const targetUrl = new URL(`https://ai.gitee.com/v1/${path}`);
  const reqUrl = new URL(request.url);
  // forward query string
  targetUrl.search = reqUrl.search;

  // Clone headers; don't forward Host
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ipcountry");
  headers.delete("cf-ray");
  headers.delete("cf-visitor");
  headers.delete("x-forwarded-for");
  headers.delete("x-forwarded-proto");
  headers.delete("x-real-ip");

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  // Only attach body for non-GET/HEAD
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  const upstream = await fetch(targetUrl.toString(), init);

  // Stream response; add CORS headers
  const respHeaders = new Headers(upstream.headers);
  for (const [k, v] of Object.entries(corsHeaders())) respHeaders.set(k, v);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400",
  };
}
