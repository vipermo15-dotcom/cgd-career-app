// 공동훈련센터 화면.
//   viewer(열람 전용): 보고서·주차현황·업체현황 조회만. 수정·업로드·학생 상세·실명 없음.
//   center_lead(팀장·담당): 위 열람 전부 + 업체 등록 + 취업자 등록(검증은 여전히 관리자만).
import { signOut } from "../auth.js";
import { skeleton, renderError, tabBtn, markTab } from "../ui.js";
import { listCohorts } from "../data.js";
import { paintReport, paintWeekly, paintControlTower, paintEmployerDirectory, paintCompanyRegister } from "./ops.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export async function renderViewer(el, { session, profile }) {
  const isLead = profile?.role === "center_lead";
  el.innerHTML = `
    <header class="topbar">
      <strong>공동훈련센터${isLead ? " · 담당" : " · 열람"}</strong>
      <span class="muted small">${esc(session.user.email)}</span>
      <a href="#/" class="ghost home-link" title="홈으로">🏠 홈</a>
      <button id="so" class="ghost">로그아웃</button>
    </header>
    <div id="cohortbar" class="cohortbar"></div>
    <nav class="tabs with-icons" aria-label="열람 메뉴">
      ${tabBtn("control", "DASHBOARD", true)}${tabBtn("report", "성과보고")}${tabBtn("weekly", "주차현황")}${tabBtn("employer", "업체현황")}
      ${isLead ? tabBtn("register", "업체 등록") : ""}
    </nav>
    <section id="pane">${skeleton(4)}</section>`;
  el.querySelector("#so").onclick = signOut;
  const pane = el.querySelector("#pane"), bar = el.querySelector("#cohortbar");
  const tabs = [...el.querySelectorAll(".tabs button")];
  let cohort = null;
  const show = (name) => {
    if (name === "register") { markTab(tabs, name); return paintCompanyRegister(pane); }
    if (!cohort) return;
    markTab(tabs, name);
    if (name === "control") paintControlTower(pane, cohort, { onNavigate: nav });
    if (name === "report") paintReport(pane, cohort);
    if (name === "weekly") paintWeekly(pane, cohort, { readOnly: true });
    if (name === "employer") paintEmployerDirectory(pane, cohort, isLead ? { canRegister: true, useRpc: true } : {});
  };
  // 학생 상세로는 이동하지 않고, 이 화면이 가진 탭으로만 이동(업체현황 등록 버튼은 담당만 보임)
  const navTabs = isLead ? ["control", "report", "weekly", "employer", "register"] : ["control", "report", "weekly", "employer"];
  const nav = (tab) => { if (navTabs.includes(tab)) show(tab); };
  tabs.forEach((b) => (b.onclick = () => show(b.dataset.tab)));
  let list = [];
  try { list = await listCohorts(); } catch (e) { return renderError(pane, e, () => renderViewer(el, { session, profile })); }
  if (!list.length) { pane.innerHTML = `<div class="card"><p class="muted">기수가 없습니다.</p></div>`; return; }
  cohort = list[0].id;
  bar.innerHTML = `<label>기수 <select id="c-sel">${list.map((c) => `<option value="${c.id}">${esc(c.name)} · 수료 ${esc(c.completion_date)}</option>`).join("")}</select></label>
    <span class="muted small">${isLead ? "업체·취업자 등록 가능" : "열람 전용"} — 번호 기준 보고서 (실명 미표시)</span>`;
  bar.querySelector("#c-sel").onchange = (e) => { cohort = e.target.value; show(tabs.find((b) => b.classList.contains("on")).dataset.tab); };
  show("control");
}
