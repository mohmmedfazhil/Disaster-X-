#!/usr/bin/env ruby
# Local web server and same-origin proxy for the Ollama MedLlama2 model.

require "webrick"
require "net/http"
require "json"
require "uri"

HOST = "127.0.0.1"
PORT = 8000
OLLAMA_URL = "http://127.0.0.1:11434"
MODEL = ENV.fetch("DISASTERX_OLLAMA_MODEL", "medllama2")
VISION_MODEL = ENV.fetch("DISASTERX_VISION_MODEL", "qwen2.5vl:3b")
SYSTEM_PROMPT = <<~PROMPT.freeze
  You are Rescue mate, a cautious emergency information assistant. For an immediate emergency, tell the user to call local emergency services first. Give concise, low-risk general information, do not diagnose, prescribe, or invent facts. For first aid, follow recognized public guidance and defer to the dispatcher and trained responders. If uncertain, say so. This chat is not a substitute for professional care.
PROMPT

server = WEBrick::HTTPServer.new(
  BindAddress: HOST,
  Port: PORT,
  DocumentRoot: Dir.pwd,
  AccessLog: [],
  Logger: WEBrick::Log.new($stdout, WEBrick::Log::INFO)
)

json_response = lambda do |response, status, payload|
  response.status = status
  response["Content-Type"] = "application/json; charset=utf-8"
  response["Cache-Control"] = "no-store"
  response.body = JSON.generate(payload)
end

server.mount_proc "/api/ai/status" do |request, response|
  begin
    uri = URI("#{OLLAMA_URL}/api/tags")
    result = Net::HTTP.start(uri.host, uri.port, open_timeout: 2, read_timeout: 2) { |http| http.get(uri.request_uri) }
    models = JSON.parse(result.body).fetch("models", [])
    available = models.any? { |model| model.fetch("name", "").split(":").first == MODEL }
    vision_available = models.any? { |model| model.fetch("name", "") == VISION_MODEL }
    json_response.call(response, 200, { available: available, model: MODEL, visionAvailable: vision_available, visionModel: VISION_MODEL })
  rescue StandardError
    json_response.call(response, 200, { available: false, model: MODEL, visionAvailable: false, visionModel: VISION_MODEL })
  end
end

server.mount_proc "/api/ai/chat" do |request, response|
  begin
    data = JSON.parse(request.body.to_s)
    prompt = data.fetch("message", "").to_s.strip
    if prompt.empty? || prompt.length > 4000
      json_response.call(response, 400, { error: "Message is empty or too long" })
      next
    end
    uri = URI("#{OLLAMA_URL}/api/chat")
    body = {
      model: MODEL,
      stream: false,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      options: { temperature: 0.2, num_predict: 350 }
    }
    result = Net::HTTP.start(uri.host, uri.port, open_timeout: 5, read_timeout: 120) do |http|
      http.post(uri.request_uri, JSON.generate(body), "Content-Type" => "application/json")
    end
    unless result.is_a?(Net::HTTPSuccess)
      json_response.call(response, 502, { error: "Ollama returned HTTP #{result.code}" })
      next
    end
    content = JSON.parse(result.body).dig("message", "content").to_s.strip
    if content.empty?
      json_response.call(response, 502, { error: "The model returned an empty response" })
    else
      json_response.call(response, 200, { model: MODEL, response: content })
    end
  rescue StandardError => error
    json_response.call(response, 503, { error: "Local Ollama is unavailable: #{error.message}" })
  end
end

server.mount_proc "/api/ai/image" do |request, response|
  begin
    data = JSON.parse(request.body.to_s)
    prompt = data.fetch("message", "").to_s.strip
    image = data.fetch("image", "").to_s
    if prompt.empty? || image.empty? || image.length > 11_000_000
      json_response.call(response, 400, { error: "Image or prompt is missing, or the image is too large" })
      next
    end
    uri = URI("#{OLLAMA_URL}/api/chat")
    body = {
      model: VISION_MODEL,
      stream: false,
      messages: [{ role: "user", content: prompt, images: [image] }],
      options: { temperature: 0.1, num_predict: 350 }
    }
    result = Net::HTTP.start(uri.host, uri.port, open_timeout: 5, read_timeout: 120) do |http|
      http.post(uri.request_uri, JSON.generate(body), "Content-Type" => "application/json")
    end
    unless result.is_a?(Net::HTTPSuccess)
      json_response.call(response, 502, { error: "Vision model returned HTTP #{result.code}" })
      next
    end
    content = JSON.parse(result.body).dig("message", "content").to_s.strip
    if content.empty?
      json_response.call(response, 502, { error: "The vision model returned an empty response" })
    else
      json_response.call(response, 200, { model: VISION_MODEL, response: content })
    end
  rescue StandardError => error
    json_response.call(response, 503, { error: "Local vision model is unavailable: #{error.message}" })
  end
end

trap("INT") { server.shutdown }
trap("TERM") { server.shutdown }
puts "DisasterX: http://localhost:#{PORT}"
puts "Ollama model: #{MODEL} (run Ollama separately to enable MedLlama2)"
puts "Ollama vision model: #{VISION_MODEL} (run Ollama separately to enable image analysis)"
server.start
