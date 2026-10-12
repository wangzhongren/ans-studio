// 门禁引擎测试：角色「文档面」固定清单 + 交付纪律（治理文案；客户原话「各个角色的工作流有问题，
// 为啥不写文档呢」）
//
// 真机根因：su 建出的角色边界**只授了代码路径**、一条文档路径都没有 ⇒ 门禁拒掉一切文档写入 ⇒
// 角色**不能**维护自己的文档（不是不写，是不能写）。
//
// 本文件钉住 su 内置卡文本（`BUILT_IN_ROLE_CARD_TEXT`，单一来源）中的约定：
//  1. 建/改每个项目角色时，**固定文档面清单逐项随边界一并授予**（kind 按文件/目录）：
//     五份文件（feature-map.md / memo.md / changelog.md / functional-description.md / api-spec.md）、
//     四个文档目录（docs/design//docs/feature//docs/change//docs/fix/）、角色自己的测试目录
//     （如 test/<角色 id>/）、temp/<角色 id>/（T-1 既有约定）；
//  2. 交付纪律：每次交付都同步自己的文档，**代码与文档同批交回**（文档缺口不得靠「下次补」）；
//  3. **反向断言**：不得暗示文档路径可选/可后补；不得出现「未列即默认可写」式表述。

import { test } from "node:test";
import assert from "node:assert/strict";

import { BUILT_IN_ROLE_CARD_TEXT } from "../../src/common/门禁引擎/boundary-core.ts";

const T = BUILT_IN_ROLE_CARD_TEXT;

test("文档面清单逐项在卡文本中（五文件 + 四目录 + 测试目录 + temp；kind 按项标注）", () => {
  const FILES = [
    "角色卡/<角色 id>/feature-map.md",
    "角色卡/<角色 id>/memo.md",
    "角色卡/<角色 id>/changelog.md",
    "角色卡/<角色 id>/functional-description.md",
    "角色卡/<角色 id>/api-spec.md",
  ];
  const DIRS = [
    "角色卡/<角色 id>/docs/design/",
    "角色卡/<角色 id>/docs/feature/",
    "角色卡/<角色 id>/docs/change/",
    "角色卡/<角色 id>/docs/fix/",
  ];
  for (const p of FILES) assert.ok(T.includes(p), `清单须逐项含文件：${p}`);
  for (const p of DIRS) assert.ok(T.includes(p), `清单须逐项含目录：${p}`);
  assert.ok(T.includes("test/<角色 id>/"), "清单须含该角色自己的测试目录");
  assert.ok(T.includes("temp/<角色 id>/"), "清单须含 temp/<角色 id>/（T-1 既有约定）");
  assert.match(T, /文件（kind: file）/, "文件项须标 kind: file");
  assert.match(T, /目录（kind: directory）/, "目录项须标 kind: directory");
  assert.ok(T.includes("角色写不了自己的文档"), "须点明「不给 ⇒ 角色写不了自己的文档」（真机根因）");
});

test("交付纪律：每次交付同步文档、代码与文档同批交回、不得靠「下次补」", () => {
  assert.ok(T.includes("每次交付"), "须写「每次交付」都要同步文档");
  for (const s of ["功能说明", "变更记录", "memo", "api-spec"]) {
    assert.ok(T.includes(s), `交付纪律须点名文档面：${s}`);
  }
  assert.ok(T.includes("代码与文档同批交回"), "须写死「代码与文档同批交回」");
  assert.ok(T.includes("不得靠「下次补」"), "须明禁「下次补」式补写");
});

test("反向断言：不得暗示文档路径可选/可后补；不得出现「未列即默认可写」式表述", () => {
  // 小句级：凡含「可选/可后补/下次补/以后补/后续补/另行补」的小句，必须带否定/禁止标记。
  const clauses = T.split(/[。；\n]/).filter((c) => /可选|可后补|后补|下次补|以后补|后续补|另行补/.test(c));
  assert.ok(clauses.length >= 1, "「下次补」禁令小句须存在（本约定至少要明禁一次）");
  for (const c of clauses) {
    assert.match(c, /不得|不|勿|禁止|非|免/, `涉及「可选/后补」的小句必须是否定/禁止表述，实得：${c}`);
  }
  // 定向反面模式：「未列即默认可写」式表述一律不得出现（未列即只读是本仓库纪律，不得反向写）。
  assert.equal(
    /未列[^。\n]{0,12}(默认可写|即可写|可以写|可写)/.test(T),
    false,
    "不得出现「未列即默认可写」式表述",
  );
});
