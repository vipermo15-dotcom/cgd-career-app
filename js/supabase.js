import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

if (SUPABASE_URL.includes("YOUR_PROJECT")) {
  document.body.innerHTML =
    '<p style="font:14px system-ui;padding:2rem;color:#b00">' +
    'web/js/config.js 를 만들고 Supabase URL·anon key 를 채우세요 ' +
    '(config.example.js 참고).</p>';
  throw new Error("config.js 미설정");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
