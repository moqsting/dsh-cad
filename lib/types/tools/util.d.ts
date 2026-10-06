/** Resolve a model-supplied path against the workspace root.
 *
 * 读路径（默认）维持原语义：绝对路径直接返回，相对路径拼到工作区根。
 * 写路径（`forWrite: true`）额外做包含校验：越界（含链接逃逸）即抛错。
 * 用 realpathSync.native——普通 realpathSync 在 Windows 上不解析 junction
 * （实测返回 junction 自身路径），而 junction 是 Windows 上不需管理员即可创建的逃逸路径。
 */
export declare function resolveWorkspacePath(input: string, workspaceRoot: string, opts?: {
    forWrite?: boolean;
}): string;
/** Load a CAD file buffer, failing with model-friendly errors. */
export declare function loadCadFile(resolvedPath: string): Promise<Buffer>;
