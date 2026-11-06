/**
 * 本地 mock 上游（OpenAI ChatCompletions 协议），仅用于 e2e 测试协议转换，
 * 不参与生产运行。启动：npx tsx tests/mock-openai-upstream.ts 18080
 *
 * 行为：
 * - POST /v1/chat/completions
 * - 用户最后一条消息里包含 "USE_TOOL" → 返回 tool_calls（shell）
 * - 否则返回文本："你好，我是 mock"
 */
import http from 'node:http'

const port = Number(process.argv[2] || 18080)

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => (data += chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'))
      } catch {
        resolve({})
      }
    })
  })
}

function chunk(delta: any, finishReason: string | null = null): string {
  return (
    'data: ' +
    JSON.stringify({
      id: 'chatcmpl-mock',
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: 'mock-model',
      choices: [{ index: 0, delta, finish_reason: finishReason }],
    }) +
    '\n\n'
  )
}

function lastUserText(body: any): string {
  const messages = body.messages || []
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'user') continue
    const content = messages[i].content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) return content.map((part: any) => part.text || '').join('')
  }
  return ''
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || !req.url?.includes('/chat/completions')) {
    res.statusCode = 404
    res.end('not found')
    return
  }

  const body = await readBody(req)
  const wantsTool = lastUserText(body).includes('USE_TOOL')

  if (!body.stream) {
    const message = wantsTool
      ? {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_mock_1',
              type: 'function',
              function: { name: 'shell', arguments: '{"cmd":"ls"}' },
            },
          ],
        }
      : { role: 'assistant', content: '你好，我是 mock' }
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        id: 'chatcmpl-mock',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'mock-model',
        choices: [{ index: 0, message, finish_reason: wantsTool ? 'tool_calls' : 'stop' }],
        usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
      })
    )
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')

  if (wantsTool) {
    res.write(chunk({ role: 'assistant', content: '' }))
    res.write(
      chunk({
        tool_calls: [
          { index: 0, id: 'call_mock_1', type: 'function', function: { name: 'shell', arguments: '' } },
        ],
      })
    )
    for (const part of ['{"cmd"', ':"ls"}']) {
      res.write(
        chunk({
          tool_calls: [{ index: 0, function: { arguments: part } }],
        })
      )
    }
    res.write(chunk({}, 'tool_calls'))
  } else {
    res.write(chunk({ role: 'assistant', content: '' }))
    for (const part of ['你好', '，我是', ' mock']) {
      res.write(chunk({ content: part }))
    }
    res.write(chunk({}, 'stop'))
  }
  res.write('data: [DONE]\n\n')
  res.end()
})

server.listen(port, '127.0.0.1', () => {
  console.log(`[mock-openai] listening on http://127.0.0.1:${port}`)
})
