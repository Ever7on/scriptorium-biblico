// Servidor da IA do Scriptorium Bíblico (Cloudflare Worker)
// Recebe o pedido do app, chama a API da Anthropic com a SUA chave (guardada
// como segredo na Cloudflare, nunca dentro do app) e devolve o texto em tempo real.
//
// Variáveis (Settings → Variables and Secrets):
//   ANTHROPIC_API_KEY  (Secret, obrigatória)  sua chave da API da Anthropic
//   ALLOWED_ORIGIN     (Text, recomendada)    endereço do app, ex.: https://scriptorium.pages.dev
//                                              (vários separados por vírgula)
//   APP_ACCESS_CODE    (Secret, opcional)     código que o usuário digita no app para usar a IA
//   ANTHROPIC_MODEL    (Text, opcional)       padrão: claude-sonnet-5
//   MAX_TOKENS         (Text, opcional)       padrão: 3000

const DEFAULT_MODEL = "claude-sonnet-5";
const SYSTEM = "Você é o assistente de estudo bíblico do app Scriptorium Bíblico. Responda sempre em português do Brasil, com fidelidade ao texto bíblico e ao contexto. Siga as instruções de formato do pedido.";

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGIN || "*").split(",").map(s => s.trim().replace(/\/$/, "")).filter(Boolean);
    const originOk = allowed.includes("*") || allowed.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": originOk ? (origin || "*") : allowed[0] || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, x-access-code",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return new Response("Servidor de IA do Scriptorium Bíblico: ativo.", { status: 200, headers: cors });
    if (!originOk) return json({ error: "forbidden_origin" }, 403, cors);
    if (!env.ANTHROPIC_API_KEY) return json({ error: "not_configured" }, 503, cors);
    if (env.APP_ACCESS_CODE && request.headers.get("x-access-code") !== env.APP_ACCESS_CODE) {
      return json({ error: "not_granted" }, 401, cors);
    }

    let body;
    try { body = await request.json(); } catch { return json({ error: "bad_request" }, 400, cors); }
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    if (!prompt || prompt.length > 40000) return json({ error: "bad_request" }, 400, cors);

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL || DEFAULT_MODEL,
        max_tokens: Number(env.MAX_TOKENS) || 3000,
        stream: true,
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (upstream.status === 429 || upstream.status === 529) return json({ error: "rate_limited" }, 429, cors);
    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 400);
      return json({ error: "upstream", status: upstream.status, detail }, 502, cors);
    }
    return new Response(upstream.body, {
      status: 200,
      headers: { ...cors, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" }
    });
  }
};
