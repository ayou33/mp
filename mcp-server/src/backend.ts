/** backend-server 的轻量 REST 客户端(MCP 工具统一经它调用后端,单一数据源) */
export class BackendError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`后端请求失败:HTTP ${status} ${typeof body === 'string' ? body : JSON.stringify(body)}`)
    this.name = 'BackendError'
  }
}

export class BackendClient {
  constructor(private base: string) {}

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const resp = await fetch(`${this.base}${path}`, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!resp.ok) {
      let text = ''
      try {
        text = JSON.stringify(await resp.json())
      } catch {
        text = await resp.text().catch(() => '')
      }
      throw new BackendError(resp.status, text || resp.statusText)
    }
    if (resp.status === 204) return null
    return resp.json()
  }

  get(path: string): Promise<unknown> {
    return this.request('GET', path)
  }
  post(path: string, body: unknown): Promise<unknown> {
    return this.request('POST', path, body)
  }
  put(path: string, body?: unknown): Promise<unknown> {
    return body === undefined ? this.request('PUT', path) : this.request('PUT', path, body)
  }
  del(path: string): Promise<unknown> {
    return this.request('DELETE', path)
  }
}
