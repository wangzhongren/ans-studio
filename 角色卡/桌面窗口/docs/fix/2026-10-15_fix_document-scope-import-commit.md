---
id: document-scope-import-commit
type: fix
title: 导入失败保留当前项目的文档引用
created: "2026-10-15"
status: implemented
---

# 只有成功导入才切换可阅读的项目

WINDOW-B-FIX-1由PM核查并经root转发客户既有授权实施。原B将grantNativeSelection和beginListing当作切换提交点，选择B后枚举失败时，界面仍显示A却已失去A引用。PM静态发现后root原独立测试留红，见[原失败证据](../../../测试/docs/change/2026-10-15-p1p7-implementation-evidence/b-failed-import-red.json)。不修改该独立测试或批准合同。

现在Service分开active grant/scope/refs与pending native grant/listing。原生选择只准备pending、令旧listing token失效，不撤销active；beginListing只登记待定序号/路径。只有最新成功updateListing提交root与匹配grant，才重置旧scope；即使新项目无nativegrant，也提交新active项目并撤销A引用，返回PROJECT_NOT_GRANTED。普通同项目成功资料刷新沿用epoch和refs。

原生取消经新增内部cancelNativeSelection清pending并使该pending结果不能迟到提交，保留当前已成功导入的项目。它只经Pipeline与Interface内部调用，不新增IPC。Provider、Model、字节/编码/路径/句柄检查未改，未触C/session/history/anchor。真正成功切项目后旧读请求仍STALE_SCOPE/未授权无正文返回；失败/取消未提交时原A请求继续有效。

实际修改：B Service impl/abstract、B Pipeline、app/desktop/interface.ts及本角色project-document.test.ts/interface.test.ts。原B初版manifest和所有旧日志保持不变；新修复候选、日志与命令结果另存[fix证据](2026-10-15-document-scope-import-commit-evidence/manifest.json)。owner专项4文件39/39、npm run typecheck退出0、git diff --check通过（记录实际最终输出）；root已以原留红断言复跑green 1/0，覆盖失败导入A仍可读、成功提交B后A失效及原有字节/权限检查，见[独立绿色证据](../../../测试/docs/change/2026-10-15-p1p7-implementation-evidence/b-failed-import-green.json)。本角色未改其测试/结果，原红证据保留。

原own测试有两处以“beginListing就撤销”为前提，已改为显式成功updateListing后再断言撤销；新增失败/取消保留A、取消后B无授权、成功C撤A、更新原生选择后旧B迟到拒绝，以及Interface实际枚举抛错场景。这里修正的是测试前提并增加真实失败分支，没有放宽成功切换/安全断言。

仍未覆盖真实UI完整阅读/Linux/Windows实机；本次不操作真实桌面、凭据或p-limit。功能背景见[受限文档阅读](../feature/restricted-document-read.md)，原B实现与初版证据见[原实施记录](../change/2026-10-15_change_restricted-document-read.md)。
