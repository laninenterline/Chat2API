#!/usr/bin/env node
/**
 * 纯手机方案：通过 Chrome 远程调试协议（CDP）读取三个站点 localStorage / Cookie 里的 token
 *
 * 前置（只需做一次）：
 *   1. 手机设置 → 关于手机 → 连点版本号开启开发者选项
 *   2. 开发者选项 → 无线调试（保持开启）
 *   3. Chrome 打开并登录 chat.deepseek.com / chatglm.cn / agent.minimaxi.com（各开一个标签页）
 *
 * 用法：
 *   # 第一次配对（无线调试页面点“使用配对码配对设备”，把弹出的端口和 6 位码填进来）
 *   adb pair 127.0.0.1:<配对端口> <6位配对码>
 *   # 之后每次连接（端口用无线调试页面显示的“IP 地址和端口”里的端口）
 *   adb connect 127.0.0.1:<调试端口>
 *   adb forward tcp:9222 localabstract:chrome_devtools_remote
 *   node scripts/get-tokens.mjs
 */

const CDP_PORT = Number(process.env.CDP_PORT || 9222)
const PROVIDERS = [
  { name: 'DeepSeek',  match: 'chat.deepseek.com',  lsKeys: ['userToken'] },
  { name: 'GLM',       match: 'chatglm.cn',         lsKeys: ['chatglm_refresh_token'], cookieKeys: ['chatglm_refresh_token'] },
  { name: 'MiniMax',   match: 'agent.minimaxi.com', lsKeys: ['_token', 'user_detail_agent'] },
]

async function cdp(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9)
    const timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 8000)
    function onMessage(event) {
      const msg = JSON.parse(event.data)
      if (msg.id !== id) return
      clearTimeout(timer)
      ws.removeEventListener('message', onMessage)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    }
    ws.addEventListener('message', onMessage)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function readTab(url) {
  const ws = new WebSocket(url)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', () => reject(new Error('WebSocket 连接失败')), { once: true })
  })
  try {
    const expression = `JSON.stringify({
      url: location.href,
      localStorage: Object.fromEntries(Object.entries(localStorage)),
      cookie: document.cookie
    })`
    const res = await cdp(ws, 'Runtime.evaluate', { expression, returnByValue: true })
    const page = JSON.parse(res.result.value || '{}')

    let cookies = []
    try {
      const all = await cdp(ws, 'Network.getAllCookies')
      cookies = all.cookies.map((c) => ({ name: c.name, value: c.value, domain: c.domain }))
    } catch {
      // 旧 Chrome 可能不支持，忽略
    }
    return { page, cookies }
  } finally {
    ws.close()
  }
}

async function main() {
  let tabs
  try {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`)
    tabs = await res.json()
  } catch {
    console.error(`连不上 http://127.0.0.1:${CDP_PORT}/json`)
    console.error(`
请先在 Termux 里完成这三步（把 <配对端口>/<调试端口> 换成无线调试页面显示的端口）：

  adb pair 127.0.0.1:<配对端口> <6位配对码>     # 只需一次
  adb connect 127.0.0.1:<调试端口>
  adb forward tcp:9222 localabstract:chrome_devtools_remote

并确认 Chrome 里已登录三家站点（各留一个标签页）。`)
    process.exit(1)
  }

  const pages = tabs.filter((t) => t.type === 'page')
  console.log(`发现 ${pages.length} 个标签页\n`)

  for (const provider of PROVIDERS) {
    const tab = pages.find((t) => (t.url || '').includes(provider.match))
    console.log(`========== ${provider.name} ==========`)
    if (!tab) {
      console.log(`未找到 ${provider.match} 的标签页，请在 Chrome 打开并登录该站点\n`)
      continue
    }
    try {
      const { page, cookies } = await readTab(tab.webSocketDebuggerUrl)
      for (const key of provider.lsKeys) {
        const value = page.localStorage[key]
        if (value) {
          console.log(`localStorage.${key} = ${value}`)
        } else {
          console.log(`localStorage.${key} = <空>`)
        }
      }
      for (const key of provider.cookieKeys || []) {
        const found = cookies.find((c) => c.name === key)
        if (found) console.log(`cookie.${key} = ${found.value}`)
      }
      if (provider.name === 'MiniMax' && page.localStorage.user_detail_agent) {
        try {
          const detail = JSON.parse(page.localStorage.user_detail_agent)
          console.log(`realUserID = ${detail.realUserID ?? detail.user_id ?? '<没找到>'}`)
        } catch {
          console.log('user_detail_agent 不是 JSON，可忽略')
        }
      }
    } catch (error) {
      console.log(`读取失败：${error.message}`)
    }
    console.log()
  }

  console.log('把上面的值填进服务（示例）：')
  console.log(`  ADMIN=$(python3 -c "import json;print(json.load(open('$HOME/ghproj/chat2api-slim/config.json'))['adminKey'])")`)
  console.log(`  curl -X PATCH http://127.0.0.1:8080/v0/management/accounts/acc-deepseek-1 -H "X-Admin-Key: $ADMIN" -H "Content-Type: application/json" -d '{"credentials":{"token":"<userToken>"}}'`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
