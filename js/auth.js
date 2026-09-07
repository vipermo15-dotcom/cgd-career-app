import { supabase } from "./supabase.js";
import { REDIRECT_URL } from "./config.js";

// 세션 + 역할(profiles.role) 캐시
let _profile = null;

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

// 로그인 사용자의 profiles 행 (role: 'instructor' | 'student', student_id)
export async function getProfile({ force = false } = {}) {
  if (_profile && !force) return _profile;
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, role, student_id")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error) { console.warn("profile 조회 실패", error.message); return null; }
  _profile = data;
  return data;
}

export async function sendMagicLink(email) {
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: REDIRECT_URL },
  });
}

export async function signOut() {
  _profile = null;
  await supabase.auth.signOut();
  location.hash = "";
  location.reload();
}

// 세션 변화 시 콜백 (라우터가 구독)
export function onAuthChange(cb) {
  supabase.auth.onAuthStateChange((_evt, session) => {
    _profile = null;
    cb(session);
  });
}
