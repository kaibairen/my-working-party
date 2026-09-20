import {
  DEMO_ID,
  FEATURED,
  SHOT_SIZES,
  STORAGE_KEY,
  createDemoProject,
  emptyCharacter,
  emptyShot,
  projectShotCount,
  seedProject,
} from "./seed.js";

const TABS = [
  { id: "script", label: "剧本" },
  { id: "cast", label: "角色" },
  { id: "shots", label: "分镜" },
  { id: "preview", label: "预览" },
];

const app = document.getElementById("app");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function parseRoute() {
  const raw = (location.hash || "#/").replace(/^#/, "") || "/";
  const [path, qs] = raw.split("?");
  const params = new URLSearchParams(qs || "");
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "new") return { name: "new", insp: params.get("insp") || "" };
  if (parts[0] === "p" && parts[1]) {
    return {
      name: "project",
      id: parts[1],
      tab: TABS.some((t) => t.id === parts[2]) ? parts[2] : "script",
      ep: params.get("ep") || "",
    };
  }
  return { name: "home" };
}

function go(hash) {
  location.hash = hash;
}

function loadProjects() {
  const map = new Map();
  map.set(DEMO_ID, createDemoProject());
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(stored)) {
      for (const project of stored) {
        if (project?.id) map.set(project.id, project);
      }
    }
  } catch {
    /* ignore broken local drafts */
  }
  return map;
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...projects.values()]));
}

const projects = loadProjects();

function projectList() {
  return [...projects.values()].sort((a, b) => {
    if (a.id === DEMO_ID) return -1;
    if (b.id === DEMO_ID) return 1;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
}

function hueFrom(text) {
  let n = 0;
  for (const ch of String(text)) n = (n * 31 + ch.charCodeAt(0)) % 360;
  return n;
}

function currentProject() {
  const route = parseRoute();
  return route.name === "project" ? projects.get(route.id) : undefined;
}

function activeEpisode(project, route) {
  return project.episodes.find((e) => e.id === route.ep) || project.episodes[0];
}

function setEpisode(project, tab, epId) {
  go(`#/p/${project.id}/${tab}?ep=${encodeURIComponent(epId)}`);
}

function renderHome() {
  const mine = projectList().filter((p) => p.id !== DEMO_ID);
  return `
    <header class="top">
      <div class="brand">
        <div class="mark">剧</div>
        <div>
          <h1>短剧工场</h1>
          <p>Harness dogfood 残留 · 产品源是 <a href="https://github.com/kaibairen/video-copilot">video-copilot</a></p>
        </div>
      </div>
      <span class="guest" data-testid="guest-badge">访客 · 无需登录</span>
    </header>
    <section class="hero">
      <h2>精选短剧，先把工作流走完。</h2>
      <p class="lede">不设登录墙。打开「丧尸清道夫」看剧本 / 角色 / 分镜 / 预览；或贴一句灵感，客户端会种出分集大纲和占位镜头。真视频模型不在本切片。</p>
      <div class="row">
        <button class="btn primary" type="button" data-go="#/new" data-testid="cta-start">开始创作</button>
        <button class="btn ghost" type="button" data-go="#/p/${DEMO_ID}" data-testid="cta-demo">打开精选 Demo</button>
      </div>
    </section>
    <div class="section-title">精选短剧</div>
    <div class="grid" data-testid="featured">
      ${FEATURED.map((item) => `
        <a class="poster ${item.tone}" href="${item.action === "open" ? `#/p/${item.id}` : `#/new?insp=${encodeURIComponent(item.insp)}`}" data-testid="featured-${item.id}">
          <span class="chip">${esc(item.badge)}</span>
          <div class="art"></div>
          <div class="body">
            <h3>${esc(item.title)}</h3>
            <p>${esc(item.logline)}</p>
          </div>
        </a>
      `).join("")}
    </div>
    <div class="section-title">我的项目</div>
    ${mine.length ? `
      <div class="grid">
        ${mine.map((p) => `
          <a class="poster ash" href="#/p/${esc(p.id)}" data-testid="my-project">
            <span class="chip">本地草稿</span>
            <div class="art"></div>
            <div class="body">
              <h3>${esc(p.title)}</h3>
              <p>${esc(p.logline)}</p>
            </div>
          </a>
        `).join("")}
      </div>
    ` : `<p class="empty">还没有本地草稿。点「开始创作」贴灵感或剧本。</p>`}
    <footer class="note">DEPRECATED：产品 SoT 是 <a href="https://github.com/kaibairen/video-copilot">kaibairen/video-copilot</a>。本页只是 Harness dogfood，见 <a href="./README.md">README</a>。</footer>
  `;
}

function renderNew(route) {
  return `
    <header class="top">
      <div class="brand">
        <div class="mark">剧</div>
        <div>
          <h1>开始创作</h1>
          <p>粘贴灵感或整本剧本 · 客户端 mock 分集</p>
        </div>
      </div>
      <span class="guest">访客 · 无需登录</span>
    </header>
    <div class="card">
      <p class="hint">不接 Seedance。提交后会种 3 集左右大纲、角色卡和占位分镜，随后进入工作台。</p>
      <label class="field">
        <span>标题（可空，默认取首行）</span>
        <input id="new-title" type="text" maxlength="24" placeholder="未命名短剧" data-testid="new-title" />
      </label>
      <label class="field">
        <span>灵感 / 剧本</span>
        <textarea id="new-source" data-testid="new-source" placeholder="一句冲突，或带「第1集」的剧本原文">${esc(route.insp)}</textarea>
      </label>
      <p class="err" id="new-error" data-testid="new-error"></p>
      <div class="row">
        <button class="btn primary" type="button" id="seed-project" data-testid="seed-project">生成分集大纲</button>
        <button class="btn ghost" type="button" data-go="#/">返回工场</button>
      </div>
    </div>
  `;
}

function tabBar(project, tab) {
  return `
    <div class="tabs" role="tablist">
      ${TABS.map((item) => `
        <button class="tab" type="button" role="tab" aria-selected="${item.id === tab}" data-go="#/p/${project.id}/${item.id}" data-testid="tab-${item.id}">${item.label}</button>
      `).join("")}
    </div>
  `;
}

function renderScript(project) {
  return `
    <label class="field">
      <span>原文</span>
      <textarea id="script-source" data-field="sourceText" data-testid="script-source">${esc(project.sourceText)}</textarea>
    </label>
    <div class="section-title">分集大纲</div>
    <div class="shots" data-testid="episode-outlines">
      ${project.episodes.map((ep) => `
        <div class="card" data-ep="${esc(ep.id)}">
          <label class="field">
            <span>第 ${ep.no} 集标题</span>
            <input type="text" data-ep-title="${esc(ep.id)}" value="${esc(ep.title)}" />
          </label>
          <label class="field">
            <span>大纲</span>
            <textarea data-ep-synopsis="${esc(ep.id)}" style="min-height:88px">${esc(ep.synopsis)}</textarea>
          </label>
        </div>
      `).join("")}
    </div>
  `;
}

function renderCast(project) {
  return `
    <div class="cast" data-testid="cast-list">
      ${project.characters.map((c) => `
        <div class="card cast-card" data-testid="character-card">
          <div class="avatar" style="background:${esc(c.color)}" title="形象占位">${esc((c.name || "角").slice(0, 1))}</div>
          <div class="grow">
            <label class="field">
              <span>名</span>
              <input type="text" data-cast-name="${esc(c.id)}" value="${esc(c.name)}" />
            </label>
            <label class="field">
              <span>描述</span>
              <textarea data-cast-desc="${esc(c.id)}" style="min-height:72px">${esc(c.desc)}</textarea>
            </label>
            <p class="look">形象占位 · ${esc(c.look || "待定妆")}</p>
          </div>
        </div>
      `).join("")}
    </div>
    <div class="row" style="margin-top:12px">
      <button class="btn ghost" type="button" id="add-cast" data-testid="add-cast">新增角色</button>
    </div>
  `;
}

function renderShots(project, episode) {
  if (!episode) return `<p class="empty">还没有分集。</p>`;
  return `
    <div class="ep-switch" data-testid="shot-episodes">
      ${project.episodes.map((ep) => `
        <button class="tab" type="button" aria-selected="${ep.id === episode.id}" data-ep-switch="${esc(ep.id)}">${esc(ep.title)}</button>
      `).join("")}
    </div>
    <div class="shots" data-testid="shot-list">
      ${episode.shots.map((s) => `
        <div class="shot" data-testid="shot-row">
          <div class="no">#${String(s.no).padStart(2, "0")}</div>
          <select class="size" data-shot-size="${esc(episode.id)}:${esc(s.id)}">
            ${SHOT_SIZES.map((size) => `<option ${size === s.size ? "selected" : ""}>${size}</option>`).join("")}
          </select>
          <input class="prompt" type="text" data-shot-prompt="${esc(episode.id)}:${esc(s.id)}" value="${esc(s.prompt)}" />
          <input class="dur" type="number" min="2" max="15" data-shot-dur="${esc(episode.id)}:${esc(s.id)}" value="${esc(s.duration)}" />
          <label class="pass"><input type="checkbox" data-shot-pass="${esc(episode.id)}:${esc(s.id)}" ${s.passed ? "checked" : ""} /> 过</label>
        </div>
      `).join("")}
    </div>
    <div class="row" style="margin-top:12px">
      <button class="btn ghost" type="button" id="add-shot" data-ep="${esc(episode.id)}" data-testid="add-shot">加一条镜头</button>
    </div>
  `;
}

function renderPreview(project, episode) {
  const shot = episode?.shots?.[0];
  const hue = hueFrom(shot?.prompt || episode?.title || project.title);
  return `
    <div class="preview-layout">
      <div>
        <div class="phone" data-testid="preview-frame" aria-label="9:16 预览框">
          <div class="notch"></div>
          <div class="stub" style="background:linear-gradient(180deg, hsl(${hue} 28% 22%), hsl(${(hue + 40) % 360} 40% 12%))">
            <div>
              <strong>${esc(shot ? `#${String(shot.no).padStart(2, "0")} · ${shot.size}` : "占位")}</strong>
              <span>${esc(shot?.prompt || "还没有镜头。")}</span>
            </div>
          </div>
        </div>
      </div>
      <div>
        <div class="ep-switch" data-testid="preview-episodes">
          ${project.episodes.map((ep) => `
            <button class="tab" type="button" aria-selected="${ep.id === episode?.id}" data-ep-switch="${esc(ep.id)}">${esc(`第${ep.no}集`)}</button>
          `).join("")}
        </div>
        <p class="hint">占位图 / 色块 stub，不是成片。集切换只换大纲和镜头表。真模型、积分、抖音发布都不在本页。</p>
        <div class="shots" id="preview-shots">
          ${(episode?.shots || []).map((s) => `
            <button class="shot" type="button" data-preview-shot="${esc(s.id)}" data-testid="preview-shot">
              <div class="no">#${String(s.no).padStart(2, "0")}</div>
              <div>${esc(s.size)}</div>
              <div>${esc(s.prompt)}</div>
              <div>${esc(s.duration)}s</div>
              <div>${s.passed ? "过" : ""}</div>
            </button>
          `).join("")}
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn" type="button" disabled title="MVP 不接 Seedance">生成成片</button>
        </div>
      </div>
    </div>
  `;
}

function renderProject(route) {
  const project = projects.get(route.id);
  if (!project) {
    return `
      <header class="top"><div class="brand"><div class="mark">剧</div><div><h1>找不到项目</h1></div></div></header>
      <p class="empty">这条草稿不在本机。回工场打开精选 Demo，无需登录。</p>
      <button class="btn primary" type="button" data-go="#/">回工场</button>
    `;
  }
  const episode = activeEpisode(project, route);
  const panels = {
    script: () => renderScript(project),
    cast: () => renderCast(project),
    shots: () => renderShots(project, episode),
    preview: () => renderPreview(project, episode),
  };
  const panel = panels[route.tab] || panels.script;
  return `
    <header class="top">
      <div class="brand">
        <div class="mark">剧</div>
        <div>
          <h1>${esc(project.title)}</h1>
          <p class="meta">${project.guest ? "访客可浏览 · " : ""}${project.episodes.length} 集 · ${projectShotCount(project)} 镜 · ${esc(project.style || "")}</p>
        </div>
      </div>
      <button class="btn ghost" type="button" data-go="#/" data-testid="back-home">回工场</button>
    </header>
    ${tabBar(project, route.tab)}
    <div data-testid="workspace">${panel()}</div>
  `;
}

function render() {
  const route = parseRoute();
  if (route.name === "new") app.innerHTML = renderNew(route);
  else if (route.name === "project") app.innerHTML = renderProject(route);
  else app.innerHTML = renderHome();
}

function findShot(project, token) {
  const [epId, shotId] = String(token || "").split(":");
  return project.episodes.find((e) => e.id === epId)?.shots.find((s) => s.id === shotId);
}

function paintPreview(shot) {
  const frame = app.querySelector("[data-testid=preview-frame] .stub");
  if (!shot || !frame) return;
  const hue = hueFrom(shot.prompt);
  frame.style.background = `linear-gradient(180deg, hsl(${hue} 28% 22%), hsl(${(hue + 40) % 360} 40% 12%))`;
  frame.innerHTML = `<div><strong>${esc(`#${String(shot.no).padStart(2, "0")} · ${shot.size}`)}</strong><span>${esc(shot.prompt)}</span></div>`;
}

app.addEventListener("click", (event) => {
  const goEl = event.target.closest("[data-go]");
  if (goEl) {
    event.preventDefault();
    go(goEl.getAttribute("data-go"));
    return;
  }

  if (event.target.closest("#seed-project")) {
    const title = document.getElementById("new-title")?.value;
    const sourceText = document.getElementById("new-source")?.value;
    const err = document.getElementById("new-error");
    try {
      const project = seedProject({ title, sourceText });
      projects.set(project.id, project);
      persist();
      go(`#/p/${project.id}/script`);
    } catch {
      if (err) err.textContent = "先贴一句灵感或一段剧本。";
    }
    return;
  }

  const project = currentProject();
  const route = parseRoute();
  if (!project) return;

  if (event.target.closest("#add-cast")) {
    project.characters.push(emptyCharacter());
    persist();
    render();
    return;
  }

  const addShot = event.target.closest("#add-shot");
  if (addShot) {
    const ep = project.episodes.find((item) => item.id === addShot.getAttribute("data-ep"));
    if (!ep) return;
    ep.shots.push(emptyShot(ep.shots.length + 1));
    persist();
    setEpisode(project, "shots", ep.id);
    render();
    return;
  }

  const epSwitch = event.target.closest("[data-ep-switch]");
  if (epSwitch) {
    setEpisode(project, route.tab, epSwitch.getAttribute("data-ep-switch"));
    return;
  }

  const previewShot = event.target.closest("[data-preview-shot]");
  if (previewShot) {
    const shot = project.episodes.flatMap((e) => e.shots).find((s) => s.id === previewShot.getAttribute("data-preview-shot"));
    paintPreview(shot);
  }
});

app.addEventListener("input", (event) => {
  const project = currentProject();
  if (!project) return;
  const t = event.target;
  if (t.id === "script-source") {
    project.sourceText = t.value;
    persist();
    return;
  }
  if (t.dataset.epTitle) {
    const ep = project.episodes.find((item) => item.id === t.dataset.epTitle);
    if (ep) ep.title = t.value;
    persist();
    return;
  }
  if (t.dataset.epSynopsis) {
    const ep = project.episodes.find((item) => item.id === t.dataset.epSynopsis);
    if (ep) ep.synopsis = t.value;
    persist();
    return;
  }
  if (t.dataset.castName) {
    const cast = project.characters.find((item) => item.id === t.dataset.castName);
    if (cast) cast.name = t.value;
    persist();
    return;
  }
  if (t.dataset.castDesc) {
    const cast = project.characters.find((item) => item.id === t.dataset.castDesc);
    if (cast) cast.desc = t.value;
    persist();
    return;
  }
  if (t.dataset.shotPrompt) {
    const shot = findShot(project, t.dataset.shotPrompt);
    if (shot) shot.prompt = t.value;
    persist();
    return;
  }
  if (t.dataset.shotDur) {
    const shot = findShot(project, t.dataset.shotDur);
    if (shot) shot.duration = Math.min(15, Math.max(2, Number(t.value) || 5));
    persist();
  }
});

app.addEventListener("change", (event) => {
  const project = currentProject();
  if (!project) return;
  const t = event.target;
  if (t.dataset.shotSize) {
    const shot = findShot(project, t.dataset.shotSize);
    if (shot) shot.size = t.value;
    persist();
    return;
  }
  if (t.dataset.shotPass) {
    const shot = findShot(project, t.dataset.shotPass);
    if (shot) shot.passed = t.checked;
    persist();
  }
});

window.addEventListener("hashchange", render);
render();
