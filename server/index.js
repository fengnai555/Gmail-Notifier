import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  // 1. 安全驗證：過濾 Token
  const authHeader = c.req.header('Authorization')
  const expectedToken = (c.env.AUTH_TOKEN || '').trim()
  
  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    console.error('Unauthorized access attempt')
    return c.text('Unauthorized', 401)
  }

  // 2. 核心金鑰讀取
  const credentials = c.env.CREDENTIALS_JSON
  if (!credentials) {
    return c.json({ error: 'CREDENTIALS_JSON_MISSING' }, 404)
  }

  try {
    // 伺服器端先嘗試解析一次，確保給客戶端的是乾淨的 JSON 物件
    const data = typeof credentials === 'string' ? JSON.parse(credentials.trim()) : credentials
    return c.json(data)
  } catch (err) {
    return c.json({ error: 'INVALID_JSON_FORMAT', message: err.message }, 500)
  }
})

export default app
