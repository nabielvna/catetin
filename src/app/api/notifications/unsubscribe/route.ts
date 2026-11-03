import { suppressEmail } from "@/services/notifications/unsubscribe";

const page = (msg: string) =>
  new Response(
    `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Catetin</title><body style="font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 20px;color:#0a0a0a"><p style="font-weight:800;letter-spacing:-.04em;font-size:20px">catetin</p><p style="font-size:16px">${msg}</p></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );

export async function GET(req: Request) {
  const ok = await suppressEmail(new URL(req.url).searchParams.get("t") ?? "");
  return page(
    ok
      ? "Kamu tidak akan menerima email dari Catetin lagi. / You won't receive emails from Catetin anymore."
      : "Link tidak valid. / Invalid link.",
  );
}

export async function POST(req: Request) {
  const ok = await suppressEmail(new URL(req.url).searchParams.get("t") ?? "");
  return new Response(null, { status: ok ? 200 : 400 });
}
