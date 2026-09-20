# Dogfood 摩擦 · 短剧工场 × Boundary Harness

**日期：** 2026-09-20（修订：产品源锁定为 video-copilot）  
**路径：** Goal → 填充槽 → Evidence → Gate（待我拍板）  
**产品 SoT：** [kaibairen/video-copilot](https://github.com/kaibairen/video-copilot)  
**本仓库残留：** `examples/drama/` 仅控制面 dogfood，**不是**产品家。不要再开 `apps/drama-web`。

决策人已锁定拆分：短剧产品只住 video-copilot；本仓库只做 Harness 优化。Goal 证据应引用 video-copilot 独立 URL，不要写 `/examples/drama/`。

这一局原先用来咬「对标小云雀」的公开面（访客走完工作流、无登录墙）。办公室仍只读。页面迁走后，本挂载应删或收成指针。

## 这一局实际怎么走

1. 决策人在 `/` 建目标：「做一个能点的短剧工场 MVP」。  
2. 协调者或执行池填槽（`pool_noop` / `pool_cursor`）。  
3. Evidence 的 `artifact_uri` → **video-copilot** 独立页（不是 `/examples/drama/`）。  
4. 待办抽屉里拍板：打开产品 Demo，切 剧本 / 角色 / 分镜 / 预览；再贴一句灵感看分集是否种出。

临时：video-copilot 尚未从本 agent 确认到可打开的页时，Harness 仍挂着旧静态页，仅供对照，不当产品 SoT。

## 卡住什么

| 摩擦 | 现象 | 为什么痛 | 拟修 / 本刀 |
|------|------|----------|-------------|
| 产品被塞进 Harness examples | 决策人否决 `examples/drama/` 当产品家 | 控制面仓库里长产品，SoT 错位 | **本刀：** README / dogfood 标明产品只在 video-copilot。不在本仓建 `apps/drama-web`。 |
| Origin new_repo / 跨仓 | 本 agent 绑在 my-working-party；`video-copilot` 从此处 404 | 产品迁仓要另一路有权限的 agent | 本仓只留指针。迁完后再拆 `mountExample(drama)`。 |
| 办公室主页不链到产物 | `/` 没有「打开产品」入口 | 决策人只记得目标标题 | Evidence 写 video-copilot URL。办公室链出去是后续。 |
| 对标产品过早登录墙 | 小云雀工作流/全片重定向登录 | Guest 验不了画布 | 产品侧（video-copilot）Demo / 新建仍应无登录墙。 |
| 证据不是页 | 只交摘要，决策人没法点四个 Tab | Gate 要「可打开的产物」 | 产物是 video-copilot 页，不是本 examples 路径。 |

## 建议 Bot 心跳（短剧工作组，可选）

```json
{
  "display_name": "Drama Bot",
  "pool_id": "pool_noop",
  "group": "harness"
}
```

本切片不新增花名册分组。组名仍走现有 `harness` / `2048` 别名。

## 明确还没做

- 把静态页迁到 video-copilot（另一路 agent）  
- 迁完后删除或收薄 `/examples/drama/` 挂载  
- 办公室主页链到产品 URL  
- 真视频生成 / 计费 / 发布
