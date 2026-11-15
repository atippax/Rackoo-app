export async function POST(request: Request): Promise<Response> {
  const configuredApiUrl = process.env.RACKOO_API_URL?.trim().replace(/\/$/u, "");
  if (!configuredApiUrl) {
    console.error("[send-to-group] Rackoo API URL is not configured");
    return Response.json({ ok: false, error: "RACKOO_API_URL is not configured" }, { status: 503 });
  }

  let apiUrl: URL;
  try {
    apiUrl = new URL(configuredApiUrl);
    if (apiUrl.protocol !== "https:") throw new Error("https_required");
  } catch {
    console.error("[send-to-group] Rackoo API URL is invalid; expected an HTTPS Worker URL");
    return Response.json({ ok: false, error: "RACKOO_API_URL must be the deployed Rackoo Worker HTTPS URL" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.error("[send-to-group] Request body is not valid JSON");
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const response = await fetch(new URL("/pairings/flex-message", apiUrl), {
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
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : null;
    console.error(JSON.stringify({
      level: "error",
      event: "send_to_group.rackoo_request_failed",
      host: apiUrl.host,
      cause,
    }));
    return Response.json({
      ok: false,
      error: `BMT cannot reach Rackoo API at ${apiUrl.host}. Check RACKOO_API_URL in Vercel and confirm the Worker is deployed.`,
    }, { status: 502 });
  }
}
