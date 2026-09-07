// 역량(Skill/Tool) + Readiness 편집 블록 — 강사·학생 공용.
import {
  listSkills, listTools, getStudentSkills, getStudentTools, getReadiness,
  saveStudentSkill, saveStudentTool, deleteStudentSkill, deleteStudentTool,
  setExperienceMonths, SKILL_LEVELS,
} from "./data.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const lvOpts = (sel) => Object.entries(SKILL_LEVELS)
  .map(([k, v]) => `<option value="${k}" ${+k === sel ? "selected" : ""}>${k} ${v}</option>`).join("");

// host: 렌더 대상 요소 / studentId / opts: { canVerify:boolean, canEditExperience:boolean }
export async function renderSkillBlock(host, studentId, opts = {}) {
  const { canVerify = false, canEditExperience = false } = opts;
  host.innerHTML = `<p class="muted">역량 불러오는 중…</p>`;
  let skills, tools, sk, st, rd;
  try {
    [skills, tools, sk, st, rd] = await Promise.all([
      listSkills(), listTools(), getStudentSkills(studentId), getStudentTools(studentId),
      getReadiness(studentId),
    ]);
  } catch (e) { host.innerHTML = `<div class="card err">역량 로드 실패: ${esc(e.message)}</div>`; return; }

  const refresh = () => renderSkillBlock(host, studentId, opts);
  const c = rd.components;
  const bars = [
    ["Skill", c.skill], ["Tool", c.tool], ["Portfolio", c.portfolio],
    ["Evidence", c.evidence], ["Experience", c.experience],
  ].map(([l, v]) => `
    <div class="fn-row"><span class="fn-label">${l}</span>
      <span class="fn-bar" style="width:${Math.round(v)}%"></span>
      <span class="fn-n">${v}</span></div>`).join("");

  const rowsHtml = (items, ref, key) => items.map((it) => {
    const name = (ref.find((r) => r.id === it[key]) || {}).name || it[key];
    return `<tr data-row="${it.id}" data-kind="${key}" data-kid="${esc(it[key])}">
      <td>${esc(name)}</td>
      <td><select class="sb-lv">${lvOpts(it.level)}</select></td>
      <td><input class="sb-ev" type="number" min="0" max="100" value="${it.evidence_confidence}" style="width:64px"> %</td>
      <td>${canVerify
        ? `<label class="small"><input type="checkbox" class="sb-vf" ${it.evidence_verified ? "checked" : ""}> 검증</label>`
        : (it.evidence_verified ? "✅검증" : "-")}</td>
      <td><button class="sb-save ghost" type="button">저장</button>
          <button class="sb-del ghost" type="button">삭제</button></td>
    </tr>`;
  }).join("");

  const addRow = (ref, key, usedIds) => {
    const avail = ref.filter((r) => !usedIds.includes(r.id));
    return `<div class="row" style="margin-top:8px">
      <select class="sb-add-id" data-kind="${key}" style="width:auto">
        ${avail.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join("")}
      </select>
      <select class="sb-add-lv" style="width:auto">${lvOpts(3)}</select>
      <input class="sb-add-ev" type="number" min="0" max="100" value="0" style="width:64px"> %
      <button class="sb-add ghost" data-kind="${key}" type="button">추가</button>
    </div>`;
  };

  host.innerHTML = `
    <div class="card">
      <h2>준비도 <b style="font-size:24px">${rd.total}</b><span class="muted small"> / 100</span></h2>
      <div class="funnel">${bars}</div>
      ${canEditExperience ? `
        <div class="row"><label class="small">경력(개월)
          <input id="sb-exp" type="number" min="0" value="${rd.experience_months}" style="width:80px"></label>
          <button id="sb-exp-save" class="ghost" type="button">저장</button>
          <span id="sb-exp-msg" class="msg"></span></div>` : ""}
    </div>
    <div class="card">
      <h2>Skill (${sk.length})</h2>
      <div class="scroll-x"><table>
        <tr><th>항목</th><th>레벨(자기평가)</th><th>Evidence</th><th>검증</th><th></th></tr>
        ${rowsHtml(sk, skills, "skill_id") || `<tr><td colspan="5" class="muted">없음</td></tr>`}
      </table></div>
      ${addRow(skills, "skill", sk.map((x) => x.skill_id))}
      <span class="msg sb-msg"></span>
    </div>
    <div class="card">
      <h2>Tool (${st.length})</h2>
      <div class="scroll-x"><table>
        <tr><th>항목</th><th>레벨</th><th>Evidence</th><th>검증</th><th></th></tr>
        ${rowsHtml(st, tools, "tool_id") || `<tr><td colspan="5" class="muted">없음</td></tr>`}
      </table></div>
      ${addRow(tools, "tool", st.map((x) => x.tool_id))}
    </div>`;

  const save = (kind) => kind === "skill" ? saveStudentSkill : saveStudentTool;
  const del = (kind) => kind === "skill" ? deleteStudentSkill : deleteStudentTool;
  const idKey = (kind) => kind === "skill" ? "skill_id" : "tool_id";
  const msg = host.querySelector(".sb-msg");

  host.querySelectorAll("tr[data-row]").forEach((tr) => {
    const kind = tr.dataset.kind === "skill_id" ? "skill" : "tool";
    tr.querySelector(".sb-save").onclick = async () => {
      const patch = {
        level: +tr.querySelector(".sb-lv").value,
        evidence_confidence: Math.max(0, Math.min(100, +tr.querySelector(".sb-ev").value || 0)),
      };
      if (canVerify) patch.evidence_verified = tr.querySelector(".sb-vf").checked;
      try {
        await save(kind)(studentId, tr.dataset.kid, patch);
        refresh();
      } catch (e) { if (msg) { msg.className = "msg err"; msg.textContent = e.message; } }
    };
    tr.querySelector(".sb-del").onclick = async () => {
      await del(kind)(tr.dataset.row);
      refresh();
    };
  });

  host.querySelectorAll(".sb-add").forEach((btn) => {
    btn.onclick = async () => {
      const kind = btn.dataset.kind;
      const wrap = btn.closest(".row");
      const kid = wrap.querySelector(".sb-add-id").value;
      if (!kid) return;
      try {
        await save(kind)(studentId, kid, {
          level: +wrap.querySelector(".sb-add-lv").value,
          evidence_confidence: Math.max(0, Math.min(100, +wrap.querySelector(".sb-add-ev").value || 0)),
        });
        refresh();
      } catch (e) { if (msg) { msg.className = "msg err"; msg.textContent = e.message; } }
    };
  });

  if (canEditExperience) {
    host.querySelector("#sb-exp-save").onclick = async (e) => {
      const m = host.querySelector("#sb-exp-msg");
      try {
        await setExperienceMonths(studentId, Math.max(0, +host.querySelector("#sb-exp").value || 0));
        m.className = "msg ok"; m.textContent = "저장됨"; refresh();
      } catch (err) { m.className = "msg err"; m.textContent = err.message; }
    };
  }
}
