# Claude适配器工作备忘录

2026-10-14：固定 Claude适配器；客户授权 ANS-RUNTIME-V2 revision1 必需开发。本角色只修改边界中 session、private common、tests 与自身资料。

SDK0.3.299（native2.1.299），实际 Option 是 settingSources 单数；MCP完整Zod对象走 server.instance.registerTool，SDK tool rawshape 无法保留 root additionalProperties。Zod4.6.7/MCP1.29/Anthropic0.93 离线17/17、targeted tsc7.0.2通过，最终项目/MCP共享版本需装配后复测。缺账号/真实模型不在证据内。停止每次调用捕获旧signal，外部秘密不继承；MCP硬上限24.8天已由PM接受披露。


A1V：正式MCP1.32.1；20/20和整仓tsc通过，真实bundledCLI回环probe通过。bare实际禁显式hooks，已移除；settings.disableAllHooks:true保留SDKcallbacks。nativeprompt_id不同于SDKuuid，用wire首行随机UUID登记原始Turn，不用submitting fallback；事件清除标记。环境构造时snapshot，profile变动不改变旧session。详见native-hook-identity修复记录。

2026-10-15 CLAUDE-A-1：批准13hash/Core final14hash匹配后接A4/C2.tp1。仅session生产；required-v1早拒+bind profile登记；真实source→注入投影→薄queue，SDK content不改。未知hook不借active，真实blocked保原Turn。自有28/28、Core实际MCP/read/shell、C运输sentinel、真实bundledCLI纯127回环通过，tsc0。详情和哈希见docs/change/2026-10-15_change_tool-display-projection.md。不能把standalone旧夹具当生产A保证；Core依赖变更后重跑。

2026-10-15 release：高负载50ms确认等待fixture固定Date/setTimeout逻辑钟，100ms等待不耗活动时限；49+1ms负对照证明真超时。真实MCP/IO仍走setImmediate，host watchdog10s。session.test29/29/tsc0，生产无变；见docs/fix/2026-10-15_fix_release-test-clock.md。

2026-10-16 截断同构评估（对照Pi F-3）：只读评估，结论(b) 无同构缺陷——ANS不设输出预算、CLI 2.1.299 自带 Er=3 次 max_output_tokens_recovery、耗尽走 api_error→is_error→适配器记 failed（非静默completed）；残余：截断特定性不可见（O-C1可选）、result「success∧!is_error∧stop_reason=max_tokens」可达性待真机探针封口（T1）。零代码改动；见docs/fix/2026-10-16_assess-truncation-parity.md。

2026-10-16 联网搜索接入提案（G-3/Claude路径）：只读调研——CLI 2.1.299 WebSearch=内置工具，执行走同端点 side-query 声明服务端工具 web_search_20250305（强制tool_choice、max_uses:8、firstParty/自定义baseURL不发web-search beta、预算默认200/会话）；落点=session.ts tools/allowedTools、PreToolUse放行分支（必需，deny先于allowedTools）、消息泵 native-start/native-result；开关建议 ANS_CLAUDE_WEB_SEARCH 默认关（探针过后可翻默认开）；测试=假SDK+真实bundledCLI回环；客户网关探针口径在文内（不代跑）；已核对Pi/Codex同日提案，差量见文§六；未实施未测试；见docs/fix/2026-10-16_proposal_web-search.md。

2026-10-16 G-3实施（客户「按推荐批准」后，期1收口）：能力位 ANS_CLAUDE_WEB_SEARCH（1/on开；未设/0/off/其他=关，默认关逐字不变）落三处——queryOptions tools/allowedTools、PreToolUse放行分支（不注入updatedInput、无__ans_call_context；未绑定/延后/他工具仍deny）、泵 native-start/native-result（Engine.nativeCalls键tool_use_id→{turn,toolCallId}，仅开时消费；string/数组content归一、isError/预算文案如实）。测试32/32（+3：关回归/开面板/泵四轮含is_error与unsupported）+typecheck0+git diff --check0+全量0新红+probe连续6/6。probe实测（bundledCLI 2.1.299）：**PreToolUse对内置WebSearch确实分发**（1次、绑定prompt_id、decision=allow、无updatedInput）——§七-②封口，hook分支为活路径；侧查询=单user「Perform a web search for the query: …」+max_uses8+强制tool_choice+无web-search beta头、声明只在侧查询；400→is_error如实、settled仍completed（不毁轮次）；400后CLI自动beta回退重试一次（第二次丢dangerous-tool-use beta）。跨边界发现：dispose删临时native目录偶发ENOTEMPTY（≈2/36次，CLI仍在flush；catch登记未改，属既有清理竞态）。未验：客户真网关side-query（探针清单在记录）、桌面行样式、默认取值裁定、WebFetch（另行评估）。见docs/fix/2026-10-16_impl_web-search.md。
