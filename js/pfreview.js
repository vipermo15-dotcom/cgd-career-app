// 포트폴리오 평가(품질 점수) 블록 — 강사·학생 공용.
import {
  listPortfolioReviews, savePortfolioReview, deletePortfolioReview, analyzePortfolio,
  PF_COMPONENTS,
} from "./data.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// opts: { reviewerAs: 'instructor' | 'self' }
export async function renderPortfolioReview(host, studentId, opts = {}) {
  const reviewerAs = opts.reviewerAs || "instructor";
  host.innerHTML = `<p class="muted">평가 불러오는 중…</p>`;
  let rows;
  try { rows = await listPortfolioReviews(studentId); }
  catch (e) { host.innerHTML = `<div class="card err">${esc(e.message)}</div>`; return; }
  const refresh = () => renderPortfolioReview(host, studentId, opts);

  const bars = (r) => PF_COMPONENTS.map(([k, l]) => `
    <div class="fn-row"><span class="fn-label">${l}</span>
      <span class="fn-bar" style="width:${r[k]}%"></span><span class="fn-n">${r[k]}</span></div>`).join("");

  const list = rows.map((r) => `
    <div class="card" data-rid="${r.id}">
      <div class="dhead">
        <h2>${esc(r.title || "(제목 없음)")} <span class="grade ${r.quality_total >= 80 ? "g-a" : r.quality_total >= 60 ? "g-c" : "g-e"}">${Math.round(r.quality_total)}</span></h2>
        <span class="muted small">${esc(r.reviewer)}${r.confidence ? ` · 신뢰도 ${Math.round(r.confidence * 100)}%` : ""} · ${esc((r.created_at || "").slice(0, 10))}</span>
        <button class="pr-del ghost" type="button" style="margin-left:auto">삭제</button>
      </div>
      <div class="funnel">${bars(r)}</div>
      ${r.comment ? `<p class="small">${esc(r.comment)}</p>` : ""}
      ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener" class="small">자료 ↗</a>` : ""}
    </div>`).join("");

  host.innerHTML = `
    <div class="card">
      <h2>포트폴리오 평가 (${rows.length})</h2>
      <p class="muted small">7요소 가중합 (컨셉20·시각20·문제해결15·전개15·타이포10·일관10·제시10)</p>
      <div class="row" style="margin-top:8px">
        <input id="pr-ai-title" placeholder="작업 제목" style="width:auto">
        <input id="pr-ai-src" placeholder="설명 또는 이미지 URL" style="flex:1">
        <button id="pr-ai" class="ghost" type="button">AI 평가</button>
        <span id="pr-ai-msg" class="msg"></span>
      </div>
      <details style="margin-top:8px"><summary class="small">직접 입력</summary>
        <div class="row" style="margin-top:6px">
          <input id="pr-m-title" placeholder="제목" style="width:auto">
          <input id="pr-m-url" placeholder="URL" style="width:auto">
        </div>
        <div class="row">
          ${PF_COMPONENTS.map(([k, l]) =>
            `<label class="small">${l} <input class="pr-m" data-k="${k}" type="number" min="0" max="100" value="70" style="width:56px"></label>`).join("")}
        </div>
        <textarea id="pr-m-comment" rows="2" placeholder="코멘트"></textarea>
        <button id="pr-m-save" class="ghost" type="button">저장</button>
        <span id="pr-m-msg" class="msg"></span>
      </details>
    </div>
    ${list}`;

  host.querySelector("#pr-ai").onclick = async (e) => {
    const msg = host.querySelector("#pr-ai-msg");
    const src = host.querySelector("#pr-ai-src").value.trim();
    if (!src) { msg.className = "msg err"; msg.textContent = "설명 또는 URL 입력"; return; }
    e.target.disabled = true; msg.className = "msg"; msg.textContent = "분석 중…";
    try {
      await analyzePortfolio({ student_id: studentId, title: host.querySelector("#pr-ai-title").value.trim() || null, source: src });
      refresh();
    } catch (err) { msg.className = "msg err"; msg.textContent = err.message; e.target.disabled = false; }
  };
  host.querySelector("#pr-m-save").onclick = async (e) => {
    const msg = host.querySelector("#pr-m-msg");
    const row = { student_id: studentId, reviewer: reviewerAs,
      title: host.querySelector("#pr-m-title").value.trim() || null,
      url: host.querySelector("#pr-m-url").value.trim() || null,
      comment: host.querySelector("#pr-m-comment").value.trim() || null };
    host.querySelectorAll(".pr-m").forEach((i) => (row[i.dataset.k] = Math.max(0, Math.min(100, +i.value || 0))));
    e.target.disabled = true;
    try { await savePortfolioReview(row); refresh(); }
    catch (err) { msg.className = "msg err"; msg.textContent = err.message; e.target.disabled = false; }
  };
  host.querySelectorAll(".pr-del").forEach((b) => {
    b.onclick = async () => {
      if (!confirm("이 평가를 삭제할까요?")) return;
      await deletePortfolioReview(b.closest("[data-rid]").dataset.rid);
      refresh();
    };
  });
}
