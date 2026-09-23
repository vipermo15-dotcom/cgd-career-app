// 공통 UI — 알림(toast) · 확인 대화상자 · 로딩 자리표시 · 오류 카드 · 저장 중 버튼
// alert()/confirm() 대신 사용한다. (스타일은 app.css 의 .toast / .dlg / .skel / .card.err)

/* ---------- 알림 ---------- */
function toastWrap() {
  let w = document.getElementById("toast-wrap");
  if (!w) {
    w = document.createElement("div");
    w.id = "toast-wrap";
    document.body.append(w);
  }
  return w;
}

/**
 * 화면 구석에 짧은 알림을 띄운다.
 * type: "ok" | "err" | "info"   opts: { actionLabel, onAction, duration(ms) }
 * 반환: 알림을 닫는 함수
 */
export function toast(message, type = "ok", opts = {}) {
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.setAttribute("role", type === "err" ? "alert" : "status");

  const text = document.createElement("span");
  text.className = "toast-msg";
  text.textContent = message;
  el.append(text);

  let timer;
  const close = () => { clearTimeout(timer); el.remove(); };

  if (opts.actionLabel && opts.onAction) {
    const act = document.createElement("button");
    act.type = "button";
    act.className = "toast-act";
    act.textContent = opts.actionLabel;
    act.onclick = () => { close(); opts.onAction(); };
    el.append(act);
  }
  const x = document.createElement("button");
  x.type = "button";
  x.className = "toast-x ghost";
  x.setAttribute("aria-label", "알림 닫기");
  x.textContent = "×";
  x.onclick = close;
  el.append(x);

  toastWrap().append(el);
  // 오류는 읽을 시간을 더 준다. duration: 0 이면 자동으로 닫히지 않음.
  const ms = opts.duration ?? (type === "err" ? 8000 : 4000);
  if (ms > 0) timer = setTimeout(close, ms);
  return close;
}

/* ---------- 확인 대화상자 ---------- */
let dlgSeq = 0;

/**
 * confirm() 대체. Promise<boolean> 을 돌려준다.
 * 안전을 위해 처음 포커스는 "취소" 버튼에 둔다. Esc / 바깥 클릭 = 취소.
 */
export function confirmDialog({ title, body = "", okLabel = "확인", cancelLabel = "취소", danger = false }) {
  return new Promise((resolve) => {
    const id = "dlg" + ++dlgSeq;
    const prevFocus = document.activeElement;

    const back = document.createElement("div");
    back.className = "dlg-back";

    const dlg = document.createElement("div");
    dlg.className = "dlg";
    dlg.setAttribute("role", "alertdialog");
    dlg.setAttribute("aria-modal", "true");
    dlg.setAttribute("aria-labelledby", id + "t");
    if (body) dlg.setAttribute("aria-describedby", id + "b");

    const h = document.createElement("h2");
    h.id = id + "t";
    h.textContent = title;
    dlg.append(h);

    if (body) {
      const p = document.createElement("p");
      p.id = id + "b";
      p.textContent = body;
      dlg.append(p);
    }

    const row = document.createElement("div");
    row.className = "dlg-row";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "ghost";
    cancel.textContent = cancelLabel;
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = danger ? "danger" : "";
    ok.textContent = okLabel;
    row.append(cancel, ok);
    dlg.append(row);

    back.append(dlg);
    document.body.append(back);
    cancel.focus();

    const done = (v) => {
      document.removeEventListener("keydown", onKey, true);
      back.remove();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); done(false); return; }
      if (e.key === "Tab") {           // 포커스가 대화상자 밖으로 나가지 않게 가둔다
        const first = cancel, last = ok;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    cancel.onclick = () => done(false);
    ok.onclick = () => done(true);
    back.addEventListener("mousedown", (e) => { if (e.target === back) done(false); });
  });
}

/**
 * 개인정보 보호정책 확인 대화상자 — 체크 전에는 닫을 수 없음(Esc·바깥 클릭 무시).
 * onAck: 체크 후 확인 버튼을 눌렀을 때 호출되는 async 함수(서버에 감사 기록을 남기는 용도).
 *        실패하면 대화상자를 닫지 않고 오류만 보여준다(반드시 기록이 남아야 진행되게).
 */
export function privacyAckDialog({ title, bodyHtml, ackLabel, okLabel = "확인하고 시작", onAck }) {
  return new Promise((resolve) => {
    const back = document.createElement("div");
    back.className = "dlg-back";

    const dlg = document.createElement("div");
    dlg.className = "dlg dlg-wide";
    dlg.setAttribute("role", "alertdialog");
    dlg.setAttribute("aria-modal", "true");

    const h = document.createElement("h2");
    h.textContent = title;
    dlg.append(h);

    const body = document.createElement("div");
    body.className = "dlg-body";
    body.innerHTML = bodyHtml;
    dlg.append(body);

    const ack = document.createElement("label");
    ack.className = "dlg-ack";
    ack.innerHTML = `<input type="checkbox" id="dlg-ack-chk"><span>${ackLabel}</span>`;
    dlg.append(ack);

    const msg = document.createElement("p");
    msg.className = "msg err";
    msg.style.display = "none";
    dlg.append(msg);

    const row = document.createElement("div");
    row.className = "dlg-row";
    const ok = document.createElement("button");
    ok.type = "button";
    ok.textContent = okLabel;
    ok.disabled = true;
    row.append(ok);
    dlg.append(row);

    back.append(dlg);
    document.body.append(back);

    const chk = ack.querySelector("#dlg-ack-chk");
    chk.onchange = () => { ok.disabled = !chk.checked; };
    ok.onclick = async () => {
      ok.disabled = true; msg.style.display = "none";
      try {
        if (onAck) await onAck();
        back.remove();
        resolve(true);
      } catch (e) {
        msg.textContent = e.message || "확인 처리에 실패했습니다. 다시 시도해 주세요.";
        msg.style.display = "";
        ok.disabled = !chk.checked;
      }
    };
    // 체크 전에는 Esc·바깥 클릭으로 닫을 수 없음(의도적 — 확인 없이 진행 불가)
  });
}

/* ---------- 로딩 자리표시 ---------- */
export function skeleton(rows = 4) {
  const widths = [72, 92, 58, 84, 66, 78];
  return `<div class="skel-list" role="status" aria-label="불러오는 중">${
    Array.from({ length: rows }, (_, i) => `<div class="skel" style="width:${widths[i % widths.length]}%"></div>`).join("")
  }</div>`;
}

/* ---------- 오류 카드 (다시 시도 버튼 포함) ---------- */
export function renderError(pane, err, retry) {
  pane.innerHTML = `<div class="card err" role="alert">
      <h2>불러오지 못했어요</h2>
      <p class="errmsg"></p>
      ${retry ? '<button type="button" class="retry">다시 시도</button>' : ""}
    </div>`;
  pane.querySelector(".errmsg").textContent = (err && err.message) || String(err || "");
  if (retry) pane.querySelector(".retry").onclick = retry;
}

/* ---------- 저장 중 버튼 (중복 클릭 방지) ---------- */
export async function withBusy(btn, fn, busyLabel = "저장 중…") {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = busyLabel;
  try { return await fn(); }
  finally { btn.disabled = false; btn.textContent = label; }
}

/* ---------- 결과 문구 (행 안의 "저장됨" 등) ---------- */
// className 을 통째로 바꾸면 .u-msg 같은 선택자 클래스가 사라져 두 번째 저장에서 오류가 나므로 classList 로만 바꾼다.
export function setMsg(el, text, type = "ok") {
  el.classList.remove("ok", "err");
  el.classList.add("msg", type);
  el.textContent = text;
}

/* ---------- 탭 버튼 (아이콘 + 이름) — 관리자·강사 화면 공용 ---------- */
// nav 에 class="tabs with-icons" 를 붙이면 PC 사이드바 / 모바일 하단 탭(아이콘 위, 이름 아래)으로 보인다.
const CAL = '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>';
const USERS = '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 010 6.8"/><path d="M18.5 14.4c1.9.8 3 2.6 3 5.6"/>';
const GRID = '<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>';
const BAG = '<rect x="3" y="7" width="18" height="13" rx="3"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2"/><path d="M3 13h18"/>';
const BUILDING = '<path d="M4 21V7l8-4 8 4v14"/><path d="M9 21v-6h6v6"/><path d="M9 10h.01M15 10h.01M9 13h.01M15 13h.01"/>';
export const TAB_ICONS = {
  // 관리자
  overview: GRID, control: GRID, users: USERS,
  companies: BUILDING, employer: BUILDING,
  taxonomy: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  config: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  ai: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  // 강사
  summary: GRID, weekly: CAL, kpi: '<path d="M5 20v-8M12 20V5M19 20V9"/>', students: USERS,
  followup: '<rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9 4h6v3H9z"/><path d="M9 14l2 2 4-4"/>',
  report: '<path d="M6 3h8l4 4v14H6z"/><path d="M9 12h6M9 16h6"/>',
  postings: BAG, roster: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/>',
  // 공동훈련센터(팀장·담당)
  register: '<path d="M12 5v14M5 12h14"/>',
};
export function tabBtn(key, label, on = false) {
  return `<button data-tab="${key}" ${on ? 'class="on" aria-current="page"' : 'aria-current="false"'}>` +
    `<span class="ti"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TAB_ICONS[key]}</svg></span>` +
    `<span class="tl">${label}</span></button>`;
}
// 탭 전환 시 현재 탭 표시(on / aria-current)를 한 번에 갱신
export function markTab(tabs, name) {
  tabs.forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle("on", on);
    b.setAttribute("aria-current", on ? "page" : "false");
  });
}

/* ---------- 입력칸 이름 자동 부여 (스크린리더용 aria-label) ---------- */
// 라벨이 없는 input/select/textarea 에 이름을 붙인다. 우선순위:
//   ① 표 안이면 "열 이름 — 행 제목"  ② 아래 CLASS_NAMES(산출물·면접 카드 안이면 "항목 — 카드 제목")  ③ placeholder
const CLASS_NAMES = {
  "i-result": "면접 결과", "d-kind": "자료 종류", "d-file": "첨부 파일", "a-status": "상태", "a-file": "파일",
  "a-url": "링크", "sb-add-id": "추가할 항목", "sb-add-lv": "레벨", "sb-add-ev": "Evidence(%)",
  "n-round": "면접 차수", "na-date": "지원일", "pf-m-url": "URL", "i-note": "면접 메모",
};
const clip = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 40);
function nameFor(el) {
  const td = el.closest("td");
  if (td) {
    const tr = td.parentElement, table = td.closest("table");
    const col = td.dataset.label || clip(table?.rows[0]?.cells[td.cellIndex]?.textContent);
    const title = clip(tr.querySelector(".tc-title")?.textContent || tr.cells[0]?.textContent);
    if (col) return title && tr.cells[0] !== td ? `${col} — ${title}` : col;
  }
  const cls = [...el.classList].find((c) => CLASS_NAMES[c]) || (CLASS_NAMES[el.id] ? el.id : "");
  if (cls) {
    const card = el.closest(".artcard");
    const ctx = clip(card?.querySelector(".arthead b, .arthead > span:first-child, h3, b")?.textContent);
    return ctx ? `${CLASS_NAMES[cls]} — ${ctx}` : CLASS_NAMES[cls];
  }
  return el.placeholder ? clip(el.placeholder) : "";
}
export function labelControls(root = document) {
  root.querySelectorAll?.("input:not([type=hidden]), select, textarea").forEach((el) => {
    if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || (el.labels && el.labels.length)) return;
    const n = nameFor(el);
    if (n) el.setAttribute("aria-label", n);
  });
}
let labelQueued = false;
if (typeof MutationObserver !== "undefined" && typeof document !== "undefined" && document.body) {
  new MutationObserver(() => {
    if (labelQueued) return;
    labelQueued = true;
    queueMicrotask(() => { labelQueued = false; labelControls(document); });
  }).observe(document.body, { childList: true, subtree: true });
}
