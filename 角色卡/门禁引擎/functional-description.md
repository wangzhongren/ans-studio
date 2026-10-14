# 门禁引擎模块说明

本角色维护 Model 共享角色/边界/判定类型、角色与边界解析和路径门禁。功能导航见[feature-map.md](feature-map.md)，范围以已接受 [boundary.yaml](boundary.yaml) 为准。

## 本次实现定位

角色协作组摘要是原有角色解析的展示结果：`src/model/role.ts` 提供唯一 `RoleGroupMetadata`，`src/service/role/resolve-role.ts` 的枚举和按 id 解析将卡正文交给 `src/common/门禁引擎/role-card-metadata.ts`。解析器仅使用 Model，没有副作用，也不参与边界和写权判定。

桌面消费方只读使用 `ProjectRoleSummary` / `ResolvedRole` 的字段；不可直接导入本角色私有解析器。公开语义见[api-spec.md](api-spec.md)，当前过程见[角色协作组摘要](docs/feature/role-group-metadata.md)。既有其他能力的历史位置仍通过功能导航和 changelog 查询，本次未迁移其源码或文档。
