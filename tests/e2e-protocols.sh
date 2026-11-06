#!/usr/bin/env bash
# 端到端协议测试：mock 上游 + chat2api-slim，验证 Anthropic / Responses 两条协议的完整流式转换
# 用法：bash tests/e2e-protocols.sh
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

pass=0; fail=0
check() {
  local name="$1" expected="$2" actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    echo "PASS  $name"; pass=$((pass+1))
  else
    echo "FAIL  $name"; echo "  expect: $expected"; echo "  got: ${actual:0:400}"; fail=$((fail+1))
  fi
}

cleanup() {
  [ -n "${SLIM_PID:-}" ] && kill "$SLIM_PID" 2>/dev/null
  [ -n "${MOCK_PID:-}" ] && kill "$MOCK_PID" 2>/dev/null
  wait 2>/dev/null
}
trap cleanup EXIT

npx tsx tests/mock-openai-upstream.ts 18080 >tests/mock.log 2>&1 &
MOCK_PID=$!
sleep 2
CONFIG_PATH="$ROOT/tests/e2e-config.json" npx tsx src/main/index.ts >tests/slim-e2e.log 2>&1 &
SLIM_PID=$!
sleep 8

BASE=http://127.0.0.1:18081
AUTH='-H "x-api-key: sk-e2e"'
anthropic_headers=(-H "x-api-key: sk-e2e" -H "anthropic-version: 2023-06-01" -H "Content-Type: application/json")

# 1) Anthropic 非流式文本
nonstream=$(curl -sS --max-time 20 "$BASE/v1/messages" "${anthropic_headers[@]}" \
  -d '{"model":"claude-sonnet-4-5","max_tokens":100,"messages":[{"role":"user","content":"hi"}]}')
check "anthropic 非流式：message 对象" '"type":"message"' "$nonstream"
check "anthropic 非流式：文本内容" '你好，我是 mock' "$nonstream"

# 2) Anthropic 流式文本（SSE 事件序列）
stream=$(curl -sS --max-time 20 -N "$BASE/v1/messages" "${anthropic_headers[@]}" \
  -d '{"model":"claude-sonnet-4-5","max_tokens":100,"stream":true,"messages":[{"role":"user","content":"hi"}]}')
check "anthropic 流：message_start" 'event: message_start' "$stream"
check "anthropic 流：text_delta" 'text_delta' "$stream"
check "anthropic 流：message_stop" 'event: message_stop' "$stream"
check "anthropic 流：内容拼接" '，我是' "$stream"

# 3) Anthropic 流式工具调用
toolstream=$(curl -sS --max-time 20 -N "$BASE/v1/messages" "${anthropic_headers[@]}" \
  -d '{"model":"claude-sonnet-4-5","max_tokens":100,"stream":true,
       "tools":[{"name":"shell","description":"run","input_schema":{"type":"object","properties":{"cmd":{"type":"string"}}}}],
       "messages":[{"role":"user","content":"USE_TOOL: list files"}]}')
check "anthropic 流：tool_use 块" '"type":"tool_use"' "$toolstream"
check "anthropic 流：input_json_delta" 'input_json_delta' "$toolstream"
check "anthropic 流：stop_reason=tool_use" '"stop_reason":"tool_use"' "$toolstream"

# 4) Anthropic count_tokens
count=$(curl -sS --max-time 10 "$BASE/v1/messages/count_tokens" "${anthropic_headers[@]}" \
  -d '{"model":"claude-sonnet-4-5","messages":[{"role":"user","content":"hello world"}]}')
check "anthropic count_tokens" '"input_tokens"' "$count"

# 5) Responses 非流式
rnonstream=$(curl -sS --max-time 20 "$BASE/v1/responses" -H "Authorization: Bearer sk-e2e" -H "Content-Type: application/json" \
  -d '{"model":"gpt-5-codex","input":"hi"}')
check "responses 非流式：response 对象" '"object":"response"' "$rnonstream"
check "responses 非流式：output_text" '你好，我是 mock' "$rnonstream"

# 6) Responses 流式
rstream=$(curl -sS --max-time 20 -N "$BASE/v1/responses" -H "Authorization: Bearer sk-e2e" -H "Content-Type: application/json" \
  -d '{"model":"gpt-5-codex","stream":true,"input":"hi"}')
check "responses 流：response.created" 'event: response.created' "$rstream"
check "responses 流：output_text.delta" 'response.output_text.delta' "$rstream"
check "responses 流：response.completed" 'event: response.completed' "$rstream"

# 7) Responses 流式工具调用
rtool=$(curl -sS --max-time 20 -N "$BASE/v1/responses" -H "Authorization: Bearer sk-e2e" -H "Content-Type: application/json" \
  -d '{"model":"gpt-5-codex","stream":true,"input":"USE_TOOL: list files",
       "tools":[{"type":"function","name":"shell","parameters":{"type":"object","properties":{"cmd":{"type":"string"}}}}]}')
check "responses 流：function_call item" '"type":"function_call"' "$rtool"
check "responses 流：function_call_arguments.delta" 'response.function_call_arguments.delta' "$rtool"
check "responses 流：completed 含 shell" '"name":"shell"' "$rtool"

# 8) /anthropic 前缀重写
prefix=$(curl -sS --max-time 20 "$BASE/anthropic/v1/messages" "${anthropic_headers[@]}" \
  -d '{"model":"claude-sonnet-4-5","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}')
check "路径重写 /anthropic/v1/messages" '"type":"message"' "$prefix"

# 9) 模型列表（Anthropic 形状）
models=$(curl -sS --max-time 10 "$BASE/v1/models" "${anthropic_headers[@]}")
check "Anthropic 形状模型列表" '"display_name"' "$models"

echo
echo "结果：$pass passed, $fail failed"
[ "$fail" -eq 0 ]
