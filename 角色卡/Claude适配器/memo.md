# Claude适配器工作备忘录

2026-10-14：固定 Claude适配器；客户授权 ANS-RUNTIME-V2 revision1 必需开发。本角色只修改边界中 session、private common、tests 与自身资料。

SDK0.3.299（native2.1.299），实际 Option 是 settingSources 单数；MCP完整Zod对象走 server.instance.registerTool，SDK tool rawshape 无法保留 root additionalProperties。Zod4.6.7/MCP1.29/Anthropic0.93 离线17/17、targeted tsc7.0.2通过，最终项目/MCP共享版本需装配后复测。缺账号/真实模型不在证据内。停止每次调用捕获旧signal，外部秘密不继承；MCP硬上限24.8天已由PM接受披露。


A1V：正式MCP1.32.1；20/20和整仓tsc通过，真实bundledCLI回环probe通过。bare实际禁显式hooks，已移除；settings.disableAllHooks:true保留SDKcallbacks。nativeprompt_id不同于SDKuuid，用wire首行随机UUID登记原始Turn，不用submitting fallback；事件清除标记。环境构造时snapshot，profile变动不改变旧session。详见native-hook-identity修复记录。
