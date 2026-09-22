import { signOut } from "../auth.js";
import { toast, confirmDialog, skeleton, renderError, setMsg, withBusy } from "../ui.js";
import {
  getMyDossier, updateArtifact, uploadArtifactFile, signedUrl, setMyGithubUrl,
  listApplications, addApplication, updateApplication, deleteApplication, getEmployment,
  getPreferences, savePreferences, listJobPostings, applyToPosting,
  getTopMatches, getGap, setPrefConditions,
  STAGES, STATUS, ARTIFACT_TYPES, APPLICATION_STATUS, JOB_CATEGORIES,
  EMPLOYMENT_TYPES, GRADE_CLASS,
} from "../data.js";
import { renderInterviews } from "./ops.js";
import { renderSkillBlock } from "../skillblock.js";
import { renderCoach } from "../coach.js";
import { renderPortfolioReview } from "../pfreview.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const dState = (deadline) => {
  if (!deadline) return "";
  const d = Math.ceil((new Date(deadline) - new Date()) / 86400000);
  return d < 0 ? "마감" : "D-" + d;
};

// 파일 업로드형 vs 링크형
const INPUT_KIND = {
  "이력서": "file", "자기소개서": "file", "포트폴리오PDF": "file",
  "HTML랜딩": "url", "피그마포폴": "url", "어도비포폴": "url",
};

export async function renderStudent(el, { session, profile }) {
  el.innerHTML = `
    <header class="topbar">
      <strong>내 취업 준비</strong>
      <span class="muted small">${esc(session.user.email)}</span>
      <a href="#/" class="ghost home-link" title="홈으로">🏠 홈</a>
      <button id="so" class="ghost">로그아웃</button>
    </header>
    <section id="pane">${skeleton(4)}</section>`;
  el.querySelector("#so").onclick = signOut;

  if (!profile.student_id) {
    el.querySelector("#pane").innerHTML =
      `<div class="card err">학생 번호가 계정에 연결되지 않았습니다. 담당 강사에게 문의하세요.</div>`;
    return;
  }
  paint(el.querySelector("#pane"), profile.student_id);
}

async function paint(pane, studentId) {
  pane.innerHTML = skeleton(4);
  let d;
  let apps = [], emp = null, prefs = [], postings = [], matches = [];
  try {
    [d, apps, emp, prefs, postings, matches] = await Promise.all([
      getMyDossier(studentId), listApplications(studentId), getEmployment(studentId),
      getPreferences(studentId), listJobPostings(), getTopMatches(studentId),
    ]);
  } catch (e) { return renderError(pane, e, () => paint(pane, studentId)); }
  const s = d.student;
  const appliedPids = new Set(apps.map((a) => a.job_posting_id).filter(Boolean));
  const matchByPid = {}; (matches || []).forEach((m) => (matchByPid[m.posting_id] = m));
  const gradeBadge = (m) => m
    ? `<span class="grade ${GRADE_CLASS[m.grade] || ""}">${m.grade} ${Math.round(m.total)}</span>` : "";

  const prefByRank = {}; prefs.forEach((p) => (prefByRank[p.rank] = p.category_code));
  const catOptions = (sel) => `<option value="">(없음)</option>` +
    Object.entries(JOB_CATEGORIES).map(([k, v]) =>
      `<option value="${k}" ${k === sel ? "selected" : ""}>${k} · ${v}</option>`).join("");

  const stepper = STAGES.map((st) => {
    const done = STAGES.indexOf(st) <= STAGES.indexOf(s.stage);
    return `<li class="${done ? "done" : ""} ${st === s.stage ? "cur" : ""}">${esc(st)}</li>`;
  }).join("");

  const arts = (s.artifacts || []).sort((a, b) =>
    ARTIFACT_TYPES.indexOf(a.type) - ARTIFACT_TYPES.indexOf(b.type))
    .map((a) => artifactCard(a)).join("");

  const log = d.activity.map((l) =>
    `<li class="small"><span class="muted">${esc(l.created_at?.slice(0, 16).replace("T", " "))}</span>
     · ${esc(l.action)} ${l.detail ? "— " + esc(l.detail) : ""}</li>`).join("")
    || "<li class='muted'>이력 없음</li>";

  pane.innerHTML = `
    <div class="card">
      <h2>${esc(s.display_name || s.code)} <span class="muted small">${esc(s.code)} · ${esc(s.track || "")}</span></h2>
      <ol class="stepper">${stepper}</ol>
      <p>상태: <span class="badge">${esc(STATUS[s.status] || s.status)}</span>
        <span class="muted small">단계·상태는 담당 강사가 관리합니다.</span></p>
    </div>

    <div class="card">
      <h2>희망 직무 (최대 3)</h2>
      <div class="row">
        <label class="small">1순위 <select id="pref1" style="width:auto">${catOptions(prefByRank[1])}</select></label>
        <label class="small">2순위 <select id="pref2" style="width:auto">${catOptions(prefByRank[2])}</select></label>
        <label class="small">3순위 <select id="pref3" style="width:auto">${catOptions(prefByRank[3])}</select></label>
        <button id="pref-save">저장</button>
        <span id="pref-msg" class="msg"></span>
      </div>
      <div class="row">
        <label class="small">희망 고용형태
          <select id="pref-et" style="width:auto">
            <option value="">무관</option>
            ${EMPLOYMENT_TYPES.map((t) => `<option ${t === s.pref_employment_type ? "selected" : ""}>${t}</option>`).join("")}
          </select></label>
        <label class="small">희망 지역
          <input id="pref-loc" value="${esc(s.pref_location || "")}" placeholder="예: 서울" style="width:auto"></label>
        <button id="prefc-save" class="ghost">조건 저장</button>
        <span id="prefc-msg" class="msg"></span>
      </div>
      <p class="muted small">같은 직무를 두 순위에 넣을 수 없습니다. 조건은 매칭 점수에 반영됩니다.</p>
    </div>

    <div class="card">
      <h2>맞춤 추천</h2>
      ${(matches || []).length ? `<div class="scroll-x"><table class="tbl-cards">
        <tr><th>등급</th><th>기업</th><th>공고명</th><th>마감</th><th></th></tr>
        ${matches.slice(0, 8).map((m) => `
          <tr data-mpid="${m.posting_id}">
            <td class="tc-title">${gradeBadge(m)} <span class="muted small">${esc(m.grade_label)}</span></td>
            <td data-label="기업">${esc(m.company)}</td>
            <td class="tc-wide" data-label="공고명">${esc(m.title)}</td>
            <td class="small" data-label="마감">${esc(m.deadline || "") || "—"} ${dState(m.deadline)}</td>
            <td class="tc-act"><button class="m-gap ghost" type="button">GAP</button>
                ${appliedPids.has(m.posting_id) ? `<span class="muted small">등록됨</span>`
                  : `<button class="jp-apply ghost" data-pid="${m.posting_id}" type="button">관심</button>`}</td>
          </tr>`).join("")}
      </table></div><div id="gapbox"></div>`
        : `<p class="muted">추천할 ACTIVE 공고가 없거나, 희망직무·역량을 먼저 입력하세요.</p>`}
    </div>

    <div class="card">
      <h2>산출물</h2>
      <label class="chk"><input type="checkbox" id="pii-ok">
        업로드 파일에서 <b>주민번호·주소·연락처 등 민감정보를 제거</b>했습니다.</label>
      <div id="arts">${arts}</div>
    </div>

    <div class="card">
      <h2>포트폴리오 깃허브</h2>
      <div class="row">
        <input id="gh-url" value="${esc(s.github_url || "")}" placeholder="https://github.com/내계정/포트폴리오" style="flex:1;min-width:220px">
        <button id="gh-save" class="ghost" type="button">저장</button>
        <span id="gh-msg" class="msg"></span>
      </div>
      <p class="muted small">담당 강사·관리자가 DASHBOARD·학생 상세에서 이 링크를 함께 볼 수 있습니다.</p>
    </div>

    <div class="card">
      <h2>내 면접 · 지원기업 자료</h2>
      <p class="muted small">면접을 볼 기업·직무를 등록하고, 면접 결과(합격·불합격)와 제출한 이력서·자소서·포트폴리오, 받은 피드백 자료를 올려 두세요.</p>
      <div id="my-interviews"></div>
    </div>

    <div class="card">
      <h2>내 지원 관리 (${apps.length})</h2>
      ${emp ? `<p class="badge">🎉 취업 확정 · ${esc(emp.company)}${emp.position ? " · " + esc(emp.position) : ""}</p>` : ""}
      <div class="scroll-x"><table class="tbl-cards">
        <tr><th>회사</th><th>직무명</th><th>상태</th><th>지원일</th><th></th></tr>
        ${apps.map((a) => `
          <tr data-app="${a.id}">
            <td class="tc-title">${esc(a.company)}</td>
            <td data-label="직무명">${esc(a.position || "") || "—"}</td>
            <td data-label="상태"><select class="ap-status">
              ${Object.entries(APPLICATION_STATUS).map(([k, v]) =>
                `<option value="${k}" ${k === a.status ? "selected" : ""}>${v}</option>`).join("")}
            </select></td>
            <td data-label="지원일"><input class="ap-date" type="date" value="${esc(a.applied_at || "")}"></td>
            <td class="tc-act"><button class="ap-del ghost" type="button">삭제</button></td>
          </tr>`).join("") || `<tr><td colspan="5" class="muted">지원 내역 없음</td></tr>`}
      </table></div>
      <button id="ap-save" class="ghost">저장</button> <span id="ap-msg" class="msg"></span>
      <div class="row" style="margin-top:10px">
        <input id="na-company" placeholder="회사명" style="width:auto">
        <input id="na-pos" placeholder="직무명" style="width:auto">
        <input id="na-date" type="date" style="width:auto">
        <button id="na-add" type="button">지원 추가</button>
      </div>
    </div>

    <div id="skillblock"></div>

    <div id="pfreviewbox"></div>

    <div id="coachbox"></div>

    <div class="card">
      <h2>채용공고 (${postings.length})</h2>
      <div class="scroll-x"><table class="tbl-cards">
        <tr><th>기업</th><th>공고명</th><th>분류</th><th>마감</th><th></th></tr>
        ${postings.map((p) => `
          <tr>
            <td class="tc-title">${esc(p.company)} ${gradeBadge(matchByPid[p.id])}</td>
            <td class="tc-wide" data-label="공고명">${esc(p.title)}${p.url ? ` <a href="${esc(p.url)}" target="_blank" rel="noopener" class="small">↗</a>` : ""}</td>
            <td data-label="분류">${esc(JOB_CATEGORIES[p.job_category] || "") || "—"}</td>
            <td data-label="마감">${esc(p.deadline || "") || "—"} <span class="muted small">${dState(p.deadline)}</span></td>
            <td class="tc-act">${appliedPids.has(p.id)
              ? `<span class="muted small">등록됨</span>`
              : `<button class="jp-apply ghost" data-pid="${p.id}" type="button">관심 등록</button>`}</td>
          </tr>`).join("") || `<tr><td colspan="5" class="muted">등록된 공고 없음</td></tr>`}
      </table></div>
    </div>

    <div class="card"><h2>내 진행 이력</h2><ul class="log">${log}</ul></div>`;

  renderSkillBlock(pane.querySelector("#skillblock"), studentId, { canVerify: false, canEditExperience: false });
  renderPortfolioReview(pane.querySelector("#pfreviewbox"), studentId, { reviewerAs: "self" });
  renderCoach(pane.querySelector("#coachbox"), studentId);
  wireArtifacts(pane, s, studentId, () => paint(pane, studentId));
  wireApplications(pane, studentId, () => paint(pane, studentId));
  renderInterviews(pane.querySelector("#my-interviews"), { studentId, code: s.code });

  pane.querySelector("#gh-save").onclick = async (e) => {
    const url = pane.querySelector("#gh-url").value.trim();
    const m = pane.querySelector("#gh-msg");
    if (url && !/^https?:\/\//.test(url)) { setMsg(m, "http(s):// 로 시작하는 주소를 입력하세요", "err"); return; }
    await withBusy(e.target, async () => {
      try { await setMyGithubUrl(url || null); setMsg(m, "저장됨", "ok"); }
      catch (err) { setMsg(m, err.message, "err"); }
    });
  };

  pane.querySelectorAll(".jp-apply").forEach((b) => {
    b.onclick = async () => {
      b.disabled = true;
      const p = postings.find((x) => x.id === b.dataset.pid)
        || (matches || []).find((m) => m.posting_id === b.dataset.pid);
      try { await applyToPosting(studentId, { ...p, id: b.dataset.pid }); paint(pane, studentId); }
      catch (e) { b.disabled = false; toast(e.message, "err"); }
    };
  });

  pane.querySelector("#prefc-save").onclick = async (e) => {
    const m = pane.querySelector("#prefc-msg");
    try {
      await setPrefConditions(studentId, {
        pref_employment_type: pane.querySelector("#pref-et").value || null,
        pref_location: pane.querySelector("#pref-loc").value.trim() || null,
      });
      m.className = "msg ok"; m.textContent = "저장됨"; paint(pane, studentId);
    } catch (err) { m.className = "msg err"; m.textContent = err.message; }
  };

  pane.querySelectorAll(".m-gap").forEach((b) => {
    b.onclick = async () => {
      const box = pane.querySelector("#gapbox");
      const pid = b.closest("tr").dataset.mpid;
      box.innerHTML = `<p class="muted small">GAP 분석 중…</p>`;
      try {
        const g = await getGap(studentId, pid);
        box.innerHTML = g.gaps.length
          ? `<ul class="gates">${g.gaps.map((x) =>
              `<li>${esc(x.name)} <span class="muted small">(${x.type}) 현재 ${x.current} → 목표 ${x.target}</span></li>`).join("")}</ul>`
          : `<p class="muted small">부족 항목 없음 — 지원 준비 완료</p>`;
      } catch (e) { box.innerHTML = `<p class="msg err">${esc(e.message)}</p>`; }
    };
  });

  pane.querySelector("#pref-save").onclick = async (e) => {
    const msg = pane.querySelector("#pref-msg");
    const codes = ["pref1", "pref2", "pref3"].map((i) => pane.querySelector("#" + i).value);
    const filled = codes.filter(Boolean);
    if (new Set(filled).size !== filled.length) {
      msg.className = "msg err"; msg.textContent = "직무가 중복됩니다"; return;
    }
    e.target.disabled = true;
    try {
      await savePreferences(studentId, codes);
      msg.className = "msg ok"; msg.textContent = "저장됨";
      paint(pane, studentId);
    } catch (err) { msg.className = "msg err"; msg.textContent = err.message; e.target.disabled = false; }
  };
}

function wireApplications(pane, studentId, refresh) {
  const msg = pane.querySelector("#ap-msg");
  pane.querySelector("#ap-save").onclick = async (e) => {
    e.target.disabled = true;
    try {
      for (const row of pane.querySelectorAll("tr[data-app]")) {
        await updateApplication(row.dataset.app, {
          status: row.querySelector(".ap-status").value,
          applied_at: row.querySelector(".ap-date").value || null,
        });
      }
      msg.className = "msg ok"; msg.textContent = "저장됨";
      refresh();
    } catch (err) { msg.className = "msg err"; msg.textContent = err.message; e.target.disabled = false; }
  };
  pane.querySelectorAll(".ap-del").forEach((b) => {
    b.onclick = async () => {
      const ok = await confirmDialog({
        title: "이 지원 건을 삭제할까요?", body: "삭제하면 되돌릴 수 없어요.", okLabel: "삭제", danger: true,
      });
      if (!ok) return;
      try { await deleteApplication(b.closest("tr").dataset.app); toast("삭제했어요."); refresh(); }
      catch (err) { toast(err.message, "err"); }
    };
  });
  pane.querySelector("#na-add").onclick = async (e) => {
    const company = pane.querySelector("#na-company").value.trim();
    if (!company) { msg.className = "msg err"; msg.textContent = "회사명을 입력하세요"; return; }
    e.target.disabled = true;
    try {
      await addApplication(studentId, {
        company,
        position: pane.querySelector("#na-pos").value.trim() || null,
        applied_at: pane.querySelector("#na-date").value || null,
        status: "INTERESTED",
      });
      refresh();
    } catch (err) { msg.className = "msg err"; msg.textContent = err.message; e.target.disabled = false; }
  };
}

function artifactCard(a) {
  const kind = INPUT_KIND[a.type] || "url";
  const statusSel = ["미확인", "진행", "완료"]
    .map((v) => `<option ${v === a.status ? "selected" : ""}>${v}</option>`).join("");
  const input = kind === "file"
    ? `<input type="file" class="a-file" accept=".pdf,.png,.jpg,.jpeg" />
       ${a.storage_path ? `<button class="a-view ghost" type="button">현재 파일 보기</button>` : ""}`
    : `<input type="url" class="a-url" value="${esc(a.external_url || "")}" placeholder="https://" />`;
  return `
    <div class="artcard" data-art="${a.id}" data-type="${esc(a.type)}" data-kind="${kind}">
      <div class="arthead"><b>${esc(a.type)}</b>
        <select class="a-status">${statusSel}</select></div>
      ${input}
      <button class="a-save" type="button">저장</button>
      <span class="msg"></span>
    </div>`;
}

function wireArtifacts(pane, student, studentId, refresh) {
  pane.querySelectorAll(".artcard").forEach((card) => {
    const msg = card.querySelector(".msg");
    const id = card.dataset.art, type = card.dataset.type, kind = card.dataset.kind;

    const view = card.querySelector(".a-view");
    if (view) view.onclick = async () => {
      try {
        const art = (student.artifacts || []).find((x) => x.id === id);
        const url = await signedUrl(art.storage_path);
        window.open(url, "_blank", "noopener");
      } catch (e) { msg.className = "msg err"; msg.textContent = e.message; }
    };

    card.querySelector(".a-save").onclick = async (e) => {
      const btn = e.target;
      btn.disabled = true; msg.className = "msg"; msg.textContent = "";
      try {
        if (kind === "file") {
          const f = card.querySelector(".a-file").files[0];
          if (f) {
            if (!pane.querySelector("#pii-ok").checked) {
              msg.className = "msg err";
              msg.textContent = "민감정보 제거 확인란을 먼저 체크하세요";
              btn.disabled = false; return;
            }
            await uploadArtifactFile(student.code, id, type, f);   // activity_log 는 DB 트리거가 기록
          } else {
            await updateArtifact(id, { status: card.querySelector(".a-status").value });
          }
        } else {
          await updateArtifact(id, {
            status: card.querySelector(".a-status").value,
            external_url: card.querySelector(".a-url").value.trim() || null,
          });   // activity_log 는 DB 트리거가 기록
        }
        msg.className = "msg ok"; msg.textContent = "저장됨";
        refresh();
      } catch (err) { msg.className = "msg err"; msg.textContent = err.message; btn.disabled = false; }
    };
  });
}
