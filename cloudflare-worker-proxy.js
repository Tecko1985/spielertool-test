// Cloudflare Worker: CORS-Proxy zwischen der GitHub-Pages-App und Nextcloud-WebDAV.
// Nextclouds remote.php/dav unterstützt kein CORS – dieser Worker leitet die
// Anfrage Server-zu-Server weiter und ergänzt die nötigen CORS-Header.
// Deployment: Cloudflare Dashboard -> Workers & Pages -> Create -> "Quick Edit",
// diesen Code einfügen, deployen. Die Worker-URL dann als "WebDAV-Adresse der Datei"
// in der App verwenden (gleicher Pfad wie die direkte Nextcloud-URL).

const ALLOWED_ORIGIN = "https://tecko1985.github.io";
const TARGET_HOST = "https://nx88695.your-storageshare.de";

export default {
  async fetch(request) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const origin = request.headers.get("Origin") || "";
    if (origin !== ALLOWED_ORIGIN) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const targetUrl = TARGET_HOST + url.pathname + url.search;

    const targetRequest = new Request(targetUrl, {
      method: request.method,
      headers: {
        Authorization: request.headers.get("Authorization") || "",
        "Content-Type": request.headers.get("Content-Type") || "application/json"
      },
      body: request.method === "PUT" ? await request.arrayBuffer() : undefined
    });

    const response = await fetch(targetRequest);
    const body = await response.arrayBuffer();
    return new Response(body, {
      status: response.status,
      headers: {
        ...corsHeaders,
        "Content-Type": response.headers.get("Content-Type") || "application/octet-stream"
      }
    });
  }
};
