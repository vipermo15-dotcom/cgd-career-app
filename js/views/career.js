// STEP 18 진로지도(직무 중심) — 강사·관리자 화면
//   paintCareerByJob    : 직무별 보기 (11개 직무 분류별 학생 묶음)
//   paintPostCompletion : 수료 후 진도지도 현황판 (학과장 특이사항·다음 확인일)
//   renderCareerPanel   : 학생 상세 안의 「진로지도」 패널 (프로필·추천 취업처·자료)
// 진단점수는 학과(강사·관리자)만 봅니다. 센터에는 '***', 교육생 본인 화면에는 표시하지 않습니다.
import { toast, confirmDialog, skeleton, renderError, withBusy, setMsg } from "../ui.js";
import {
  getCareerByJob, getPostCompletionBoard, getNameMap, whoLabel, getMyCareer, getCareerCenterView,
  getCareerProfile, saveCareerProfile, listCareerRecs, saveCareerRec, deleteCareerRec,
  listCareerDocs, addCareerDoc, setCareerDocVisible, deleteCareerDoc, careerDocUrl,
  findStudentByName, docExists,
  addMentorNote,
  PORTFOLIO_STATUS, REC_STATUS, DOC_KIND_CAREER, NOTE_TYPES, JOB_CATEGORIES,
} from "../data.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const opt = (list, sel, blank) =>
  (blank ? `<option value="">${esc(blank)}</option>` : "") +
  list.map((v) => `<option ${v === sel ? "selected" : ""}>${esc(v)}</option>`).join("");
const catOpts = (sel) => `<option value="">(미지정)</option>` +
  Object.entries(JOB_CATEGORIES).map(([k, v]) =>
    `<option value="${k}" ${k === sel ? "selected" : ""}>${esc(v)}</option>`).join("");
const dday = (iso) => {
  if (!iso) return "";
  const d = Math.round((new Date(iso + "T00:00:00") - new Date(today() + "T00:00:00")) / 86400000);
  return d === 0 ? "D-day" : d > 0 ? `D-${d}` : `D+${-d}`;
};

/* =====================================================================
   1) 직무별 보기
   ===================================================================== */
export async function paintCareerByJob(pane, cohort, { onOpenStudent } = {}) {
  pane.innerHTML = `<div class="card">${skeleton(4)}</div>`;
  let d, names;
  try { [d, names] = await Promise.all([getCareerByJob(cohort), getNameMap(cohort)]); }
  catch (e) { return renderError(pane, e, () => paintCareerByJob(pane, cohort, { onOpenStudent })); }

  const groups = d.categories.filter((c) => c.students.length);
  const filled = new Set(d.categories.flatMap((c) => c.students.filter((s) => s.is_primary).map((s) => s.code)));
  const cards = groups.map((c) => `
    <div class="card">
      <h2>${esc(c.name)} <span class="muted small">${c.students.length}명 (주 직무 ${c.students.filter((s) => s.is_primary).length})</span></h2>
      <div class="scroll-x"><table class="tbl-cards rowlink">
        <tr><th scope="col">학생</th><th scope="col">구분</th><th scope="col">목표 직무명</th><th scope="col">진단</th><th scope="col">포트폴리오</th><th scope="col">다음 행동</th><th scope="col">추천처</th></tr>
        ${c.students.map((s) => `
          <tr data-id="${s.student_id}" data-code="${esc(s.code)}">
            <td data-label="학생"><b>${esc(whoLabel(names, s.code))}</b></td>
            <td data-label="구분">${s.is_primary ? "주" : `<span class="muted">보조</span>`}</td>
            <td data-label="목표 직무명">${esc(s.target_title || "")}</td>
            <td data-label="진단">${s.diagnosis_score ?? `<span class="muted">-</span>`}</td>
            <td data-label="포트폴리오">${esc(s.portfolio_status || "")}</td>
            <td data-label="다음 행동" class="small">${esc(s.next_action || "")}${s.next_due ? ` <span class="muted">${esc(s.next_due)} ${dday(s.next_due)}</span>` : ""}</td>
            <td data-label="추천처">${s.recommendations}</td>
          </tr>`).join("")}
      </table></div>
    </div>`).join("");
  const missing = d.unassigned.length
    ? `<div class="card"><h2>직무 미지정 <span class="muted small">${d.unassigned.length}명</span></h2>
        <p>${d.unassigned.map((c) => `<b>${esc(whoLabel(names, c))}</b>`).join(" · ")}</p>
        <p class="muted small">진로지도 자료가 없거나 아직 직무를 정하지 못한 학생입니다. 상담 후 학생 상세의 「진로지도」에서 입력하세요.</p></div>` : "";
  pane.innerHTML = `
    <div class="card"><h2>직무별 진로지도 <span class="muted small">주 직무 ${filled.size}명 · 진단점수는 학과에서만 보입니다</span></h2>
      <p class="muted small">행을 누르면 학생 상세로 이동합니다.</p></div>
    ${cards || `<div class="card"><p class="muted">등록된 진로지도가 없습니다.</p></div>`}${missing}`;
  pane.querySelectorAll("tr[data-code]").forEach((tr) => (tr.onclick = () => onOpenStudent?.(tr.dataset.code)));
}

/* =====================================================================
   2) 수료 후 진도지도 현황판
   ===================================================================== */
export async function paintPostCompletion(pane, cohort, { onOpenStudent } = {}) {
  pane.innerHTML = `<div class="card">${skeleton(4)}</div>`;
  let d, names;
  try { [d, names] = await Promise.all([getPostCompletionBoard(cohort), getNameMap(cohort)]); }
  catch (e) { return renderError(pane, e, () => paintPostCompletion(pane, cohort, { onOpenStudent })); }
  const rows = d.students;
  const overdue = rows.filter((r) => r.overdue_follow_up).length;
  const noNote = rows.filter((r) => !r.last_note_at && !r.employed).length;
  const employed = rows.filter((r) => r.employed).length;

  pane.innerHTML = `
    <div class="grid kpis">
      <div class="card kpi"><span class="muted small">수료일</span><b style="font-size:20px">${esc(d.completion_date || "")}</b></div>
      <div class="card kpi"><span class="muted small">취업 확정(검증)</span><b>${employed}</b></div>
      <div class="card kpi"><span class="muted small">확인일 경과·미조치</span><b>${overdue}</b></div>
      <div class="card kpi"><span class="muted small">기록 없음(미취업)</span><b>${noNote}</b></div>
    </div>
    <div class="card"><h2>수료 후 진도지도 현황</h2>
      <p class="muted small">학과장이 남긴 특이사항 기준입니다. 기록은 학생 상세의 「특이사항」에서 분류·다음 확인일과 함께 입력합니다.</p>
      <div class="scroll-x"><table class="tbl-cards rowlink">
        <tr><th scope="col">학생</th><th scope="col">취업</th><th scope="col">수료 후 기록</th><th scope="col">마지막 기록</th><th scope="col">다음 확인일</th><th scope="col">진로지도 다음 행동</th></tr>
        ${rows.map((r) => `
          <tr data-code="${esc(r.code)}">
            <td data-label="학생"><b>${esc(whoLabel(names, r.code))}</b></td>
            <td data-label="취업">${r.employed ? "확정" : `<span class="muted">-</span>`}</td>
            <td data-label="수료 후 기록">${r.notes_after}건</td>
            <td data-label="마지막 기록" class="small">${r.last_note_at
              ? `<span class="muted">${esc(r.last_note_at.slice(0, 10))} · ${esc(r.last_note_type || "")}</span><br>${esc((r.last_note || "").slice(0, 60))}`
              : `<span class="muted">없음</span>`}</td>
            <td data-label="다음 확인일">${r.overdue_follow_up
              ? `<b class="msg err">경과·미조치</b>`
              : r.next_follow_up ? `${esc(r.next_follow_up)} <span class="muted">${dday(r.next_follow_up)}</span>` : `<span class="muted">-</span>`}</td>
            <td data-label="다음 행동" class="small">${esc(r.career_next_action || "")}${r.career_next_due ? ` <span class="muted">${esc(r.career_next_due)}</span>` : ""}</td>
          </tr>`).join("")}
      </table></div>
    </div>`;
  pane.querySelectorAll("tr[data-code]").forEach((tr) => (tr.onclick = () => onOpenStudent?.(tr.dataset.code)));
}

/* =====================================================================
   3) 학생 상세 「진로지도」 패널
   ===================================================================== */
export async function renderCareerPanel(host, { studentId }) {
  host.innerHTML = `<p class="muted small">불러오는 중…</p>`;
  let p, recs, docs;
  try { [p, recs, docs] = await Promise.all([getCareerProfile(studentId), listCareerRecs(studentId), listCareerDocs(studentId)]); }
  catch (e) { host.innerHTML = `<p class="msg err">${esc(e.message)}</p>`; return; }
  p = p || {};
  const lines = (a) => (a || []).join("\n");
  const list = (t) => String(t || "").split("\n").map((x) => x.trim()).filter(Boolean);

  host.innerHTML = `
    <div class="row">
      <label class="small">주 직무 <select id="cp-main" style="width:auto">${catOpts(p.primary_category)}</select></label>
      <label class="small">보조 직무 <select id="cp-sub" style="width:auto">${catOpts(p.secondary_category)}</select></label>
      <label class="small">포트폴리오 <select id="cp-pf" style="width:auto">${opt(PORTFOLIO_STATUS, p.portfolio_status, "(미정)")}</select></label>
    </div>
    <div class="row">
      <input id="cp-title" placeholder="목표 직무명 (예: 편집디자이너)" value="${esc(p.target_title || "")}" style="flex:1;min-width:220px">
      <label class="small">진단 <input id="cp-score" type="number" min="0" max="100" value="${p.diagnosis_score ?? ""}" style="width:80px" title="학과에서만 보입니다"></label>
      <label class="small">진단일 <input id="cp-sdate" type="date" value="${esc(p.diagnosis_date || "")}" style="width:auto"></label>
    </div>
    <p class="muted small">진단점수·진단일·내부 메모는 학과(강사·관리자)만 봅니다. 센터에는 점수가 ***로 표시되고, 교육생에게는 보이지 않습니다.</p>
    <textarea id="cp-track" rows="2" placeholder="트랙 메모">${esc(p.track_note || "")}</textarea>
    <div class="row" style="align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:240px"><span class="muted small">강점 (한 줄에 하나)</span><textarea id="cp-str" rows="4">${esc(lines(p.strengths))}</textarea></div>
      <div style="flex:1;min-width:240px"><span class="muted small">보완점 (한 줄에 하나)</span><textarea id="cp-gap" rows="4">${esc(lines(p.gaps))}</textarea></div>
    </div>
    <div class="row">
      <input id="cp-next" placeholder="다음 행동" value="${esc(p.next_action || "")}" style="flex:1;min-width:220px">
      <label class="small">기한 <input id="cp-due" type="date" value="${esc(p.next_due || "")}" style="width:auto"></label>
    </div>
    <textarea id="cp-note" rows="2" placeholder="내부 메모 (학과 전용)">${esc(p.internal_note || "")}</textarea>
    <button id="cp-save" type="button">진로지도 저장</button> <span id="cp-msg" class="msg"></span>

    <h3 style="margin-top:16px">추천 취업처</h3>
    <div class="scroll-x"><table class="tbl-cards">
      <tr><th scope="col">순위</th><th scope="col">회사</th><th scope="col">직무</th><th scope="col">마감</th><th scope="col">상태</th><th scope="col">사유</th><th scope="col"><span class="sr-only">작업</span></th></tr>
      ${recs.map((r) => `
        <tr data-id="${r.id}">
          <td data-label="순위"><input class="r-pri" type="number" min="1" max="5" value="${r.priority}" style="width:56px"></td>
          <td data-label="회사"><input class="r-co" value="${esc(r.company)}"></td>
          <td data-label="직무"><input class="r-job" value="${esc(r.job_title || "")}"></td>
          <td data-label="마감"><input class="r-dl" type="date" value="${esc(r.deadline || "")}" style="width:auto"></td>
          <td data-label="상태"><select class="r-st" style="width:auto">${opt(REC_STATUS, r.status)}</select></td>
          <td data-label="사유"><input class="r-why" value="${esc(r.reason || "")}"></td>
          <td class="tc-act">${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">공고</a> ` : ""}<button class="r-save ghost" type="button">저장</button> <button class="r-del ghost" type="button">삭제</button></td>
        </tr>`).join("") || `<tr><td colspan="7" class="muted">추천 취업처가 없습니다.</td></tr>`}
    </table></div>
    <div class="row" style="margin-top:8px">
      <input id="nr-co" placeholder="회사명" style="width:auto"><input id="nr-job" placeholder="직무" style="width:auto">
      <label class="small">순위 <input id="nr-pri" type="number" min="1" max="5" value="3" style="width:56px"></label>
      <input id="nr-url" placeholder="공고 링크(https://…)" style="flex:1;min-width:180px">
      <label class="small">마감 <input id="nr-dl" type="date" style="width:auto"></label>
      <button id="nr-add" type="button">추천 추가</button> <span id="nr-msg" class="msg"></span>
    </div>

    <h3 style="margin-top:16px">진로지도 자료</h3>
    <ul class="log">${docs.map((d) => `
      <li data-id="${d.id}"><b>${esc(d.kind)}</b> · ${esc(d.title)} <span class="muted small">${esc(d.doc_date || "")}</span>
        <button class="d-open ghost" type="button">열기</button>
        <label class="small"><input class="d-vis" type="checkbox" ${d.visible_to_student ? "checked" : ""}> 교육생 공개</label>
        <button class="d-del ghost" type="button">삭제</button></li>`).join("") || `<li class="muted">연결된 자료가 없습니다.</li>`}</ul>
    <div class="row">
      <select id="nd-kind" style="width:auto">${opt(DOC_KIND_CAREER, "진로지도")}</select>
      <input id="nd-title" placeholder="자료 제목" style="flex:1;min-width:180px">
      <label class="small">일자 <input id="nd-date" type="date" style="width:auto"></label>
      <input id="nd-file" type="file" style="width:auto" title="개인정보를 마스킹한 파일만 올리세요">
      <input id="nd-url" placeholder="또는 링크" style="width:auto">
      <button id="nd-add" type="button">자료 추가</button> <span id="nd-msg" class="msg"></span>
    </div>
    <label class="small" id="nd-ack-wrap" style="display:none">
      <input id="nd-ack" type="checkbox"> 이 파일에서 연락처·주민번호·생년월일·주소 등 개인정보를 확인해 지웠습니다
    </label>
    <p class="muted small">이력서·자기소개서는 올리지 않습니다. 연락처·주민번호·주소 등은 마스킹한 파일만 올려 주세요. (파일 10MB 이하)</p>`;

  const $ = (s) => host.querySelector(s);
  const reload = () => renderCareerPanel(host, { studentId });

  $("#cp-save").onclick = (e) => withBusy(e.target, async () => {
    const msg = $("#cp-msg"), main = $("#cp-main").value, sub = $("#cp-sub").value;
    if (main && main === sub) return setMsg(msg, "주 직무와 보조 직무가 같습니다", "err");
    const score = $("#cp-score").value;
    if (score !== "" && (!Number.isInteger(Number(score)) || Number(score) < 0 || Number(score) > 100)) {
      return setMsg(msg, "진단점수는 0~100 사이 숫자로 입력하세요", "err");
    }
    try {
      await saveCareerProfile(studentId, {
        primary_category: main || null, secondary_category: sub || null,
        target_title: $("#cp-title").value.trim() || null, track_note: $("#cp-track").value.trim() || null,
        diagnosis_score: score === "" ? null : Number(score), diagnosis_date: $("#cp-sdate").value || null,
        strengths: list($("#cp-str").value), gaps: list($("#cp-gap").value),
        portfolio_status: $("#cp-pf").value || null,
        next_action: $("#cp-next").value.trim() || null, next_due: $("#cp-due").value || null,
        internal_note: $("#cp-note").value.trim() || null,
      });
      setMsg(msg, "저장됨", "ok");
    } catch (err) { setMsg(msg, err.message, "err"); }
  });

  host.querySelectorAll("tr[data-id] .r-save").forEach((b) => (b.onclick = () => withBusy(b, async () => {
    const tr = b.closest("tr");
    const pri = Number(tr.querySelector(".r-pri").value);
    if (!Number.isInteger(pri) || pri < 1 || pri > 5) return toast("순위는 1~5 사이 숫자로 입력하세요", "err");
    const company = tr.querySelector(".r-co").value.trim();
    if (!company) return toast("회사명을 입력하세요", "err");
    try {
      await saveCareerRec({
        id: tr.dataset.id, priority: pri,
        company, job_title: tr.querySelector(".r-job").value.trim() || null,
        deadline: tr.querySelector(".r-dl").value || null, status: tr.querySelector(".r-st").value,
        reason: tr.querySelector(".r-why").value.trim() || null });
      toast("저장했어요.");
    } catch (err) { toast(err.message, "err"); }
  })));
  host.querySelectorAll("tr[data-id] .r-del").forEach((b) => (b.onclick = async () => {
    if (!(await confirmDialog({ title: "추천 취업처를 삭제할까요?", okLabel: "삭제", danger: true }))) return;
    try { await deleteCareerRec(b.closest("tr").dataset.id); reload(); } catch (err) { toast(err.message, "err"); }
  }));
  $("#nr-add").onclick = (e) => withBusy(e.target, async () => {
    const msg = $("#nr-msg"), company = $("#nr-co").value.trim(), url = $("#nr-url").value.trim();
    const pri = Number($("#nr-pri").value);
    if (!company) return setMsg(msg, "회사명을 입력하세요", "err");
    if (!Number.isInteger(pri) || pri < 1 || pri > 5) return setMsg(msg, "순위는 1~5 사이 숫자로 입력하세요", "err");
    if (url && !/^https?:\/\//.test(url)) return setMsg(msg, "링크는 http(s):// 로 시작해야 합니다", "err");
    try {
      await saveCareerRec({ student_id: studentId, company, job_title: $("#nr-job").value.trim() || null,
        priority: pri, url: url || null, deadline: $("#nr-dl").value || null });
      reload();
    } catch (err) { setMsg(msg, err.message, "err"); }
  });

  host.querySelectorAll("li[data-id] .d-open").forEach((b) => (b.onclick = async () => {
    const d = docs.find((x) => x.id === b.closest("li").dataset.id);
    try { window.open(await careerDocUrl(d), "_blank", "noopener"); } catch (err) { toast(err.message, "err"); }
  }));
  host.querySelectorAll("li[data-id] .d-vis").forEach((c) => (c.onchange = async () => {
    try { await setCareerDocVisible(c.closest("li").dataset.id, c.checked); toast(c.checked ? "교육생에게 공개" : "교육생에게 비공개"); }
    catch (err) { toast(err.message, "err"); c.checked = !c.checked; }
  }));
  host.querySelectorAll("li[data-id] .d-del").forEach((b) => (b.onclick = async () => {
    if (!(await confirmDialog({ title: "자료 연결을 삭제할까요?", okLabel: "삭제", danger: true }))) return;
    try { await deleteCareerDoc(docs.find((x) => x.id === b.closest("li").dataset.id)); reload(); } catch (err) { toast(err.message, "err"); }
  }));
  const ndFile = $("#nd-file"), ndAckWrap = $("#nd-ack-wrap");
  ndFile.onchange = () => { ndAckWrap.style.display = ndFile.files[0] ? "" : "none"; $("#nd-ack").checked = false; };
  $("#nd-add").onclick = (e) => withBusy(e.target, async () => {
    const msg = $("#nd-msg"), title = $("#nd-title").value.trim(), file = ndFile.files[0], url = $("#nd-url").value.trim();
    if (!title) return setMsg(msg, "제목을 입력하세요", "err");
    if (!file && !url) return setMsg(msg, "파일 또는 링크가 필요합니다", "err");
    if (file && file.size > 10 * 1024 * 1024) return setMsg(msg, "파일이 10MB를 넘습니다", "err");
    if (file && !$("#nd-ack").checked) return setMsg(msg, "개인정보 확인 체크를 해주세요", "err");
    if (url && !/^https?:\/\//.test(url)) return setMsg(msg, "링크는 http(s):// 로 시작해야 합니다", "err");
    try {
      await addCareerDoc({ student_id: studentId, kind: $("#nd-kind").value, title, doc_date: $("#nd-date").value, url, file });
      reload();
    } catch (err) { setMsg(msg, err.message, "err"); }
  });
}

/* 특이사항 입력 보조: 분류·다음 확인일 옵션 (ops.js 의 renderMentorNotes 에서 사용) */
export const noteTypeOptions = (sel = "진도지도") => opt(NOTE_TYPES, sel);
export { addMentorNote };

/* =====================================================================
   4) 교육생 본인 「내 진로지도」 (진단점수·내부 메모는 서버에서 이미 제외됨)
   ===================================================================== */
export async function renderMyCareer(host) {
  host.innerHTML = `<p class="muted small">불러오는 중…</p>`;
  let d;
  try { d = await getMyCareer(); }
  catch (e) { host.innerHTML = `<p class="msg err">${esc(e.message)}</p>`; return; }
  const p = d.profile;
  if (!p && !d.recommendations.length && !d.documents.length) {
    host.innerHTML = `<p class="muted">담당 강사가 진로지도 내용을 정리해 등록하면 이곳에 표시됩니다.</p>`; return;
  }
  const cat = (c) => (c && d.category_names[c]) || "";
  const ul = (a) => (a && a.length) ? `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<span class="muted small">-</span>`;
  const recRows = d.recommendations.map((r) => `
    <tr>
      <td data-label="순위">${r.priority}</td>
      <td data-label="회사"><b>${esc(r.company)}</b></td>
      <td data-label="직무">${esc(r.job_title || "")}</td>
      <td data-label="마감" class="small">${r.deadline ? `${esc(r.deadline)} <span class="muted">${dday(r.deadline)}</span>` : `<span class="muted">-</span>`}</td>
      <td data-label="상태">${esc(r.status)}</td>
      <td data-label="추천 이유" class="small">${esc(r.reason || "")}</td>
      <td class="tc-act">${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">공고 보기</a>` : ""}</td>
    </tr>`).join("");
  host.innerHTML = `
    ${p ? `
    <p><b>${esc(cat(p.primary_category) || "직무 미정")}</b>${p.secondary_category ? ` <span class="muted">· 보조 ${esc(cat(p.secondary_category))}</span>` : ""}
      ${p.target_title ? ` — ${esc(p.target_title)}` : ""}
      ${p.portfolio_status ? ` <span class="badge">포트폴리오 ${esc(p.portfolio_status)}</span>` : ""}</p>
    ${p.track_note ? `<p class="small muted">${esc(p.track_note)}</p>` : ""}
    <div class="row" style="align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:240px"><span class="muted small">강점</span>${ul(p.strengths)}</div>
      <div style="flex:1;min-width:240px"><span class="muted small">보완할 점</span>${ul(p.gaps)}</div>
    </div>
    ${p.next_action ? `<p><span class="muted small">다음 행동</span><br>${esc(p.next_action)}${p.next_due ? ` <span class="muted small">${esc(p.next_due)} ${dday(p.next_due)}</span>` : ""}</p>` : ""}` : ""}
    ${recRows ? `<h3 style="margin-top:14px">추천 취업처</h3>
      <div class="scroll-x"><table class="tbl-cards">
        <tr><th scope="col">순위</th><th scope="col">회사</th><th scope="col">직무</th><th scope="col">마감</th><th scope="col">상태</th><th scope="col">추천 이유</th><th scope="col"><span class="sr-only">작업</span></th></tr>${recRows}</table></div>
      <p class="muted small">공고는 조기 마감·변경될 수 있으니 지원 직전에 링크에서 다시 확인하세요.</p>` : ""}
    ${d.documents.length ? `<h3 style="margin-top:14px">진로지도 자료</h3>
      <ul class="log">${d.documents.map((x, i) => `
        <li><b>${esc(x.kind)}</b> · ${esc(x.title)} <span class="muted small">${esc(x.doc_date || "")}</span>
          <button class="mc-open ghost" type="button" data-i="${i}">열기</button></li>`).join("")}</ul>` : ""}`;
  host.querySelectorAll(".mc-open").forEach((b) => (b.onclick = async () => {
    try { window.open(await careerDocUrl(d.documents[Number(b.dataset.i)]), "_blank", "noopener"); }
    catch (err) { toast(err.message, "err"); }
  }));
}

/* =====================================================================
   5) 공동훈련센터 「진로지도」 (번호 기준 요약 — 진단점수 ***, 내부 메모·자료·추천 사유 제외)
   ===================================================================== */
export async function paintCenterCareer(pane, cohort) {
  pane.innerHTML = `<div class="card">${skeleton(4)}</div>`;
  let d;
  try { d = await getCareerCenterView(cohort); }
  catch (e) { return renderError(pane, e, () => paintCenterCareer(pane, cohort)); }
  const rows = d.students;
  pane.innerHTML = `
    <div class="card"><h2>진로지도 요약 <span class="muted small">번호 기준 · 진단점수는 학과에서만 확인할 수 있습니다</span></h2>
      <div class="scroll-x"><table class="tbl-cards">
        <tr><th scope="col">번호</th><th scope="col">주 직무</th><th scope="col">보조</th><th scope="col">목표 직무명</th><th scope="col">진단</th><th scope="col">포트폴리오</th><th scope="col">다음 행동</th><th scope="col">추천 취업처</th></tr>
        ${rows.map((r) => `
          <tr>
            <td data-label="번호"><b>${esc(r.code)}</b></td>
            <td data-label="주 직무">${esc(r.primary_category || "")}</td>
            <td data-label="보조" class="muted">${esc(r.secondary_category || "")}</td>
            <td data-label="목표 직무명">${esc(r.target_title || "")}</td>
            <td data-label="진단">${r.diagnosis_score ? esc(r.diagnosis_score) : `<span class="muted">-</span>`}</td>
            <td data-label="포트폴리오">${esc(r.portfolio_status || "")}</td>
            <td data-label="다음 행동" class="small">${esc(r.next_action || "")}${r.next_due ? ` <span class="muted">${esc(r.next_due)} ${dday(r.next_due)}</span>` : ""}</td>
            <td data-label="추천 취업처" class="small">${r.recommendations.length
              ? r.recommendations.map((x) => `${esc(x.company)}${x.deadline ? ` <span class="muted">~${esc(x.deadline.slice(5))}</span>` : ""} <span class="muted">${esc(x.status)}</span>`).join("<br>")
              : `<span class="muted">-</span>`}</td>
          </tr>`).join("")}
      </table></div>
    </div>`;
}

/* =====================================================================
   6) 진로지도 자료 일괄 적재 (일회용 관리자 도구)
   폴더(_진로지도_적재본)를 통째로 선택하면 web/data/career_manifest.json 과
   상대경로("NN-이름/파일명")를 대조해 학생을 찾고 career-docs 에 올린 뒤 career_documents 에 연결한다.
   이미 같은 제목의 자료가 있으면 건너뛴다(중복 방지, 재시도 가능).
   ===================================================================== */
export async function paintBulkImport(pane, cohort) {
  pane.innerHTML = `
    <div class="card">
      <h2>진로지도 자료 일괄 적재 <span class="muted small">일회용 도구 — 적재가 끝나면 이 탭은 지워도 됩니다</span></h2>
      <p class="muted small">바탕화면/다운로드의 <code>수료생관리/_진로지도_적재본</code> 폴더를 선택하세요. 폴더 안 <code>NN-이름</code> 하위 폴더의 파일들을
        <code>career_manifest.json</code>과 대조해 학생별로 올립니다. 매칭되지 않는 파일은 건너뜁니다.</p>
      <input id="bi-dir" type="file" webkitdirectory directory multiple>
      <button id="bi-start" type="button" disabled>적재 시작</button>
      <span id="bi-msg" class="msg"></span>
      <ul id="bi-log" class="log" style="max-height:320px;overflow:auto;margin-top:10px"></ul>
    </div>`;
  const $ = (s) => pane.querySelector(s);
  const dir = $("#bi-dir"), start = $("#bi-start"), msg = $("#bi-msg"), log = $("#bi-log");
  const line = (t) => { const li = document.createElement("li"); li.className = "small"; li.textContent = t; log.appendChild(li); log.scrollTop = log.scrollHeight; };

  let manifest = [];
  try { manifest = await (await fetch("data/career_manifest.json")).json(); }
  catch { setMsg(msg, "manifest 로드 실패 — data/career_manifest.json 확인", "err"); return; }
  const byPath = new Map(manifest.map((m) => [m.path, m]));

  dir.onchange = () => { start.disabled = !dir.files.length; setMsg(msg, `${dir.files.length}개 파일 선택됨`, "ok"); };

  start.onclick = () => withBusy(start, async () => {
    log.innerHTML = "";
    const files = [...dir.files];
    let done = 0, skipped = 0, failed = 0, notInManifest = 0;
    const studentCache = new Map();
    for (const file of files) {
      const rel = file.webkitRelativePath || file.name;
      const parts = rel.split("/");
      const key = parts.slice(-2).join("/");          // "NN-이름/파일명"
      const m = byPath.get(key);
      if (!m) { notInManifest++; continue; }
      try {
        if (!studentCache.has(m.student)) {
          const found = await findStudentByName(cohort, m.student);
          studentCache.set(m.student, found[0] || null);
        }
        const stu = studentCache.get(m.student);
        if (!stu) { line(`⚠️ 학생 매칭 실패: ${m.student} (${m.title})`); failed++; continue; }
        if (await docExists(stu.id, m.title)) { skipped++; continue; }
        await addCareerDoc({ student_id: stu.id, kind: m.kind, title: m.title, doc_date: m.doc_date, file, visible_to_student: m.visible });
        line(`✅ ${m.student} · ${m.title}`);
        done++;
      } catch (err) { line(`❌ ${m.student} · ${m.title} — ${err.message}`); failed++; }
    }
    setMsg(msg, `완료 — 올림 ${done} · 건너뜀(이미 있음) ${skipped} · 실패 ${failed} · manifest 미일치 ${notInManifest}`, failed ? "err" : "ok");
  });
}
