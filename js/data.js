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
    .select("id, code, display_name, track, stage, status, note, updated_at, artifacts(type, status)")
    .eq("cohort_id", cohortId)
    .order("code");
  if (error) throw error;
  return data;
}

export async function getStudentDetail(studentId) {
  const [s, fb, log] = await Promise.all([
    supabase.from("students")
      .select("id, code, display_name, track, stage, status, note, completion_status, outcome_status, outcome_note, report_included, artifacts(id, type, status, external_url, storage_path)")
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
      .select("id, code, display_name, track, stage, status, github_url, artifacts(id, type, status, external_url, storage_path)")
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
    .select("id, company, position, job_category, employment_type, hire_date, salary_range, note, verified, verified_at, evidence_type, evidence_note, contract_checked, insurance_checked, retention_status, retention_checked_at")
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
    .select("id, name, industry, size, website, note, is_partner").order("name");
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


/* ---------- STEP 13: 성과보고 · 면접 · 사후관리 · 주차별 현황 ----------
   원칙: 보고서의 모든 수치는 cgd_final_report() 한 곳에서만 나온다 (관제판·보고서·사후관리 동일 원본).
   취업 확정 = 관리자 검증. AI·자동 확정 없음. */
async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}
export const getFinalReport = (from, to, cohort = null) =>
  rpc("cgd_final_report", { p_from: from, p_to: to, p_cohort: cohort });
export const getStudentReport = (from, to, cohort = null) =>
  rpc("cgd_student_report", { p_from: from, p_to: to, p_cohort: cohort });
export const getDataQuality = (cohort = null) => rpc("cgd_data_quality", { p_cohort: cohort });
export const getTodayTasks = (cohort = null) => rpc("cgd_today_tasks", { p_cohort: cohort });
export const ensureFollowups = (cohort = null, milestones = [30, 90]) =>
  rpc("cgd_ensure_followups", { p_cohort: cohort, p_milestones: milestones });
export const getWeeklyBoard = (week = null, cohort = null) =>
  rpc("cgd_weekly_board", { p_week: week || new Date().toISOString().slice(0, 10), p_cohort: cohort });

/** 학과장 운영보고 · 공동훈련센터 보고 · 기관 제출용 요약 — 같은 원본에서 표시 범위만 다름 */
export async function getDepartmentHeadReport(from, to, cohort = null) {
  const [report, quality, tasks] = await Promise.all([
    getFinalReport(from, to, cohort), getDataQuality(cohort), getTodayTasks(cohort)]);
  return { report, quality, tasks };
}
export async function getJointTrainingCenterReport(from, to, cohort = null) {
  const [report, students] = await Promise.all([
    getFinalReport(from, to, cohort), getStudentReport(from, to, cohort)]);
  return { report, students };
}
export async function getInstitutionSummaryReport(from, to, cohort = null) {
  const [report, quality] = await Promise.all([getFinalReport(from, to, cohort), getDataQuality(cohort)]);
  return { report, quality, needs_supplement: quality.needs_supplement };
}

export const OUTCOME_LABEL = {
  DATA_PENDING: "자료 미입력", NOT_EMPLOYED: "미취업", HOLD: "보류",
  INELIGIBLE: "취업불가", REFUSED: "취업거부", UNREACHABLE: "연락불가",
};
export const INTERVIEW_RESULT = {
  SCHEDULED: "예정", PASSED: "합격", FAILED: "불합격", PENDING: "결과 대기", CANCELLED: "취소",
};
export const DOC_KIND = {
  RESUME: "이력서", COVER_LETTER: "자기소개서", PORTFOLIO: "포트폴리오",
  FEEDBACK: "피드백", JOB_POSTING: "채용공고", OTHER: "기타",
};
export const RETENTION = ["재직중", "이직", "퇴사", "확인불가"];
export const FOLLOWUP_STATUS = { SCHEDULED: "예정", COMPLETED: "완료", UNREACHABLE: "연락불가", CANCELLED: "취소" };

/* ---- 면접 ---- */
export async function listInterviews(studentId) {
  const { data, error } = await supabase
    .from("interviews")
    .select("id, company, position, interview_date, round, format, result, note, interview_documents(id, kind, title, storage_path, note, created_at)")
    .eq("student_id", studentId)
    .order("interview_date", { ascending: false, nullsFirst: true });
  if (error) throw error;
  return data;
}
export async function saveInterview(studentId, row) {
  const { id, interview_documents, ...patch } = row;
  const q = id
    ? supabase.from("interviews").update(patch).eq("id", id)
    : supabase.from("interviews").insert({ student_id: studentId, ...patch });
  const { error } = await q;
  if (error) throw error;
}
export async function deleteInterview(id) {
  const { error } = await supabase.from("interviews").delete().eq("id", id);
  if (error) throw error;
}
/** 면접 건별 자료 업로드: {학생번호}/면접/{면접ID}/{종류}_{시각}.{확장자} */
export async function uploadInterviewDoc(code, studentId, interviewId, kind, title, file, note = null) {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `${code}/면접/${interviewId}/${kind}_${Date.now()}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (up.error) throw up.error;
  const { error } = await supabase.from("interview_documents").insert({
    interview_id: interviewId, student_id: studentId, kind, title: title || file.name, storage_path: path, note });
  if (error) throw error;
  return path;
}
export async function deleteInterviewDoc(doc) {
  if (doc.storage_path) await supabase.storage.from(BUCKET).remove([doc.storage_path]);
  const { error } = await supabase.from("interview_documents").delete().eq("id", doc.id);
  if (error) throw error;
}

/* ---- 취업 확정(검증) · 취업 후 관리 ---- */
export async function verifyEmployment(studentId, verified, evidence = {}) {
  const { error } = await supabase.from("employment_results")
    .update({ verified, ...(verified ? evidence : {}) }).eq("student_id", studentId);
  if (error) throw error;   // 강사 계정이면 서버가 42501 로 거부
}
export async function setEmploymentCare(studentId, patch) {
  const { error } = await supabase.from("employment_results").update(patch).eq("student_id", studentId);
  if (error) throw error;
}
export async function setOutcomeStatus(studentId, outcome_status, outcome_note = null) {
  await updateStudent(studentId, { outcome_status, outcome_note });
}
export async function setCompletionStatus(studentId, completion_status) {
  await updateStudent(studentId, { completion_status });
}

/* ---- 사후관리 ---- */
export async function listFollowups(cohortId) {
  const { data, error } = await supabase
    .from("followups")
    .select("id, student_id, milestone_days, due_date, actual_date, status, employment_state, note, students!inner(code, cohort_id, report_included)")
    .eq("students.cohort_id", cohortId).eq("students.report_included", true)
    .order("due_date");
  if (error) throw error;
  return data;
}
export async function saveFollowup(id, patch) {
  const { error } = await supabase.from("followups").update(patch).eq("id", id);
  if (error) throw error;
}

/* ---- 주차별 진로지도 기록 ---- */
export function mondayOf(d = new Date()) {
  const x = new Date(d); const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
}
export async function saveWeeklyGuidance(studentId, weekStart, patch) {
  const { error } = await supabase.from("weekly_guidance")
    .upsert({ student_id: studentId, week_start: weekStart, ...patch }, { onConflict: "student_id,week_start" });
  if (error) throw error;
}

/* ---- 내보내기: 화면과 동일한 원본(getFinalReport 결과)만 사용 ---- */
const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (v, unit = "") => (v === null || v === undefined ? "산출 불가" : v + unit);

export function exportReportHtml(report, quality = null) {
  const k = report.kpi, p = report.population, o = report.outcome_breakdown, s = report.settings;
  const stamp = quality?.needs_supplement || !s.criteria_confirmed
    ? '<p style="border:2px solid #EF6C4A;color:#D45233;padding:8px 12px;border-radius:12px;font-weight:700">자료보완 필요 — 기관 인정기준 또는 데이터 검증 항목이 남아 있습니다.</p>' : "";
  const row = (a, b) => `<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`;
  return `<!doctype html><meta charset="utf-8"><title>${esc(s.program_name)} 성과보고</title>
<style>body{font:14px/1.6 -apple-system,"Apple SD Gothic Neo",sans-serif;max-width:820px;margin:24px auto;color:#17403D}
table{border-collapse:collapse;width:100%;margin:8px 0 20px}th,td{border:1px solid #D3E7E5;padding:7px 10px;text-align:left}th{background:#E8F6F5;width:42%}
h1{color:#1E8C86}h2{border-bottom:2px dashed #3CC4BD;padding-bottom:4px}</style>
<h1>${esc(s.program_name)} 성과보고</h1>
<p>${esc(report.cohort.name)} · 기간 ${esc(report.period.from)} ~ ${esc(report.period.to)} · <b>기준일 ${esc(report.basis_date)}</b> · 생성일 ${esc(String(report.generated_at).slice(0, 10))}</p>${stamp}
<h2>인원</h2><table>${row("보고 대상자", p.report_target + "명")}${row("수료자", p.completed + "명")}${row("중도탈락", p.dropped + "명")}${row("보고 제외", p.excluded + "명")}</table>
<h2>핵심 지표</h2><table>${row("취업 확정(관리자 검증)", k.employed_confirmed + "명")}${row("검증 대기", k.employed_pending_verification + "명")}
${row("취업률 (분모: " + s.denominator_label + " " + k.employment_rate_denominator + "명)", fmt(k.employment_rate, "%"))}${row("증빙 기재율", fmt(k.evidence_rate, "%"))}
${row("지원 건수", k.application_count + "건")}${row("면접 건수", k.interview_count + "건")}${row("사후관리 완료율", fmt(k.followup_rate, "%"))}</table>
<h2>성과 분포</h2><table>${row("취업 확정", o.employed)}${row("미취업", o.not_employed)}${row("보류", o.hold)}${row("취업불가", o.ineligible)}${row("취업거부", o.refused)}${row("연락불가", o.unreachable)}${row("자료 미입력(미취업 아님)", o.data_pending)}</table>
<h2>산출 기준</h2><table>${Object.values(report.definitions).map((d, i) => row(String(i + 1), d)).join("")}</table>
<p style="color:#5F7F7C">본 보고서의 수치는 원본 DB의 관리자 검증 자료에서만 산출되었으며, 학생 실명·연락처는 포함하지 않습니다.</p>`;
}

export function exportReportCsv(students) {
  const head = ["번호", "트랙", "단계", "수료", "성과상태", "보고포함", "지원(기간)", "면접(기간)", "취업검증", "회사", "입사일", "증빙"];
  const rows = students.rows.map((r) => [r.code, r.track, r.stage, r.completion_status, OUTCOME_LABEL[r.outcome_status] || r.outcome_status,
    r.report_included ? "Y" : "N", r.application_count, r.interview_count,
    r.employment ? (r.employment.verified ? "검증" : "대기") : "", r.employment?.company || "", r.employment?.hire_date || "", r.employment?.evidence_type || ""]);
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "\uFEFF" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

/** 번호 → 표시 이름 (강사·관리자 화면 전용. 보고서·내보내기에는 사용하지 않음) */
export async function getNameMap(cohortId) {
  const { data, error } = await supabase.from("students").select("code, display_name").eq("cohort_id", cohortId);
  if (error) throw error;
  return Object.fromEntries((data || []).map((r) => [r.code, r.display_name || ""]));
}
export const whoLabel = (map, code) => (map && map[code] ? `${map[code]} (${code})` : code);

/* ---------- STEP 14: 종합관제판 · 업체현황 · 특이사항 · 깃허브 링크 ---------- */
export const getControlTower = (cohort = null) => rpc("cgd_control_tower", { p_cohort: cohort });
export const getEmployerDirectory = (from = null, to = null, cohort = null) =>
  rpc("cgd_employer_directory", { p_from: from, p_to: to, p_cohort: cohort });

export async function listMentorNotes(studentId) {
  const { data, error } = await supabase.from("mentor_notes")
    .select("id, note, created_at, author").eq("student_id", studentId).order("created_at", { ascending: false });
  if (error) throw error; return data;
}
export async function addMentorNote(studentId, note) {
  const { error } = await supabase.from("mentor_notes").insert({ student_id: studentId, note });
  if (error) throw error;
}
export async function deleteMentorNote(id) {
  const { error } = await supabase.from("mentor_notes").delete().eq("id", id);
  if (error) throw error;
}
export async function setMyGithubUrl(url) {
  const { error } = await supabase.rpc("set_my_github_url", { p_url: url || null });
  if (error) throw error;
}
export async function setStudentGithubUrl(studentId, url) {
  const { error } = await supabase.from("students").update({ github_url: url || null }).eq("id", studentId);
  if (error) throw error;
}

/* ---------- STEP 15: 공동훈련센터(팀장·담당) 등록 전용 함수 ---------- */
export async function registerCompany({ name, industry, size, website, note, is_partner }) {
  const { error } = await supabase.rpc("cgd_register_company", {
    p_name: name, p_industry: industry || null, p_size: size || null,
    p_website: website || null, p_note: note || null, p_is_partner: !!is_partner,
  });
  if (error) throw error;
}
export async function registerEmployment({
  student_id, company, position, job_category, employment_type, hire_date,
  employer_contact, is_partner_company, note,
}) {
  const { error } = await supabase.rpc("cgd_register_employment", {
    p_student: student_id, p_company: company, p_position: position || null,
    p_job_category: job_category || null, p_employment_type: employment_type || "정규직",
    p_hire_date: hire_date || null, p_employer_contact: employer_contact || null,
    p_is_partner_company: !!is_partner_company, p_note: note || null,
  });
  if (error) throw error;
}
