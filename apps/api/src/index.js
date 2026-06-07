import { lookup } from "@feruz-crawler/lookup";

const port = Number(process.env.PORT ?? 3000);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

const server = Bun.serve({
  port,
  fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true });
    }

    if (request.method === "GET" && url.pathname === "/") {
      return json({
        name: "feruz-crawler",
        service: "api",
        lookup: lookup("health")
      });
    }

    return json({ error: "Not found" }, 404);
  }
});

console.log(`feruz-crawler API listening on http://localhost:${server.port}`);
