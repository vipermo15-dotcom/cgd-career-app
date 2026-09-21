import { signOut } from "../auth.js";
import { DEFAULT_COHORT_ID } from "../config.js";
import {
  getDashboard, listStudents, getStudentDetail, updateStudent,
  updateArtifact, addFeedback, importRoster, listCohorts, createCohort, getCohortExport,
  getKPI, listApplications, addApplication, updateApplication, deleteApplication,
  getEmployment, setEmployment, getPreferences, savePreferences,
  listJobPostings, saveJobPosting, deleteJobPosting, analyzeJobPosting,
  getTopMatches, getGap,
  STAGES, STATUS, ARTIFACT_TYPES,
  APPLICATION_STATUS, JOB_CATEGORIES, EMPLOYMENT_TYPES, GRADE_CLASS,
} from "../data.js";
import { paintWeekly, paintFollowups, paintReport, renderStudentOps } from "./ops.js";
import { renderSkillBlock } from "../skillblock.js";
import { renderCoach } from "../coach.js";
import { renderPortfolioReview } from "../pfreview.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const artMark = { "완료": "✅", "진행": "⏳", "미확인": "⬜" };

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const toCSV = (headers, rows) =>
  [headers.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");

function downloadText(filename, text) {
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function exportCohortCSV(cohortId, cohortName) {
  const { students, feedback } = await getCohortExport(cohortId);
  const fbByStudent = {};
  for (const f of feedback) (fbByStudent[f.student_id] ||= []).push(f);
  const headers = ["번호", "트랙", "단계", "상태", "비고",
    ...ARTIFACT_TYPES, "피드백수", "최근피드백"];
  const rows = students.map((s) => {
    const art = (t) => ((s.artifacts || []).find((a) => a.type === t) || {}).status || "미확인";
    const fbs = fbByStudent[s.id] || [];
    const last = fbs[0] ? `[${fbs[0].author}] ${fbs[0].body}` : "";
    return [s.code, s.track || "", s.stage, STATUS[s.status] || s.status, s.note || "",
      ...ARTIFACT_TYPES.map(art), fbs.length, last];
  });
  const today = new Date().toISOString().slice(0, 10);
  downloadText(`취업현황_${cohortName || cohortId}_${today}.csv`, toCSV(headers, rows));
}

const LS_KEY = "active_cohort";
const lsGet = () => { try { return localStorage.getItem(LS_KEY); } catch { return null; } };
const lsSet = (v) => { try { localStorage.setItem(LS_KEY, v); } catch {} };

let IS_ADMIN = false;   // 취업 확정(검증) 버튼 노출용 — 실제 권한은 서버 트리거가 강제

export async function renderInstructor(el, { session, profile }) {
  IS_ADMIN = profile?.role === "admin";
  el.innerHTML = `
    <header class="topbar">
      <strong>강사 대시보드</strong>
      <span class="muted small">${esc(session.user.email)}</span>
      <button id="so" class="ghost">로그아웃</button>
    </header>
    <div id="cohortbar" class="cohortbar"></div>
    <nav class="tabs">
      <button data-tab="summary" class="on">현황</button>
      <button data-tab="weekly">주차현황</button>
      <button data-tab="kpi">실적</button>
      <button data-tab="students">학생</button>
      <button data-tab="followup">사후관리</button>
      <button data-tab="report">성과보고</button>
      <button data-tab="postings">공고</button>
      <button data-tab="roster">명단</button>
    </nav>
    <section id="pane"><p class="muted">불러오는 중…</p></section>`;
  el.querySelector("#so").onclick = signOut;

  const pane = el.querySelector("#pane");
  const bar = el.querySelector("#cohortbar");
  const tabs = [...el.querySelectorAll(".tabs button")];
  let cohort = null;

  const show = (name) => {
    if (!cohort) return;
    tabs.forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
    if (name === "summary") paintSummary(pane, cohort);
    if (name === "weekly") paintWeekly(pane, cohort);
    if (name === "followup") paintFollowups(pane, cohort);
    if (name === "report") paintReport(pane, cohort);
    if (name === "kpi") paintKPI(pane, cohort);
    if (name === "students") paintStudents(pane, cohort);
    if (name === "postings") paintPostings(pane);
    if (name === "roster") paintRoster(pane, cohort);
  };
  tabs.forEach((b) => (b.onclick = () => show(b.dataset.tab)));

  async function refreshCohortBar() {
    let list = [];
    try { list = await listCohorts(); }
    catch (e) { bar.innerHTML = `<span class="msg err">기수 로드 실패: ${esc(e.message)}</span>`; return; }
    if (!list.length) {
      cohort = null;
      bar.innerHTML = `<span class="muted">기수 없음</span> <button id="c-new" class="ghost">+ 새 기수</button>`;
      bar.querySelector("#c-new").onclick = () => cohortForm(bar, refreshCohortBar);
      pane.innerHTML = `<div class="card"><p class="muted">먼저 기수를 만드세요. 그 뒤 명단 탭에서 학생을 가져옵니다.</p></div>`;
      return;
    }
    const saved = lsGet() || DEFAULT_COHORT_ID;
    cohort = list.some((c) => c.id === saved) ? saved : list[0].id;
    lsSet(cohort);
    const opts = list.map((c) =>
      `<option value="${c.id}" ${c.id === cohort ? "selected" : ""}>${esc(c.name)} · 수료 ${esc(c.completion_date)}</option>`).join("");
    const cname = () => (list.find((c) => c.id === cohort) || {}).name || "";
    bar.innerHTML = `
      <label>기수 <select id="c-sel">${opts}</select></label>
      <button id="c-new" class="ghost">+ 새 기수</button>
      <button id="c-export" class="ghost">CSV 내보내기</button>
      <span id="c-msg" class="msg"></span>`;
    bar.querySelector("#c-sel").onchange = (e) => { cohort = e.target.value; lsSet(cohort); show(currentTab()); };
    bar.querySelector("#c-new").onclick = () => cohortForm(bar, refreshCohortBar);
    bar.querySelector("#c-export").onclick = async (e) => {
      const msg = bar.querySelector("#c-msg");
      e.target.disabled = true; msg.className = "msg"; msg.textContent = "";
      try { await exportCohortCSV(cohort, cname()); msg.className = "msg ok"; msg.textContent = "내려받음"; }
      catch (err) { msg.className = "msg err"; msg.textContent = err.message; }
      e.target.disabled = false;
    };
    show(currentTab());
  }
  const currentTab = () => (tabs.find((b) => b.classList.contains("on")) || tabs[0]).dataset.tab;

  await refreshCohortBar();
}

async function cohortForm(bar, done) {
  const box = document.createElement("div");
  box.className = "card cform";
  box.innerHTML = `
    <h2>새 기수</h2>
    <div class="row">
      <label>이름 <input id="cf-name" placeholder="2026 중부캠퍼스 컴그"></label>
      <label>수료일 <input id="cf-date" type="date"></label>
      <label>대상 인원 <input id="cf-n" type="number" min="0" value="0" style="width:80px"></label>
      <button id="cf-save">만들기</button>
      <button id="cf-cancel" class="ghost">취소</button>
      <span id="cf-msg" class="msg"></span>
    </div>`;
  bar.after(box);
  box.querySelector("#cf-cancel").onclick = () => box.remove();
  box.querySelector("#cf-save").onclick = async (e) => {
    const msg = box.querySelector("#cf-msg");
    const name = box.querySelector("#cf-name").value.trim();
    const date = box.querySelector("#cf-date").value;
    const n = +box.querySelector("#cf-n").value || 0;
    if (!name || !date) { msg.className = "msg err"; msg.textContent = "이름·수료일 필수"; return; }
    e.target.disabled = true;
    try {
      const c = await createCohort({ name, completion_date: date, target_count: n });
      lsSet(c.id);
      box.remove();
      done();
    } catch (err) { msg.className = "msg err"; msg.textContent = err.message; e.target.disabled = false; }
  };
}

/* ---------- 현황 ---------- */
async function paintSummary(pane, cohort) {
  pane.innerHTML = `<p class="muted">불러오는 중…</p>`;
  let d;
  try { d = await getDashboard(cohort); }
  catch (e) { pane.innerHTML = `<div class="card err">현황 로드 실패: ${esc(e.message)}</div>`; return; }

  const dist = (obj, map) => Object.entries(obj || {})
    .map(([k, v]) => `<span class="badge">${esc(map ? (map[k] || k) : k)} ${v}</span>`).join(" ");
  const paceRows = (d.pace || []).map((p) => {
    const behind = p.done < p.total && p.d <= 3;
    return `<tr class="${behind ? "warn" : ""}">
      <td>${esc(p.milestone)}</td><td>${esc(p.target_date)}</td>
      <td>D${p.d >= 0 ? "-" + p.d : "+" + -p.d}</td>
      <td>${p.done} / ${p.total}</td></tr>`;
  }).join("");
  const arts = ARTIFACT_TYPES.map((t) => {
    const a = (d.artifacts || {})[t] || {};
    return `<tr><td>${t}</td><td>${a["완료"] || 0}</td><td>${a["진행"] || 0}</td><td>${a["미확인"] || 0}</td></tr>`;
  }).join("");
  const gates = (d.gate_waiting || []).map((g) =>
    `<li><b>${esc(g.code)}</b> · ${esc(STATUS[g.status] || g.status)} · ${esc(g.stage)}<br>
     <span class="muted small">${esc(g.note || "")}</span></li>`).join("") || "<li class='muted'>없음</li>";

  pane.innerHTML = `
    <div class="grid">
      <div class="card kpi"><span>D-day</span><b>D-${d.cohort.d_day}</b>
        <span class="muted small">수료 ${esc(d.cohort.completion_date)}</span></div>
      <div class="card kpi"><span>등록 / 대상</span><b>${d.cohort.enrolled} / ${d.cohort.target_count}</b></div>
    </div>
    <div class="card"><h2>단계 분포</h2><div>${dist(d.stage_dist)}</div>
      <h2 style="margin-top:14px">상태 분포</h2><div>${dist(d.status_dist, STATUS)}</div></div>
    <div class="card"><h2>D-day 페이스</h2><div class="scroll-x"><table>
      <tr><th>마일스톤</th><th>목표일</th><th>D</th><th>달성</th></tr>${paceRows}</table></div></div>
    <div class="card"><h2>아티팩트 완료율</h2><div class="scroll-x"><table>
      <tr><th>종류</th><th>완료</th><th>진행</th><th>미확인</th></tr>${arts}</table></div></div>
    <div class="card"><h2>게이트 대기 (지연·불일치)</h2><ul class="gates">${gates}</ul></div>
    <p class="muted small">생성 ${esc(d.generated_at)}</p>`;
}

/* ---------- 실적 (지원 퍼널 + KPI) ---------- */
async function paintKPI(pane, cohort) {
  pane.innerHTML = `<p class="muted">불러오는 중…</p>`;
  let k;
  try { k = await getKPI(cohort); }
  catch (e) { pane.innerHTML = `<div class="card err">실적 로드 실패: ${esc(e.message)}</div>`; return; }

  const f = k.funnel, r = k.rates;
  const steps = [
    ["관심", f.interested], ["지원", f.applied], ["서류합격", f.document_pass],
    ["면접", f.interview], ["최종합격", f.final_pass], ["취업", f.employed],
  ];
  const maxN = Math.max(1, ...steps.map((s) => s[1]));
  const funnelRows = steps.map(([label, n]) => `
    <div class="fn-row">
      <span class="fn-label">${label}</span>
      <span class="fn-bar" style="width:${Math.round((n / maxN) * 100)}%"></span>
      <span class="fn-n">${n}</span>
    </div>`).join("");

  const rate = (v) => (v == null ? "—" : v + "%");
  const cat = (k.by_category || []).map((c) => `
    <tr><td>${esc(JOB_CATEGORIES[c.code] || c.code)}</td>
      <td>${c.applied}</td><td>${c.final_pass}</td><td>${c.employed}</td></tr>`).join("")
    || `<tr><td colspan="4" class="muted">데이터 없음</td></tr>`;
  const recent = (k.recent || []).map((e) => `
    <li class="small"><span class="muted">${esc((e.at || "").slice(0, 16).replace("T", " "))}</span>
      · ${esc(e.actor)} · ${esc(e.detail || e.action)}</li>`).join("")
    || "<li class='muted'>활동 없음</li>";

  pane.innerHTML = `
    <div class="grid">
      <div class="card kpi"><span>취업</span><b>${f.employed} / ${k.students}</b>
        <span class="muted small">취업률 ${rate(r.employment_rate)}</span></div>
      <div class="card kpi"><span>지원 활동 학생</span><b>${f.active_students}</b>
        <span class="muted small">총 지원 ${f.total_applications}건</span></div>
    </div>
    <div class="card"><h2>취업 퍼널</h2><div class="funnel">${funnelRows}</div>
      <p class="muted small">불합격·취소 ${f.rejected}건</p></div>
    <div class="card"><h2>전환율</h2><div class="scroll-x"><table>
      <tr><th>지원→서류합격</th><th>서류→면접</th><th>면접→최종</th><th>취업률</th></tr>
      <tr><td>${rate(r.apply_to_doc_pass)}</td><td>${rate(r.doc_to_interview)}</td>
          <td>${rate(r.interview_to_final)}</td><td>${rate(r.employment_rate)}</td></tr>
    </table></div></div>
    <div class="card"><h2>직무별</h2><div class="scroll-x"><table>
      <tr><th>직무</th><th>지원</th><th>최종합격</th><th>취업</th></tr>${cat}</table></div></div>
    <div class="card"><h2>최근 지원 활동</h2><ul class="log">${recent}</ul></div>
    <p class="muted small">지원 건 추가·수정은 <b>학생 탭 → 학생 상세</b>에서.</p>`;
}

/* ---------- 채용공고 ---------- */
const dState = (deadline) => {
  if (!deadline) return "";
  const d = Math.ceil((new Date(deadline) - new Date()) / 86400000);
  if (d < 0) return "마감";
  return "D-" + d;
};

async function paintPostings(pane) {
  pane.innerHTML = `<p class="muted">불러오는 중…</p>`;
  let rows;
  try { rows = await listJobPostings(); }
  catch (e) { pane.innerHTML = `<div class="card err">${esc(e.message)}</div>`; return; }

  const tr = rows.map((p) => `
    <tr data-pid="${p.id}">
      <td>${esc(p.company)}</td>
      <td>${esc(p.title)}</td>
      <td>${esc(JOB_CATEGORIES[p.job_category] || p.job_category || "")}</td>
      <td>${esc(p.deadline || "")} <span class="muted small">${dState(p.deadline)}</span></td>
      <td>${esc(p.status)}</td>
      <td><button class="pe ghost" type="button">편집</button>
          <button class="pd ghost" type="button">삭제</button></td>
    </tr>`).join("") || `<tr><td colspan="6" class="muted">공고 없음</td></tr>`;

  pane.innerHTML = `
    <div class="card">
      <div class="dhead"><h2>채용공고 (${rows.length})</h2>
        <button id="p-new" class="ghost">+ 공고 추가</button></div>
      <div class="scroll-x"><table class="rowlink">
        <tr><th>기업</th><th>공고명</th><th>분류</th><th>마감</th><th>상태</th><th></th></tr>${tr}
      </table></div>
    </div>
    <div id="p-form"></div>`;

  pane.querySelector("#p-new").onclick = () => postingForm(pane.querySelector("#p-form"), {}, () => paintPostings(pane));
  pane.querySelectorAll("tr[data-pid]").forEach((row) => {
    const p = rows.find((x) => x.id === row.dataset.pid);
    row.querySelector(".pe").onclick = () => postingForm(pane.querySelector("#p-form"), p, () => paintPostings(pane));
    row.querySelector(".pd").onclick = async () => {
      if (!confirm(`"${p.company} · ${p.title}" 공고를 삭제할까요?`)) return;
      await deleteJobPosting(p.id);
      paintPostings(pane);
    };
  });
}

function postingForm(host, p, done) {
  const catOpt = `<option value="">분류-</option>` + Object.entries(JOB_CATEGORIES)
    .map(([k, v]) => `<option value="${k}" ${k === p.job_category ? "selected" : ""}>${k} · ${v}</option>`).join("");
  const etOpt = `<option value="">고용형태-</option>` + EMPLOYMENT_TYPES
    .map((t) => `<option ${t === p.employment_type ? "selected" : ""}>${t}</option>`).join("");
  const stOpt = ["DRAFT", "ACTIVE", "CLOSED"]
    .map((s) => `<option ${s === (p.status || "ACTIVE") ? "selected" : ""}>${s}</option>`).join("");
  host.innerHTML = `
    <div class="card cform">
      <h2>${p.id ? "공고 편집" : "새 공고"}</h2>
      ${p.id ? "" : `
      <textarea id="pf-raw" rows="4" placeholder="채용공고 원문을 붙여넣고 'AI 분석' → 아래 폼 자동 채움"></textarea>
      <div class="row"><button id="pf-ai" class="ghost" type="button">AI 분석</button>
        <span id="pf-ai-msg" class="msg"></span></div>`}
      <div class="row">
        <input id="pf-company" placeholder="기업명" value="${esc(p.company || "")}">
        <input id="pf-title" placeholder="공고명" value="${esc(p.title || "")}">
        <select id="pf-cat">${catOpt}</select>
        <select id="pf-et">${etOpt}</select>
        <select id="pf-status">${stOpt}</select>
      </div>
      <div class="row">
        <input id="pf-loc" placeholder="지역" value="${esc(p.location || "")}">
        <input id="pf-exp" placeholder="경력(신입/경력2년/무관)" value="${esc(p.experience_level || "")}">
        <input id="pf-salary" placeholder="급여" value="${esc(p.salary || "")}">
        <label class="small">마감 <input id="pf-deadline" type="date" value="${esc(p.deadline || "")}"></label>
        <label class="small"><input id="pf-portfolio" type="checkbox" ${p.portfolio_required !== false ? "checked" : ""}> 포트폴리오 필수</label>
      </div>
      <textarea id="pf-desc" rows="2" placeholder="담당업무 / 원문">${esc(p.description || "")}</textarea>
      <textarea id="pf-req" rows="2" placeholder="자격요건">${esc(p.requirements || "")}</textarea>
      <textarea id="pf-pref" rows="2" placeholder="우대사항">${esc(p.preferred || "")}</textarea>
      <div class="row">
        <input id="pf-skills" placeholder="required_skills (쉼표: branding,typography)" value="${esc((p.required_skills || []).join(","))}">
        <input id="pf-tools" placeholder="required_tools (쉼표: photoshop,figma)" value="${esc((p.required_tools || []).join(","))}">
        <input id="pf-source" placeholder="출처" value="${esc(p.source || "")}">
        <input id="pf-url" placeholder="URL" value="${esc(p.url || "")}">
      </div>
      <div class="row">
        <button id="pf-save">저장</button>
        <button id="pf-cancel" class="ghost" type="button">취소</button>
        <span id="pf-msg" class="msg"></span>
      </div>
    </div>`;
  host.querySelector("#pf-cancel").onclick = () => (host.innerHTML = "");

  const aiBtn = host.querySelector("#pf-ai");
  if (aiBtn) aiBtn.onclick = async () => {
    const msg = host.querySelector("#pf-ai-msg");
    const raw = host.querySelector("#pf-raw").value.trim();
    if (raw.length < 20) { msg.className = "msg err"; msg.textContent = "원문 20자 이상"; return; }
    aiBtn.disabled = true; msg.className = "msg"; msg.textContent = "분석 중…";
    try {
      const res = await analyzeJobPosting(raw);
      const r = res.result || {};
      const set = (id, v) => { const el = host.querySelector("#pf-" + id); if (el != null && v != null) el.value = v; };
      set("company", r.company); set("title", r.title);
      set("loc", r.location); set("exp", r.experience_level); set("salary", r.salary);
      set("deadline", r.deadline); set("desc", r.description);
      set("req", r.requirements); set("pref", r.preferred);
      set("skills", (r.required_skills || []).join(","));
      set("tools", (r.required_tools || []).join(","));
      if (r.job_category) host.querySelector("#pf-cat").value = r.job_category;
      if (r.employment_type) host.querySelector("#pf-et").value = r.employment_type;
      host.querySelector("#pf-portfolio").checked = r.portfolio_required !== false;
      const w = (res.warnings || []).length ? ` · 확인: ${res.warnings.join(", ")}` : "";
      msg.className = "msg ok";
      msg.textContent = `채움 완료 (신뢰도 ${Math.round((res.confidence || 0) * 100)}%)${w}`;
    } catch (err) { msg.className = "msg err"; msg.textContent = err.message; }
    aiBtn.disabled = false;
  };

  host.querySelector("#pf-save").onclick = async (e) => {
    const msg = host.querySelector("#pf-msg");
    const g = (id) => host.querySelector("#pf-" + id).value.trim();
    const arr = (id) => g(id).split(",").map((x) => x.trim()).filter(Boolean);
    if (!g("company") || !g("title")) { msg.className = "msg err"; msg.textContent = "기업명·공고명 필수"; return; }
    e.target.disabled = true;
    try {
      await saveJobPosting({
        ...(p.id ? { id: p.id } : {}),
        company: g("company"), title: g("title"),
        job_category: g("cat") || null, employment_type: g("et") || null,
        status: host.querySelector("#pf-status").value,
        location: g("loc") || null, experience_level: g("exp") || null, salary: g("salary") || null,
        deadline: g("deadline") || null,
        portfolio_required: host.querySelector("#pf-portfolio").checked,
        description: g("desc") || null, requirements: g("req") || null, preferred: g("pref") || null,
        required_skills: arr("skills"), required_tools: arr("tools"),
        source: g("source") || null, url: g("url") || null,
      });
      host.innerHTML = ""; done();
    } catch (err) { msg.className = "msg err"; msg.textContent = err.message; e.target.disabled = false; }
  };
}

/* 학생별 다음 액션 자동 산출 (클로드 스킬 파이프라인과 동일 규칙) */
function nextAction(s) {
  const idx = STAGES.indexOf(s.stage);
  const done = (t) => ((s.artifacts || []).find((a) => a.type === t) || {}).status === "완료";
  if (s.status === "placed" || s.stage === "졸업") return { label: "완료 (취업 확정)", trig: "" };
  if (s.status === "data_mismatch") return { label: "데이터 불일치 원인 확인", trig: "수기" };
  if (idx < STAGES.indexOf("진로지도")) return { label: "진로지도 진행", trig: '"진로지도 시작"' };
  if (idx < STAGES.indexOf("채용공고분석")) return { label: "채용공고 분석", trig: '"채용공고 분석하자"' };
  if (idx < STAGES.indexOf("포폴가이드")) return { label: "포폴 구성", trig: '"포트폴리오 가이드 시작"' };
  if (idx < STAGES.indexOf("첨삭")) {
    if (!done("이력서") || !done("자기소개서")) return { label: "이력서·자소서 마감", trig: "작성" };
    return { label: "포트폴리오 첨삭", trig: '"포트폴리오 첨삭하자"' };
  }
  const miss = ARTIFACT_TYPES.filter((t) => !done(t));
  if (miss.length) return { label: "아티팩트 마감: " + miss.join("·"), trig: "제작" };
  return { label: "지원·마무리", trig: "" };
}

/* ---------- 학생 목록 + 상세 ---------- */
async function paintStudents(pane, cohort) {
  pane.innerHTML = `<p class="muted">불러오는 중…</p>`;
  let rows;
  try { rows = await listStudents(cohort); }
  catch (e) { pane.innerHTML = `<div class="card err">${esc(e.message)}</div>`; return; }

  const artCell = (arr) => ARTIFACT_TYPES.map((t) => {
    const hit = (arr || []).find((a) => a.type === t);
    return artMark[hit?.status || "미확인"];
  }).join(" ");

  // 번호순 고정 — 상태·위험도 기준 학생 정렬(순위화)은 하지 않음 (STEP 13 금지사항)
  const sorted = [...rows].sort((a, b) => a.code.localeCompare(b.code));

  const tr = sorted.map((r) => {
    const na = nextAction(r);
    const hot = r.status === "delayed" || r.status === "data_mismatch";
    return `
    <tr data-id="${r.id}" class="${hot ? "warn" : ""}">
      <td><b>${esc(r.code)}</b></td>
      <td>${esc(r.track || "")}</td>
      <td>${esc(r.stage)}</td>
      <td>${esc(STATUS[r.status] || r.status)}</td>
      <td class="small">${artCell(r.artifacts)}</td>
      <td class="small">${esc(na.label)}${na.trig ? ` <span class="muted">${esc(na.trig)}</span>` : ""}</td>
    </tr>`;
  }).join("");

  const todo = sorted.filter((r) => r.status === "delayed" || r.status === "data_mismatch" || r.status === "check");
  const todoList = todo.map((r) => {
    const na = nextAction(r);
    return `<li><b>${esc(r.code)}</b> (${esc(STATUS[r.status] || r.status)}) → ${esc(na.label)}
      ${na.trig ? `<span class="muted small">${esc(na.trig)}</span>` : ""}</li>`;
  }).join("") || "<li class='muted'>없음</li>";

  pane.innerHTML = `
    <div class="card"><h2>확인 필요 (${todo.length}명 · 번호순)</h2><ul class="gates">${todoList}</ul></div>
    <div class="card"><div class="scroll-x"><table class="rowlink">
      <tr><th>번호</th><th>트랙</th><th>단계</th><th>상태</th>
          <th class="small">이력·자소·PDF·랜딩·피그마</th><th>다음 액션</th></tr>
      ${tr}
    </table></div></div>
    <div id="detail"></div>`;

  pane.querySelectorAll("tr[data-id]").forEach((row) => {
    row.onclick = () => openDetail(pane.querySelector("#detail"), row.dataset.id, () => paintStudents(pane, cohort));
  });
}

const catOpts = (sel) => `<option value="">직무-</option>` +
  Object.entries(JOB_CATEGORIES).map(([k, v]) =>
    `<option value="${k}" ${k === sel ? "selected" : ""}>${v}</option>`).join("");
const appStatusOpts = (sel) => Object.entries(APPLICATION_STATUS).map(([k, v]) =>
  `<option value="${k}" ${k === sel ? "selected" : ""}>${v}</option>`).join("");

async function openDetail(host, id, refresh) {
  host.innerHTML = `<div class="card"><p class="muted">불러오는 중…</p></div>`;
  let d, apps, emp, prefs, matches;
  try {
    [d, apps, emp, prefs, matches] = await Promise.all([
      getStudentDetail(id), listApplications(id), getEmployment(id), getPreferences(id), getTopMatches(id),
    ]);
  } catch (e) { host.innerHTML = `<div class="card err">${esc(e.message)}</div>`; return; }
  const s = d.student;
  const prefByRank = {}; (prefs || []).forEach((p) => (prefByRank[p.rank] = p.category_code));
  const prefOpts = (sel) => `<option value="">(없음)</option>` +
    Object.entries(JOB_CATEGORIES).map(([k, v]) =>
      `<option value="${k}" ${k === sel ? "selected" : ""}>${k} · ${v}</option>`).join("");

  const stageOpts = STAGES.map((v) => `<option ${v === s.stage ? "selected" : ""}>${v}</option>`).join("");
  const statusOpts = Object.entries(STATUS).map(([k, label]) =>
    `<option value="${k}" ${k === s.status ? "selected" : ""}>${label}</option>`).join("");
  const artList = (s.artifacts || []).sort((a, b) =>
    ARTIFACT_TYPES.indexOf(a.type) - ARTIFACT_TYPES.indexOf(b.type)).map((a) => `
    <tr data-art="${a.id}">
      <td>${esc(a.type)}</td>
      <td><select class="a-status">
        ${["미확인", "진행", "완료"].map((v) => `<option ${v === a.status ? "selected" : ""}>${v}</option>`).join("")}
      </select></td>
      <td><input class="a-url" value="${esc(a.external_url || "")}" placeholder="링크(랜딩·피그마)"></td>
    </tr>`).join("");
  const fbList = d.feedback.map((f) => `
    <li><b>${esc(f.author)}</b> <span class="muted small">${esc(f.stage || "")} · ${esc(f.created_at?.slice(0, 10))}</span>
    <div>${esc(f.body)}</div></li>`).join("") || "<li class='muted'>피드백 없음</li>";
  const logList = d.activity.map((l) =>
    `<li class="small"><span class="muted">${esc(l.created_at?.slice(0, 16).replace("T", " "))}</span>
     · ${esc(l.actor)} · ${esc(l.action)} ${l.detail ? "— " + esc(l.detail) : ""}</li>`).join("")
    || "<li class='muted'>이력 없음</li>";

  host.innerHTML = `
    <div class="card detail">
      <div class="dhead"><h2>${esc(s.code)} · ${esc(s.track || "")}</h2>
        <button id="dclose" class="ghost">닫기</button></div>
      <div class="row">
        <label>단계 <select id="d-stage">${stageOpts}</select></label>
        <label>상태 <select id="d-status">${statusOpts}</select></label>
        <button id="d-save">저장</button>
        <span id="d-msg" class="msg"></span>
      </div>
      <p class="muted small">${esc(s.note || "")}</p>

      <h2>희망 직무</h2>
      <div class="row">
        <label class="small">1 <select id="pf1" style="width:auto">${prefOpts(prefByRank[1])}</select></label>
        <label class="small">2 <select id="pf2" style="width:auto">${prefOpts(prefByRank[2])}</select></label>
        <label class="small">3 <select id="pf3" style="width:auto">${prefOpts(prefByRank[3])}</select></label>
        <button id="pf-save" class="ghost">저장</button>
        <span id="pf-msg" class="msg"></span>
      </div>

      <h2>아티팩트</h2>
      <div class="scroll-x"><table>
        <tr><th>종류</th><th>상태</th><th>링크</th></tr>${artList}
      </table></div>
      <button id="a-save" class="ghost">아티팩트 저장</button>
      <span id="a-msg" class="msg"></span>

      <div id="i-skillblock"></div>

      <h2>매칭 · GAP (${(matches || []).length})</h2>
      <div class="scroll-x"><table>
        <tr><th>등급</th><th>기업</th><th>공고명</th><th></th></tr>
        ${(matches || []).slice(0, 6).map((m) => `
          <tr data-mpid="${m.posting_id}">
            <td><span class="grade ${GRADE_CLASS[m.grade] || ""}">${m.grade} ${Math.round(m.total)}</span>
                <span class="muted small">${esc(m.grade_label)}</span></td>
            <td>${esc(m.company)}</td><td>${esc(m.title)}</td>
            <td><button class="im-gap ghost" type="button">GAP</button></td>
          </tr>`).join("") || `<tr><td colspan="4" class="muted">ACTIVE 공고 없음</td></tr>`}
      </table></div>
      <div id="i-gapbox"></div>

      <div id="i-pfreviewbox"></div>

      <div id="i-coachbox"></div>

      <h2>지원 현황 (${apps.length})</h2>
      <div class="scroll-x"><table>
        <tr><th>회사</th><th>직무명</th><th>분류</th><th>상태</th><th>지원일</th><th></th></tr>
        ${apps.map((a) => `
          <tr data-app="${a.id}">
            <td>${esc(a.company)}</td>
            <td>${esc(a.position || "")}</td>
            <td><select class="ap-cat">${catOpts(a.job_category)}</select></td>
            <td><select class="ap-status">${appStatusOpts(a.status)}</select></td>
            <td><input class="ap-date" type="date" value="${esc(a.applied_at || "")}"></td>
            <td><button class="ap-del ghost" type="button">삭제</button></td>
          </tr>`).join("") || `<tr><td colspan="6" class="muted">지원 내역 없음</td></tr>`}
      </table></div>
      <button id="ap-save" class="ghost">지원 현황 저장</button>
      <span id="ap-msg" class="msg"></span>
      <div class="row" style="margin-top:10px">
        <input id="na-company" placeholder="회사명" style="width:auto">
        <input id="na-pos" placeholder="직무명" style="width:auto">
        <select id="na-cat" style="width:auto">${catOpts("")}</select>
        <select id="na-status" style="width:auto">${appStatusOpts("INTERESTED")}</select>
        <input id="na-date" type="date" style="width:auto">
        <button id="na-add" type="button">지원 추가</button>
      </div>

      <h2>취업 확정</h2>
      <div class="row">
        <input id="em-company" placeholder="취업처" value="${esc(emp?.company || "")}" style="width:auto">
        <input id="em-pos" placeholder="직무명" value="${esc(emp?.position || "")}" style="width:auto">
        <select id="em-cat" style="width:auto">${catOpts(emp?.job_category)}</select>
        <select id="em-type" style="width:auto">
          ${EMPLOYMENT_TYPES.map((t) => `<option ${t === emp?.employment_type ? "selected" : ""}>${t}</option>`).join("")}
        </select>
        <label class="small">입사일 <input id="em-date" type="date" value="${esc(emp?.hire_date || "")}" style="width:auto"></label>
        <button id="em-save">${emp ? "수정" : "확정"}</button>
        <span id="em-msg" class="msg"></span>
      </div>
      <p class="muted small">등록만으로는 확정되지 않습니다. 관리자가 증빙을 확인해 검증하면 "취업 확정 · 졸업"으로 바뀝니다.</p>
      <div id="i-ops"></div>

      <h2>피드백 추가</h2>
      <div class="row">
        <select id="f-author"><option>강사</option><option>윤교수</option><option>학과장</option></select>
        <select id="f-stage"><option value="">단계 무관</option>${STAGES.map((v) => `<option>${v}</option>`).join("")}</select>
      </div>
      <textarea id="f-body" rows="3" placeholder="피드백 내용"></textarea>
      <button id="f-add">추가</button> <span id="f-msg" class="msg"></span>
      <ul class="fb">${fbList}</ul>

      <h2>진행 이력</h2><ul class="log">${logList}</ul>
    </div>`;

  host.querySelector("#dclose").onclick = () => (host.innerHTML = "");
  renderSkillBlock(host.querySelector("#i-skillblock"), id, { canVerify: true, canEditExperience: true });
  renderPortfolioReview(host.querySelector("#i-pfreviewbox"), id, { reviewerAs: "instructor" });
  renderStudentOps(host.querySelector("#i-ops"), {
    studentId: id, code: s.code, student: s, isAdmin: IS_ADMIN, onChange: refresh });
  renderCoach(host.querySelector("#i-coachbox"), id);

  host.querySelectorAll(".im-gap").forEach((b) => {
    b.onclick = async () => {
      const box = host.querySelector("#i-gapbox");
      box.innerHTML = `<p class="muted small">GAP 분석 중…</p>`;
      try {
        const g = await getGap(id, b.closest("tr").dataset.mpid);
        box.innerHTML = g.gaps.length
          ? `<ul class="gates">${g.gaps.map((x) =>
              `<li>${esc(x.name)} <span class="muted small">(${x.type}) 현재 ${x.current} → 목표 ${x.target}</span></li>`).join("")}</ul>`
          : `<p class="muted small">부족 항목 없음</p>`;
      } catch (e) { box.innerHTML = `<p class="msg err">${esc(e.message)}</p>`; }
    };
  });

  host.querySelector("#pf-save").onclick = async (e) => {
    const msg = host.querySelector("#pf-msg");
    const codes = ["pf1", "pf2", "pf3"].map((i) => host.querySelector("#" + i).value);
    const filled = codes.filter(Boolean);
    if (new Set(filled).size !== filled.length) {
      msg.className = "msg err"; msg.textContent = "직무 중복"; return;
    }
    e.target.disabled = true;
    try {
      await savePreferences(id, codes);
      msg.className = "msg ok"; msg.textContent = "저장됨";
    } catch (err) { msg.className = "msg err"; msg.textContent = err.message; }
    e.target.disabled = false;
  };

  host.querySelector("#d-save").onclick = async (e) => {
    const btn = e.target, msg = host.querySelector("#d-msg");
    const stage = host.querySelector("#d-stage").value;
    const status = host.querySelector("#d-status").value;
    btn.disabled = true;
    try {
      await updateStudent(id, { stage, status });   // activity_log 는 DB 트리거가 기록
      msg.className = "msg ok"; msg.textContent = "저장됨";
      refresh && refresh();
    } catch (err) { msg.className = "msg err"; msg.textContent = err.message; }
    btn.disabled = false;
  };

  host.querySelector("#a-save").onclick = async (e) => {
    const btn = e.target, msg = host.querySelector("#a-msg");
    btn.disabled = true;
    try {
      for (const row of host.querySelectorAll("tr[data-art]")) {
        await updateArtifact(row.dataset.art, {
          status: row.querySelector(".a-status").value,
          external_url: row.querySelector(".a-url").value.trim() || null,
        });
      }   // activity_log 는 DB 트리거가 기록
      msg.className = "msg ok"; msg.textContent = "저장됨";
    } catch (err) { msg.className = "msg err"; msg.textContent = err.message; }
    btn.disabled = false;
  };

  host.querySelector("#f-add").onclick = async (e) => {
    const btn = e.target, msg = host.querySelector("#f-msg");
    const body = host.querySelector("#f-body").value.trim();
    if (!body) { msg.className = "msg err"; msg.textContent = "내용을 입력하세요"; return; }
    btn.disabled = true;
    try {
      await addFeedback(id, {
        author: host.querySelector("#f-author").value,
        stage: host.querySelector("#f-stage").value,
        body,
      });   // activity_log 는 DB 트리거가 기록
      openDetail(host, id, refresh);
    } catch (err) { msg.className = "msg err"; msg.textContent = err.message; btn.disabled = false; }
  };

  // 지원 현황 저장 (행별)
  host.querySelector("#ap-save").onclick = async (e) => {
    const btn = e.target, msg = host.querySelector("#ap-msg");
    btn.disabled = true;
    try {
      for (const row of host.querySelectorAll("tr[data-app]")) {
        await updateApplication(row.dataset.app, {
          job_category: row.querySelector(".ap-cat").value || null,
          status: row.querySelector(".ap-status").value,
          applied_at: row.querySelector(".ap-date").value || null,
        });
      }
      msg.className = "msg ok"; msg.textContent = "저장됨";
      openDetail(host, id, refresh);
    } catch (err) { msg.className = "msg err"; msg.textContent = err.message; btn.disabled = false; }
  };
  host.querySelectorAll(".ap-del").forEach((b) => {
    b.onclick = async () => {
      if (!confirm("이 지원 건을 삭제할까요?")) return;
      await deleteApplication(b.closest("tr").dataset.app);
      openDetail(host, id, refresh);
    };
  });
  host.querySelector("#na-add").onclick = async (e) => {
    const btn = e.target, msg = host.querySelector("#ap-msg");
    const company = host.querySelector("#na-company").value.trim();
    if (!company) { msg.className = "msg err"; msg.textContent = "회사명을 입력하세요"; return; }
    btn.disabled = true;
    try {
      await addApplication(id, {
        company,
        position: host.querySelector("#na-pos").value.trim() || null,
        job_category: host.querySelector("#na-cat").value || null,
        status: host.querySelector("#na-status").value,
        applied_at: host.querySelector("#na-date").value || null,
      });
      openDetail(host, id, refresh);
    } catch (err) { msg.className = "msg err"; msg.textContent = err.message; btn.disabled = false; }
  };

  // 취업 확정
  host.querySelector("#em-save").onclick = async (e) => {
    const btn = e.target, msg = host.querySelector("#em-msg");
    const company = host.querySelector("#em-company").value.trim();
    if (!company) { msg.className = "msg err"; msg.textContent = "취업처를 입력하세요"; return; }
    btn.disabled = true;
    try {
      await setEmployment(id, {
        company,
        position: host.querySelector("#em-pos").value.trim() || null,
        job_category: host.querySelector("#em-cat").value || null,
        employment_type: host.querySelector("#em-type").value,
        hire_date: host.querySelector("#em-date").value || null,
      });
      msg.className = "msg ok"; msg.textContent = "저장됨";
      refresh && refresh();
      openDetail(host, id, refresh);
    } catch (err) { msg.className = "msg err"; msg.textContent = err.message; btn.disabled = false; }
  };
}

/* ---------- 명단 가져오기 (CSV / JSON) ---------- */
// CSV: 첫 줄 헤더. 허용 컬럼 code(필수)·track·stage·status·note.
// 헤더 별칭: 번호→code, 트랙/직무→track, 단계→stage, 상태→status, 비고→note
const CSV_ALIAS = {
  code: "code", 번호: "code", 학생번호: "code",
  track: "track", 트랙: "track", 직무: "track", 추천트랙: "track",
  stage: "stage", 단계: "stage",
  status: "status", 상태: "status",
  note: "note", 비고: "note", 메모: "note",
};
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const split = (l) => {
    const out = []; let cur = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const header = split(lines[0]).map((h) => CSV_ALIAS[h.toLowerCase()] || CSV_ALIAS[h] || h);
  return lines.slice(1).map((l) => {
    const cells = split(l), row = {};
    header.forEach((h, i) => { if (["code", "track", "stage", "status", "note"].includes(h) && cells[i]) row[h] = cells[i]; });
    return row;
  }).filter((r) => r.code);
}

async function paintRoster(pane, cohort) {
  pane.innerHTML = `
    <div class="card">
      <h2>명단 가져오기 (import_roster)</h2>
      <p class="muted small"><b>CSV</b>(엑셀에서 복사) 또는 <b>JSON 배열</b>. <code>code</code> 필수,
      나머지 선택(track·stage·status·note). 기존 <code>code</code>는 갱신, 신규는 아티팩트 5종 자동 생성.</p>
      <p class="muted small">CSV 헤더 예: <code>번호,트랙,상태</code> 또는 <code>code,track,status</code></p>
      <textarea id="r-in" rows="9" placeholder="번호,트랙,상태
S19,패키지 디자이너,
S20,영상편집,
S01,,check"></textarea>
      <div class="row">
        <button id="r-parse" class="ghost" type="button">미리보기</button>
        <button id="r-run" type="button">가져오기</button>
        <span id="r-msg" class="msg"></span>
      </div>
      <pre id="r-prev" class="prev" hidden></pre>
    </div>`;

  const inEl = pane.querySelector("#r-in");
  const msg = pane.querySelector("#r-msg");
  const prev = pane.querySelector("#r-prev");

  const readRows = () => {
    const raw = inEl.value.trim();
    if (!raw) throw new Error("입력이 비었습니다");
    if (raw[0] === "[" || raw[0] === "{") {
      const j = JSON.parse(raw);
      if (!Array.isArray(j)) throw new Error("JSON은 배열이어야 합니다");
      return j;
    }
    const rows = parseCSV(raw);
    if (!rows.length) throw new Error("CSV에서 code 있는 행을 못 찾음 (헤더 확인)");
    return rows;
  };

  pane.querySelector("#r-parse").onclick = () => {
    try {
      const rows = readRows();
      prev.hidden = false;
      prev.textContent = `${rows.length}행:\n` + JSON.stringify(rows, null, 1);
      msg.className = "msg"; msg.textContent = "";
    } catch (e) { msg.className = "msg err"; msg.textContent = e.message; }
  };

  pane.querySelector("#r-run").onclick = async (e) => {
    const btn = e.target;
    let rows;
    try { rows = readRows(); }
    catch (err) { msg.className = "msg err"; msg.textContent = err.message; return; }
    btn.disabled = true;
    try {
      const res = await importRoster(cohort, rows);
      msg.className = "msg ok";
      msg.textContent = `완료 — 신규 ${res.inserted} · 갱신 ${res.updated}`;
    } catch (err) { msg.className = "msg err"; msg.textContent = err.message; }
    btn.disabled = false;
  };
}
