// 이력서 ATS 평가 블록 — 강사 전용(student.js 에선 사용 안 함).
import { listResumeReviews, analyzeResume } from "./data.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export async function renderResumeReview(host, studentId) {
  host.innerHTML = `<p class="muted">평가 불러오는 중…</p>`;
  let rows;
  try { rows = await listResumeReviews(studentId); }
  catch (e) { host.innerHTML = `<div class="card err">${esc(e.message)}</div>`; return; }
  const refresh = () => renderResumeReview(host, studentId);

  const list = rows.map((r) => `
    <div class="card" data-rid="${r.id}">
      <div class="dhead">
        <h2>${esc(r.posting_title ? `${r.posting_company} · ${r.posting_title}` : "일반 평가")}
          <span class="grade ${r.ats_score >= 80 ? "g-a" : r.ats_score >= 60 ? "g-c" : "g-e"}">${r.ats_score}</span></h2>
        <span class="muted small">키워드 일치 ${r.keyword_match_pct ?? "-"}% · ${r.validated ? "검증완료" : "미검증"} · ${esc((r.created_at || "").slice(0, 10))}</span>
      </div>
      ${r.keywords_matched?.length ? `<p class="small">일치: ${r.keywords_matched.map(esc).join(", ")}</p>` : ""}
      ${r.keywords_missing?.length ? `<p class="small muted">누락: ${r.keywords_missing.map(esc).join(", ")}</p>` : ""}
      ${r.comment ? `<p class="small">${esc(r.comment)}</p>` : ""}
    </div>`).join("");

  host.innerHTML = `
    <div class="card">
      <h2>이력서 ATS 평가 (${rows.length})</h2>
      <p class="muted small">채용공고를 지정하면 그 공고의 요구 스킬·자격요건 대비 키워드 매칭을 평가합니다. 미지정 시 일반 기준.</p>
      <textarea id="rr-text" rows="6" placeholder="이력서 전문 텍스트를 붙여넣으세요"></textarea>
      <div class="row" style="margin-top:8px">
        <input id="rr-posting" placeholder="채용공고 ID(선택, 비워도 됨)" style="flex:1">
        <button id="rr-ai" class="ghost" type="button">AI 평가</button>
        <span id="rr-ai-msg" class="msg"></span>
      </div>
    </div>
    ${list}`;

  host.querySelector("#rr-ai").onclick = async (e) => {
    const msg = host.querySelector("#rr-ai-msg");
    const text = host.querySelector("#rr-text").value.trim();
    if (!text) { msg.className = "msg err"; msg.textContent = "이력서 텍스트를 입력하세요"; return; }
    e.target.disabled = true; msg.className = "msg"; msg.textContent = "평가 중(최대 1분)…";
    try {
      await analyzeResume({
        student_id: studentId,
        resume_text: text,
        posting_id: host.querySelector("#rr-posting").value.trim() || null,
      });
      refresh();
    } catch (err) { msg.className = "msg err"; msg.textContent = err.message; e.target.disabled = false; }
  };
}
