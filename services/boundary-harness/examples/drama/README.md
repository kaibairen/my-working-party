# DEPRECATED · 不是短剧产品源

**产品（短剧）只住在 [kaibairen/video-copilot](https://github.com/kaibairen/video-copilot)。**  
本目录是 Boundary Harness 的控制面 dogfood 挂载，**不是**产品 SoT。不要在这里长功能、不要把 Goal 证据写成「产品在 `/examples/drama/`」。

决策人已锁定拆分：

| 仓库 | 职责 |
|------|------|
| [kaibairen/video-copilot](https://github.com/kaibairen/video-copilot) | 短剧产品 |
| `kaibairen/my-working-party` | Harness 优化 |

`apps/drama-web` **不要**在本仓库新建。另一路 agent 会把页面迁到 video-copilot。迁完后可再拆掉本挂载。

## 本页还在挂什么（临时 dogfood）

Harness API 仍服务这些静态文件，方便旧书签 / 现有 API 测试，**直到** video-copilot 接住产品页：

1. `cd services/boundary-harness && pnpm --filter @harness/api dev`
2. [http://127.0.0.1:8080/examples/drama/](http://127.0.0.1:8080/examples/drama/)
3. 旧 demo 路径：`/examples/drama/#/p/demo-scavenger`

**Evidence 应指向 video-copilot 的独立 URL**（或该仓库路径），不要再把本路径当产品交付物。摩擦备忘：[FRICTION_DRAMA.md](../../docs/dogfood/FRICTION_DRAMA.md)
