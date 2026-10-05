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
import { readFile, stat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
/** Whether `target` lies within `base` (lexical containment). */
function inside(base, target) {
    const rel = relative(base, target);
    return rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel));
}
/** Resolve a model-supplied path against the workspace root.
 *
 * 读路径（默认）维持原语义：绝对路径直接返回，相对路径拼到工作区根。
 * 写路径（`forWrite: true`）额外做包含校验：越界（含符号链接逃逸）即抛错。
 */
export function resolveWorkspacePath(input, workspaceRoot, opts = {}) {
    const base = resolve(workspaceRoot);
    const resolved = isAbsolute(input) ? resolve(input) : resolve(base, input);
    if (!opts.forWrite)
        return resolved;
    if (!inside(base, resolved))
        throw new Error(`写入越界：${resolved} 不在工作区 ${base} 内`);
    let rb = base;
    let rt = resolved;
    try {
        rb = realpathSync(base);
    }
    catch { /* 工作区根尚未创建时退回词法结果 */ }
    try {
        rt = realpathSync(resolved);
    }
    catch {
        try {
            rt = realpathSync(dirname(resolved));
        }
        catch {
            rt = resolved;
        }
    }
    if (!inside(rb, rt))
        throw new Error(`写入越界：${resolved} 经符号链接指向工作区外`);
    return resolved;
}
/** Load a CAD file buffer, failing with model-friendly errors. */
export async function loadCadFile(resolvedPath) {
    let info;
    try {
        info = await stat(resolvedPath);
    }
    catch {
        throw new Error(`CAD file not found: ${resolvedPath}`);
    }
    if (!info.isFile())
        throw new Error(`not a file: ${resolvedPath}`);
    return readFile(resolvedPath);
}
