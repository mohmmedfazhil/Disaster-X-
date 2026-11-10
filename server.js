import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, "dist");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 8000);
const ollama = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const model = process.env.DISASTERX_OLLAMA_MODEL || "medllama2";
const visionModel = process.env.DISASTERX_VISION_MODEL || "qwen2.5vl:3b";
const systemPrompt = "You are Rescue mate, a cautious emergency information assistant. For an immediate emergency, tell the user to call local emergency services first. Give concise, low-risk general information, do not diagnose, prescribe, or invent facts. Defer to the dispatcher and trained responders.";
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon" };

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJson(req, max = 12_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw Object.assign(new Error("Request is too large"), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function handleAi(req, res, pathname) {
  if (pathname === "/api/ai/status" && req.method === "GET") {
    try {
      const response = await fetch(`${ollama}/api/tags`, { signal: AbortSignal.timeout(3000) });
      const data = await response.json();
      const models = data.models || [];
      return send(res, 200, {
        available: models.some(item => item.name?.split(":")[0] === model), model,
        visionAvailable: models.some(item => item.name === visionModel), visionModel
      });
    } catch {
      return send(res, 200, { available: false, model, visionAvailable: false, visionModel });
    }
  }
  if (!["/api/ai/chat", "/api/ai/image"].includes(pathname) || req.method !== "POST") return false;
  try {
    const data = await readJson(req);
    const prompt = String(data.message || "").trim();
    const image = String(data.image || "");
    if (!prompt || prompt.length > 4000 || (pathname.endsWith("/image") && (!image || image.length > 11_000_000))) {
      return send(res, 400, { error: "Message or image is missing, too long, or too large" });
    }
    const selectedModel = pathname.endsWith("/image") ? visionModel : model;
    const body = { model: selectedModel, stream: false, messages: pathname.endsWith("/image")
      ? [{ role: "user", content: prompt, images: [image] }]
      : [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }], options: { temperature: 0.2, num_predict: 350 } };
    const response = await fetch(`${ollama}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(125_000) });
    if (!response.ok) return send(res, 502, { error: `Ollama returned HTTP ${response.status}` });
    const result = await response.json();
    const text = result.message?.content?.trim();
    return text ? send(res, 200, { model: selectedModel, response: text }) : send(res, 502, { error: "The model returned an empty response" });
  } catch (error) {
    return send(res, error.status || 503, { error: `Local Ollama is unavailable: ${error.message}` });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);
  if (url.pathname.startsWith("/api/")) {
    if (await handleAi(req, res, url.pathname) !== false) return;
    return send(res, 404, { error: "API route not found" });
  }
  const base = await fs.access(dist).then(() => dist).catch(() => root);
  let requested;
  try { requested = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end("Bad request"); return; }
  const target = path.resolve(base, `.${requested === "/" ? "/index.html" : requested}`);
  if (!target.startsWith(`${base}${path.sep}`) && target !== path.join(base, "index.html")) { res.writeHead(403).end("Forbidden"); return; }
  try {
    const content = await fs.readFile(target);
    res.writeHead(200, { "content-type": mime[path.extname(target).toLowerCase()] || "application/octet-stream", "x-content-type-options": "nosniff" });
    res.end(content);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

server.listen(port, host, () => console.log(`DisasterX Node server running at http://${host}:${port}`));
