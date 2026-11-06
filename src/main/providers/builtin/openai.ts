/**
 * 通用 OpenAI 兼容上游（slim 版新增，上游 Chat2API 对应的是「自定义供应商」功能）
 *
 * 用途：
 * - 把官方 OpenAI / 其他中转 / 本地 vLLM 也接进来，统一走本服务的模型映射和协议转换；
 * - 本地联调时可以用它指向 mock 上游（见 tests/mock-openai-upstream.ts）。
 *
 * 默认关闭，需要在 config.json 里打开并填 apiEndpoint：
 *   "providers": { "openai": { "enabled": true, "apiEndpoint": "http://127.0.0.1:18080/v1" } },
 *   "accounts": [{ "provider": "openai", "credentials": { "apiKey": "sk-xxx" } }]
 */

import type { BuiltinProviderConfig } from '../../store/types'

export const openaiConfig: BuiltinProviderConfig = {
  id: 'openai',
  name: 'OpenAI 兼容上游',
  type: 'builtin',
  authType: 'token',
  apiEndpoint: 'https://api.openai.com/v1',
  chatPath: '/chat/completions',
  headers: {
    'Content-Type': 'application/json',
  },
  enabled: false,
  description:
    '任意 OpenAI 兼容上游（官方 API / 中转 / 本地 vLLM）。在 config.json 里设置 apiEndpoint 与账号 token；请求原样转发，工具调用走原生 tools 字段。',
  supportedModels: ['*'],
  modelMappings: {},
  credentialFields: [
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      placeholder: 'sk-...',
      helpText: '上游的 API Key；会以 Authorization: Bearer 发送',
    },
  ],
}

export default openaiConfig
