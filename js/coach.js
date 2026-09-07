// AI 취업코치 채팅 위젯 — 강사·학생 공용. 대화는 세션 동안만 유지(비영속).
import { supabase } from "./supabase.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function renderCoach(host, studentId) {
  const msgs = []; // {role, content}
  host.innerHTML = `
    <div class="card">
      <h2>AI 취업코치</h2>
      <div class="coach-log" id="coach-log">
        <p class="muted small">희망직무·역량·지원현황을 근거로 상담합니다. 예: "지금 지원하기 좋은 공고는?", "부족한 역량 우선순위는?"</p>
      </div>
      <div class="row">
        <input id="coach-in" placeholder="질문 입력" style="flex:1">
        <button id="coach-send">보내기</button>
      </div>
      <span id="coach-msg" class="msg"></span>
    </div>`;

  const log = host.querySelector("#coach-log");
  const input = host.querySelector("#coach-in");
  const btn = host.querySelector("#coach-send");
  const err = host.querySelector("#coach-msg");

  const bubble = (role, text) => {
    const div = document.createElement("div");
    div.className = "coach-b " + (role === "user" ? "me" : "ai");
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  };

  const send = async () => {
    const q = input.value.trim();
    if (!q) return;
    input.value = ""; err.textContent = "";
    msgs.push({ role: "user", content: q });
    bubble("user", q);
    btn.disabled = true;
    const thinking = document.createElement("div");
    thinking.className = "coach-b ai"; thinking.textContent = "…";
    log.appendChild(thinking);
    try {
      const { data, error } = await supabase.functions.invoke("career-coach", {
        body: { student_id: studentId, messages: msgs },
      });
      thinking.remove();
      if (error || data?.error) {
        const raw = data?.error || error.message || "";
        throw new Error(/non-2xx|not found|Failed to send/i.test(raw)
          ? "AI 코치 미설정 — 관리자가 Edge Function을 배포해야 사용할 수 있습니다." : raw);
      }
      msgs.push({ role: "assistant", content: data.reply });
      bubble("ai", data.reply);
    } catch (e) {
      thinking.remove();
      err.className = "msg err"; err.textContent = e.message;
    }
    btn.disabled = false;
    input.focus();
  };

  btn.onclick = send;
  input.onkeydown = (e) => { if (e.key === "Enter") send(); };
}
