# Dogfood 摩擦 · 短剧工场 × Boundary Harness（归档）

**状态：** 产品 SoT 已迁到 [kaibairen/video-copilot](https://github.com/kaibairen/video-copilot)。  
**现行备忘：** [docs/dogfood/DRAMA.md](../../../../docs/dogfood/DRAMA.md) · [DRAMA_PRODUCT_SOT.md](./DRAMA_PRODUCT_SOT.md)  
**本目录：** `examples/drama/` 只留 deprecated 指针 / 薄 stub。不要再按下面的 MVP 切片长功能，不要新建 `apps/drama-web`。

决策人已锁定拆分：短剧产品只住 video-copilot；本仓库只做 Harness 优化。Goal 证据应引用 video-copilot 独立 URL，不要写 `/examples/drama/`。

下面是 2026-09-20 切片当时的摩擦记录，只作归档。`#29` 已把挂载收成指针。

---

**原日期：** 2026-09-20  
**当时路径：** Goal → 填充槽 → Evidence → Gate（待我拍板）  
**当时产物：** `examples/drama/`（决策人打开 `/examples/drama/`，demo `#/p/demo-scavenger`）

当时用来咬「对标小云雀」的公开面：访客必须能走完一条工作流，不能在首页就被登录墙挡住。办公室仍只读，不在花名册上派工。

## 当时怎么走

1. 决策人在 `/` 建目标：「做一个能点的短剧工场 MVP」。  
2. 协调者或执行池填槽（`pool_noop` / `pool_cursor`）。  
3. Evidence 的 `artifact_uri` → **video-copilot** 独立页（不是 `/examples/drama/`）。  
4. 待办抽屉里拍板：打开产品 Demo，切 剧本 / 角色 / 分镜 / 预览；再贴一句灵感看分集是否种出。

## 当时卡住什么

| 摩擦 | 现象 | 为什么痛 | 当时怎么修 |
|------|------|----------|-------------|
| 产品被塞进 Harness examples | 决策人否决 `examples/drama/` 当产品家 | 控制面仓库里长产品，SoT 错位 | README / dogfood 标明产品只在 video-copilot。不在本仓建 `apps/drama-web`。`#29` 已收成薄 stub。 |
| Origin new_repo / 跨仓 | 本 agent 绑在 my-working-party；`video-copilot` 从此处 404 | 产品迁仓要另一路有权限的 agent | 本仓只留指针。 |
| 办公室主页不链到产物 | `/` 没有「打开产品」入口 | 决策人只记得目标标题 | Evidence 写 video-copilot URL。办公室链出去是后续。 |
| 对标产品过早登录墙 | 小云雀工作流/全片重定向登录 | Guest 验不了画布 | 产品侧（video-copilot）Demo / 新建仍应无登录墙。 |
| 证据不是页 | 只交摘要，决策人没法点四个 Tab | Gate 要「可打开的产物」 | 产物是 video-copilot 页，不是本 examples 路径。 |

## 现在不要做

- 不要在 `examples/drama/` 恢复精选剧 / 播种 / 分镜工作台  
- 不要新建 `apps/drama-web`  
- 短剧产品去 video-copilot；Harness 操作留在本仓库
