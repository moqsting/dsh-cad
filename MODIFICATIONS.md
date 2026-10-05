# MODIFICATIONS.md —— 相对上游的修改

> 上游：LAU-MARS/dsh-cad @ fa38ec56a58d97c3ecaa609f4d04118c87be2ba9
> Fork 维护者：moqsting（GitHub）
> 原则：保留原 author 与 LICENSE；本文件是“相对原作者已修改”的权威记录，整合包文档直接引用。

## 修改清单

| # | 文件 | 修改 | 原因 | 对应审查结论 |
|---|---|---|---|---|
| 1 | `src/index.ts`；删除 `src/tools/cad-script.ts`、`lib/tools/cad-script.js`、`lib/types/tools/cad-script.d.ts`、`test/cad-script.test.ts` | 删除 `cad_script` 工具的 import、实例化与注册；删除其源码、编译产物与测试 | `cad_script` 的 js 路径为 Node vm 逃逸面（C1）、py 路径为无沙箱任意执行（C2），无法在保留语义下安全重写，已拍板移除 | C1、C2 |
| 2 | `src/tools/util.ts` | 重写 `resolveWorkspacePath`：新增 `{ forWrite: true }`，写路径做词法 + realpath 双包含校验、越界抛错；读路径维持原语义 | 审计 C3：写路径无包含性检查，可越界写（含 DSH 凭据可达） | C3 |
| 3 | `src/tools/cad-model.ts`、`cad-freecad.ts`、`cad-fusion.ts`、`cad-onshape.ts` | 导出/写路径调用点传 `{ forWrite: true }` | 与 #2 联动 | C3 |
| 4 | `src/routes.ts` | 新增 `sameOriginGuard(req)`，应用到全部 7 条路由（GET 读 + POST 删除），跨源不通过即 403 | 审计 C4：无鉴权路由，可跨站读场景/装配树/删除文档 | C4 |
| 5 | `test/security.test.ts`（新增） | 为 #2、#4 补回归（写越界 + 同源守卫） | 约束#4：重写后必须跑测试 | C3、C4 |
| 6 | `README.md`、`README.zh-CN.md` | 工具表删除 `cad_script` 行 | 文档一致 | C1、C2 |
| 7 | `package.json` | `repository` 改指 fork URL | fork 处置 | 通用 |

## 保留并记录

- `cad_freecad` / `cad_fusion` / `cad_onshape` 三个外部连接器：均带 `available()` 门控、无凭据惰性、Onshape HMAC 签名正确；保留（opt-in）。
- 读路径（`cad_view` / `cad_info` / `cad_image`）不设写围栏：维持上游语义，扩展名门禁在调用方已有。

## 验证

- `npm run build`（tsc）通过；`lib/` 重新生成：`lib/index.js` 已移除 cad_script、`lib/tools/util.js` 含 forWrite、`lib/routes.js` 含 sameOriginGuard。
- `npx vitest run --pool=threads --no-file-parallelism`：151 passed / 1 failed / 3 skipped。唯一失败为 `test/executor.test.ts` 的 fusion360 桥接 add-in 安装用例——它向 `%AppData%\Roaming\Autodesk` 真实目录写文件，在本机受限沙箱（禁止写工作区外）被拒；与本 fork 修改无关，目标机正常环境不受影响。
- 新增 `test/security.test.ts`（9 例）+ `test/route-registration.test.ts`（2 例）：11/11 通过。
- 静态确认：`cad_script` / `createCadScriptTool` / `cad-script` 在本 fork 中零残留。

## 未改

- 保留上游 `author`（LAU-MARS）、`LICENSE`（MIT）。
- 运行时依赖未锁精确版本：`occt.ts` 等 WASM 内核上游按功能演进版本，锁定会阻碍内核升级（fork 自带 AGENTS.md 明确此约定）。
- `lib/client.js`（client 端 bundle）未重建：本 fork 未改 `client/` 源码，上游已提交的 client bundle 保持原样。
