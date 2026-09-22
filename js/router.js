import { getSession, getProfile, onAuthChange } from "./auth.js";
import { renderLogin } from "./views/login.js";
import { renderInstructor } from "./views/instructor.js";
import { renderStudent } from "./views/student.js";
import { renderAdmin } from "./views/admin.js";
import { renderViewer } from "./views/viewer.js";

const root = () => document.getElementById("app");

// 해시 라우트 → 필요한 역할
const ROUTES = {
  "#/login": { role: null, render: renderLogin },
  "#/admin": { role: "admin", render: renderAdmin },
  "#/instructor": { role: "instructor", render: renderInstructor },
  "#/student": { role: "student", render: renderStudent },
  "#/viewer": { role: "viewer", render: renderViewer },
};

function homeFor(profile) {
  if (!profile) return "#/login";
  if (profile.role === "admin") return "#/admin";
  if (profile.role === "viewer" || profile.role === "center_lead") return "#/viewer";
  return profile.role === "instructor" ? "#/instructor" : "#/student";
}
// admin 은 instructor 화면도 접근 가능
const roleOk = (need, role) =>
  !need || need === role || (role === "admin" && need === "instructor") || (role === "center_lead" && need === "viewer");

export async function route() {
  const session = await getSession();
  const profile = session ? await getProfile() : null;
  let hash = location.hash || "";

  // 로그인 안 됨 → 로그인 화면
  if (!session) {
    if (hash !== "#/login") { location.hash = "#/login"; return; }
    return ROUTES["#/login"].render(root());
  }

  // 로그인됐지만 profiles 행 없음 → 안내
  if (!profile) {
    root().innerHTML =
      '<div class="card"><h2>계정 준비 중</h2>' +
      "<p>로그인은 됐지만 아직 권한(강사/학생)이 지정되지 않았습니다.<br>" +
      "관리자에게 <code>profiles</code> 등록을 요청하세요.</p>" +
      '<button id="so">로그아웃</button></div>';
    document.getElementById("so").onclick = () => import("./auth.js").then(m => m.signOut());
    return;
  }

  // 기본 경로 / 잘못된 경로 → 역할 홈으로
  const match = ROUTES[hash];
  if (!match) { location.hash = homeFor(profile); return; }

  // 역할 불일치 → 역할 홈으로
  if (!roleOk(match.role, profile.role)) { location.hash = homeFor(profile); return; }

  match.render(root(), { session, profile });
}

export function startRouter() {
  window.addEventListener("hashchange", route);
  onAuthChange(() => route());
  route();
}
