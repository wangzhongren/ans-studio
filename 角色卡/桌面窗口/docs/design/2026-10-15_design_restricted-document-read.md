---
id: restricted-document-read
type: design
title: B 受限项目文档只读接口
created: "2026-10-15"
updated: "2026-10-15"
revision: 2
status: draft
---

# 在当前项目中阅读已列出的文档

本文件是B的唯一候选接口规范，待PM审核及客户确认实施。依据[UX完整流程v2](../../../UIUX设计师/docs/design/2026-10-15_design_desktop-complete-flow.md)与[窗口影响评估](2026-10-15_design_complete-flow-window-assessment.md)。本轮只写设计，不操作桌面、不读真实凭据、不修改生产或测试。读取不会授予写权限，也不增加任意本地文件打开能力。

## 推荐范围与理由

推荐第一版只读UTF-8 `.md`、`.txt`，每文件最多 **262144原始字节（256KiB，包含BOM）**，不截断后伪称完整文件。该预算足够当前报告的约8–16KiB文本，又限制IPC、Markdown解析及界面开销；超限明确失败，后续若确需大文档应另审分页。读取最多分配262145字节，用多读一字节可靠识别增长/超限；不先无界readFile。扩展名大小写不敏感。UTF-8 fatal解码、允许UTF-8 BOM，含NUL视为不支持的二进制内容；不猜GBK/UTF-16，不支持PDF、图片、HTML执行或压缩包。这些数值与清单是具体推荐，尚非已生效政策。

第一版权威可读清单限当前成功导入listing中的非builtIn角色：主进程已有角色卡路径、changelog文件路径，以及 `readRoleDocsIndex` 返回的docs `kind=file` 且满足上述格式的条目。卡/changelog本来已可读，统一入口不扩张到源码。目录可以显示但不发可读引用。隐藏路径段（以`.`开头）不发引用；`.env`、`.ans`、私钥等不在清单，renderer传文件路径也无效。现索引有500条扫描预算，未列出的文件不通过任意输入补读。内部列入判断不复制写门禁；这是新阅读范围，不是resolveWrite的新分支。

TaskHandback.evidence是任意字符串，不是文件引用或授权。B不从句子、Markdown链接、绝对路径或助手文字提取文件并赋权。已列报告可以通过同一清单路径找到引用；不在清单的报告显示「此路径尚未提供阅读入口」，不承诺全部evidence都可点击。C若新增结构化产物引用，只能在PM确认后作为**候选来源**交给B同一校验器，不直接绕过范围；本版不增加第二套报告读取清单。

## 版本、导入作用域与公开类型

复用现 `app:list-project` 成功结果，增加 `documentScope` 与RoleView中的 `documents`。它们由Window生成，不由renderer或模型生成。角色现有docs路径/type索引保留兼容；新增只读引用可供UI阅读入口用。当前main通过listProject成功设置recoveryProjectRoot；以同一次前台导入/切项目成功作为作用域切换，不把后台refreshListing当新导入。作用域状态属于当前窗口DesktopInterface实例，关闭窗口清空，不跨renderer/窗口共享。

```ts
type ProjectDocumentScope = { version: 1; projectViewId: string; projectRoot: string };
type ProjectDocumentRef = {
  version: 1; projectViewId: string; documentId: string;
  roleId: string; relativePath: string; label: string; format: 'markdown'|'text';
};
type ReadProjectDocumentRequest = {
  version: 1; projectViewId: string; documentId: string;
};
type ReadProjectDocumentResult =
  | { ok: true; version: 1; projectViewId: string; documentId: string;
      roleId: string; relativePath: string; format: 'markdown'|'text';
      text: string; byteLength: number }
  | { ok: false; version: 1; projectViewId?: string; documentId?: string;
      code: DocumentReadErrorCode; message: string };
```

### 导入grant必须来自原生选择，而不是renderer的listProject路径

现app:list-project接受renderer传root，成功列出目录本身**不是读取授权**；opaque documentId只防路径伪造，不能单独建立授权。本版新增主进程内存 `documentImportGrant`，绑定当前BrowserWindow及可信原生pickProject成功返回的root realpath。main的app:pick-project handler await原生选择，取消不授权；选定后主进程登记grant，再返回路径。B的scope创建除listing成功外还必须匹配该grant。恶意renderer直接listProject任意root即使旧索引接口仍成功，也不能创建B scope/refs，documentScope缺席并带documentReadUnavailable='PROJECT_NOT_GRANTED'，读取返回PROJECT_NOT_GRANTED。

main当前recoveryProjectRoot是主进程内存恢复状态。renderer reload仅在同BrowserWindow的既存grant仍匹配时可恢复B；只信现recovery字符串而无grant不够。当前没有获审的跨进程grant持久合同，本版应用重启后需再次原生选择；不会把renderer自行传来的recovery root升级为授权。关窗清grant。原生选择新项目后旧B grant/epoch立即撤销；新项目枚举失败时B不恢复旧grant，不影响原会话保留的既有行为，但显示需重新选择项目。后台refresh/list不新增grant、不改变原生选择的授权范围。

grant通过可信main→Interface→Pipeline的初始化/更新入口传递，renderer IPC中不能带grant或调用更新；Model中以内部不导preload方法的类型表达。不以任意成功listProject替代授权。测试必须模拟绕过pick、伪造root/recovery、跨窗口、取消选择与renderer reload；旧任意索引能力不因此被宣称已全面收紧，本B仅保证新增读取不能绕原生选择。

`projectViewId`为主进程随机不透明epoch，首次成功导入创建，真实切到不同项目/显式重新导入时更换，普通同项目资料刷新沿用。`documentId`为主进程随机引用，registry把它绑定root真实路径、该epoch、role、规范相对路径及来源；仅当前registry可解析。刷新重算清单，仍在清单的同路径引用保持，已移除引用撤销。项目切换立即撤销旧registry；切回重新列入生成新epoch。request不接收root、路径、role或URL，不能伪造路径扩大读取。返回root不重复附绝对文件路径，便于避免失败泄露主机布局。

新IPC唯一方法 `desktop.readProjectDocument(request)` → `project:document-read`。版本不是1/字段不是非空字符串/额外路径字段均返回INVALID_REQUEST；不把任意对象字符串化当路径。renderer校验结果epoch和documentId仍是当前阅读请求，再呈现；主进程也在读取前和返回前核对epoch。重放旧IPC、迟到响应不落入新项目。失败使用固定文案，不直接把Node原始error.message或文件内容外发。

## 读取算法与诚实的保护范围

1. 验证版本与引用、前台已导入scope；解析registry，不接受任意路径。再次核对当前清单，引用仍可读。以共享path-primitives的词法原语规范路径，拒绝绝对路径、NUL、空段歧义、`.`/`..`、Windows盘符/UNC/替代数据流形式；相对路径只由主进程已列条目构造。项目内关系以分段relative判断，不能用裸字符串startsWith。
2. pin住本请求的项目root realpath；lstat遍历root下每段，**第一版拒绝所有子路径symlink**（即使指向项目内），以减少含糊跳转。root自身可由用户导入symlink目录，导入成功时解析真实root后固定该scope。对候选realpath再做真实root内包含检查；只允许普通文件，目录/设备/socket/FIFO明确拒绝。
3. 使用只读open；本机支持时采用O_NOFOLLOW，防最后一段符号链接替换。fstat确认普通文件、size预算；把此前lstat与打开后的dev/ino核对，拒绝变更。文件句柄受try/finally关闭。**读取的是已打开句柄，不在校验后改用路径readFile**。
4. 有界读取该句柄并在读前后fstat核对dev/ino、size、mtime/ctime；重跑父段lstat、realpath和候选路径lstat与句柄身份核对，任何变化失败CHANGED_DURING_READ；检查scope仍有效后才返回。所有失败不返回部分文本。扩展名来自registry并在检查当前路径后确认，不能把改名成md的二进制当合法UTF-8。

上述是Node可实现的检查与有界风险降低，**不等于对恶意并发本地写者的无竞态沙箱**：Node通用fs没有完整的openat逐目录句柄遍历语义；祖先路径可被瞬时替换后恢复、同inode可被改写后伪造时间，硬链接不能证明文件最初来自项目。预后检查能发现通常替换，但不能严密排除这些攻击。不得宣称“realpath+O_NOFOLLOW完全防目录竞态”。推荐本版支持用户信任的本地项目，并明确不把本地恶意进程隔离当能力；若客户要求严格对抗该威胁，需另审原生目录句柄/沙箱提供方与对应属主边界，当前不偷偷新增原生模块，也不降为任意读。第一版明确仅支持本地macOS/Linux且O_NOFOLLOW可用、dev/ino可用于身份比较的文件系统；Windows、缺O_NOFOLLOW、无法提供稳定身份的文件系统返回UNSUPPORTED_ENVIRONMENT，**不降级为仅realpath后读取**。本地网络挂载/特殊FS若无法确认身份行为也拒读；支持性需在实施平台测试中登记，不能凭OS名称保证所有挂载安全。即使支持平台也保留上述恶意瞬时祖先替换/硬链接限度；如产品要求对抗它们，则本候选不足，须原生目录句柄方案通过评审后才启用该威胁范围。

文件清单不能保证文档内容没有用户手写的秘密。本版不读取凭据位置、不自动发送模型/网络、不记录文本到诊断，不把任意doc内容标成已脱敏；文档作者若在允许md内写了秘密，本地预览仍可能显示其内容。错误及遥测仅限固定错误码和已发引用，不输出正文或宿主原始异常。

## 明确失败结果

`DocumentReadErrorCode`固定为：INVALID_REQUEST、PROJECT_NOT_GRANTED、PROJECT_NOT_ACTIVE、STALE_SCOPE、UNKNOWN_DOCUMENT、NOT_LISTED、OUTSIDE_PROJECT、SYMLINK_NOT_ALLOWED、NOT_FOUND、NOT_FILE、UNSUPPORTED_FORMAT、INVALID_UTF8、BINARY_CONTENT、TOO_LARGE、PERMISSION_DENIED、CHANGED_DURING_READ、UNSUPPORTED_ENVIRONMENT、IO_ERROR。

无项目与无效scope分开；旧epoch为STALE_SCOPE，当前未知ID为UNKNOWN_DOCUMENT；清单刷新撤销为NOT_LISTED（本epoch保留轻量撤销标记直到换项目）。ENOENT→NOT_FOUND，EACCES/EPERM→PERMISSION_DENIED，目录→NOT_FILE，超预算→TOO_LARGE。文件刚删除或替换以最先可确认的结构化事实返回，不伪造更精确原因。IO_ERROR是其余无法归类的固定安全失败，不返回stack。错误不重试风暴，UI提供显式重试/返回，失败仍保留原阅读入口和上下文。

## UI静态呈现合同

仅处理返回的text，markdown走已有安全renderer；HTML标签按文本/净化规则禁执行，代码块作文本，不运行脚本，不嵌iframe。禁自动加载图片、远程资源及file:/javascript:/data:链接；http/https外链若提供，仍经既有openExternal白名单并由用户动作触发。md相对链接本版不触发任意读取，只能显式匹配当前已发documentRef，匹配不到显示无入口；不自动递归读取引用。文本包含原文、无隐式总结替代全文；新阅读/失败不得清空草稿、改变正在运行状态或给文件写权。安全Markdown具体落地由UI属主验证，不因Window返回format就假定安全。

## 精确实施写集、依赖与验证

本版撤回r1的新增Interface直接fs方案；已有project.ts读取模式不构成新能力的跨层例外。推荐单一相邻调用路径如下，全部lowerlayer均为**候选新文件，当前不在Window白名单**：

| 层/职责 | 精确候选路径 | 当前/候选主属主 |
| --- | --- | --- |
| Model：本B版本、引用、请求/结果与错误类型，不含IO | `src/model/project-document.ts` | 当前未建未授权；候选Window为B能力唯一主属 |
| Interface：IPC与现有资料索引接入，不新增fs | `app/main.ts`、`app/preload.cjs`、`app/desktop/interface.ts`、`app/desktop/project.ts` | 当前Window已拥有；本次实施仍待确认 |
| Pipeline：对外唯一createProjectDocumentReader入口，组合scope更新/读取/关闭流程 | `src/pipeline/project-document/read-project-document.ts` | 当前未建未授权；候选Window |
| Service abstract：Provider所需读取条件与服务接口 | `src/service/project-document/abstract/document-reader.ts` | 当前未建未授权；候选Window |
| Service public：创建/调用受限文档服务的公开入口 | `src/service/project-document/public/read-project-document.ts` | 当前未建未授权；候选Window |
| Service impl：唯一scope registry、清单资格、预算/格式/编码政策与错误映射 | `src/service/project-document/impl/read-project-document.ts` | 当前未建未授权；候选Window |
| Provider abstract：文件句柄事实与受限有界IO接口 | `src/provider/project-document/abstract/file-reader.ts` | 当前未建未授权；候选Window |
| Provider public：平台文件读取能力公开工厂 | `src/provider/project-document/public/file-reader.ts` | 当前未建未授权；候选Window |
| Provider impl：fs lstat/realpath/open/fstat/有界read/close与平台能力检查 | `src/provider/project-document/impl/file-reader.ts` | 当前未建未授权；候选Window |

Interface只调用Pipeline公开入口并导入Model；Pipeline只调Service public/abstract；Service只调Provider public/abstract；Provider只依赖Model/自身类型/Node基础设施。上层不直接导入下层impl，不平级互调，不把fs藏进common。Service保存唯一权限registry，Interface只把既有可信listing和docs索引的候选投递到Pipeline，renderer输入不能成为候选来源。Service定资格、Provider只返回句柄事实与字节，不第二次定义可读清单；Pipeline编排创建及关闭，Interface关窗时调用其dispose，不保留另一份权限表。

本建议不把B划给Core或编排：它是桌面文档能力，与模型工具执行/任务调度不同。推荐Governance在客户同意后扩充**既有Window角色**为该专属能力的跨层维护者，不新建角色，不在当前上下文切角色。本轮仅提出该分工，不能据此自授lowerlayer权限。

现白名单内可修改测试候选仅 `test/桌面应用/interface.test.ts`、`project.test.ts`、`diagnostics.test.ts`（IPC接线必要同步）。另外建议Governance精确增加 `test/桌面应用/project-document.test.ts` 单文件，专测B服务/Provider预算、编码、句柄竞态与scope；它**当前未授权，不能创建**。不以把Provider测试塞进Interface夹具规避边界。角色api-spec与本设计/证据可在既有文档范围准备；app/renderer由UI独立负责，新增依赖由装配评审，本版推荐不增包。

### Governance与客户确认前置（尚未完成）

Governance需核查上述逐文件当前无属主冲突，更新Window role-card职责/functional-description/必读资料，明确B的Model唯一主属及Pipeline/Service/Provider责任，并在boundary.yaml与boundary.md逐条加入表中的8个lowerlayer/Model文件及1个测试文件，取得客户确认后才可实施。当前角色卡明确Window是Interface层，不能只改YAML而不改责任；本方案与PM推荐均不替代客户边界确认。本轮不改治理文件、不创建任何lowerlayer文件、不授权整个src或common目录。若Governance确认存在其它已接受主属，应退回PM重新评估分工，不能重叠所有权。

已有共享path-primitives仅按其公开原语只读复用；跨角色安全原语若需新增由PM主属处理，不在Window复制共享安全组件。新Model字段/服务不会成为写门禁，也不把文档阅读变成工具执行。

### 需出现在客户approval brief的明确取舍

推荐接受本版**可信本地项目、macOS/Linux本地受测文件系统、UTF-8 md/txt且256KiB**范围，并接受Windows/能力不足环境明确拒读。代价是Windows用户暂不能使用B、某些挂载与符号链接文档不可读、较大/其它格式需外部工具，不能称所有桌面已完整支持。

Node通用fs方案对恶意瞬时祖先替换/恢复与硬链接来源没有严格隔离保证；此残余不能被“已使用句柄”掩盖。是否接受可信本地项目威胁边界是客户必须明确的产品决策，而非免费的技术默认。若要求严格对抗恶意本地writer/任意目录竞态，应拒绝本推荐并另审带目录句柄openat/平台沙箱的Provider及原生平台测试，需新的成本/owner/边界提案，本版不预授权或顺带实现。未接受此取舍前，B保持未实施，不降级到直接路径读取。

必需单测使用临时目录且不读真实.env：可读md/txt/BOM、空文件、精确262144/262145边界、分块增长、UTF-8截断/NUL/binary、不存在/目录/权限、绝对路径/../UNC/盘符/伪造ID、隐藏未列文件、内外symlink、校验后替换注入、句柄关闭、scope切换和迟到、清单撤销/同项目刷新、跨role引用不能重绑定。权限用可控IO替身或真实非root环境，不让本机特权使测试虚绿。真实Electron由测试角色核对IPC与安全渲染、全文/错误、返回定位、草稿保留、双宽键盘；不以JS纯函数测试替代。

## A/C消费占位，不复制规范

A的权威tool展示投影由[Core评估](../../../运行时核心/docs/design/2026-10-15_design_complete-flow-core-assessment.md)及后续canonical定义；Window所需仅同scope/turn/call/phase和可选有界命令/目标/结果/错误/exit/截断元数据，透传到history/live不另立字段副本。未定义前显示未保存，不抽附近聊天。

C由[编排评估](../../../编排/docs/design/2026-10-15_design_complete-flow-orchestration-assessment.md)及后续canonical定义typed报告来源、原turn/目标输入关联和持久快照；Window只消费可选typed对象，不根据前缀生成。C若提供结构化document候选，仍通过本B清单资格与文件校验，未知evidence保持普通文本。两合同定稿改变本B接口范围时必须修订本版本再实施，不能静默扩张。

按[独立验收框架B](../../../测试/docs/design/2026-10-15_three-interface-verification-plan.md)逐条落实错误码、替换竞态、迟到返回与只读副作用测试；阅读前后检查内容哈希与mtime，atime可能由OS文件访问自动更新，不宣称完全无文件系统元数据副作用。角色/引擎切换、关闭抽屉或另开文档也由UI请求版本令牌抑制迟到，主进程epoch负责项目安全范围，二者不混同。

本提案给出单一最小推荐，没有默认勾选选装。全部生产与验证尚未实施；PM审核、客户确认和实际通过分别记录。


## r2 回签：P3“查看来源角色文档”的最小入口

PM推荐的卡入口可行且不需要C artifact路径schema：只有可信typed报告/live view实际给出source.roleId且它属于当前已导入listing时，入口转到**该角色当前RoleView.documents列表**，由用户显式选择主进程已签发的documentRef，再调用B读取。evidence仍是文字，不自动选文件、不声称列表第一项就是报告全文；源角色未知/不在当前项目则提示无法定位来源资料，不按标题、路径句或相邻聊天找角色。

无需新增list刷新API：首次复用现app:list-project结果的RoleView.documents；用户显式刷新可复用同一已授权root的listProject，原nativegrant不变、同项目scope epoch不变，清单更新撤销失效ref。现main该调用还推history，UI需依现scope/阅读seq避免刷新抢上下文，不把它当纯零副作用函数；若不能保证UX，第一版只用当前列表和已有全项目刷新，不额外造自动轮询。没有grant、旧recovery无grant、平台不支持时入口只说明需原生重选/当前不支持，不造可读ref。切角色/引擎仅使UI阅读请求失效，不扩大B权限。

回签限制：本r2是待审推荐，合法分层新增8源码+1测试及职责/Model主属的Governance更新和客户确认仍是实施前置；并非Window已拥有这些lowerlayer。原生重选要求也需在客户审批简报明示：应用重启后未保留可信grant时，即使旧角色资料可显示，B阅读要再次原生选择。Windows拒读、可信本地项目残余竞态、旧文档/大文档不可读同样是实质取舍，不隐去成本。本轮未修改生产、边界、测试或真实窗口。
