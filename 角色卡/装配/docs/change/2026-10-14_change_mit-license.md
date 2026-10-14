# 添加 MIT 许可证

客户明确要求“你添加一个mit协议吧”。Governance已将项目根 LICENSE 精确加入装配白名单。本次使用该既有授权，新增标准MIT文本（版权人2026 汪忠仁），仅同步package.json顶级license、package-lock.json根package的license与README链接；第三方许可证/vendor、依赖版本、业务和测试均保持，不读取实际.env，不install或运行全仓/native测试，不提交推送。模板核对来源：[OSI MIT](https://opensource.org/license/mit)，引号规范为ASCII双引号。

先保存三份原内容的内存快照及SHA，写入后逐对象比较：两JSON只允许指定license字段新增，README只允许一条许可链接，LICENSE完整三段正文及ASCII（版权人汉字除外），再检查链接和diff格式。

## 写前快照

| 文件 | SHA-256 |
| --- | --- |
| package.json | a3ea68c320c1421fe3c132952a60835995203da0ef62003422b1444f54b9986c |
| package-lock.json | 38b2f2da801bcc0980ecdcdb146f5a723c374cf0a3795e7e16121efced45b749 |
| README.md | 44941e78c117b14983debdc48bea8fc77c81b514c7a1f3cacc725a3e3071d0d7 |
| LICENSE | 原不存在 |

当前状态：已实施并完成限定核验。

## 核验结果

已添加LICENSE及许可元数据/README链接。JSONparse与两处精确MIT值通过；删除新增license字段后两份JSON深比较完全相同，移除新增许可行后package/lock字节也与写前相同，因此依赖与其他lock字段没有漂移。README仅追加一条MIT链接，目标存在。LICENSE三段标准正文完整、版权人正确，正文ASCII与straight quotes检查通过；第三方/vendor原许可未改。未增加/运行测试或安装依赖。

| 文件 | 修改后 SHA-256 |
| --- | --- |
| package.json | c9f1903181e9540973e3f1cd283616147f99b54983914cf874a1fdde1dcc66a0 |
| package-lock.json | f74a0f38f32eaa335936e1dba174be7db5dda0ff863713a204753bc2ca44bd58 |
| README.md | 5246d71666e5cafa6d3f299ff51a41b9b4726ef412a34e12b239978ac352ea71 |
| LICENSE | 37fe0f42fecccc14d7cbd82a9070124cf68d74cd59940c5eef2c99eda357bf41 |

限定路径 `git diff --check`：exit0。
