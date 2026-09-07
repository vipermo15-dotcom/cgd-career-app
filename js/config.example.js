// config.js 로 복사한 뒤 값을 채우세요 (config.js 는 .gitignore 처리됨).
// Supabase 대시보드 > Project Settings > API 에서 확인.
export const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR_ANON_PUBLIC_KEY";

// 시드 기수 id (seed.sql). 실제 기수 생성 후 교체.
export const DEFAULT_COHORT_ID = "a0000000-0000-0000-0000-000000000022";

// 매직링크 로그인 후 돌아올 주소 (배포 도메인). 로컬은 http://localhost:8080
export const REDIRECT_URL = window.location.origin + window.location.pathname;
