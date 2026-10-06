/**
 * Security regression tests for the forked hardening:
 * - resolveWorkspacePath `forWrite` confinement (审计 C3: 任意路径越界写)
 * - sameOriginGuard (审计 C4: 无鉴权路由跨站访问)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { IncomingMessage } from 'node:http'
import { mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { resolveWorkspacePath } from '../src/tools/util.js'
import { sameOriginGuard } from '../src/routes.js'

function fakeReq(headers: Record<string, string>): IncomingMessage {
  return { headers } as unknown as IncomingMessage
}

describe('resolveWorkspacePath write confinement (C3)', () => {
  const ws = resolve('/tmp/dsh-cad-workspace')

  it('读路径维持原语义（绝对路径原样返回，不设围栏）', () => {
    expect(resolveWorkspacePath('rel/file.step', ws)).toBe(resolve(ws, 'rel/file.step'))
    const abs = resolve('/etc/passwd')
    expect(resolveWorkspacePath(abs, ws)).toBe(resolve(abs))
  })

  it('写路径在工作区内允许（相对 + 绝对）', () => {
    expect(resolveWorkspacePath('out/part.step', ws, { forWrite: true })).toBe(resolve(ws, 'out/part.step'))
    expect(resolveWorkspacePath(resolve(ws, 'part.step'), ws, { forWrite: true })).toBe(resolve(ws, 'part.step'))
  })

  it('写路径绝对越界抛错', () => {
    const outside = resolve('/etc/evil.step')
    expect(() => resolveWorkspacePath(outside, ws, { forWrite: true })).toThrow(/写入越界/)
  })

  it('写路径经 .. 越界抛错', () => {
    expect(() => resolveWorkspacePath('../evil.step', ws, { forWrite: true })).toThrow(/写入越界/)
  })
})

describe('resolveWorkspacePath 链接逃逸（realpath 纵深，需真实目录）', () => {
  const base = join(tmpdir(), `dsh-cad-link-${process.pid}`)
  const ws = join(base, 'ws')
  const outside = join(base, 'outside')

  beforeAll(() => {
    rmSync(base, { recursive: true, force: true })
    mkdirSync(ws, { recursive: true })
    mkdirSync(outside, { recursive: true })
  })

  afterAll(() => {
    rmSync(base, { recursive: true, force: true })
  })

  it('工作区内正常写路径放行', () => {
    expect(resolveWorkspacePath('ok/part.step', ws, { forWrite: true })).toBe(join(ws, 'ok', 'part.step'))
  })

  it('中间目录为链接时写路径越界抛错（必须 realpathSync.native 才拦得住 junction）', () => {
    const link = join(ws, 'escape')
    try {
      symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
    } catch {
      return // 平台不支持创建链接时跳过该断言
    }
    expect(() => resolveWorkspacePath('escape/pwn.step', ws, { forWrite: true })).toThrow(/写入越界/)
  })
})

describe('sameOriginGuard (C4)', () => {
  it('无 Origin 头放行（同源导航 / 非浏览器客户端）', () => {
    expect(sameOriginGuard(fakeReq({ host: '127.0.0.1:3080' }))).toBe(true)
  })

  it('Sec-Fetch-Site=same-origin 放行', () => {
    expect(sameOriginGuard(fakeReq({ host: 'evil.example', 'sec-fetch-site': 'same-origin' }))).toBe(true)
  })

  it('Origin 与 Host 一致放行', () => {
    expect(sameOriginGuard(fakeReq({ host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' }))).toBe(true)
  })

  it('Origin 与 Host 不一致拒绝', () => {
    expect(sameOriginGuard(fakeReq({ host: '127.0.0.1:3080', origin: 'https://evil.example' }))).toBe(false)
  })

  it('畸形 Origin 拒绝', () => {
    expect(sameOriginGuard(fakeReq({ host: '127.0.0.1:3080', origin: 'not-a-url' }))).toBe(false)
  })
})
