// 공동훈련센터(열람 전용) 화면 — 보고서·주차현황 조회만. 수정·업로드·학생 상세·실명 없음.
import { signOut } from "../auth.js";
import { listCohorts } from "../data.js";
import { paintReport, paintWeekly } from "./ops.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export async function renderViewer(el, { session }) {
  el.innerHTML = `
    <header class="topbar">
      <strong>공동훈련센터 · 열람</strong>
      <span class="muted small">${esc(session.user.email)}</span>
      <button id="so" class="ghost">로그아웃</button>
    </header>
    <div id="cohortbar" class="cohortbar"></div>
    <nav class="tabs">
      <button data-tab="report" class="on">성과보고</button>
      <button data-tab="weekly">주차현황</button>
    </nav>
    <section id="pane"><p class="muted">불러오는 중…</p></section>`;
  el.querySelector("#so").onclick = signOut;
  const pane = el.querySelector("#pane"), bar = el.querySelector("#cohortbar");
  const tabs = [...el.querySelectorAll(".tabs button")];
  let cohort = null;
  const show = (name) => {
    if (!cohort) return;
    tabs.forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
    if (name === "report") paintReport(pane, cohort);
    if (name === "weekly") paintWeekly(pane, cohort, { readOnly: true });
  };
  tabs.forEach((b) => (b.onclick = () => show(b.dataset.tab)));
  let list = [];
  try { list = await listCohorts(); } catch (e) { pane.innerHTML = `<div class="card"><p class="msg err">${esc(e.message)}</p></div>`; return; }
  if (!list.length) { pane.innerHTML = `<div class="card"><p class="muted">기수가 없습니다.</p></div>`; return; }
  cohort = list[0].id;
  bar.innerHTML = `<label>기수 <select id="c-sel">${list.map((c) => `<option value="${c.id}">${esc(c.name)} · 수료 ${esc(c.completion_date)}</option>`).join("")}</select></label>
    <span class="muted small">열람 전용 — 번호 기준 보고서 (실명 미표시)</span>`;
  bar.querySelector("#c-sel").onchange = (e) => { cohort = e.target.value; show(tabs.find((b) => b.classList.contains("on")).dataset.tab); };
  show("report");
}
