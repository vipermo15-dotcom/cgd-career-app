import { sendMagicLink } from "../auth.js";

export function renderLogin(el) {
  el.innerHTML = `
    <div class="card login">
      <h1>재학생 취업시스템</h1>
      <p class="muted">이메일로 로그인 링크를 받습니다. 별도 비밀번호 없음.</p>
      <form id="f">
        <input id="email" type="email" required placeholder="이메일 주소" aria-label="이메일 주소" autocomplete="email" />
        <button type="submit">로그인 링크 받기</button>
      </form>
      <p id="msg" class="msg" role="status" hidden></p>
      <p class="muted small">
        개인정보 최소 수집 — 학생 번호와 표시 이름만 저장하며, 연락처·주민번호·주소는 저장하지 않습니다.
      </p>
    </div>`;

  const form = el.querySelector("#f");
  const msg = el.querySelector("#msg");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = el.querySelector("#email").value.trim();
    const btn = form.querySelector("button");
    btn.disabled = true; btn.textContent = "전송 중…";
    const { error } = await sendMagicLink(email);
    msg.hidden = false;
    if (error) {
      msg.className = "msg err";
      msg.textContent = "전송 실패: " + error.message;
    } else {
      msg.className = "msg ok";
      msg.textContent = "메일함을 확인하세요. 링크를 누르면 로그인됩니다.";
    }
    btn.disabled = false; btn.textContent = "로그인 링크 받기";
  });
}
