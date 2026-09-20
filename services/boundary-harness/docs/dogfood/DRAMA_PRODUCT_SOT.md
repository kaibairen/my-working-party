# Dogfood · 短剧产品 SoT

**日期：** 2026-09-20  
**范围：** 决策人 / Bot 不要把 harness 示例当成短剧产品。

| 面 | SoT | 不要当成 SoT |
|----|-----|----------------|
| **短剧产品**（工作台、分镜、出片、获客面） | [kaibairen/video-copilot](https://github.com/kaibairen/video-copilot) | `services/boundary-harness/examples/drama/`（已 deprecated） |
| **Harness 操作**（办公室、Gate、MCP、填充槽、dogfood 四件套） | 本仓库 `kaibairen/my-working-party` · `services/boundary-harness/` | video-copilot 里的产品页 |

## 本仓库还留什么

`GET /examples/drama/` 是 **薄 stub / deprecated 指针**，只说明产品已迁走。不要在这里长功能，不要新建 `apps/drama-web`。

仓库根备忘：[docs/dogfood/DRAMA.md](../../../../docs/dogfood/DRAMA.md)。旧摩擦日志（MVP 切片时期）见 [FRICTION_DRAMA.md](./FRICTION_DRAMA.md)，不再当产品范围。
