---
id: windows-document-test-oracles
type: fix
title: Windows按已接受拒读策略验证而不套用POSIX成功前提
created: "2026-10-15"
status: implemented
---

# 保留Windows拒读保护，修正跨平台测试前提

真实CI1 Windows总回归存在29项失败，其中本角色的两类测试错误是：重建提示断言写死POSIX分隔符；B真实读文件/竞态用例没有区分Windows不支持的已接受前提。依据root保留的[Windows原红日志](../../../测试/docs/change/2026-10-15-v1-release-evidence/ci1-win-regression-red.txt)。本轮仅修测试，不把产品的UNSUPPORTED_ENVIRONMENT改为成功，也不修改安全Provider、CI覆盖或已批准取舍。

精确修改三个已授权文件：boundary-refresh.test.ts两处用path.join等义比较实际文件名，重建次数/发送/恢复真实性断言不变；interface.test.ts两项实际导入文档用例在Windows明确要求documentReadUnavailable=UNSUPPORTED_ENVIRONMENT、没有scope/refs、读取返回安全失败无text、字节及mtime不变，跨窗口/关闭/非法路径守卫仍验证；失败或取消导入仍保留原A的拒读上下文，成功导入未授权B才转PROJECT_NOT_GRANTED。POSIX原有正向读与旧引用保留/撤销断言完整保留。

project-document.test.ts的十项真实POSIX读/句柄/编码/引用前提用例在Windows执行真实Provider/Service fail-closed检查，不调用t.skip：平台拒绝发生在打开/读取checkpoint之前；Service不建立scope、不mintrefs，对格式正确但未发出的ID不返回正文，content read counter为0，原字节/mtime不变。POSIX子体全部保留，纯Service替身的规则/迟到测试和实际preload桥仍各平台执行。另加所有host都会运行的真实Provider({platform:'win32'})→Service负例，使本机也能确定测试这一拒读分支，不把该受控平台参数当成真实Windows实机验证。

本机macOS专项3文件35/35、typecheck退出0、git diff --check通过；skip计数0。精确test overlay、命令与输出见[manifest](2026-10-15-windows-document-test-oracles-evidence/manifest.json)。生产app/src及打包配置均未由本角色修改，原红日志不覆盖。装配已收到三个精确测试路径和哈希，CI仍跑完整回归；root自身集成测试的相同平台前提由root单独维护。

真实Windows新分支与最终Windows产物必须由CI2确认，本机绿色不能代签。此前macOS真实安装包用户目录非秘密保存/重启与Claude缺配入口由root另有独验，不冒充本次跨平台测试已在所有OS通过。本角色不改tag/commit/push、不操作GUI、不读取真实.env。
