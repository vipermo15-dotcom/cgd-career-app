import { signOut } from "../auth.js";
import {
  adminOverview, adminUsers, setUserRole, listAiRuns,
  listJobCategories, saveJobCategory, listSkills, listTools, saveRef, deleteRef,
  listCompanies, saveCompany, deleteCompany, getConfig, setConfig,
  MATCH_WEIGHT_KEYS, READINESS_WEIGHT_KEYS,
} from "../data.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function renderAdmin(el, { session }) {
  el.innerHTML = `
    <header class="topbar">
      <strong>관리자</strong>
      <span class="muted small">${esc(session.user.email)}</span>
      <a href="#/instructor" class="ghost" style="text-decoration:none;padding:8px 12px;border:1px solid var(--line);border-radius:8px">강사 화면 →</a>
      <button id="so" class="ghost">로그아웃</button>
    </header>
    <nav class="tabs">
      <button data-tab="overview" class="on">개요</button>
      <button data-tab="users">회원</button>
      <button data-tab="companies">기업</button>
      <button data-tab="taxonomy">기준데이터</button>
      <button data-tab="config">설정</button>
      <button data-tab="ai">AI 로그</button>
    </nav>
    <section id="pane"><p class="muted">불러오는 중…</p></section>`;
  el.querySelector("#so").onclick = signOut;
  const pane = el.querySelector("#pane");
  const tabs = [...el.querySelectorAll(".tabs button")];
  const show = (n) => {
    tabs.forEach((b) => b.classList.toggle("on", b.dataset.tab === n));
    ({ overview: paintOverview, users: paintUsers, companies: paintCompanies,
       taxonomy: paintTaxonomy, config: paintConfig, ai: paintAi }[n])(pane);
  };
  tabs.forEach((b) => (b.onclick = () => show(b.dataset.tab)));
  show("overview");
}

async function paintOverview(pane) {
  pane.innerHTML = `<p class="muted">불러오는 중…</p>`;
  let d;
  try { d = await adminOverview(); }
  catch (e) { pane.innerHTML = `<div class="card err">${esc(e.message)}</div>`; return; }
  const c = d.counts;
  const kpi = (label, v) => `<div class="card kpi"><span>${label}</span><b>${v}</b></div>`;
  const dist = (o) => Object.entries(o || {}).map(([k, v]) => `<span class="badge">${esc(k)} ${v}</span>`).join(" ");
  const recent = (d.recent_activity || []).map((a) =>
    `<li class="small"><span class="muted">${esc((a.at || "").slice(0, 16).replace("T", " "))}</span> · ${esc(a.actor)} · ${esc(a.detail || a.action)}</li>`).join("")
    || "<li class='muted'>없음</li>";
  pane.innerHTML = `
    <div class="grid">
      ${kpi("회원", c.users)}${kpi("기수", c.cohorts)}${kpi("학생", c.students)}
      ${kpi("공고", c.job_postings)}${kpi("지원", c.applications)}${kpi("취업", c.employment)}${kpi("AI 호출", c.ai_runs)}
    </div>
    <div class="card"><h2>역할 분포</h2><div>${dist(d.by_role)}</div>
      <h2 style="margin-top:14px">취업 고용형태</h2><div>${dist(d.employment_by_type)}</div></div>
    <div class="card"><h2>최근 활동 (전체 기수)</h2><ul class="log">${recent}</ul></div>`;
}

async function paintUsers(pane) {
  pane.innerHTML = `<p class="muted">불러오는 중…</p>`;
  let rows;
  try { rows = await adminUsers(); }
  catch (e) { pane.innerHTML = `<div class="card err">${esc(e.message)}</div>`; return; }
  const roleOpt = (r) => ["", "student", "instructor", "viewer", "admin"]
    .map((v) => `<option value="${v}" ${v === (r || "") ? "selected" : ""}>${v || "(미지정)"}</option>`).join("");
  pane.innerHTML = `
    <div class="card"><div class="scroll-x"><table>
      <tr><th>이메일</th><th>역할</th><th>학생번호</th><th>가입</th><th></th></tr>
      ${rows.map((u) => `
        <tr data-uid="${u.user_id}">
          <td>${esc(u.email)}</td>
          <td><select class="u-role">${roleOpt(u.role)}</select></td>
          <td>${esc(u.student_code || "")}</td>
          <td class="small">${esc((u.created_at || "").slice(0, 10))}</td>
          <td><button class="u-save ghost" type="button">저장</button> <span class="msg u-msg"></span></td>
        </tr>`).join("")}
    </table></div>
    <p class="muted small">역할 변경은 즉시 적용됩니다. student 로 바꾸면 학생번호 연결은 link_student 로 별도.</p></div>`;
  pane.querySelectorAll("tr[data-uid]").forEach((tr) => {
    tr.querySelector(".u-save").onclick = async () => {
      const m = tr.querySelector(".u-msg");
      const role = tr.querySelector(".u-role").value;
      if (!role) { m.className = "msg err"; m.textContent = "역할 선택"; return; }
      try { await setUserRole(tr.dataset.uid, role); m.className = "msg ok"; m.textContent = "저장됨"; }
      catch (e) { m.className = "msg err"; m.textContent = e.message; }
    };
  });
}

async function paintTaxonomy(pane) {
  pane.innerHTML = `<p class="muted">불러오는 중…</p>`;
  let cats, sks, tls;
  try { [cats, sks, tls] = await Promise.all([listJobCategories(), listSkills(), listTools()]); }
  catch (e) { pane.innerHTML = `<div class="card err">${esc(e.message)}</div>`; return; }

  const refTable = (title, table, rows, extraCol) => `
    <div class="card">
      <h2>${title} (${rows.length})</h2>
      <div class="scroll-x"><table>
        <tr><th>id</th><th>이름</th>${extraCol ? "<th>분류</th>" : ""}<th></th></tr>
        ${rows.map((r) => `
          <tr data-id="${esc(r.id)}" data-table="${table}">
            <td class="small">${esc(r.id)}</td>
            <td><input class="r-name" value="${esc(r.name)}" style="width:auto"></td>
            ${extraCol ? `<td><input class="r-cat" value="${esc(r.category || "")}" style="width:80px"></td>` : ""}
            <td><button class="r-save ghost" type="button">저장</button>
                <button class="r-del ghost" type="button">삭제</button></td>
          </tr>`).join("")}
      </table></div>
      <div class="row" style="margin-top:8px">
        <input class="r-new-id" placeholder="새 id (영문)" style="width:auto" data-table="${table}">
        <input class="r-new-name" placeholder="이름" style="width:auto">
        <button class="r-new ghost" type="button" data-table="${table}">추가</button>
      </div>
    </div>`;

  pane.innerHTML = `
    <div class="card">
      <h2>직무 (11 고정)</h2>
      <div class="scroll-x"><table>
        <tr><th>코드</th><th>이름</th><th>정렬</th><th></th></tr>
        ${cats.map((c) => `
          <tr data-code="${esc(c.code)}">
            <td class="small">${esc(c.code)}</td>
            <td><input class="c-name" value="${esc(c.name)}" style="width:auto"></td>
            <td><input class="c-sort" type="number" value="${c.sort_order}" style="width:56px"></td>
            <td><button class="c-save ghost" type="button">저장</button> <span class="msg c-msg"></span></td>
          </tr>`).join("")}
      </table></div>
      <p class="muted small">직무 코드는 enum 고정 — 추가/삭제 불가, 이름·정렬만 수정.</p>
    </div>
    ${refTable("Skill", "skills", sks, false)}
    ${refTable("Tool", "tools", tls, true)}`;

  pane.querySelectorAll("tr[data-code]").forEach((tr) => {
    tr.querySelector(".c-save").onclick = async () => {
      const m = tr.querySelector(".c-msg");
      try {
        await saveJobCategory({ code: tr.dataset.code, name: tr.querySelector(".c-name").value.trim(),
          sort_order: +tr.querySelector(".c-sort").value || 0 });
        m.className = "msg ok"; m.textContent = "저장됨";
      } catch (e) { m.className = "msg err"; m.textContent = e.message; }
    };
  });
  pane.querySelectorAll("tr[data-id]").forEach((tr) => {
    const table = tr.dataset.table;
    tr.querySelector(".r-save").onclick = async () => {
      const row = { id: tr.dataset.id, name: tr.querySelector(".r-name").value.trim() };
      const cat = tr.querySelector(".r-cat"); if (cat) row.category = cat.value.trim() || null;
      try { await saveRef(table, row); paintTaxonomy(pane); } catch (e) { alert(e.message); }
    };
    tr.querySelector(".r-del").onclick = async () => {
      if (!confirm(`${tr.dataset.id} 삭제? (사용 중이면 실패)`)) return;
      try { await deleteRef(table, tr.dataset.id); paintTaxonomy(pane); } catch (e) { alert(e.message); }
    };
  });
  pane.querySelectorAll(".r-new").forEach((btn) => {
    btn.onclick = async () => {
      const box = btn.closest(".row");
      const id = box.querySelector(".r-new-id").value.trim();
      const name = box.querySelector(".r-new-name").value.trim();
      if (!id || !name) return;
      try { await saveRef(btn.dataset.table, { id, name, sort_order: 99 }); paintTaxonomy(pane); }
      catch (e) { alert(e.message); }
    };
  });
}

async function paintCompanies(pane) {
  pane.innerHTML = `<p class="muted">불러오는 중…</p>`;
  let rows;
  try { rows = await listCompanies(); }
  catch (e) { pane.innerHTML = `<div class="card err">${esc(e.message)}</div>`; return; }
  const f = (id) => pane.querySelector("#" + id).value.trim();
  pane.innerHTML = `
    <div class="card">
      <h2>기업 (${rows.length})</h2>
      <div class="row">
        <input id="co-name" placeholder="기업명" style="width:auto">
        <input id="co-ind" placeholder="산업" style="width:auto">
        <input id="co-size" placeholder="규모(대기업/중견/스타트업)" style="width:auto">
        <input id="co-web" placeholder="website" style="width:auto">
        <button id="co-add" type="button">추가</button>
        <span id="co-msg" class="msg"></span>
      </div>
      <div class="scroll-x"><table>
        <tr><th>기업명</th><th>산업</th><th>규모</th><th>web</th><th></th></tr>
        ${rows.map((c) => `<tr data-cid="${c.id}">
          <td><input class="co-e" data-k="name" value="${esc(c.name)}" style="width:auto"></td>
          <td><input class="co-e" data-k="industry" value="${esc(c.industry || "")}" style="width:auto"></td>
          <td><input class="co-e" data-k="size" value="${esc(c.size || "")}" style="width:auto"></td>
          <td><input class="co-e" data-k="website" value="${esc(c.website || "")}" style="width:auto"></td>
          <td><button class="co-save ghost" type="button">저장</button>
              <button class="co-del ghost" type="button">삭제</button></td>
        </tr>`).join("") || `<tr><td colspan="5" class="muted">없음</td></tr>`}
      </table></div>
    </div>`;
  pane.querySelector("#co-add").onclick = async () => {
    const m = pane.querySelector("#co-msg");
    if (!f("co-name")) { m.className = "msg err"; m.textContent = "기업명 필수"; return; }
    try {
      await saveCompany({ name: f("co-name"), industry: f("co-ind") || null,
        size: f("co-size") || null, website: f("co-web") || null });
      paintCompanies(pane);
    } catch (e) { m.className = "msg err"; m.textContent = e.message; }
  };
  pane.querySelectorAll("tr[data-cid]").forEach((tr) => {
    tr.querySelector(".co-save").onclick = async () => {
      const row = { id: tr.dataset.cid };
      tr.querySelectorAll(".co-e").forEach((i) => (row[i.dataset.k] = i.value.trim() || null));
      try { await saveCompany(row); paintCompanies(pane); } catch (e) { alert(e.message); }
    };
    tr.querySelector(".co-del").onclick = async () => {
      if (!confirm("삭제?")) return;
      try { await deleteCompany(tr.dataset.cid); paintCompanies(pane); } catch (e) { alert(e.message); }
    };
  });
}

async function paintConfig(pane) {
  pane.innerHTML = `<p class="muted">불러오는 중…</p>`;
  let mw, rw, rs;
  try { [mw, rw, rs] = await Promise.all([getConfig("matching_weights"), getConfig("readiness_weights"), getConfig("report_settings")]); }
  catch (e) { pane.innerHTML = `<div class="card err">${esc(e.message)}</div>`; return; }

  const block = (id, title, keys, obj) => {
    const sum = keys.reduce((a, [k]) => a + (Number(obj[k]) || 0), 0);
    return `<div class="card" data-cfg="${id}">
      <h2>${title} <span class="muted small" id="${id}-sum">합계 ${sum.toFixed(2)}</span></h2>
      <div class="row">
        ${keys.map(([k, l]) =>
          `<label class="small">${l}
            <input class="w-in" data-k="${k}" type="number" min="0" max="1" step="0.05"
                   value="${obj[k] ?? 0}" style="width:70px"></label>`).join("")}
        <button class="w-save" type="button">저장</button>
        <span class="msg w-msg"></span>
      </div>
      <p class="muted small">합계 1.00 권장 (아니어도 저장됨 — 상대 비중으로 동작)</p>
    </div>`;
  };
  pane.innerHTML =
    block("matching_weights", "Matching 가중치 (8요소)", MATCH_WEIGHT_KEYS, mw || {}) +
    block("readiness_weights", "Readiness 가중치 (5요소)", READINESS_WEIGHT_KEYS, rw || {}) +
    reportSettingsCard(rs || {});
  wireReportSettings(pane, rs || {});

  pane.querySelectorAll("[data-cfg]").forEach((card) => {
    const key = card.dataset.cfg;
    const recalc = () => {
      const s = [...card.querySelectorAll(".w-in")].reduce((a, i) => a + (Number(i.value) || 0), 0);
      card.querySelector("#" + key + "-sum").textContent = "합계 " + s.toFixed(2);
    };
    card.querySelectorAll(".w-in").forEach((i) => (i.oninput = recalc));
    card.querySelector(".w-save").onclick = async () => {
      const m = card.querySelector(".w-msg");
      const val = {};
      card.querySelectorAll(".w-in").forEach((i) => (val[i.dataset.k] = Number(i.value) || 0));
      try { await setConfig(key, val); m.className = "msg ok"; m.textContent = "저장됨 (다음 계산부터 적용)"; }
      catch (e) { m.className = "msg err"; m.textContent = e.message; }
    };
  });
}

async function paintAi(pane) {
  pane.innerHTML = `<p class="muted">불러오는 중…</p>`;
  let rows;
  try { rows = await listAiRuns(); }
  catch (e) { pane.innerHTML = `<div class="card err">${esc(e.message)}</div>`; return; }
  pane.innerHTML = `
    <div class="card"><h2>AI 실행 로그 (${rows.length})</h2><div class="scroll-x"><table>
      <tr><th>일시</th><th>에이전트</th><th>신뢰도</th><th>모델</th><th>입력요약</th></tr>
      ${rows.map((r) => `<tr>
        <td class="small">${esc((r.created_at || "").slice(0, 16).replace("T", " "))}</td>
        <td>${esc(r.agent)}</td>
        <td>${r.confidence == null ? "-" : Math.round(r.confidence * 100) + "%"}</td>
        <td class="small">${esc(r.model_version || "")}</td>
        <td class="small">${esc((r.input_summary || "").slice(0, 60))}</td>
      </tr>`).join("") || `<tr><td colspan="5" class="muted">없음</td></tr>`}
    </table></div></div>`;
}

/* ---------- 성과보고 기준 설정 (기관 확인 후 입력 — 확정 전에는 보고서에 「자료보완 필요」 표시) ---------- */
const ALL_EMP_TYPES = ["정규직", "계약직", "인턴", "프리랜서", "기타"];
const DENOMS = { target: "보고 대상자 (기본)", completed: "수료자", enrolled: "재적자 (중도탈락 제외)" };

function reportSettingsCard(c) {
  const types = c.recognized_employment_types || ALL_EMP_TYPES;
  return `<div class="card" data-rs="1">
    <h2>성과보고 기준 <span class="badge">${c.criteria_confirmed ? "기관 기준 확정" : "기관 기준 미확정"}</span></h2>
    <p class="muted small">취업률 분모와 인정 고용형태는 기관(공동훈련센터) 지침을 확인한 뒤 확정하세요. 확정 전에는 모든 보고서에 「자료보완 필요」가 표시됩니다.</p>
    <div class="row">
      <label class="small">취업률 분모
        <select id="rs-denom">${Object.entries(DENOMS).map(([k, v]) =>
          `<option value="${k}" ${k === (c.employment_rate_denominator || "target") ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label class="small">성과 기준일수 (수료일 + N일)
        <input id="rs-days" type="number" min="1" max="730" value="${Number(c.outcome_days) || 90}" style="width:90px"></label>
      <label class="small">지원 후 미확인 알림 (일)
        <input id="rs-stale" type="number" min="1" max="90" value="${Number(c.stale_application_days) || 14}" style="width:90px"></label>
    </div>
    <div class="row"><span class="small muted">인정 고용형태</span>
      ${ALL_EMP_TYPES.map((t) => `<label class="chk"><input type="checkbox" class="rs-type" value="${t}" ${types.includes(t) ? "checked" : ""}> ${t}</label>`).join("")}
    </div>
    <div class="row">
      <input id="rs-inst" placeholder="기관명 (보고서 표기)" value="${esc(c.institution_name || "")}">
      <input id="rs-prog" placeholder="과정명" value="${esc(c.program_name || "")}">
    </div>
    <label class="chk"><input type="checkbox" id="rs-ok" ${c.criteria_confirmed ? "checked" : ""}>
      기관 취업 인정기준과 취업률 분모를 <b>확인했으며 위 설정이 맞습니다</b></label>
    <div class="row"><button id="rs-save" type="button">저장</button><span id="rs-msg" class="msg"></span></div>
  </div>`;
}

function wireReportSettings(pane, current) {
  const card = pane.querySelector("[data-rs]");
  const g = (sel) => card.querySelector(sel);
  g("#rs-save").onclick = async () => {
    const m = g("#rs-msg");
    const types = [...card.querySelectorAll(".rs-type:checked")].map((i) => i.value);
    if (!types.length) { m.className = "msg err"; m.textContent = "인정 고용형태를 1개 이상 선택하세요"; return; }
    const val = {
      ...current,                                            // 알 수 없는 기존 키는 보존
      employment_rate_denominator: g("#rs-denom").value,
      outcome_days: Number(g("#rs-days").value) || 90,
      stale_application_days: Number(g("#rs-stale").value) || 14,
      recognized_employment_types: types,
      institution_name: g("#rs-inst").value.trim(),
      program_name: g("#rs-prog").value.trim(),
      criteria_confirmed: g("#rs-ok").checked,
    };
    try { await setConfig("report_settings", val); m.className = "msg ok"; m.textContent = "저장됨 (다음 보고서 생성부터 적용)"; }
    catch (e) { m.className = "msg err"; m.textContent = e.message; }
  };
}
