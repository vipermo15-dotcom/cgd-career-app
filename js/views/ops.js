// STEP 13 운영 화면: 주차별 현황 · 사후관리/90일 성과 · 성과보고서 · 교육생별 면접·자료·취업후관리
// 원칙: 수치는 cgd_* RPC 원본만 사용. 점수·순위·취업 가능성 표시 없음. 취업 확정은 관리자 검증만.
import {
  getWeeklyBoard, saveWeeklyGuidance, mondayOf,
  getFinalReport, getStudentReport, getDataQuality, getTodayTasks, ensureFollowups,
  getDepartmentHeadReport, getJointTrainingCenterReport, getInstitutionSummaryReport,
  listFollowups, saveFollowup, exportReportHtml, exportReportCsv,
  listInterviews, saveInterview, deleteInterview, uploadInterviewDoc, deleteInterviewDoc, signedUrl,
  verifyEmployment, setEmploymentCare, setOutcomeStatus, setCompletionStatus, getEmployment,
  OUTCOME_LABEL, INTERVIEW_RESULT, DOC_KIND, RETENTION, FOLLOWUP_STATUS, STAGES,
} from "../data.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const opts = (map, sel) => Object.entries(map).map(([k, v]) =>
  `<option value="${k}" ${k === sel ? "selected" : ""}>${esc(v)}</option>`).join("");
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const pct = (v) => (v === null || v === undefined ? "산출 불가" : v + "%");
const say = (el, ok, text) => { el.className = "msg " + (ok ? "ok" : "err"); el.textContent = text; };
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* =====================================================================
   1) 주차별 진로지도 현황
   ===================================================================== */
export async function paintWeekly(pane, cohort) {
  let week = mondayOf();
  const load = async () => {
    pane.innerHTML = `<div class="card"><p class="muted">불러오는 중…</p></div>`;
    let w;
    try { w = await getWeeklyBoard(week, cohort); }
    catch (e) { pane.innerHTML = `<div class="card"><p class="msg err">${esc(e.message)}</p></div>`; return; }
    week = w.week_start;
    const rows = w.rows.map((r) => {
      const li = r.latest_interview, em = r.employment, g = r.guidance;
      const emTxt = em ? (em.verified ? "취업 확정" : "검증 대기") +
        (em.verified ? ` · 계약서 ${em.contract_checked ? "✔" : "–"} · 보험 ${em.insurance_checked ? "✔" : "–"}` +
          (em.retention_status ? ` · ${esc(em.retention_status)}` : "") : "") : "–";
      return `<tr data-code="${esc(r.code)}">
        <td><b>${esc(r.code)}</b></td><td>${esc(r.stage)}</td>
        <td>${esc(OUTCOME_LABEL[r.outcome_status] || r.outcome_status)}</td>
        <td>${r.applications_week}</td><td>${r.interviews_week}</td><td>${r.docs_week}</td>
        <td class="small">${li ? esc(li.company) + " · " + esc(INTERVIEW_RESULT[li.result] || li.result) : "–"}</td>
        <td class="small">${emTxt}</td>
        <td class="small">${g?.guided ? "✅ " + esc(g.topic || "지도 완료") : "⬜ 미기록"}${g?.next_action ? `<br><span class="muted">→ ${esc(g.next_action)}${g.next_due ? " (" + esc(g.next_due) + ")" : ""}</span>` : ""}</td>
        <td><button class="ghost w-edit" data-code="${esc(r.code)}">기록</button></td></tr>`;
    }).join("");
    pane.innerHTML = `
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <h1 style="margin:0">주차별 진로지도 현황</h1>
          <span>
            <button class="ghost" id="w-prev">◀ 지난 주</button>
            <b>${esc(w.week_start)} ~ ${esc(w.week_end)}</b>
            <button class="ghost" id="w-next">다음 주 ▶</button>
          </span>
        </div>
        <p class="muted small">진로지도 기록 <b>${w.guided_count} / ${w.total}명</b> · 번호순 표시 (점수·순위 없음)</p>
        <div class="scroll-x"><table class="rowlink">
          <tr><th>번호</th><th>단계</th><th>성과 상태</th><th>지원</th><th>면접</th><th>자료</th><th>최근 면접</th><th>취업·사후</th><th>진로지도</th><th></th></tr>
          ${rows || `<tr><td colspan="10" class="muted">대상 학생이 없습니다.</td></tr>`}
        </table></div>
        <div id="w-form"></div>
      </div>`;
    pane.querySelector("#w-prev").onclick = () => { week = addDays(week, -7); load(); };
    pane.querySelector("#w-next").onclick = () => { week = addDays(week, 7); load(); };
    pane.querySelectorAll(".w-edit").forEach((b) => (b.onclick = () => guidanceForm(pane.querySelector("#w-form"), w, b.dataset.code, load)));
  };
  await load();
}

async function guidanceForm(host, w, code, done) {
  const row = w.rows.find((r) => r.code === code);
  const g = row.guidance || {};
  // students.id 는 board 에 없으므로 코드로 조회
  const { supabase } = await import("../supabase.js");
  const { data: st } = await supabase.from("students").select("id").eq("cohort_id", w.cohort_id).eq("code", code).single();
  host.innerHTML = `
    <div class="card" style="margin-top:12px">
      <h2>${esc(code)} · ${esc(w.week_start)} 주 진로지도 기록</h2>
      <div class="row">
        <label class="chk"><input type="checkbox" id="g-done" ${g.guided ? "checked" : ""}> 이번 주 진로지도 완료</label>
        <input id="g-topic" placeholder="지도 주제 (예: 포트폴리오 보완)" value="${esc(g.topic || "")}">
      </div>
      <textarea id="g-note" rows="2" placeholder="지도 내용 메모 (실명·연락처 입력 금지)"></textarea>
      <div class="row">
        <input id="g-next" placeholder="다음 조치" value="${esc(g.next_action || "")}">
        <label class="small">기한 <input id="g-due" type="date" value="${esc(g.next_due || "")}" style="width:auto"></label>
        <button id="g-save">저장</button><button class="ghost" id="g-cancel">닫기</button>
        <span id="g-msg" class="msg"></span>
      </div>
    </div>`;
  host.querySelector("#g-cancel").onclick = () => (host.innerHTML = "");
  host.querySelector("#g-save").onclick = async (e) => {
    const msg = host.querySelector("#g-msg"); e.target.disabled = true;
    try {
      const patch = {
        guided: host.querySelector("#g-done").checked,
        topic: host.querySelector("#g-topic").value.trim() || null,
        next_action: host.querySelector("#g-next").value.trim() || null,
        next_due: host.querySelector("#g-due").value || null,
      };
      const note = host.querySelector("#g-note").value.trim();
      if (note) patch.note = note;
      await saveWeeklyGuidance(st.id, w.week_start, patch);
      say(msg, true, "저장됨"); setTimeout(done, 400);
    } catch (err) { say(msg, false, err.message); e.target.disabled = false; }
  };
}

/* =====================================================================
   2) 사후관리 + 90일 성과
   ===================================================================== */
export async function paintFollowups(pane, cohort) {
  pane.innerHTML = `<div class="card"><p class="muted">불러오는 중…</p></div>`;
  let list, rep;
  try {
    const probe = await getFinalReport("2000-01-01", today(), cohort);      // 기수 정보(수료일·기준일) 확보
    const ref = probe.cohort.outcome_ref_date;
    const basis = probe.cohort.outcome_ref_reached ? ref : today();
    [list, rep] = await Promise.all([listFollowups(cohort), getFinalReport("2000-01-01", basis, cohort)]);
  } catch (e) { pane.innerHTML = `<div class="card"><p class="msg err">${esc(e.message)}</p></div>`; return; }
  const k = rep.kpi, c = rep.cohort;
  const provisional = !c.outcome_ref_reached;
  const ms = rep.followup_by_milestone.map((m) =>
    `<tr><td>${m.milestone_days}일</td><td>${m.total}</td><td>${m.completed}</td><td>${m.scheduled}</td><td>${m.unreachable}</td></tr>`).join("");
  const rows = list.map((f) => `
    <tr data-id="${f.id}">
      <td><b>${esc(f.students.code)}</b></td><td>${f.milestone_days}일</td><td>${esc(f.due_date)}</td>
      <td><select class="f-status">${opts(FOLLOWUP_STATUS, f.status)}</select></td>
      <td><select class="f-state"><option value="">–</option>${RETENTION.concat(["미취업"]).map((v) =>
        `<option ${v === f.employment_state ? "selected" : ""}>${v}</option>`).join("")}</select></td>
      <td><input class="f-date" type="date" value="${esc(f.actual_date || "")}" style="width:auto"></td>
      <td><input class="f-note" value="${esc(f.note || "")}" placeholder="메모(실명 금지)"></td>
      <td><button class="ghost f-save">저장</button> <span class="msg small"></span></td></tr>`).join("");
  pane.innerHTML = `
    <div class="card">
      <h1>90일 성과 ${provisional ? '<span class="badge">잠정 · 기준일 미도래</span>' : ""}</h1>
      <p class="muted small">성과 기준일 = 수료일 ${esc(c.completion_date)} + 90일 = <b>${esc(c.outcome_ref_date)}</b> ·
        집계 기준일 ${esc(rep.basis_date)} · 생성 ${esc(String(rep.generated_at).slice(0, 10))}</p>
      <div class="grid">
        <div class="card kpi"><span>취업 확정(검증)</span><b>${k.employed_confirmed}명</b><span class="muted small">검증 대기 ${k.employed_pending_verification}명</span></div>
        <div class="card kpi"><span>취업률 (${esc(rep.settings.denominator_label)} ${k.employment_rate_denominator}명)</span><b>${pct(k.employment_rate)}</b></div>
        <div class="card kpi"><span>증빙 기재율</span><b>${pct(k.evidence_rate)}</b></div>
        <div class="card kpi"><span>사후관리 완료율</span><b>${pct(k.followup_rate)}</b><span class="muted small">미처리 ${k.followup_unprocessed}건</span></div>
      </div>
      ${rep.settings.criteria_confirmed ? "" : `<p class="msg err small">기관 취업 인정기준·취업률 분모가 아직 확정되지 않았습니다 (자료보완 필요).</p>`}
    </div>
    <div class="card">
      <h2>사후관리 (수료일 기준 30일·90일)</h2>
      <div class="row"><button id="fu-gen">일정 생성 (30·90일)</button><span id="fu-msg" class="msg"></span></div>
      <table><tr><th>시점</th><th>전체</th><th>완료</th><th>예정</th><th>연락불가</th></tr>${ms || `<tr><td colspan="5" class="muted">일정이 없습니다. 「일정 생성」을 누르세요.</td></tr>`}</table>
      <div class="scroll-x"><table>
        <tr><th>번호</th><th>시점</th><th>예정일</th><th>상태</th><th>재직 상태</th><th>처리일</th><th>메모</th><th></th></tr>
        ${rows}</table></div>
    </div>`;
  pane.querySelector("#fu-gen").onclick = async (e) => {
    const msg = pane.querySelector("#fu-msg"); e.target.disabled = true;
    try { const r = await ensureFollowups(cohort); say(msg, true, `${r.inserted}건 생성 (기준: 수료일 ${r.anchor_date})`); setTimeout(() => paintFollowups(pane, cohort), 600); }
    catch (err) { say(msg, false, err.message); e.target.disabled = false; }
  };
  pane.querySelectorAll(".f-save").forEach((b) => (b.onclick = async () => {
    const tr = b.closest("tr"), msg = tr.querySelector(".msg");
    const status = tr.querySelector(".f-status").value, date = tr.querySelector(".f-date").value;
    try {
      await saveFollowup(tr.dataset.id, {
        status, actual_date: date || (status === "COMPLETED" ? today() : null),
        employment_state: tr.querySelector(".f-state").value || null,
        note: tr.querySelector(".f-note").value.trim() || null,
      });
      say(msg, true, "저장됨");
    } catch (err) { say(msg, false, err.message); }
  }));
}

/* =====================================================================
   3) ★ 성과보고서
   ===================================================================== */
export async function paintReport(pane, cohort) {
  const yr = new Date().getFullYear();
  pane.innerHTML = `
    <div class="card">
      <h1>★ 성과보고서</h1>
      <p class="muted small">원본 DB → KPI → 검증 → 보고서 순서. 모든 수치는 관리자 검증을 마친 자료에서만 산출되며 기준일과 생성일이 표시됩니다.</p>
      <div class="row">
        <label class="small">기간 시작 <input id="r-from" type="date" value="${yr}-01-01" style="width:auto"></label>
        <label class="small">기준일(기간 끝) <input id="r-to" type="date" value="${today()}" style="width:auto"></label>
      </div>
      <div class="row">
        <button data-kind="dept">학과장 운영보고</button>
        <button data-kind="jtc">공동훈련센터 보고</button>
        <button data-kind="inst">기관 제출용 요약</button>
        <button data-kind="students" class="ghost">학생별 명세</button>
        <button id="r-html" class="ghost">HTML 내려받기</button>
        <button id="r-csv" class="ghost">CSV 내려받기</button>
        <span id="r-msg" class="msg"></span>
      </div>
    </div>
    <div id="r-out"></div>`;
  const out = pane.querySelector("#r-out"), msg = pane.querySelector("#r-msg");
  let last = null;
  const range = () => [pane.querySelector("#r-from").value, pane.querySelector("#r-to").value];

  const kpiCards = (r) => {
    const k = r.kpi;
    return `<div class="grid">
      <div class="card kpi"><span>보고 대상</span><b>${k.target_count}명</b><span class="muted small">수료 ${k.completed_count}명</span></div>
      <div class="card kpi"><span>취업 확정(검증)</span><b>${k.employed_confirmed}명</b><span class="muted small">검증 대기 ${k.employed_pending_verification}명</span></div>
      <div class="card kpi"><span>취업률 (${esc(r.settings.denominator_label)} ${k.employment_rate_denominator}명)</span><b>${pct(k.employment_rate)}</b></div>
      <div class="card kpi"><span>증빙 기재율</span><b>${pct(k.evidence_rate)}</b></div>
      <div class="card kpi"><span>지원 / 면접</span><b>${k.application_count} / ${k.interview_count}</b></div>
      <div class="card kpi"><span>사후관리 완료율</span><b>${pct(k.followup_rate)}</b></div></div>`;
  };
  const outcome = (r) => {
    const o = r.outcome_breakdown;
    return `<table><tr><th>성과 분포</th><th>인원</th></tr>
      ${[["취업 확정", o.employed], ["미취업", o.not_employed], ["보류", o.hold], ["취업불가", o.ineligible],
         ["취업거부", o.refused], ["연락불가", o.unreachable], ["자료 미입력 (미취업 아님)", o.data_pending]]
        .map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join("")}</table>`;
  };
  const head = (r) => `<p class="muted small">${esc(r.cohort.name)} · 기간 ${esc(r.period.from)} ~ ${esc(r.period.to)} ·
    <b>기준일 ${esc(r.basis_date)}</b> · 생성일 ${esc(String(r.generated_at).slice(0, 10))}</p>`;
  const quality = (q) => {
    const badge = { ERROR: "err", WARN: "err", INFO: "muted" };
    const items = q.items.map((i) => `<li class="${badge[i.severity]}"><b>[${i.severity}]</b> ${esc(i.label)} — ${i.count}건
      ${i.student_codes.length ? `<span class="muted small">(${i.student_codes.map(esc).join(", ")})</span>` : ""}</li>`).join("");
    return `<div class="card"><h2>데이터 검증 ${q.needs_supplement ? '<span class="badge">자료보완 필요</span>' : '<span class="badge">이상 없음</span>'}</h2>
      <ul>${items || "<li class='muted'>검증 항목 없음</li>"}</ul></div>`;
  };
  const tasks = (t) => `<div class="card"><h2>오늘의 업무 (기한순 · ${t.total}건)</h2>
    ${t.groups.filter((g) => g.items.length).map((g) => `<h3 class="small">${esc(g.label)}</h3><ul>${g.items.map((i) =>
      `<li class="small"><b>${esc(i.student_code)}</b> ${esc(i.detail)} <span class="muted">${esc(i.date || "")}</span></li>`).join("")}</ul>`).join("") || "<p class='muted'>처리할 업무가 없습니다.</p>"}</div>`;
  const cats = (r) => r.employment_by_category.length
    ? `<table><tr><th>취업 직무 분야</th><th>인원</th></tr>${r.employment_by_category.map((c) => `<tr><td>${esc(c.name)}</td><td>${c.count}</td></tr>`).join("")}</table>` : "";
  const defs = (r) => `<div class="card"><h2>산출 기준</h2><ol class="small">${Object.values(r.definitions).map((d) => `<li>${esc(d)}</li>`).join("")}</ol></div>`;
  const studentTable = (s) => `<div class="card"><h2>학생별 명세 (번호 기준)</h2><div class="scroll-x"><table>
    <tr><th>번호</th><th>단계</th><th>수료</th><th>성과</th><th>지원</th><th>면접</th><th>취업(검증)</th><th>보고</th></tr>
    ${s.rows.map((r) => `<tr><td><b>${esc(r.code)}</b></td><td>${esc(r.stage)}</td><td>${esc(r.completion_status)}</td>
      <td>${esc(OUTCOME_LABEL[r.outcome_status] || r.outcome_status)}</td><td>${r.application_count}</td><td>${r.interview_count}</td>
      <td>${r.employment ? (r.employment.verified ? "✅ " : "⏳ ") + esc(r.employment.company || "") : "–"}</td>
      <td>${r.report_included ? "포함" : "제외: " + esc(r.report_exclude_reason || "")}</td></tr>`).join("")}</table></div></div>`;

  const run = async (kind) => {
    const [from, to] = range();
    if (!from || !to || from > to) return say(msg, false, "기간을 확인하세요 (시작 ≤ 기준일)");
    out.innerHTML = `<div class="card"><p class="muted">생성 중…</p></div>`; msg.textContent = "";
    try {
      if (kind === "dept") {
        const { report, quality: q, tasks: t } = await getDepartmentHeadReport(from, to, cohort);
        last = { report, quality: q, students: null };
        out.innerHTML = `<div class="card"><h2>학과장 운영보고</h2>${head(report)}${kpiCards(report)}${outcome(report)}${cats(report)}</div>${quality(q)}${tasks(t)}${defs(report)}`;
      } else if (kind === "jtc") {
        const { report, students } = await getJointTrainingCenterReport(from, to, cohort);
        last = { report, quality: null, students };
        out.innerHTML = `<div class="card"><h2>공동훈련센터 보고</h2>${head(report)}${kpiCards(report)}${outcome(report)}${cats(report)}</div>${studentTable(students)}${defs(report)}`;
      } else if (kind === "inst") {
        const { report, quality: q } = await getInstitutionSummaryReport(from, to, cohort);
        last = { report, quality: q, students: null };
        out.innerHTML = `<div class="card"><h2>기관 제출용 요약</h2>${head(report)}
          ${q.needs_supplement || !report.settings.criteria_confirmed ? '<p class="msg err"><b>자료보완 필요</b> — 아래 검증 항목을 해소한 뒤 제출하세요.</p>' : ""}
          ${kpiCards(report)}${outcome(report)}</div>${quality(q)}${defs(report)}`;
      } else {
        const s = await getStudentReport(from, to, cohort);
        last = { ...(last || {}), students: s };
        out.innerHTML = studentTable(s);
      }
    } catch (e) { out.innerHTML = ""; say(msg, false, e.message); }
  };
  pane.querySelectorAll("button[data-kind]").forEach((b) => (b.onclick = () => run(b.dataset.kind)));
  pane.querySelector("#r-html").onclick = async () => {
    const [from, to] = range();
    try {
      const [r, q] = await Promise.all([getFinalReport(from, to, cohort), getDataQuality(cohort)]);
      download(`성과보고_${to}.html`, exportReportHtml(r, q), "text/html;charset=utf-8"); say(msg, true, "HTML 내려받음");
    } catch (e) { say(msg, false, e.message); }
  };
  pane.querySelector("#r-csv").onclick = async () => {
    const [from, to] = range();
    try {
      const s = await getStudentReport(from, to, cohort);
      download(`학생별명세_${to}.csv`, exportReportCsv(s), "text/csv;charset=utf-8"); say(msg, true, "CSV 내려받음");
    } catch (e) { say(msg, false, e.message); }
  };
}


/* =====================================================================
   면접 · 지원기업 자료 (교육생 본인 / 강사 공용) — 기업·직무·면접결과 + 이력서·자소서·포트폴리오·피드백 자료
   ===================================================================== */
export async function renderInterviews(host, { studentId, code }) {
  const paint = async () => {
    host.innerHTML = `<p class="muted small">불러오는 중…</p>`;
    let iv;
    try { iv = await listInterviews(studentId); }
    catch (e) { host.innerHTML = `<p class="msg err">${esc(e.message)}</p>`; return; }
    const ivHtml = iv.map((i) => `
      <div class="artcard" data-iv="${i.id}">
        <div class="arthead"><b>${esc(i.company)}</b> <span class="muted small">${esc(i.position || "")} · ${i.round}차 · ${esc(i.interview_date || "일자 미정")}</span>
          <select class="i-result">${opts(INTERVIEW_RESULT, i.result)}</select></div>
        <input class="i-note" value="${esc(i.note || "")}" placeholder="면접 메모 (실명·연락처 금지)">
        <div class="small">${(i.interview_documents || []).map((d) =>
          `<span class="badge"><a href="#" class="d-open" data-path="${esc(d.storage_path || "")}">${esc(DOC_KIND[d.kind] || d.kind)}: ${esc(d.title)}</a>
           <a href="#" class="d-del" data-id="${d.id}" data-path="${esc(d.storage_path || "")}" title="삭제">✕</a></span>`).join("") || '<span class="muted">첨부 자료 없음</span>'}</div>
        <div class="row">
          <select class="d-kind">${opts(DOC_KIND, "RESUME")}</select>
          <input type="file" class="d-file">
          <button class="ghost d-up">자료 업로드</button>
          <button class="ghost i-save">저장</button><button class="ghost i-del">삭제</button>
          <span class="msg small"></span>
        </div>
      </div>`).join("") || `<p class="muted small">등록된 면접이 없습니다.</p>`;


    host.innerHTML = `${ivHtml}
      <div class="row">
        <input id="n-company" placeholder="기업명"><input id="n-pos" placeholder="직무">
        <label class="small">면접일 <input id="n-date" type="date" style="width:auto"></label>
        <select id="n-round">${[1, 2, 3, 4].map((n) => `<option value="${n}">${n}차</option>`).join("")}</select>
        <button id="n-add" type="button">면접 추가</button><span id="n-msg" class="msg"></span>
      </div>
      <p class="muted small">자료 업로드 전 주민번호·주소·연락처 등 민감정보를 지웠는지 확인하세요.</p>`;
    const g = (sel) => host.querySelector(sel);
    g("#n-add").onclick = async () => {
      const m = g("#n-msg"), company = g("#n-company").value.trim();
      if (!company) return say(m, false, "기업명을 입력하세요");
      try {
        await saveInterview(studentId, { company, position: g("#n-pos").value.trim() || null,
          interview_date: g("#n-date").value || null, round: +g("#n-round").value });
        paint();
      } catch (e) { say(m, false, e.message); }
    };
    host.querySelectorAll("[data-iv]").forEach((card) => {
      const id = card.dataset.iv, m = card.querySelector(".msg");
      card.querySelector(".i-save").onclick = async () => {
        try { await saveInterview(studentId, { id, result: card.querySelector(".i-result").value,
                note: card.querySelector(".i-note").value.trim() || null }); say(m, true, "저장됨"); }
        catch (e) { say(m, false, e.message); }
      };
      card.querySelector(".i-del").onclick = async () => {
        if (!confirm("이 면접 기록과 첨부 자료 정보를 삭제할까요?")) return;
        try { await deleteInterview(id); paint(); } catch (e) { say(m, false, e.message); }
      };
      card.querySelector(".d-up").onclick = async (e) => {
        const f = card.querySelector(".d-file").files[0];
        if (!f) return say(m, false, "파일을 선택하세요");
        e.target.disabled = true;
        try { await uploadInterviewDoc(code, studentId, id, card.querySelector(".d-kind").value, f.name, f); paint(); }
        catch (err) { say(m, false, err.message); e.target.disabled = false; }
      };
      card.querySelectorAll(".d-open").forEach((a) => (a.onclick = async (ev) => {
        ev.preventDefault();
        try { window.open(await signedUrl(a.dataset.path), "_blank", "noopener"); } catch (err) { say(m, false, err.message); }
      }));
      card.querySelectorAll(".d-del").forEach((a) => (a.onclick = async (ev) => {
        ev.preventDefault();
        if (!confirm("첨부 자료를 삭제할까요?")) return;
        try { await deleteInterviewDoc({ id: a.dataset.id, storage_path: a.dataset.path }); paint(); }
        catch (err) { say(m, false, err.message); }
      }));
    });
  };
  await paint();
}

/* =====================================================================
   4) 교육생 상세 — 성과 상태 · 면접/자료 · 취업 검증/사후 관리
   ===================================================================== */
export async function renderStudentOps(host, { studentId, code, student, isAdmin, onChange }) {
  const paint = async () => {
    host.innerHTML = `<p class="muted small">불러오는 중…</p>`;
    let emp;
    try { emp = await getEmployment(studentId); }
    catch (e) { host.innerHTML = `<p class="msg err">${esc(e.message)}</p>`; return; }

    const oc = student.outcome_status, cs = student.completion_status;
    host.innerHTML = `
      <h2>성과 상태 (취업 대기 분류)</h2>
      <div class="row">
        <label class="small">수료 <select id="o-comp">${opts({ ENROLLED: "재학", COMPLETED: "수료", DROPPED: "중도탈락" }, cs)}</select></label>
        <label class="small">성과 <select id="o-out">${opts(OUTCOME_LABEL, oc)}</select></label>
        <input id="o-note" placeholder="사유 메모 (실명 금지)" value="${esc(student.outcome_note || "")}">
        <button id="o-save" class="ghost">저장</button><span id="o-msg" class="msg"></span>
      </div>
      <p class="muted small">「자료 미입력」은 미취업이 아닙니다. 취업 여부는 아래 검증 결과로만 확정됩니다.</p>

      <h2>면접 · 지원기업 자료</h2>
      <div id="iv-block"></div>

      <h2>취업 확정 검증 · 취업 후 관리</h2>
      ${emp ? `
      <p class="small">${esc(emp.company)} · ${esc(emp.employment_type || "")} · 입사 ${esc(emp.hire_date || "미입력")} —
        <b>${emp.verified ? "관리자 검증 완료" : "검증 대기"}</b></p>
      <div class="row">
        <input id="v-evidence" placeholder="증빙 종류 (재직증명서·근로계약서·4대보험 등)" value="${esc(emp.evidence_type || "")}">
        ${isAdmin
          ? (emp.verified ? `<button id="v-off" class="danger">검증 취소</button>` : `<button id="v-on" class="cta">취업 확정(검증)</button>`)
          : `<span class="muted small">취업 확정은 관리자만 할 수 있습니다.</span>`}
        <span id="v-msg" class="msg"></span>
      </div>
      <div class="row">
        <label class="chk"><input type="checkbox" id="c-contract" ${emp.contract_checked ? "checked" : ""}> 고용계약서 확인</label>
        <label class="chk"><input type="checkbox" id="c-ins" ${emp.insurance_checked ? "checked" : ""}> 고용보험 가입 확인</label>
        <label class="small">취업 유지 <select id="c-ret"><option value="">–</option>${RETENTION.map((v) =>
          `<option ${v === emp.retention_status ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <button id="c-save" class="ghost">저장</button><span id="c-msg" class="msg"></span>
      </div>` : `<p class="muted small">취업 등록이 없습니다. 위 「취업 확정」 영역에서 취업처를 먼저 등록하세요 (등록만으로는 확정되지 않고 관리자 검증이 필요합니다).</p>`}`;

    const g = (sel) => host.querySelector(sel);
    g("#o-save").onclick = async () => {
      const m = g("#o-msg");
      try {
        await setCompletionStatus(studentId, g("#o-comp").value);
        await setOutcomeStatus(studentId, g("#o-out").value, g("#o-note").value.trim() || null);
        student.completion_status = g("#o-comp").value; student.outcome_status = g("#o-out").value;
        say(m, true, "저장됨"); onChange && onChange();
      } catch (e) { say(m, false, e.message); }
    };
    renderInterviews(g("#iv-block"), { studentId, code });
    if (emp) {
      const vm = g("#v-msg");
      const setV = (on) => async () => {
        try {
          await verifyEmployment(studentId, on, on ? { evidence_type: g("#v-evidence").value.trim() || null } : {});
          say(vm, true, on ? "취업 확정됨" : "검증 취소됨"); onChange && onChange(); setTimeout(paint, 500);
        } catch (e) { say(vm, false, e.message); }
      };
      g("#v-on") && (g("#v-on").onclick = setV(true));
      g("#v-off") && (g("#v-off").onclick = setV(false));
      g("#c-save").onclick = async () => {
        const m = g("#c-msg");
        try {
          await setEmploymentCare(studentId, {
            contract_checked: g("#c-contract").checked, insurance_checked: g("#c-ins").checked,
            retention_status: g("#c-ret").value || null,
            retention_checked_at: g("#c-ret").value ? today() : null,
          });
          say(m, true, "저장됨");
        } catch (e) { say(m, false, e.message); }
      };
    }
  };
  await paint();
}
