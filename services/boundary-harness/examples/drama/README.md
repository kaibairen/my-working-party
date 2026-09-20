# 短剧工场 · Harness dogfood 产物

对标小云雀的 **AI 短剧 MVP 切片**：精选短剧、访客可进的 demo 工作台、贴灵感/剧本后客户端种分集大纲与占位分镜。逻辑在 `seed.js`，页面是 `index.html` + `app.js`。

不接真视频模型、会员积分、抖音发布、无限节点画布、登录墙。

## 本地怎么打开

**决策人最快路径（Harness 已起）：**

1. `cd services/boundary-harness && pnpm --filter @harness/api dev`
2. 浏览器打开 [http://127.0.0.1:8080/examples/drama/](http://127.0.0.1:8080/examples/drama/)
3. 点精选「丧尸清道夫」或 CTA「开始创作」。Demo 路径：`/examples/drama/#/p/demo-scavenger`

**不经过 API：**

```bash
cd services/boundary-harness/examples/drama
python3 -m http.server 4174
# 打开 http://127.0.0.1:4174/
```

不要用 `file://` 打开：页面按 ES module 加载 `app.js` / `seed.js`，本地文件协议会拦。

## MVP 范围

| 可点 | 说明 |
|------|------|
| 首页 | 精选短剧 +「开始创作」。访客徽章，无登录墙 |
| Demo 项目 | 「丧尸清道夫」完整可浏览：剧本原文 / 分集大纲 / 角色卡 / 分镜时间线 / 9:16 占位预览 |
| 工作台 Tab | 剧本 · 角色 · 分镜 · 预览 |
| 新建 | 贴灵感或带「第 N 集」的剧本 → 客户端 mock 分集 + 占位镜头（写入 localStorage） |

## 明确非目标

真 Seedance 出片、计费/积分、抖音发布、无限节点画布、鉴权。预览里的「生成成片」是禁用按钮。

## 和 Harness 四件套怎么对

这一局 dogfood 的「产品」就是这个静态页，不是办公室里的派工按钮。

| Harness | 这一局 |
|---------|--------|
| **Goal** | 「做一个能点的短剧工场 MVP」——办公室左侧目标标题 |
| **Assignment / 填充槽** | 协调者或执行池填槽。槽位应标 **执行池 · noop / Cursor**。Bot 自己 `harness_heartbeat` 才会出现在右侧工位。 |
| **Evidence** | 可打开的产物：本页 URL（`/examples/drama/`）或仓库路径 `services/boundary-harness/examples/drama/`。`artifact_uri` 指到这里。访客必须能走进 `#/p/demo-scavenger`。 |
| **Gate · 待我拍板** | 决策人打开产物、点开 demo 四个 Tab、再贴一句灵感看是否种出分集。过了就「通过」。 |

自动化：`pnpm test` 会跑 `seed.test.ts`（demo 可浏览 + 灵感/剧本播种冒烟），以及 API 对 `/examples/drama/` 的 200 检查。

摩擦备忘：[FRICTION_DRAMA.md](../../docs/dogfood/FRICTION_DRAMA.md)
