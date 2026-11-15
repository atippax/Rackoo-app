export async function POST(request: Request): Promise<Response> {
  const apiUrl = process.env.RACKOO_API_URL?.replace(/\/$/u, "");
  if (!apiUrl) {
    console.error("[send-to-group] Rackoo API URL is not configured");
    return Response.json({ ok: false, error: "RACKOO_API_URL is not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.error("[send-to-group] Request body is not valid JSON");
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const response = await fetch(apiUrl + "/pairings/flex-message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const responseBody = await response.text();
    if (response.ok) {
      console.info(`[send-to-group] Rackoo API responded with ${response.status}`);
    } else {
      console.error(`[send-to-group] Rackoo API responded with ${response.status}`);
    }
    return new Response(responseBody, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    console.error("[send-to-group] Request to Rackoo API failed");
    return Response.json({ ok: false, error: "Pairing API is unavailable" }, { status: 502 });
  }
}
