# app/renderer/vendor —— 前端第三方库（vendored 单文件；无打包器，随仓库自带）

## markdown-it.umd.min.js

- 版本：**15.0.2**（pin；升级见下）
- 许可：**MIT**（全文见 `markdown-it.LICENSE`）
- 来源（可复核）：
  - 包：`markdown-it@15.0.2`（npm registry tarball：`https://registry.npmjs.org/markdown-it/-/markdown-it-15.0.2.tgz`）
  - 文件：tarball 内 `package/dist/browser/markdown-it.umd.min.js`（**UMD**，浏览器全局名 `markdownit`；自带全部内部依赖）
- sha256（2026-10-12 取得时核对）：
  - `markdown-it.umd.min.js`：`635972b985228e8af9f0143647c68616b7a3bb09f6946e7e4a52e43dcf5e7be5`
  - `markdown-it.LICENSE`：`792c48c5a849a15fdf9e37e8bcf9e6d1dd13b32b46c642a748a0a46a9919d473`
- 谁在用：`../markdown.js`（封装——安全配置 `html:false`、链接白名单/rel/类名、图片表格禁用、代码块样式类都在那；
  测试钉子与 XSS 负例见 `test/桌面应用/markdown.test.ts`）。

## 升级路径（升级时逐条做）

1. `npm pack markdown-it@<新版本>` —— 在**临时目录**里做（本仓 `package.json` 属装配角色，渲染侧不动依赖清单）；
2. 解包取 `package/dist/browser/markdown-it.umd.min.js` 与 `package/LICENSE`，覆盖本目录两个文件；
3. `shasum -a 256 app/renderer/vendor/markdown-it.umd.min.js app/renderer/vendor/markdown-it.LICENSE`
   —— 更新本 README 记录的 sha256；
4. 更新 `markdown.js` 头注释与 `test/桌面应用/markdown.test.ts` 里 pin 的**版本号与 sha256**；
5. 跑 `node --test "test/桌面应用/*.test.ts"`：**XSS 负例与「html:false 钉子」必须仍全绿**——
   红了＝配置/行为被改坏，**不得带着红升级**。
