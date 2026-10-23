# Phase 4 설계: Matching 연계 및 운영화

> 관련 문서: [`sns-job-posting-research-prd.md`](./sns-job-posting-research-prd.md) Phase 4, Phase 1~3 리포트
> 근거 코드: `js/data.js` (`listJobPostings`/`saveJobPosting`/`analyzeJobPosting`), `js/views/instructor.js` (공고 편집 폼)

## 1. 기존 시스템 확인

재학생 취업시스템은 이미 `job_postings` 테이블과 Matching 파이프라인(Phase D/E, `js/data.js:278-320`)을 갖추고 있다. SNS 채용공고 리서치는 **새 저장소를 만드는 것이 아니라, 정규화된 SNS Job Record를 기존 `job_postings` 입력 파이프라인에 태우는 것**으로 설계한다.

- `job_postings` 컬럼: `id, company, title, job_category, location, experience_level, employment_type, salary, deadline, description, requirements, preferred, portfolio_required, required_skills, required_tools, source, url, status, updated_at`
- `status` 값: `DRAFT | ACTIVE | CLOSED` (`js/views/instructor.js:303`)
- 이미 원문 텍스트를 AI로 분석해 구조화하는 Edge Function이 존재: `analyzeJobPosting(raw)` → `job-analyze` (`js/data.js:298`)
- Matching은 `job_postings.id` 단위로 동작 (`getMatchScore`, `getGap`, `getTopMatches`가 `p_posting`으로 posting id를 받음)

## 2. 필드 매핑 (SNS Job Record → job_postings)

| career-job-research 출력 필드 | job_postings 컬럼 | 매핑 규칙 |
|---|---|---|
| Job Summary(회사/직무) | `company`, `title` | 큐레이션 분리 후 개별 값 사용 |
| Source | `source` | `"SNS:{플랫폼}:{계정명}"` 형식으로 통일 (예: `SNS:Instagram:@designrookie.official`). 재게시(큐레이션)인 경우 원 소스도 `description` 하단에 원문 링크로 병기 |
| — | `url` | 게시물 원문 URL |
| Deadline / Freshness | `deadline`, `status` | 3장 "상태 매핑" 참고 |
| MUST | `requirements` | 텍스트 그대로, 없으면 `null` (임의 생성 금지) |
| PREFERRED | `preferred` | 동일 |
| Tools | `required_tools` | 배열, 스니펫에 명시된 것만 |
| (MUST 중 도구 아닌 항목) | `required_skills` | 배열 |
| Portfolio 요구 여부 | `portfolio_required` | boolean, 명시 없으면 `false`(기본값)로 두되 `description`에 원문 인용 |
| Location / Employment Type | `location`, `employment_type` | 스니펫에 없으면 `null` |
| Research Confidence | — | `job_postings`에 전용 컬럼 없음 → **`description` 필드 상단에 `[SNS-Confidence: 낮음/중간/높음]` 태그로 기록**하는 임시 방식 채택 (전용 컬럼 추가는 스키마 마이그레이션이 필요해 이번 설계 범위 밖) |
| Exclusion Reason | — | 배제된 후보는 `job_postings`에 저장하지 않음 (테이블은 "지원 가능 후보"만 유지) |

## 3. 상태(status) 매핑 및 DRAFT 우선 원칙

Phase 1~3에서 확인했듯 SNS 스니펫만으로는 마감일·전체 요건을 완전히 채울 수 없는 경우가 많다. 따라서:

- **SNS에서 수집된 모든 신규 레코드는 `status = DRAFT`로 최초 저장**한다. `ACTIVE`로 전환하는 것은 담당자(강사/운영자)가 원문을 확인한 뒤 수동으로 수행한다. 자동으로 `ACTIVE`로 승격하지 않는다.
- `Freshness = EXPIRED`로 판정된 후보는애초에 `job_postings`에 저장하지 않는다 (현재 지원 불가능한 공고를 노출하지 않는다는 career-job-research 금지 규칙 준수).
- `Freshness = UNKNOWN`인 경우도 `DRAFT`로 저장하고, `deadline`은 `null`로 둔다(추정값을 넣지 않는다).
- 담당자가 원문을 확인해 마감일을 확정하면 `deadline` 입력 + `status`를 `ACTIVE`로 변경 (기존 instructor.js 편집 폼을 그대로 사용 가능 — 신규 UI 불필요).

## 4. 원문 텍스트 → 구조화: 기존 AI 분석 기능 재사용

`analyzeJobPosting(raw)`는 이미 원문 텍스트를 받아 구조화하는 Edge Function을 호출한다. SNS 검색 스니펫(title+description)을 이 함수의 `raw` 입력으로 그대로 전달하면, 별도의 SNS 전용 파서를 새로 만들지 않고 기존 AI 분석 파이프라인을 재사용할 수 있다.

- 제안 흐름: `firecrawl_search` 스니펫 → 큐레이션 분리·배제 규칙 적용(Phase 1~3) → 남은 후보의 `title + description`을 `analyzeJobPosting(raw)`에 전달 → 반환된 구조화 결과를 `saveJobPosting(patch)`로 `DRAFT` 상태로 insert
- 스니펫 정보량이 원문보다 적으므로, AI 분석 결과의 신뢰도도 낮게 잡아야 함 — 3장의 Confidence 태그를 이 단계에서 함께 기록

## 5. 재수집 스케줄 (설계안)

| 대상 | 주기 | 근거 |
|---|---|---|
| 신뢰 큐레이션 계정(디자인루키/윤빌리티/remaincareer/owanimal/미디어잡) 지정 검색 | 주 1회 (해당 계정들의 게시 주기가 대체로 주간이므로) | Phase 3 발견 |
| 일반 키워드 검색(노이즈 높은 조합 제외) | 주 1~2회 | Phase 1~2 노이즈 데이터 기반, 과도한 재실행은 노이즈만 늘림 |
| 노이즈 90% 이상 확인된 조합(예: Threads×UXUI 일반 키워드) | 제외 또는 계정 지정 검색으로 대체 | Phase 3 결과 |
| 기존 `DRAFT` 레코드 재검증(마감일 재확인) | 마감 임박(D-7 이내)이거나 등록 후 14일 경과 시 | 신선도 유지 |

## 6. 운영 대시보드 (설계안)

기존 `adminOverview()`/`listAiRuns()` 패턴을 확장하는 형태를 제안 (신규 테이블 불필요, `job_postings.source`가 `SNS:`로 시작하는 레코드를 집계):

- 플랫폼별 수집 건수 (source의 플랫폼 세그먼트로 group by)
- `status = DRAFT`로 대기 중인 SNS 후보 수 (담당자 검토 필요 큐)
- Confidence 태그별 분포
- 마감 임박(D-7 이내) `ACTIVE` SNS 공고 알림 목록

## 7. 이번 세션에서 하지 않은 것 (다음 엔지니어링 작업)

이 문서는 **설계**이며, 아래는 별도 구현 작업(코드/DB 마이그레이션/크론)이 필요해 이번 PRD 리서치 세션 범위 밖으로 남긴다:

- 실제 수집 스크립트/크론 작업 구현 (Firecrawl 검색 → 필터링 → `analyzeJobPosting` → `saveJobPosting` 자동화)
- `job_postings`에 SNS 전용 메타데이터(플랫폼, Confidence, 원 계정)를 위한 전용 컬럼 추가 여부 검토 (현재는 `source`/`description` 텍스트로 임시 인코딩)
- 재수집 스케줄러(크론) 및 대시보드 UI 실제 구현
- 담당자 검토 큐 UI (현재 instructor.js의 공고 목록/편집 폼을 그대로 써도 되는지, 별도 "SNS 검토 대기" 뷰가 필요한지 결정)
