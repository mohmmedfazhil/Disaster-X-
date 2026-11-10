"""Local development server with a same-origin proxy for Ollama."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import URLError, HTTPError
from urllib.request import Request, urlopen
import json
import os

HOST = "127.0.0.1"
PORT = 8000
OLLAMA_URL = "http://127.0.0.1:11434"
MODEL = os.environ.get("DISASTERX_OLLAMA_MODEL", "medllama2")
VISION_MODEL = os.environ.get("DISASTERX_VISION_MODEL", "qwen2.5vl:3b")
SYSTEM_PROMPT = (
    "You are Rescue mate, a cautious emergency information assistant. "
    "For an immediate emergency, tell the user to call local emergency services first. "
    "Give concise, low-risk general information, do not diagnose, prescribe, or invent facts. "
    "For first aid, follow recognized public guidance and defer to the dispatcher and trained responders. "
    "If uncertain, say so. This chat is not a substitute for professional care."
)


class Handler(SimpleHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/ai/status":
            try:
                with urlopen(f"{OLLAMA_URL}/api/tags", timeout=2) as response:
                    models = json.loads(response.read().decode("utf-8")).get("models", [])
                available = any(model.get("name", "").split(":")[0] == MODEL for model in models)
                vision_available = any(model.get("name", "") == VISION_MODEL for model in models)
                return self.send_json(200, {"available": available, "model": MODEL, "visionAvailable": vision_available, "visionModel": VISION_MODEL})
            except (URLError, TimeoutError, json.JSONDecodeError):
                return self.send_json(200, {"available": False, "model": MODEL, "visionAvailable": False, "visionModel": VISION_MODEL})
        return super().do_GET()

    def do_POST(self):
        if self.path not in ("/api/ai/chat", "/api/ai/image"):
            return self.send_json(404, {"error": "Not found"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size <= 0 or size > 12_000_000:
                return self.send_json(400, {"error": "Request body is empty or too large"})
            data = json.loads(self.rfile.read(size).decode("utf-8"))
            prompt = str(data.get("message", "")).strip()
            if not prompt or len(prompt) > 4000:
                return self.send_json(400, {"error": "Message is empty or too long"})
            is_image = self.path == "/api/ai/image"
            image = str(data.get("image", "")) if is_image else ""
            if is_image and (not image or len(image) > 11_000_000):
                return self.send_json(400, {"error": "Image is missing or too large"})
            messages = ([{"role": "user", "content": prompt, "images": [image]}] if is_image else [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ])
            payload = json.dumps({
                "model": VISION_MODEL if is_image else MODEL,
                "stream": False,
                "messages": messages,
                "options": {"temperature": 0.1 if is_image else 0.2, "num_predict": 350},
            }).encode("utf-8")
            request = Request(f"{OLLAMA_URL}/api/chat", data=payload, headers={"Content-Type": "application/json"})
            with urlopen(request, timeout=120) as response:
                result = json.loads(response.read().decode("utf-8"))
            content = result.get("message", {}).get("content", "").strip()
            if not content:
                return self.send_json(502, {"error": "The model returned an empty response"})
            return self.send_json(200, {"model": VISION_MODEL if is_image else MODEL, "response": content})
        except HTTPError as error:
            try:
                detail = error.read().decode("utf-8")[:500]
            except Exception:
                detail = str(error)
            return self.send_json(502, {"error": f"Ollama returned an error: {detail}"})
        except (URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError) as error:
            return self.send_json(503, {"error": f"Local Ollama is unavailable: {error}"})


if __name__ == "__main__":
    print(f"DisasterX is serving at http://{HOST}:{PORT}")
    print(f"Ollama model: {MODEL} (start Ollama and pull the model to enable it)")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
