# Chat2API

![CI](https://github.com/laninenterline/Chat2API/actions/workflows/ci.yml/badge.svg) ![License](https://img.shields.io/badge/license-GPL--3.0-blue) ![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)

网页版模型 → 标准 API 的**三合一 Node 网关**：一个服务同时接 **DeepSeek / GLM / MiniMax**，
对 Claude Code、DeepSeek Harness（DSH）、Codex CLI 以及任意 OpenAI 兼容客户端提供统一入口。

- **`main`（本分支）**：Node 版 —— `npm i && npm start` 即可跑
- **[`cf-worker`](https://github.com/laninenterline/Chat2API/tree/cf-worker)**：Cloudflare Workers 版 —— 同一套协议，部署到 CF 免费运行
- 单供应商裁剪版：`deepseek` / `glm` / `minimax`（Node）和 `deepseek-worker` / `glm-worker` / `minimax-worker`（Worker）

## 分支一览

| 分支 | 内容 |
|---|---|
| [`main`](https://github.com/laninenterline/Chat2API) | 三合一 Node 版（本分支） |
| [`cf-worker`](https://github.com/laninenterline/Chat2API/tree/cf-worker) | 三合一 Cloudflare Workers 版 |
| [`deepseek`](https://github.com/laninenterline/Chat2API/tree/deepseek) | DeepSeek 单供应商 Node 版 |
| [`glm`](https://github.com/laninenterline/Chat2API/tree/glm) | GLM 单供应商 Node 版 |
| [`minimax`](https://github.com/laninenterline/Chat2API/tree/minimax) | MiniMax 单供应商 Node 版 |
| [`deepseek-worker`](https://github.com/laninenterline/Chat2API/tree/deepseek-worker) | DeepSeek 单供应商 Worker 版 |
| [`glm-worker`](https://github.com/laninenterline/Chat2API/tree/glm-worker) | GLM 单供应商 Worker 版 |
| [`minimax-worker`](https://github.com/laninenterline/Chat2API/tree/minimax-worker) | MiniMax 单供应商 Worker 版 |

从 [xiaoY233/Chat2API](https://github.com/xiaoY233/Chat2API)（Electron 桌面版，v1.4.0，60k 行）剥离出来的
**精简网关**，去掉 Electron / GUI / 托盘 / 自动更新，只保留 deepseek、glm、minimax 三家网页端供应商
（外加一个可选的通用 OpenAI 兼容上游），并保留流式、多轮、工具调用、模型映射、负载均衡、上下文管理、管理接口。

> **许可证**：上游 Chat2API 是 GPL-3.0，本仓库包含其衍生代码，因此同样按 **GPL-3.0** 发布。
> 仅限自用/研究；凭据来自网页版个人账号，有封号风险，商用请走官方 API。

---

## 1. 快速开始

```bash
npm install
cp config.example.json config.json     # 填账号凭据
npm start                              # 默认 http://127.0.0.1:8080
```

凭据获取方式（沿用 Chat2API）：

| 供应商 | 凭据字段 | 从哪拿 |
|---|---|---|
| DeepSeek | `token` | chat.deepseek.com 登录 → F12 → Application → LocalStorage → `userToken` |
| GLM | `refresh_token` | chatglm.cn 登录 → F12 → Application → LocalStorage → `chatglm_refresh_token` |
| MiniMax | `token`（可 `realUserID+JWT`）、`realUserID` | agent.minimaxi.com 登录 → F12 → LocalStorage → `_token` / `user_detail_agent` |

常用命令：

```bash
npm run typecheck     # tsc --noEmit
npm test              # 协议转换单测（7 项，不需要账号）
npm run test:e2e      # 端到端协议测试（20 项，自带 mock 上游，不需要账号）
bash scripts/smoke-test.sh   # 健康检查/鉴权/管理接口（需要服务已启动）
```

服务启动后有三组入口：

```
http://127.0.0.1:8080/v1/chat/completions   OpenAI ChatCompletions
http://127.0.0.1:8080/v1/messages           Anthropic Messages（Claude Code / DSH）
http://127.0.0.1:8080/v1/responses          OpenAI Responses（Codex CLI）
```

---

## 2. 对接 Claude Code

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:8080
export ANTHROPIC_AUTH_TOKEN=sk-local-test        # 对应 config.json 的 apiKeys
export ANTHROPIC_MODEL=deepseek-v4-pro
export ANTHROPIC_SMALL_FAST_MODEL=deepseek-v4-flash
claude
```

说明：

- Claude Code 发的是 Anthropic `/v1/messages`，用 `x-api-key`（`ANTHROPIC_API_KEY`）或 `Authorization: Bearer`（`ANTHROPIC_AUTH_TOKEN`），两种都支持。
- 它会调 `/v1/messages/count_tokens` 估算上下文，本服务用字符数近似（4 字符 ≈ 1 token）。
- `config.json` 里默认已配好 `claude-*` → `deepseek-v4-pro` 的通配映射，所以不设 `ANTHROPIC_MODEL` 也能跑。
- 工具调用：Claude Code 的 `tools`/`tool_use`/`tool_result` 会被翻译成内部 OpenAI tools，交由上游 ToolCallingEngine 做 prompt 注入，再把模型输出的 tool_calls 翻回 `tool_use` 块。

## 3. 对接 DeepSeek Harness（DSH）

DSH 的 DeepSeek 适配器本身讲 Anthropic Messages 协议（默认 `https://api.deepseek.com/anthropic`），所以只需要把 baseURL 指过来：

```bash
export DEEPSEEK_BASE_URL=http://127.0.0.1:8080
dsh
```

- DSH 会在 baseURL 后补 `/v1`，即请求 `http://127.0.0.1:8080/v1/messages`，正好命中。
- DSH 默认模型 ID 是 `deepseek-flash` / `deepseek-v4-pro`；`config.json` 里已把 `deepseek-flash` 映射到 `deepseek-v4-flash`。
- 也支持 `/anthropic` 前缀（`DEEPSEEK_BASE_URL=http://127.0.0.1:8080/anthropic`），服务端会自动重写路径。
- **限制**：DSH 的附件/大图会走 DeepSeek 的 Files API（`/v1/files`），本服务未实现该端点；纯文本编码任务不受影响。

## 4. 对接 Codex CLI

`~/.codex/config.toml`：

```toml
model = "deepseek-v4-pro"
model_provider = "slim"

[model_providers.slim]
name = "Chat2API"
base_url = "http://127.0.0.1:8080/v1"
wire_api = "responses"
env_key = "SLIM_API_KEY"
```

```bash
export SLIM_API_KEY=sk-local-test
codex
```

- Codex 走 OpenAI Responses API：请求里的 `input` items（message / function_call / function_call_output）、`instructions`、`tools` 都会转换成内部 OpenAI ChatCompletions；响应再还原成 `response.*` 事件流（`response.created` / `response.output_item.added` / `response.output_text.delta` / `response.function_call_arguments.delta` / `response.completed`）。
- 如果你的 Codex 版本只支持 chat 协议，把 `wire_api` 改成 `"chat"`，直接走 `/v1/chat/completions` 即可。
- `config.json` 里默认已配好 `gpt-*` / `o3*` / `o4*` → `deepseek-v4-pro` 的通配映射。

---

## 5. 目录结构

```
Chat2API/
├── config.example.json          # 配置模板
├── Dockerfile
├── assets/sha3_wasm_bg.*.wasm   # DeepSeek PoW 用（原样拷贝）
├── scripts/
│   ├── smoke-test.sh            # 冒烟测试（健康检查/鉴权/管理接口）
│   └── test-protocols.ts        # 协议转换单元测试
├── tests/
│   ├── mock-openai-upstream.ts  # 本地 mock 上游（e2e 用）
│   ├── e2e-config.json
│   └── e2e-protocols.sh         # 端到端协议测试（20 项断言）
└── src/
    ├── main/
    │   ├── index.ts             # ★新写：入口
    │   ├── store/
    │   │   ├── types.ts         # 原样拷贝
    │   │   └── store.ts         # ★重写：config.json 替代 electron-store
    │   ├── providers/builtin/   # 原样拷贝 + ★openai.ts（通用 OpenAI 兼容上游）
    │   ├── lib/challenge.ts     # 改 2 行：wasm 路径
    │   └── proxy/
    │       ├── server.ts        # ★新写：Koa 中间件 + 路由注册
    │       ├── completion.ts    # ★新写：选账号/映射/重试/统计（三个协议共用）
    │       ├── forwarder.ts     # 裁剪：只保留三家 forwardXxx（1514→908 行）
    │       ├── adapters/        # 原样拷贝 3686 行：三家网页端协议适配
    │       ├── convert/
    │       │   ├── openaiStream.ts   # ★新写：内部 SSE 解析
    │       │   ├── anthropic.ts      # ★新写：Anthropic 请求/响应/流转换
    │       │   └── responses.ts      # ★新写：Responses 请求/响应/流转换
    │       ├── routes/
    │       │   ├── chat.ts      # 原样拷贝：/v1/chat/completions
    │       │   ├── models.ts    # 原样拷贝 + Anthropic 形状模型列表
    │       │   ├── messages.ts  # ★新写：/v1/messages（Claude Code / DSH）
    │       │   ├── responses.ts # ★新写：/v1/responses（Codex）
    │       │   └── admin.ts     # ★新写：/v0/management
    │       ├── toolCalling/     # 原样拷贝：工具调用引擎
    │       ├── utils/ loadbalancer.ts modelMapper.ts stream.ts sessionManager.ts status.ts
    │       └── services/contextManagementService.ts
    └── shared/                  # 原样拷贝
```

**怎么认代码**：文件头注释标注「上游对应：Chat2API xxx」的都是原样/近原样拷贝，可直接与上游对照；标 ★ 的是脱离 Electron 新写的胶水层。

---

## 6. 配置项

| 字段 | 说明 |
|---|---|
| `host` / `port` | 监听地址，默认 `127.0.0.1:8080` |
| `apiKeys` | 调用 `/v1/*` 的 key（`Authorization: Bearer` 或 `x-api-key`）；为空则不校验 |
| `adminKey` | 管理接口 key；为空则 `/v0/management` 返回 404 |
| `loadBalanceStrategy` | `round-robin` / `fill-first` / `failover` |
| `mode` | `single`（每次请求后清理上游会话）/ `multi`（保留上下文） |
| `modelMappings` | 虚拟模型名 → 真实模型，支持通配符（`claude-*`、`gpt-*`） |
| `contextManagement` | 滑窗 / token 上限 / 摘要 三段可单独开关 |
| `providers.<id>.apiEndpoint` | 覆盖上游地址（例如把 `openai` 指到本地 mock 或中转） |
| `accounts` | 账号数组，同一供应商可多账号自动轮询/故障切换 |

---

## 7. 管理接口

配置了 `adminKey` 才可用，鉴权头 `X-Admin-Key` 或 `Authorization: Bearer <adminKey>`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST | `/v0/management/accounts` | 账号列表 / 新增账号 |
| PATCH/DELETE | `/v0/management/accounts/:id` | 改凭据、状态 / 删账号 |
| GET | `/v0/management/providers` | 供应商 + 模型 + 账号数 |
| GET | `/v0/management/models` | 全部可用模型（含实际模型 ID） |
| GET | `/v0/management/stats` | 请求量/成功率/平均耗时/按模型、账号分布 |
| GET | `/v0/management/logs?limit=50` | 最近请求日志 |
| GET/DELETE | `/v0/management/sessions` | 查看/清空会话 |
| GET/PATCH | `/v0/management/config` | 查看/热改负载均衡策略、模型映射、mode |

另有 `GET /health`、`GET /stats`（无鉴权，便于探活）。

---

## 8. 已验证 / 已知限制

**已验证**：

- `tsc --noEmit` 0 error；`npm i` + `npm start` 正常启动
- `npm test`：**7 个协议转换单测全部通过**（Anthropic/Responses 的请求、响应、流式事件）
- `npm run test:e2e`：**20 项端到端断言全部通过** —— 用本地 mock 上游跑通真实 HTTP：
  - `/v1/messages` 非流式、流式文本、流式工具调用（`tool_use` + `input_json_delta` + `stop_reason: tool_use`）
  - `/v1/responses` 非流式、流式文本、流式工具调用（`function_call` item + arguments delta + `response.completed`）
  - `/v1/messages/count_tokens`、`/anthropic` 前缀重写、Anthropic 形状模型列表
- `bash scripts/smoke-test.sh`：健康检查、鉴权、管理接口
- 三家真实 adapter 都能打到上游并返回干净错误（占位凭据）：
  DeepSeek `Authorization Failed` / GLM `unauthorized user(40102)` / MiniMax `HTTP 401`

**错误码约定**：上游失败时，`/v1/messages` 返回 502 + Anthropic 错误结构
（`{"type":"error","error":{...}}`），`/v1/responses` 返回 502 + OpenAI 错误结构
（`{"error":{...}}`）；客户端会原样展示 message。

**已知限制**：

- **没有用真实账号跑通完整对话**：成功路径依赖上游网页接口，凭据/接口一变就要跟着改。首次使用先看 `[DeepSeek]/[GLM]/[MiniMax]` 前缀日志。
- `count_tokens` 是字符数近似，不是真实 tokenizer。
- 没有 Claude 的 thinking 块（`thinking` content block）和 prompt caching 字段；客户端会忽略。
- 不支持 DSH 的 Files API（`/v1/files`）、也不支持图片/视频生成（上游 Chat2API 也砍了）。
- 凭据明文存 `config.json`（上游用 electron-store 混淆），自用请 `chmod 600`。
