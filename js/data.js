import { supabase } from "./supabase.js";

export async function listCohorts() {
  const { data, error } = await supabase
    .from("cohorts")
    .select("id, name, completion_date, target_count")
    .order("completion_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createCohort({ name, completion_date, target_count }) {
  const { data, error } = await supabase
    .from("cohorts")
    .insert({ name, completion_date, target_count: target_count || 0 })
    .select("id, name, completion_date, target_count")
    .single();
  if (error) throw error;
  return data;
}

export async function getDashboard(cohortId) {
  const { data, error } = await supabase.rpc("dashboard_summary", { p_cohort: cohortId });
  if (error) throw error;
  return data;
}

export async function listStudents(cohortId) {
  const { data, error } = await supabase
    .from("students")
    .select("id, code, track, stage, status, note, updated_at, artifacts(type, status)")
    .eq("cohort_id", cohortId)
    .order("code");
  if (error) throw error;
  return data;
}

export async function getStudentDetail(studentId) {
  const [s, fb, log] = await Promise.all([
    supabase.from("students")
      .select("id, code, track, stage, status, note, artifacts(id, type, status, external_url, storage_path)")
      .eq("id", studentId).single(),
    supabase.from("feedback")
      .select("id, author, stage, body, created_at")
      .eq("student_id", studentId).order("created_at", { ascending: false }),
    supabase.from("activity_log")
      .select("id, actor, action, detail, created_at")
      .eq("student_id", studentId).order("created_at", { ascending: false }).limit(30),
  ]);
  for (const r of [s, fb, log]) if (r.error) throw r.error;
  return { student: s.data, feedback: fb.data, activity: log.data };
}

export async function updateStudent(id, patch) {
  const { error } = await supabase.from("students").update(patch).eq("id", id);
  if (error) throw error;
}

export async function updateArtifact(id, patch) {
  const { error } = await supabase.from("artifacts").update(patch).eq("id", id);
  if (error) throw error;
}

export async function addFeedback(studentId, { author, stage, body }) {
  const { error } = await supabase.from("feedback")
    .insert({ student_id: studentId, author, stage: stage || null, body });
  if (error) throw error;
}

export async function logActivity(studentId, actor, action, detail) {
  await supabase.from("activity_log")
    .insert({ student_id: studentId, actor, action, detail });
}

export async function importRoster(cohortId, rows) {
  const { data, error } = await supabase.rpc("import_roster", { p_cohort: cohortId, p_rows: rows });
  if (error) throw error;
  return data;
}

// 학과 보고용 내보내기 — 번호(S01~)만, 실명 없음
export async function getCohortExport(cohortId) {
  const students = await listStudents(cohortId);
  const ids = students.map((s) => s.id);
  let feedback = [];
  if (ids.length) {
    const { data, error } = await supabase
      .from("feedback")
      .select("student_id, author, stage, body, created_at")
      .in("student_id", ids)
      .order("created_at", { ascending: false });
    if (error) throw error;
    feedback = data;
  }
  return { students, feedback };
}

/* ---------- 학생 본인용 (RLS: 본인 행만) ---------- */
export async function getMyDossier(studentId) {
  const [s, log] = await Promise.all([
    supabase.from("students")
      .select("id, code, track, stage, status, artifacts(id, type, status, external_url, storage_path)")
      .eq("id", studentId).single(),
    supabase.from("activity_log")
      .select("id, actor, action, detail, created_at")
      .eq("student_id", studentId).order("created_at", { ascending: false }).limit(20),
  ]);
  for (const r of [s, log]) if (r.error) throw r.error;
  return { student: s.data, activity: log.data };
}

const BUCKET = "student-materials";

export async function uploadArtifactFile(code, artifactId, type, file) {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `${code}/${type}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
  if (up.error) throw up.error;
  await updateArtifact(artifactId, { storage_path: path, status: "진행" });
  return path;
}

export async function signedUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

/* ---------- Phase A: 실적관리 ---------- */
export async function getKPI(cohortId) {
  const { data, error } = await supabase.rpc("employment_kpi", { p_cohort: cohortId });
  if (error) throw error;
  return data;
}
export async function listApplications(studentId) {
  const { data, error } = await supabase
    .from("applications")
    .select("id, company, position, job_category, source, status, applied_at, deadline, closed_at, note, updated_at")
    .eq("student_id", studentId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}
export async function addApplication(studentId, patch) {
  const { error } = await supabase.from("applications").insert({ student_id: studentId, ...patch });
  if (error) throw error;
}
export async function updateApplication(id, patch) {
  const { error } = await supabase.from("applications").update(patch).eq("id", id);
  if (error) throw error;
}
export async function deleteApplication(id) {
  const { error } = await supabase.from("applications").delete().eq("id", id);
  if (error) throw error;
}
export async function getEmployment(studentId) {
  const { data, error } = await supabase
    .from("employment_results")
    .select("id, company, position, job_category, employment_type, hire_date, salary_range, note")
    .eq("student_id", studentId).maybeSingle();
  if (error) throw error;
  return data;
}
export async function setEmployment(studentId, patch) {
  const { error } = await supabase
    .from("employment_results")
    .upsert({ student_id: studentId, ...patch }, { onConflict: "student_id" });
  if (error) throw error;
}

export async function listJobCategories() {
  const { data, error } = await supabase
    .from("job_categories").select("code, name, sort_order")
    .eq("active", true).order("sort_order");
  if (error) throw error;
  return data;
}
export async function getPreferences(studentId) {
  const { data, error } = await supabase
    .from("student_preferences").select("rank, category_code")
    .eq("student_id", studentId).order("rank");
  if (error) throw error;
  return data;
}
// codes: 순위 순 배열(최대 3). 기존 전부 교체.
export async function savePreferences(studentId, codes) {
  const del = await supabase.from("student_preferences").delete().eq("student_id", studentId);
  if (del.error) throw del.error;
  const rows = codes.filter(Boolean).slice(0, 3)
    .map((c, i) => ({ student_id: studentId, rank: i + 1, category_code: c }));
  if (rows.length) {
    const { error } = await supabase.from("student_preferences").insert(rows);
    if (error) throw error;
  }
}

/* ---------- Phase C: Skill/Tool + Readiness ---------- */
export async function listSkills() {
  const { data, error } = await supabase.from("skills").select("id, name")
    .eq("active", true).order("sort_order");
  if (error) throw error; return data;
}
export async function listTools() {
  const { data, error } = await supabase.from("tools").select("id, name, category")
    .eq("active", true).order("sort_order");
  if (error) throw error; return data;
}
export async function getStudentSkills(studentId) {
  const { data, error } = await supabase.from("student_skills")
    .select("id, skill_id, level, evidence_confidence, evidence_verified, evidence_note")
    .eq("student_id", studentId);
  if (error) throw error; return data;
}
export async function getStudentTools(studentId) {
  const { data, error } = await supabase.from("student_tools")
    .select("id, tool_id, level, evidence_confidence, evidence_verified")
    .eq("student_id", studentId);
  if (error) throw error; return data;
}
export async function saveStudentSkill(studentId, skill_id, patch) {
  const { error } = await supabase.from("student_skills")
    .upsert({ student_id: studentId, skill_id, ...patch }, { onConflict: "student_id,skill_id" });
  if (error) throw error;
}
export async function saveStudentTool(studentId, tool_id, patch) {
  const { error } = await supabase.from("student_tools")
    .upsert({ student_id: studentId, tool_id, ...patch }, { onConflict: "student_id,tool_id" });
  if (error) throw error;
}
export async function deleteStudentSkill(id) {
  const { error } = await supabase.from("student_skills").delete().eq("id", id);
  if (error) throw error;
}
export async function deleteStudentTool(id) {
  const { error } = await supabase.from("student_tools").delete().eq("id", id);
  if (error) throw error;
}
export async function getReadiness(studentId) {
  const { data, error } = await supabase.rpc("readiness", { p_student: studentId });
  if (error) throw error; return data;
}
export async function setExperienceMonths(studentId, months) {
  const { error } = await supabase.from("students")
    .update({ experience_months: months }).eq("id", studentId);
  if (error) throw error;
}
export const SKILL_LEVELS = { 1: "입문", 2: "기초", 3: "중급", 4: "고급", 5: "전문" };

/* ---------- AI-06: 포트폴리오 평가 ---------- */
export const PF_COMPONENTS = [
  ["concept", "컨셉"], ["visual_quality", "시각완성도"], ["problem_solving", "문제해결"],
  ["process", "전개과정"], ["typography", "타이포"], ["consistency", "일관성"], ["presentation", "제시력"],
];
export async function listPortfolioReviews(studentId) {
  const { data, error } = await supabase.from("portfolio_reviews")
    .select("*").eq("student_id", studentId).order("created_at", { ascending: false });
  if (error) throw error; return data;
}
export async function savePortfolioReview(row) {
  const q = row.id
    ? supabase.from("portfolio_reviews").update(row).eq("id", row.id)
    : supabase.from("portfolio_reviews").insert(row);
  const { error } = await q;
  if (error) throw error;
}
export async function deletePortfolioReview(id) {
  const { error } = await supabase.from("portfolio_reviews").delete().eq("id", id);
  if (error) throw error;
}
const AI_OFF_MSG = "AI 기능 미설정 — 관리자가 Edge Function을 배포해야 사용할 수 있습니다.";
export async function analyzePortfolio(body) {
  const { data, error } = await supabase.functions.invoke("portfolio-analyze", { body });
  if (error) throw new Error(/non-2xx|not found|Failed to send/i.test(error.message) ? AI_OFF_MSG : error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

/* ---------- Phase D: 채용공고 ---------- */
export async function listJobPostings() {
  const { data, error } = await supabase.from("job_postings")
    .select("id, company, title, job_category, location, experience_level, employment_type, salary, deadline, description, requirements, preferred, portfolio_required, required_skills, required_tools, source, url, status, updated_at")
    .order("deadline", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data;
}
export async function saveJobPosting(patch) {
  const q = patch.id
    ? supabase.from("job_postings").update(patch).eq("id", patch.id)
    : supabase.from("job_postings").insert(patch);
  const { error } = await q;
  if (error) throw error;
}
export async function deleteJobPosting(id) {
  const { error } = await supabase.from("job_postings").delete().eq("id", id);
  if (error) throw error;
}
// Phase F: AI 공고 분석 (Edge Function)
export async function analyzeJobPosting(raw) {
  const { data, error } = await supabase.functions.invoke("job-analyze", { body: { raw } });
  if (error) throw new Error(/non-2xx|not found|Failed to send/i.test(error.message) ? AI_OFF_MSG : error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}
/* ---------- Phase E: Matching + GAP ---------- */
export async function getMatchScore(studentId, postingId) {
  const { data, error } = await supabase.rpc("match_score", { p_student: studentId, p_posting: postingId });
  if (error) throw error; return data;
}
export async function getGap(studentId, postingId) {
  const { data, error } = await supabase.rpc("gap_analysis", { p_student: studentId, p_posting: postingId });
  if (error) throw error; return data;
}
export async function getTopMatches(studentId) {
  const { data, error } = await supabase.rpc("top_matches", { p_student: studentId });
  if (error) throw error; return data;
}
export async function setPrefConditions(studentId, patch) {
  const { error } = await supabase.from("students").update(patch).eq("id", studentId);
  if (error) throw error;
}
export const GRADE_CLASS = { "A+": "g-a", A: "g-a", B: "g-b", C: "g-c", D: "g-d", E: "g-e" };

/* ---------- Admin ---------- */
export async function adminOverview() {
  const { data, error } = await supabase.rpc("admin_overview");
  if (error) throw error; return data;
}
export async function adminUsers() {
  const { data, error } = await supabase.rpc("admin_users");
  if (error) throw error; return data;
}
export async function setUserRole(userId, role) {
  const { error } = await supabase.from("profiles")
    .upsert({ user_id: userId, role }, { onConflict: "user_id" });
  if (error) throw error;
}
export async function listAiRuns() {
  const { data, error } = await supabase.from("ai_runs")
    .select("id, agent, confidence, model_version, input_summary, created_at")
    .order("created_at", { ascending: false }).limit(50);
  if (error) throw error; return data;
}
export async function saveJobCategory(row) {
  const { error } = await supabase.from("job_categories").update(row).eq("code", row.code);
  if (error) throw error;
}
export async function saveRef(table, row) {
  const { error } = await supabase.from(table).upsert(row, { onConflict: "id" });
  if (error) throw error;
}
export async function deleteRef(table, id) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}
export async function listCompanies() {
  const { data, error } = await supabase.from("companies")
    .select("id, name, industry, size, website, note").order("name");
  if (error) throw error; return data;
}
export async function saveCompany(row) {
  const q = row.id ? supabase.from("companies").update(row).eq("id", row.id)
                   : supabase.from("companies").insert(row);
  const { error } = await q; if (error) throw error;
}
export async function deleteCompany(id) {
  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) throw error;
}
export async function getConfig(key) {
  const { data, error } = await supabase.rpc("get_config", { p_key: key });
  if (error) throw error; return data;
}
export async function setConfig(key, value) {
  const { error } = await supabase.rpc("set_config", { p_key: key, p_value: value });
  if (error) throw error;
}
export const MATCH_WEIGHT_KEYS = [
  ["job_fit", "직무"], ["skill_fit", "Skill"], ["tool_fit", "Tool"], ["portfolio_fit", "포트폴리오"],
  ["evidence_fit", "Evidence"], ["experience_fit", "경력"], ["condition_fit", "희망조건"], ["company_fit", "기업"],
];
export const READINESS_WEIGHT_KEYS = [
  ["skill", "Skill"], ["tool", "Tool"], ["portfolio", "포트폴리오"], ["evidence", "Evidence"], ["experience", "경력"],
];

export async function applyToPosting(studentId, posting) {
  const { error } = await supabase.from("applications").insert({
    student_id: studentId,
    company: posting.company,
    position: posting.title,
    job_category: posting.job_category,
    job_posting_id: posting.id,
    source: posting.source || "공고",
    status: "INTERESTED",
  });
  if (error) throw error;
}

export const APPLICATION_STATUS = {
  INTERESTED: "관심", PLANNED: "지원예정", APPLIED: "지원완료",
  DOCUMENT_REVIEW: "서류전형", DOCUMENT_PASS: "서류합격", INTERVIEW: "면접",
  FINAL_PASS: "최종합격", REJECTED: "불합격", WITHDRAWN: "지원취소",
};
export const JOB_CATEGORIES = {
  AD: "광고콘텐츠제작", ED: "편집디자인", GD: "그래픽디자인", BD: "브랜드디자인",
  PD: "패키지디자인", MD: "굿즈제작", SC: "SNS콘텐츠제작", CM: "콘텐츠마케팅",
  BX: "BX디자인", CC: "콘텐츠크리에이터", AIC: "AI크리에이터",
};
export const EMPLOYMENT_TYPES = ["정규직", "계약직", "인턴", "프리랜서", "기타"];

export const STAGES = ["사전설문", "진로지도", "채용공고분석", "포폴가이드", "첨삭", "졸업"];
export const STATUS = {
  normal: "🟢 정상", check: "🟡 점검", delayed: "🔴 지연",
  ahead: "🔵 여유", placed: "✅ 확정", data_mismatch: "⚠️ 불일치",
};
export const ARTIFACT_TYPES = ["이력서", "자기소개서", "포트폴리오PDF", "HTML랜딩", "피그마포폴"];
