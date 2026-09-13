# Phase 2 실행 리포트: Instagram 채용공고 파이프라인 정식 적용

> 관련 문서: [`sns-job-posting-research-prd.md`](./sns-job-posting-research-prd.md) Phase 2, [Phase 1 파일럿 리포트](./phase1-instagram-pilot-report.md)
> 실행일 기준: 2026-09-13

## 1. 실행 범위

- 소스: Instagram (Firecrawl `firecrawl_search`, `includeDomains: ["instagram.com"]`)
- 쿼리 3종: "그래픽 디자이너 신입 채용", "UXUI 디자이너 채용", "영상 편집자 채용" (각 10건)
- 원시 후보 풀: **30건**
- 파이프라인: 검색 → 후보 풀 → 중복 제거 → 신선도 검증 → 출처/기업 검증 → 요건 추출 → 정규화 → Research Confidence → Matching 입력

## 2. 단계별 처리 결과

### 2.1 중복 제거
- 동일 회사·동일 공고가 재게시된 그룹 2건 발견 (예: 동일 캡션의 "촬영본을 스토리텔링 구조로 재구성할 수 있는 편집 감각 보유자..." 게시물이 서로 다른 계정에 2회 게시)
- Phase 1 샘플과 겹치는 후보(예: 디자인루키 8월 3주차 게시물) 1건 → 재수집 시 동일 URL이면 스킵

### 2.2 큐레이션 게시물 분리 (1건 → N건)
아래 5건의 큐레이션/집계 게시물을 원자 단위 공고로 분리:

| 원 게시물 | 분리된 공고 수 | 비고 |
|---|---|---|
| 디자인루키 8월 3주차 (`DcSomLEE8Ae`) | 3 (크록스/JYP/휠라) | 회사명·직무만 확인, 요건/마감 스니펫엔 없음 |
| 윤빌리티 주간 채용 (`DSjrjCNkYON`) | 5 (플러스엑스/그리드/피크닉/네이버·치지직/카멜커피) | 동일 |
| 디자인루키 채용공고 (`DViCAAHDjWb`) | 3 (국립박물관문화재단/한화생명보험/카카오모빌리티) | 마감일 일부 스니펫에 포함(`~9/2`, `~9/9`) |
| 미디어잡 8월 넷째주 TOP5 (`Dcacqz0E6wr`) | 5 (포도크리에이티브 외 4) | 일부 마감일 명시(`9월 8일 마감`) |
| 미디어잡 7월 넷째주 TOP5 (`Da_tjb2DSIO`) | 5 (더블유캐스트 외 4) | 7월 게시 → 신선도 낮음 |
| "9월 2주차 디자이너 신입 채용 소식" (`DdDPZ5dATXU`) | 분리 보류 | 스니펫에 개별 회사명 미노출 → 원문 확인 전까지 후보군에서만 유지, 정규화 보류 |

### 2.3 신선도 검증 (Freshness)
- **명시적 마감일 확인 → EXPIRED 처리**: 2건
  - `DZE9migzMqI` (UXUI Designer 모집): 모집 기간 2026-05-28 ~ 06-11 → 실행일(2026-09-13) 기준 마감 3개월 경과 → `EXPIRED`
  - `Dbk-xvmGN8s` (테크몽 편집자): 접수 2026-08-03 ~ 08-12 → `EXPIRED`
- **"채용 시 마감"/마감일 미명시** → `UNKNOWN`으로 유지 (임의로 ACTIVE 처리 금지)
- **게시 시점이 오래된 큐레이션(7월 넷째주 등)** → 개별 공고 마감일 재확인 없이는 `UNKNOWN`, 신선도 낮음으로 하향

### 2.4 출처/기업 검증 및 신규 배제 유형 발견
Phase 1에서 정의한 `NOT_A_JOB_POSTING` 외에 이번 실행에서 새로운 배제 유형을 발견:

- **`CANDIDATE_SELF_PROMOTION` (신규)**: 구직자 본인이 "저를 채용하실 분을 찾습니다" 형태로 올린 자기소개 게시물 2건 발견 (`DbHfHeuk71Z`, `DbARckkkYg4` — 동일 내용 중복 게시). 기업의 채용 공고가 아니라 개인의 구직 활동이므로 Job Record 대상에서 제외.
- **`EDUCATION_PROGRAM_AD` (신규)**: "채용"이라는 단어가 포함되어 있으나 실제로는 교육과정/부트캠프 광고인 게시물 2건 (`DUMECUIkuGr`, `DR39AKPj8bD`) — 커리큘럼 소개, "~님을 모집합니다"가 아닌 "수강생 모집" 성격.
- 기존 `NOT_A_JOB_POSTING`: 채용 트렌드에 대한 의견/분석 게시물 1건 (`DcM4sZVCVQm`)
- 신호가 섞여 판단이 어려운 게시물(`DdIS2k1pr3F`, `DbkeszWCVAd`, `DcOEWPYSSSt`)은 자동 배제하지 않고 `AMBIGUOUS`로 표시, 사람 검토 대기열로 이관

### 2.5 최종 집계

| 단계 | 건수 |
|---|---|
| 원시 후보 (검색 결과) | 30 |
| 중복 제거 후 | 28 |
| 큐레이션 분리로 증가 | +21 (5개 게시물 → 21개 개별 후보) |
| 배제 (`NOT_A_JOB_POSTING` + `CANDIDATE_SELF_PROMOTION` + `EDUCATION_PROGRAM_AD`) | -5 |
| `AMBIGUOUS` (검토 대기) | 3 |
| **정규화 완료(직접 게시, 요건 일부 확보)** | **약 34건** |
| 그중 `EXPIRED` | 2 |
| 그중 마감일 `UNKNOWN` | 대다수 (스니펫 한계) |

## 3. 정규화 샘플 (career-job-research 출력 포맷)

### 샘플 1 — ACTIVE 후보 (직접 게시, 신뢰도 높음)
- **Job Summary**: S2VICTOR, 그래픽디자이너(신입/경력 무관)
- **Source**: `instagram.com/p/DcR5N45z5sl` (기업 공식 계정 추정, 직접 게시)
- **Deadline**: UNKNOWN (스니펫에 마감일 없음)
- **Freshness**: UNKNOWN — 임의 ACTIVE 처리 안 함
- **MUST**: (스니펫 근거 없음 → 미기재)
- **PREFERRED**: 프로젝트 리딩 경험, 영상편집 가능자
- **Tools**: 명시 없음
- **Location/Employment Type**: 명시 없음 (원문 확인 필요)
- **Research Confidence**: 중간 (기업 계정 직접 게시로 추정되나 스니펫만으로 계정 성격 확정 불가)
- **Exclusion Reason**: 없음

### 샘플 2 — EXPIRED 후보 (명시적 마감일로 배제)
- **Job Summary**: (기업명 비공개 추정) UXUI Designer, 신입/경력(1-2년)
- **Source**: `instagram.com/p/DZE9migzMqI`
- **Deadline**: 2026-06-11 (명시)
- **Freshness**: **EXPIRED** (실행일 2026-09-13 기준 마감 경과)
- **Exclusion Reason**: `EXPIRED` — 현재 지원 가능 공고로 표시하지 않음

### 샘플 3 — 배제 (신규 유형)
- **원문 요지**: "저를 영상 편집자, 콘텐트 마케터로 채용하실 분을 찾습니다"
- **판정**: 구직자 본인 홍보 게시물
- **Exclusion Reason**: `CANDIDATE_SELF_PROMOTION`

### 샘플 4 — 큐레이션 분리 후 개별 레코드
- **Job Summary**: 국립박물관문화재단, VMD(계약직)
- **Source**: 원 게시물 `instagram.com/p/DViCAAHDjWb` (디자인루키 큐레이션, 재게시)
- **Deadline**: ~9/2 (스니펫 명시, 실행일 기준 이미 경과 → `EXPIRED`)
- **Research Confidence**: 낮음(재게시 소스) — 국립박물관문화재단 공식 채용 페이지로 원문 재확인 필요

## 4. PRD 반영 사항 (Phase 2 결과)

1. **배제 사유 확장**: `NOT_A_JOB_POSTING` 외 `CANDIDATE_SELF_PROMOTION`(구직자 자기홍보), `EDUCATION_PROGRAM_AD`(교육과정 광고를 "채용"으로 오인)를 표준 배제 유형에 추가
2. **명시적 마감일 우선 처리 규칙**: 게시물에 마감일이 명시된 경우, 실행 시점과 비교해 지났으면 즉시 `EXPIRED` 처리 (마감일 없는 경우만 `UNKNOWN`)
3. **큐레이션 분리 비용 확인**: 큐레이션 게시물 5건에서 21건의 개별 후보가 나옴 → 전체 파이프라인에서 큐레이션 계정 비중이 높은 만큼 분리 로직이 필수임을 재확인
4. **재게시 소스의 Research Confidence 하향**은 Phase 1 규칙대로 유지, 실제 데이터에서도 유효함을 확인

## 5. 다음 단계 (Phase 3 준비)
- 동일 파이프라인을 Threads → Facebook → X 순으로 적용
- `AMBIGUOUS` 3건은 사람이 원문을 직접 열어 확인(자동 scrape 불가로 인한 임시 수동 검증)
- 플랫폼 간 중복(동일 공고가 Instagram·Threads에 동시 게시) 탐지 로직은 Phase 3에서 다수 플랫폼 데이터를 함께 놓고 검증
