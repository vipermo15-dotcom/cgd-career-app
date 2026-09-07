// 실 프로젝트 설정. SUPABASE_URL + publishable key 는 공개용(브라우저 노출 전제) — 커밋됨.
export const SUPABASE_URL = "https://hpzpojvywpqputbzfwqo.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_aC65d9tYvcsKsStTP4hYhg_n1ZaH-tg";

// 시드 기수 id (seed.sql). 실기수 만들면 강사 화면에서 전환.
export const DEFAULT_COHORT_ID = "a0000000-0000-0000-0000-000000000022";

// 매직링크 로그인 후 돌아올 주소.
export const REDIRECT_URL = window.location.origin + window.location.pathname;
