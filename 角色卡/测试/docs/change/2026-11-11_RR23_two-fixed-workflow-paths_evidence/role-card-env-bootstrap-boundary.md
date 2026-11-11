# 边界：环境装配（env-bootstrap）

## Section 1: 可修改文件与目录

| 类型 | 路径 | 用途 |
| --- | --- | --- |
| directory | `assets/` | 环境与静态资源边界；仅本地相对引用，禁止网络依赖 |
| file | `index.html` | 自包含单文件入口与内联装配 |
