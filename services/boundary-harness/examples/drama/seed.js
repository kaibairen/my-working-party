/** Pure short-drama seed logic — no DOM. Used by the SPA and the smoke test. */

export const DEMO_ID = "demo-scavenger";
export const STORAGE_KEY = "harness-drama-projects";
export const SHOT_SIZES = ["远景", "全景", "中景", "近景", "特写"];

export const FEATURED = [
  {
    id: DEMO_ID,
    title: "丧尸清道夫",
    logline: "她不救人，她收尸。直到板车上有人还在要水。",
    badge: "精选 · 访客可进",
    action: "open",
    tone: "ash",
  },
  {
    id: "remix-rain-store",
    title: "雨夜便利店",
    logline: "夜班听到冷柜里有人敲门。监控显示柜是空的。",
    badge: "创作同款",
    action: "remix",
    insp: "雨夜便利店。夜班店员听到冷柜里有人敲门，监控却显示柜子是空的。不要开门的人先说话。",
    tone: "teal",
  },
  {
    id: "remix-gaokao",
    title: "高考那年",
    logline: "成绩条先到了班主任手里。他没有当场拆开。",
    badge: "创作同款",
    action: "remix",
    insp: "高考那年。成绩条先到班主任手里，他没有当场拆开，让全班自己来拿。第一排有人始终没站起来。",
    tone: "amber",
  },
];

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function shot(no, size, prompt, duration, extra = {}) {
  return {
    id: uid("sh"),
    no,
    size,
    prompt,
    duration,
    passed: false,
    ...extra,
  };
}

export function createDemoProject() {
  const episodes = [
    {
      id: "ep-1",
      no: 1,
      title: "第1集 · 收尸的人",
      synopsis: "雨夜，林晚把第三具感染者拖上板车。赵叔只要市场在天亮前干净。",
      shots: [
        shot(1, "远景", "雨夜空荡街道，板车轮子轧过积水，竖构图，冷青路灯", 6),
        shot(2, "中景", "林晚把感染者拖上车，黑雨衣湿透，动作机械", 5),
        shot(3, "特写", "对讲机沙哑：「城西市场，天亮前清干净。」", 4),
        shot(4, "近景", "林晚抬头，看见未完全死去的眼睛，停一拍", 6),
      ],
    },
    {
      id: "ep-2",
      no: 2,
      title: "第2集 · 会说话的货",
      synopsis: "板车底层有人抓住她的脚踝。不是撕咬——是一句「水」。",
      shots: [
        shot(1, "近景", "脚踝被一只脏手抓住，雨水顺着小臂往下", 4),
        shot(2, "特写", "黄瞳少年沙哑说「水」，嘴唇干裂", 5),
        shot(3, "中景", "林晚举刀又放下，雨声盖过呼吸", 6),
        shot(4, "全景", "雨停了一秒，两人分站板车两侧", 5),
      ],
    },
    {
      id: "ep-3",
      no: 3,
      title: "第3集 · 天亮之前",
      synopsis: "封锁线提前收缩。她把阿鬼推进冷库，自己推空车去交差。",
      shots: [
        shot(1, "远景", "市场外围封锁线，远处已有火光", 5),
        shot(2, "中景", "冷库门关上，阿鬼缩在角落，呼出白气", 5),
        shot(3, "近景", "林晚推着空板车走向检查点，不回头", 6),
        shot(4, "特写", "天空将亮未亮，对讲机静音", 4),
      ],
    },
  ];

  return {
    id: DEMO_ID,
    title: "丧尸清道夫",
    logline: "末世清道夫不救人——她收尸。直到她捡到一个还会说话的感染者。",
    guest: true,
    style: "真人 · 冷青雨夜",
    sourceText: [
      "【丧尸清道夫】",
      "",
      "第1集 收尸的人",
      "雨夜里，林晚把第三具感染者拖上板车。对讲机里赵叔只丢下一句：城西市场，天亮前清干净。她不抬头。她知道，抬头就会看见那些还没完全死去的眼睛。",
      "",
      "第2集 会说话的货",
      "板车最底层有人抓住她的脚踝。不是撕咬——是一句沙哑的「水」。阿鬼，十七岁，瞳孔发黄，却还记得自己的名字。林晚本该补一刀。她没有。",
      "",
      "第3集 天亮之前",
      "城管封锁线提前收缩。赵叔说上面要烧市场。林晚把阿鬼藏进冷库，自己推着空车去交差。她第一次希望天亮晚一点。",
    ].join("\n"),
    characters: [
      {
        id: "cast-lin",
        name: "林晚",
        desc: "清道夫。黑雨衣，左耳一道旧伤。不相信「还有人」。",
        look: "真人，冷白皮，湿发贴颊，雨衣反光",
        color: "#8a3d3a",
      },
      {
        id: "cast-gui",
        name: "阿鬼",
        desc: "感染早期少年。黄瞳，说话费力。还记得妈妈的电话号码。",
        look: "十七岁，消瘦，虹膜发黄，嘴唇干裂",
        color: "#4a6a4a",
      },
      {
        id: "cast-zhao",
        name: "赵叔",
        desc: "废弃城管。对讲机那头的声音。把人情当成配额。",
        look: "中年，沙哑，几乎不上镜，只有手和烟",
        color: "#4a5870",
      },
    ],
    episodes,
    createdAt: "2026-09-20T00:00:00.000Z",
  };
}

export function guessTitle(text) {
  const first = String(text || "")
    .trim()
    .split(/\n/)[0]
    .replace(/^【|】$/g, "")
    .replace(/^第[0-9一二三四五六七八九十]+集\s*/, "")
    .trim();
  if (!first) return "未命名短剧";
  return first.slice(0, 16);
}

export function splitEpisodes(text, fallbackCount = 3) {
  const raw = String(text || "").trim();
  const chunks = raw.split(/(?=第[0-9一二三四五六七八九十]+集)/).map((s) => s.trim()).filter(Boolean);
  if (chunks.length >= 2) {
    return chunks.slice(0, 8).map((chunk, i) => {
      const line = chunk.split(/\n/)[0].trim();
      const title = line.slice(0, 24) || `第${i + 1}集`;
      const body = chunk.split(/\n/).slice(1).join("\n").trim();
      return {
        id: uid("ep"),
        no: i + 1,
        title: title.startsWith("第") ? title : `第${i + 1}集 · ${title}`,
        synopsis: (body || chunk).slice(0, 120),
      };
    });
  }

  const hook = raw.slice(0, 42) || "一句还没说完的冲突";
  const beats = [
    { title: `第1集 · 钩子`, synopsis: `开场把观众按进竖屏：${hook}。先给一个具体动作，不解释世界观。` },
    { title: `第2集 · 反转`, synopsis: `表面办法失效。${hook}里出现不该在场的人，关系比怪物更危险。` },
    { title: `第3集 · 悬置`, synopsis: `代价兑现，但不收束。留下一句能续集的钩子，方便下一轮分镜。` },
  ];
  return beats.slice(0, fallbackCount).map((beat, i) => ({
    id: uid("ep"),
    no: i + 1,
    ...beat,
  }));
}

export function inferCast(text, title) {
  const t = String(text || "");
  if (/丧尸|感染|清道/.test(t)) {
    return [
      { id: uid("c"), name: "清道夫", desc: "负责把场面收拾干净的人。不先问名字。", look: "雨衣、手套、夜路", color: "#8a3d3a" },
      { id: uid("c"), name: "感染者", desc: "本该是货物。忽然还记得自己的名字。", look: "黄瞳、湿发、克制的颤抖", color: "#4a6a4a" },
      { id: uid("c"), name: "调度", desc: "对讲机那头只要结果。", look: "几乎不上镜，只有声音", color: "#4a5870" },
    ];
  }
  if (/高考|校园|班主任|成绩/.test(t)) {
    return [
      { id: uid("c"), name: "考生", desc: "成绩还没拆开，人已经站到走廊尽头。", look: "校服皱了，手指捏成绩袋", color: "#8a6a32" },
      { id: uid("c"), name: "班主任", desc: "先看见数字的人。选择不当场说。", look: "中年，衬衫，目光躲镜头", color: "#3d5a7a" },
      { id: uid("c"), name: "同桌", desc: "知道一点，但不会说完。", look: "侧脸，窗外光", color: "#5a4a68" },
    ];
  }
  if (/便利店|夜班|冷柜/.test(t)) {
    return [
      { id: uid("c"), name: "夜班店员", desc: "一个人撑到四点。听见不该响的声音。", look: "工服，冷白灯光", color: "#2f6a68" },
      { id: uid("c"), name: "门外的人", desc: "监控里没有。门缝下有影子。", look: "剪影，雨丝", color: "#3a3a4a" },
      { id: uid("c"), name: "店长", desc: "只在对讲机里出现：不要停机。", look: "电话那头", color: "#6a4a3a" },
    ];
  }
  const who = String(title || "主角").slice(0, 6);
  return [
    { id: uid("c"), name: who, desc: "被推到镜头前的人。这条竖屏围着她转。", look: "形象占位，待定妆", color: "#c45c4a" },
    { id: uid("c"), name: "对手", desc: "把冲突按在脸上的人。", look: "形象占位", color: "#4a6c8a" },
    { id: uid("c"), name: "旁证", desc: "知道一点、但不会说完的人。", look: "形象占位", color: "#6a5a3a" },
  ];
}

export function placeholderShots(episode, epIndex = 0) {
  const label = episode.title || `第${epIndex + 1}集`;
  return [
    shot(1, "远景", `${label}：建立空间，竖构图，环境先说话`, 5),
    shot(2, "中景", `${label}：人物进画，动作清楚，关系能一眼读`, 6),
    shot(3, "近景", `${label}：表情停一拍，给对白留口型`, 4),
    shot(4, "特写", `${label}：物件或手部细节，留给剪辑的钩子`, 4),
  ];
}

export function seedProject({ sourceText, title } = {}) {
  const text = String(sourceText || "").trim();
  if (!text) {
    throw new Error("source_required");
  }
  const resolvedTitle = (title && String(title).trim()) || guessTitle(text);
  const outlines = splitEpisodes(text);
  const episodes = outlines.map((ep, i) => ({
    ...ep,
    shots: placeholderShots(ep, i),
  }));
  return {
    id: uid("p"),
    title: resolvedTitle,
    logline: text.split(/\n/).find((line) => line.trim()) || resolvedTitle,
    guest: true,
    style: "待选 · 占位风格",
    sourceText: text,
    characters: inferCast(text, resolvedTitle),
    episodes,
    createdAt: new Date().toISOString(),
  };
}

export function emptyCharacter() {
  return {
    id: uid("c"),
    name: "新角色",
    desc: "一句话关系。先写她要什么。",
    look: "形象占位",
    color: "#5a4a68",
  };
}

export function emptyShot(no) {
  return shot(no, "中景", "补一句画面提示词", 5);
}

export function projectShotCount(project) {
  return (project.episodes || []).reduce((n, ep) => n + (ep.shots?.length || 0), 0);
}
