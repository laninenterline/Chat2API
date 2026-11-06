# 本机（Termux）部署记录

## 1. 服务位置与命令

```
项目目录：~/ghproj/chat2api-slim
配置：    config.json（含 apiKeys / adminKey / 账号）
日志：    logs/server.log
```

```bash
bash scripts/start.sh     # 后台启动（pid 写入 .server.pid）
bash scripts/status.sh    # 查看状态 + /health
bash scripts/stop.sh      # 停止
```

- 监听：`127.0.0.1:8080`（只对本机开放）
- 本机网关 API Key：见 `config.json` 的 `apiKeys`（当前为 `sk-slim-local`）
- 管理接口 Key：见 `config.json` 的 `adminKey`

## 2. 填入真实网页版 Token

三个账号已经建好（DeepSeek / GLM / MiniMax），凭据为空，所以现在调用会返回
「Token not configured / refresh failed / HTTP 401」。两种填法：

### 方式 A：管理接口（不用重启）

```bash
ADMIN=$(python3 -c "import json;print(json.load(open('$HOME/ghproj/chat2api-slim/config.json'))['adminKey'])")

# DeepSeek：chat.deepseek.com → F12 → LocalStorage → userToken
curl -X PATCH http://127.0.0.1:8080/v0/management/accounts/acc-deepseek-1 \
  -H "X-Admin-Key: $ADMIN" -H "Content-Type: application/json" \
  -d '{"credentials":{"token":"<userToken>"}}'

# GLM：chatglm.cn → F12 → LocalStorage → chatglm_refresh_token
curl -X PATCH http://127.0.0.1:8080/v0/management/accounts/acc-glm-2 \
  -H "X-Admin-Key: $ADMIN" -H "Content-Type: application/json" \
  -d '{"credentials":{"refresh_token":"<chatglm_refresh_token>"}}'

# MiniMax：agent.minimaxi.com → F12 → LocalStorage → _token（realUserID 可留空）
curl -X PATCH http://127.0.0.1:8080/v0/management/accounts/acc-minimax-3 \
  -H "X-Admin-Key: $ADMIN" -H "Content-Type: application/json" \
  -d '{"credentials":{"token":"<token>","realUserID":"<realUserID>"}}'
```

### 方式 B：直接改 config.json

编辑 `config.json` 里对应 `accounts[].credentials`，然后
`bash scripts/stop.sh && bash scripts/start.sh`。

管理接口会把 token 回写进 `config.json`，两种方式等价。

## 3. DSH 配置（已写入）

文件：`~/.dsh/profiles/web/cordis.patch.yml`

```yaml
- id: agent-default-model
  config:
    provider: deepseek-official     # 原来：deepseek-account（官方 OAuth）
    model: deepseek-v4.1-flash

- id: llm-deepseek                  # 原条目为 @deepseek-ai/dsh-llm-deepseek-api-key
  config:
    baseURL: http://127.0.0.1:8080  # DSH 会补 /v1 -> /v1/messages
    apiKeyEnv: SLIM_API_KEY         # 凭据名，值在 ~/.dsh/.credentials.yaml 的 refs
    thinking: disabled
    reasoningEffort: off
    models:                         # 四个模型
      - deepseek-v4.1-flash         # DeepSeek V4.1-Flash
      - GLM-5.3-Flash
      - GLM-5.3
      - MiniMax-M3.1-Flash
```

凭据：`~/.dsh/.credentials.yaml` 的 `refs:` 下新增 `SLIM_API_KEY: sk-slim-local`
（与 `config.json` 的 `apiKeys` 对应）。

验证配置已正确合成：

```bash
dsh --profile web --dump-config | grep -A 8 'id: llm-deepseek'
```

生效方式：DSH web profile 启用了 HMR，保存 profile 配置后一般会自动重载；
若模型选择器里没出现三个模型，退出当前 `dsh web` 重新启动即可。

> 注意：`agent-default-model` 已被改成 `deepseek-official / deepseek-v4-pro`。
> 想切回官方账号模型，把这两行改回 `deepseek-account` / `deepseek-flash`，
> 或在 GUI 的模型选择器里手动选。

## 4. 其他客户端（可选）

```bash
# Claude Code
export ANTHROPIC_BASE_URL=http://127.0.0.1:8080
export ANTHROPIC_AUTH_TOKEN=sk-slim-local
export ANTHROPIC_MODEL=deepseek-v4-pro

# Codex CLI（~/.codex/config.toml）
# base_url = "http://127.0.0.1:8080/v1"
# wire_api = "responses"
# env_key  = "SLIM_API_KEY"
```

## 5. 开机自启（可选，需要安装 Termux:Boot）

```bash
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/start-chat2api.sh <<'SH'
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
cd "$HOME/ghproj/chat2api-slim" && bash scripts/start.sh
SH
chmod +x ~/.termux/boot/start-chat2api.sh
```

## 5.1 MiniMax 说明（2026-10-26）

- Web 端 API 已迁到 **`agent.minimax.cn`**（旧 `agent.minimaxi.com` 仅做 302 跳转），适配器已切到 `.cn`。
- 协议验证通过：`device/register` 200、`chat/send_msg` 200；但该账号 **积分为 0**
  （抓包里 `total_credits: 0`、`remaining_credits: 0`、`daily_login_gift_credit_remaining: 0`），
  上游业务错误为「积分不足」。需要领取/购买 MiniMax 积分或换有额度的账号，代码无需再改。
- token 有效期约 40 天（JWT `exp`），过期后需重新抓一次。

## 6. 已知限制

- 未用真实账号跑通过完整对话，填完 token 第一次调用请留意 `logs/server.log`。
- DSH 的附件/大图会走 Files API（`/v1/files`），本服务未实现；纯文本编码任务不受影响。
- `count_tokens` 是字符数近似；没有 Anthropic thinking / cache 块。
- 手机后台可能杀进程：长期使用建议 `termux-wake-lock`。
