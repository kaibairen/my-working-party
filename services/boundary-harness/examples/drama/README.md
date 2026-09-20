# 短剧工场 · DEPRECATED

**产品已迁到 [video-copilot](https://github.com/kaibairen/video-copilot)。这里不再长功能。**

`services/boundary-harness/examples/drama/` 不是短剧产品 SoT。它只是 Boundary Harness 上的 **deprecated 指针 / 薄 stub**，方便旧 dogfood 链接不 404。不要在这里加精选剧、播种、分镜、出片、登录墙，也不要新建 `apps/drama-web`。

## 去哪做

| 事 | 仓库 |
|----|------|
| **短剧产品**（工作台、分镜、出片…） | [kaibairen/video-copilot](https://github.com/kaibairen/video-copilot) |
| **Harness 控制面 / dogfood 操作**（办公室、Gate、MCP、填充槽） | 本仓库 `kaibairen/my-working-party` · `services/boundary-harness/` |

SoT 备忘：[docs/dogfood/DRAMA.md](../../../../docs/dogfood/DRAMA.md) · [DRAMA_PRODUCT_SOT.md](../../docs/dogfood/DRAMA_PRODUCT_SOT.md)。历史摩擦（已归档）：[FRICTION_DRAMA.md](../../docs/dogfood/FRICTION_DRAMA.md)。

**Evidence 应指向 video-copilot 的独立 URL**，不要再把本路径当产品交付物。

## 这个挂载还在吗

`GET /examples/drama/` 仍返回本 stub（无登录墙）。它**不是**产品，也不是要继续 dogfood 的 MVP。

```bash
cd services/boundary-harness
pnpm --filter @harness/api dev
# http://127.0.0.1:8080/examples/drama/
```

自动化：`pnpm test` 只检查指针还在（README + stub 指向 video-copilot；挂载 200）。
