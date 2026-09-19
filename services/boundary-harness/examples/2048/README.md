# 2048 · Harness dogfood 产物

可玩的 4×4 2048。键盘方向键 / WASD，触摸滑动，计分，新游戏。逻辑在 `board.js`，页面是 `index.html`。

## 本地怎么打开

**决策人最快路径（Harness 已起）：**

1. `cd services/boundary-harness && pnpm --filter @harness/api dev`
2. 浏览器打开 [http://127.0.0.1:8080/examples/2048/](http://127.0.0.1:8080/examples/2048/)

**不经过 API：**

```bash
cd services/boundary-harness/examples/2048
python3 -m http.server 4173
# 打开 http://127.0.0.1:4173/
```

不要用 `file://` 打开：页面按 ES module 加载 `board.js`，本地文件协议会拦。

## 和 Harness 四件套怎么对

这一局 dogfood 的「产品」就是这个静态页，不是办公室里的派工按钮。

| Harness | 这一局 |
|---------|--------|
| **Goal** | 「做一个能玩的 2048」——办公室左侧目标标题 + 一句话要什么 |
| **Assignment / 填充槽** | 协调者或执行池填槽。槽位应标 **执行池 · noop / Cursor**，不要写成假同事名。Bot 自己 `harness_heartbeat`（可带 `group=2048`）才会出现在右侧工位。 |
| **Evidence** | 可打开的产物：本页 URL（`/examples/2048/`）或仓库路径 `services/boundary-harness/examples/2048/`。`artifact_uri` 指到这里。 |
| **Gate · 待我拍板** | 决策人打开产物、滑两下、看分数和新游戏。过了就「通过」；坏了「打回重做」。办公室工位仍只读，不在花名册上派工。 |

自动化：`pnpm test` 会跑 `board.test.ts`（合并规则冒烟）。
