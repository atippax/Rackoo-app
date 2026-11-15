export async function POST(request: Request): Promise<Response> {
  const apiUrl = process.env.RACKOO_API_URL?.replace(/\/$/u, "");
  if (!apiUrl) {
    return Response.json({ ok: false, error: "RACKOO_API_URL is not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const response = await fetch(apiUrl + "/pairings/flex-message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return Response.json({ ok: false, error: "Pairing API is unavailable" }, { status: 502 });
  }
}
