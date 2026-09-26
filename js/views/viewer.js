// 공동훈련센터(팀장·담당, center_lead) 전용 화면.
// 열람(DASHBOARD·성과보고·주차현황·업체현황) + 업체 등록 + 취업자 등록(검증은 여전히 관리자만).
// 그 외 누구도 이 화면을 볼 수 없음(열람 전용 viewer 역할 접근 폐지 — router.js 에서 이미 차단).
import { signOut } from "../auth.js";
import { skeleton, renderError, tabBtn, markTab, privacyAckDialog } from "../ui.js";
import { listCohorts, ackPrivacyPolicy } from "../data.js";
import { paintReport, paintWeekly, paintControlTower, paintEmployerDirectory, paintCompanyRegister } from "./ops.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const ACK_KEY = "cgd_privacy_ack";   // sessionStorage — 브라우저를 닫았다 다시 열면(새 세션) 다시 확인받음

const PRIVACY_POLICY_HTML = `
  <p><b>1. 최소 수집·목적 제한</b> — 이 시스템은 학생 실명·번호·취업처 정보만 다룹니다. 주민등록번호·주소·개인 전화번호는
  어떤 화면에서도 입력·저장하지 않습니다. 업체·취업자 등록 항목의 "담당자 연락처"는 기업측 정보이며 학생 개인정보가 아닙니다.</p>
  <p><b>2. 목적 외 사용 금지</b> — 조회·등록한 정보는 수료생 취업 연계 목적 외로 사용하거나 제3자에게 전달하지 않습니다.</p>
  <p><b>3. 외부 공유 시 최소화</b> — 협약·개발 업체에 학생을 연계할 때도 채용에 필요한 최소 정보만 전달하고,
  주민등록번호 등 민감정보는 어떤 경우에도 전달하지 않습니다.</p>
  <p><b>4. 활동 기록</b> — 이 계정의 모든 조회·등록 활동은 로그로 남으며, 이 확인 절차 자체도 기록됩니다.</p>
  <p><b>5. 위반 시</b> — 위 원칙을 위반한 사실이 확인되면 계정 접근 권한이 제한될 수 있습니다.</p>
`;

async function ensurePrivacyAck() {
  try { if (sessionStorage.getItem(ACK_KEY)) return; } catch { /* 스토리지 접근 불가 시에도 계속 진행(모달은 보여줌) */ }
  await privacyAckDialog({
    title: "개인정보 보호정책 확인",
    bodyHtml: PRIVACY_POLICY_HTML,
    ackLabel: "위 개인정보 보호정책을 확인했으며 준수하겠습니다.",
    onAck: async () => {
      await ackPrivacyPolicy("v1");
      try { sessionStorage.setItem(ACK_KEY, "1"); } catch {}
    },
  });
}

export async function renderViewer(el, { session, profile }) {
  await ensurePrivacyAck();
  el.innerHTML = `
    <header class="topbar">
      <strong>공동훈련센터 · 담당</strong>
      <span class="muted small">${esc(session.user.email)}</span>
      <a href="#/" class="ghost home-link" title="홈으로">🏠 홈</a>
      <a href="help/center.html" target="_blank" rel="noopener" class="ghost" title="새 탭에서 매뉴얼 열기">📖 매뉴얼</a>
      <button id="so" class="ghost">로그아웃</button>
    </header>
    <div id="cohortbar" class="cohortbar"></div>
    <nav class="tabs with-icons" aria-label="공동훈련센터 메뉴">
      ${tabBtn("control", "DASHBOARD", true)}${tabBtn("report", "성과보고")}${tabBtn("weekly", "주차현황")}${tabBtn("employer", "업체현황")}${tabBtn("register", "업체 등록")}
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
    if (name === "control") paintControlTower(pane, cohort, { onNavigate: nav, audience: "center" });
    if (name === "report") paintReport(pane, cohort);
    if (name === "weekly") paintWeekly(pane, cohort, { readOnly: true });
    if (name === "employer") paintEmployerDirectory(pane, cohort, { canRegister: true, useRpc: true });
  };
  // 학생 상세로는 이동하지 않고, 이 화면이 가진 탭으로만 이동
  const navTabs = ["control", "report", "weekly", "employer", "register"];
  const nav = (tab) => { if (navTabs.includes(tab)) show(tab); };
  tabs.forEach((b) => (b.onclick = () => show(b.dataset.tab)));
  let list = [];
  try { list = await listCohorts(); } catch (e) { return renderError(pane, e, () => renderViewer(el, { session, profile })); }
  if (!list.length) { pane.innerHTML = `<div class="card"><p class="muted">기수가 없습니다.</p></div>`; return; }
  cohort = list[0].id;
  bar.innerHTML = `<label>기수 <select id="c-sel">${list.map((c) => `<option value="${c.id}">${esc(c.name)} · 수료 ${esc(c.completion_date)}</option>`).join("")}</select></label>
    <span class="muted small">업체·취업자 등록 가능 — 번호 기준 보고서 (실명 미표시)</span>`;
  bar.querySelector("#c-sel").onchange = (e) => { cohort = e.target.value; show(tabs.find((b) => b.classList.contains("on")).dataset.tab); };
  show("control");
}
