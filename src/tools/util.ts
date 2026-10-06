/**
 * Shared tool helpers: path resolution and file loading. CAD payloads are
 * binary, so reads go through node:fs (the platform fs service exposes only
 * UTF-8 text reads); relative paths resolve against the workspace root like
 * every other model-facing path.
 *
 * Write paths are additionally confined to the workspace: `resolveWorkspacePath`
 * with `{ forWrite: true }` rejects paths that escape the workspace root,
 * including escapes through symbolic links. Read paths keep the original
 * semantics (no confinement), because reads are already gatekept by the
 * caller's extension whitelist.
 */
import { readFile, stat } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

/** Whether `target` lies within `base` (lexical containment). */
function inside(base: string, target: string): boolean {
  const rel = relative(base, target)
  return rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel))
}

/** Resolve a model-supplied path against the workspace root.
 *
 * 读路径（默认）维持原语义：绝对路径直接返回，相对路径拼到工作区根。
 * 写路径（`forWrite: true`）额外做包含校验：越界（含链接逃逸）即抛错。
 * 用 realpathSync.native——普通 realpathSync 在 Windows 上不解析 junction
 * （实测返回 junction 自身路径），而 junction 是 Windows 上不需管理员即可创建的逃逸路径。
 */
export function resolveWorkspacePath(input: string, workspaceRoot: string, opts: { forWrite?: boolean } = {}): string {
  const base = resolve(workspaceRoot)
  const resolved = isAbsolute(input) ? resolve(input) : resolve(base, input)
  if (!opts.forWrite) return resolved
  if (!inside(base, resolved)) throw new Error(`写入越界：${resolved} 不在工作区 ${base} 内`)
  let rb = base
  let rt = resolved
  try { rb = realpathSync.native(base) } catch { /* 工作区根尚未创建时退回词法结果 */ }
  try {
    rt = realpathSync.native(resolved)
  } catch {
    try { rt = realpathSync.native(dirname(resolved)) } catch { rt = resolved }
  }
  if (!inside(rb, rt)) throw new Error(`写入越界：${resolved} 经链接指向工作区外（realpath ${rt}）`)
  return resolved
}

/** Load a CAD file buffer, failing with model-friendly errors. */
export async function loadCadFile(resolvedPath: string): Promise<Buffer> {
  let info
  try {
    info = await stat(resolvedPath)
  } catch {
    throw new Error(`CAD file not found: ${resolvedPath}`)
  }
  if (!info.isFile()) throw new Error(`not a file: ${resolvedPath}`)
  return readFile(resolvedPath)
}
