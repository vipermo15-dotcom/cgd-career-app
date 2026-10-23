# Phase 1 파일럿 리포트: SNS 채용공고 리서치 (Instagram 중심 + 3개 플랫폼 비교)

> 관련 문서: [`sns-job-posting-research-prd.md`](./sns-job-posting-research-prd.md) Phase 1

## 1. 실행 방법

- 도구: `mcp__Firecrawl__firecrawl_search`, `includeDomains`로 플랫폼별 필터링
- 쿼리 예: `"디자이너 채용 site:instagram.com"`, `includeDomains: ["instagram.com"]`
- 4개 플랫폼(Instagram, Threads, Facebook, X)에 동일 계열 쿼리로 각 10건씩 조회

## 2. 핵심 발견: 도구 제약 (PRD 전제 수정 필요)

이번 환경에 연결된 Firecrawl 커넥터는 **`firecrawl_search`(검색 스니펫 반환)만 제공**하며, 페이지 전체를 렌더링해 가져오는 `scrape`/`crawl` 계열 도구는 제공되지 않는다.

- `firecrawl_search` 결과는 `title` / `url` / `description`(짧은 발췌)만 포함 — 원문 게시물 전체(정확한 마감일, 전체 자격요건 목록, 지원 방법 등)는 확보되지 않는다.
- Instagram/Threads/X는 로그인 없이 원문 페이지에 접근 시 콘텐츠가 제한적으로만 노출되는 경우가 많아, 설령 scrape 도구가 있어도 완전한 본문 확보가 보장되지 않는다.
- **결론**: PRD의 파이프라인 중 "정규화" 단계는 검색 스니펫만으로는 완전히 채울 수 없는 필드(정확한 마감일, 전체 MUST/PREFERRED 목록)가 다수 발생한다. 이런 필드는 `UNKNOWN`/`AMBIGUOUS`로 남기고, 원문 링크를 제공하는 것을 기본 동작으로 확정한다. (→ PRD 5장에 반영)

## 3. 플랫폼별 결과 요약 (쿼리: "디자이너 채용", 10건 기준)

| 플랫폼 | 실제 채용공고(추정) | 채용 큐레이션/집계 계정 | 노이즈(단순 언급·개인 코멘트) |
|---|---|---|---|
| Instagram | 8 | 대부분 (디자인루키 등 채용 큐레이션 계정 다수) | 2 |
| Threads | 7 | 다수 (개인/에이전시가 주간 채용 요약 게시) | 3 |
| Facebook | 9 | 일부 (기업 페이지 직접 게시 다수) | 1 |
| X(트위터) | 4 | 2 | 6 (업계 코멘트, 채용공고에 대한 감상 등) |

- Instagram/Facebook은 기업 또는 채용 큐레이션 계정이 직접 올린 공고 비중이 높아 신호 대비 노이즈가 낮음.
- X(트위터)는 "채용공고를 봤다/이야기한다" 류의 개인 코멘트가 섞여 False Positive 비율이 가장 높음 → 요건 추출 전 "1인칭 채용 공지 문구(모집합니다/채용합니다/지원 바랍니다 등)" 존재 여부로 1차 필터링 필요.
- Threads는 개인 큐레이터가 다수 채용공고를 요약해서 올리는 게시물이 많아, 한 게시물 안에 여러 기업의 공고가 섞여 있음 → 정규화 시 게시물 1건을 Job Record 여러 건으로 분리해야 함 (PRD에 반영 필요).

## 4. 정규화 샘플 (검색 스니펫 기반, 필드 제한 명시)

### 샘플 A — Instagram (큐레이션 계정)
- **Job Summary**: 8월 3주차 채용공고 모음 중 "그래픽 디자이너(신입)" 등 다건 (원본: 디자인루키)
- **Source**: `instagram.com/p/DcSomLEE8Ae` (큐레이션 계정, 원 채용 공고 아님 — 재게시)
- **Deadline**: UNKNOWN (스니펫에 "채용 시 마감"만 확인, 정확한 날짜는 원문 확인 필요)
- **Freshness**: UNKNOWN
- **MUST/PREFERRED**: UNKNOWN (스니펫에 요건 없음)
- **Research Confidence**: 낮음 — 큐레이션 재게시이므로 원 채용 공고(기업 공식 페이지)를 1차 소스로 재확인 필요
- **Exclusion Reason**: 해당 없음(후보로 유지하되 원문 링크만 제공, 정규화 보류)

### 샘플 B — Facebook (기업 페이지 직접 게시 추정)
- **Job Summary**: "상담디자이너 채용공고" (포카라다이아몬드)
- **Source**: `facebook.com/pocaradiamond/posts/...` (기업 페이지로 추정, 계정 성격 재검증 필요)
- **Deadline**: UNKNOWN
- **Freshness**: UNKNOWN
- **Research Confidence**: 중간 — 기업 페이지 직접 게시로 추정되나 검색 스니펫만으로는 확정 불가
- **Exclusion Reason**: 해당 없음

### 샘플 C — X (제외 대상)
- **원문**: "AI 시대, 디자이너들의 채용공고가 변했다. Meta는 Vibecoding을, Figma는..." (업계 트렌드 코멘트)
- **판정**: 채용공고 아님 (기업의 채용 공지가 아니라 채용 트렌드에 대한 개인 의견)
- **Exclusion Reason**: `NOT_A_JOB_POSTING`

## 5. PRD 반영 사항

1. **소스 신뢰도 등급 추가**: 기업 공식 계정 직접 게시 > 채용 큐레이션 계정 재게시 > 개인 공유/코멘트. 큐레이션 재게시는 원문(기업 공식 채용 페이지) 재확인 전까지 Research Confidence를 낮게 유지.
2. **1건의 게시물 → N건의 Job Record 분리 규칙 추가** (Threads/Instagram 주간 요약 게시물 대응).
3. **1인칭 채용 공지 문구 기반 1차 필터** 추가 (X 노이즈 대응).
4. **필드 완전성 한계 명시**: `firecrawl_search`는 스니펫만 제공 → 정확한 마감일/전체 요건은 원문 확인 전까지 `UNKNOWN`/`AMBIGUOUS` 유지, 임의 채우기 금지(career-job-research 금지 규칙과 일치).

## 6. 다음 단계

- Phase 2에서 위 4가지 규칙을 파이프라인 로직에 반영 후, 동일 쿼리 세트로 재실행하여 False Positive율 재측정
- 원문 확인이 필요한 고신뢰 후보(샘플 B 등)에 한해 사람이 직접 원문 방문 확인하는 수동 검증 단계를 Phase 2에 임시로 포함(자동 scrape 도구 부재 대응)
