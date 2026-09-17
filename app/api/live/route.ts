import { db } from "@/lib/db";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let last = new Date(Date.now() - 30_000).toISOString();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`event: ready\ndata: ${JSON.stringify({ connected: true })}\n\n`));
      const timer = setInterval(async () => {
        try {
          const rows = await db()`select id,created_at from posts where created_at>${last} order by created_at asc limit 20`;
          if (rows.length) {
            last = new Date(String(rows[rows.length - 1].created_at)).toISOString();
            controller.enqueue(encoder.encode(`event: activity\ndata: ${JSON.stringify({ postIds: rows.map((r) => r.id) })}\n\n`));
          } else controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {}
      }, 8000);
      request.signal.addEventListener("abort", () => { clearInterval(timer); try { controller.close(); } catch {} });
    }
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
