# Dogfood 摩擦 · 短剧工场 × Boundary Harness

**日期：** 2026-09-20  
**路径：** Goal → 填充槽 → Evidence → Gate（待我拍板）  
**产物：** `examples/drama/`（决策人打开 `/examples/drama/`，demo `#/p/demo-scavenger`）

这一局用来咬「对标小云雀」的公开面：访客必须能走完一条工作流，不能在首页就被登录墙挡住。办公室仍只读，不在花名册上派工。

## 这一局实际怎么走

1. 决策人在 `/` 建目标：「做一个能点的短剧工场 MVP」。  
2. 协调者或执行池填槽（`pool_noop` / `pool_cursor`）。  
3. 把可打开的页当作 Evidence（`artifact_uri` → `/examples/drama/`）。  
4. 待办抽屉里拍板：打开精选 Demo，切 剧本 / 角色 / 分镜 / 预览；再贴一句灵感看分集是否种出。

## 卡住什么

| 摩擦 | 现象 | 为什么痛 | 拟修 / 本刀 |
|------|------|----------|-------------|
| 静态产物要逐文件挂路由 | 2048 要手写 `index.html` / `board.js` / `README.md` 三条 | 短剧页多了 `app.js` + `seed.js`，漏挂一条就是 ESM 404，Gate 打不开 | **本刀：** API `mountExample()`，2048 / drama 共用。新文件仍要写进 assets 列表——还没有目录级 static。 |
| 办公室主页不链到产物 | `/` 没有「打开 examples」入口 | 决策人只记得目标标题，不知道 `/examples/drama/` | 与 2048 相同。README 把 URL 写成 Evidence。办公室链出去是后续，不在本切片改 IA。 |
| 对标产品过早登录墙 | 小云雀工作流/全片重定向登录 | Guest 验不了画布，获客和 dogfood 都断 | **本刀产品选择：** Demo 与新建都不要求登录。这是和竞品的差，不是漏做鉴权。 |
| `file://` 打不开 | 直接打开 html，模块被拦 | 决策人把仓库当附件发 | README 写明走 API 或 `python3 -m http.server`。 |
| 证据不是页 | 只交摘要，决策人没法点四个 Tab | Gate 要「可打开的产物」 | 短剧页就是 artifact。预览是色块 stub，不要当成 Seedance 成片。 |

## 建议 Bot 心跳（短剧工作组，可选）

```json
{
  "display_name": "Drama Bot",
  "pool_id": "pool_noop",
  "group": "harness"
}
```

本切片不新增花名册分组。组名仍走现有 `harness` / `2048` 别名，避免再开一套频道当工位。

## 明确还没做

- 目录级 `/examples/*` 静态中间件（现在是白名单文件）  
- 办公室主页链到 dogfood 产物  
- 真视频生成 / 计费 / 发布
