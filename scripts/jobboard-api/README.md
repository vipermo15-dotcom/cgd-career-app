# 채용 사이트 공식 API 수집 스크립트

`docs/prd/jobboard-1000-collection-prd.md`에서 결정된 방향에 따라 작성된 스크립트입니다.
**이 스크립트들은 Claude Code on the web 세션(이 저장소를 다루는 이 환경)에서는 실행할 수 없습니다.**
사람인·잡코리아·원티드의 API 도메인(`oapi.saramin.co.kr`, `jobkorea.co.kr`, `openapi.wanted.jobs`)이
조직 네트워크 정책으로 차단되어 있기 때문입니다. **반드시 이 저장소를 클론한 별도의 PC(회사 PC 등,
네트워크 제한이 없는 환경)에서 실행하세요.**

## 왜 이렇게 되어 있나

| 플랫폼 | 공식 API | 이 세션에서 실행 가능? | 스크립트 상태 |
|---|---|---|---|
| 사람인 | `oapi.saramin.co.kr` (문서 상세, access-key 방식) | ❌ 차단됨 | ✅ 완전히 작동하는 스크립트 |
| 잡코리아 | `jobkorea.co.kr/service/api` | ❌ 차단됨 | ⚠️ 템플릿 (파라미터 직접 확인 필요) |
| 원티드 | `openapi.wanted.jobs` | ❌ 차단됨 | ⚠️ 템플릿 (파라미터 직접 확인 필요) |
| 디자인잡 | 공식 API 확인 안 됨 | ❌ 차단됨 | 스크립트 없음 (아래 "디자인잡" 참고) |

사람인은 API 문서가 매우 상세히 공개되어 있어(`oapi.saramin.co.kr/guide/job-search`) 검색 결과만으로도
정확한 요청/응답 형식을 확인할 수 있었습니다. 잡코리아와 원티드는 API 존재는 확인했지만, 이 세션에서
직접 문서 페이지를 열어볼 수 없어(네트워크 차단) 정확한 파라미터명까지는 확인하지 못했습니다.
**담당자가 실제 환경에서 각 문서 페이지를 열어 TODO로 표시된 부분을 수정한 뒤 실행해야 합니다.**

## 실행 순서

### 1. 사람인 (`saramin_collect.py`) — 바로 실행 가능
```bash
cd scripts/jobboard-api
pip install -r requirements.txt

# 1) https://oapi.saramin.co.kr/join 에서 이용신청 → 승인 대기
# 2) https://oapi.saramin.co.kr/guide/1 에서 access-key 발급
export SARAMIN_ACCESS_KEY="발급받은-키"

python saramin_collect.py \
  --keywords "그래픽디자이너,편집디자이너,브랜드디자이너,BX디자이너,패키지디자이너,VMD,SNS콘텐츠디자이너,영상편집디자이너,굿즈디자이너,콘텐츠마케터" \
  --deadline-month 2026-09 \
  --out saramin_2026_09.csv
```
- 키워드를 늘릴수록 더 많은 공고를 모을 수 있습니다. CGD 학생 관련 직무 카테고리(`docs/prd/job-category-trusted-accounts.md`에 정리된 AD/ED/GD/BD/PD/MD/SC/CM/BX/CC/AIC)를 참고해 키워드를 확장하세요.
- 하루 최대 500회 호출 제한이 있으므로, 키워드가 많으면 여러 날에 나눠 실행해야 할 수 있습니다.
- `expiration-date`가 `--deadline-month`(예: `2026-09`)로 시작하는 공고만 필터링해 저장합니다.

### 2. 잡코리아 (`jobkorea_collect.py`) — 실행 전 수정 필요
1. 담당자 PC에서 `https://www.jobkorea.co.kr/service/api` 페이지를 열어 API 신청.
2. 승인 후 제공되는 문서에서 **정확한 엔드포인트 URL, 인증 방식, 응답 필드명(특히 마감일 필드)**을 확인.
3. `jobkorea_collect.py`의 `TODO` 주석 4곳(엔드포인트, 인증 헤더, 응답 파싱, 마감일 필드명)을 실제 값으로 교체.
4. 사람인과 동일하게 실행:
   ```bash
   export JOBKOREA_API_KEY="발급받은-키"
   python jobkorea_collect.py --keywords "..." --deadline-month 2026-09 --out jobkorea_2026_09.csv
   ```

### 3. 원티드 (`wanted_collect.py`) — 실행 전 수정 필요
1. `https://openapi.wanted.jobs/apply/` 에서 API Key 신청 (접수 후 3일 이내 이메일로 수령).
2. `https://openapi.wanted.jobs/api-docs/v1/` (또는 v2) 문서에서 정확한 엔드포인트·파라미터 확인.
3. `wanted_collect.py`의 TODO 항목 수정.
4. **주의**: 원티드는 명시적 마감일이 없는 "상시채용" 비중이 높아, 사람인·잡코리아만큼 "9월 마감"으로
   깔끔하게 필터링되지 않을 수 있습니다. 마감일 필드가 비어 있는 공고는 별도로 검토하세요.

### 4. 디자인잡(designerjob.co.kr)
공식 개발자 API 존재 여부를 이번 조사에서 확인하지 못했습니다. 사이트 자체도 이 세션에서 접속이
차단되어 있어, 담당자가 직접 사이트에서 "채용정보 API"나 "제휴 문의" 메뉴가 있는지 확인해야 합니다.
없다면 이 플랫폼은 API 경로로는 수집이 불가능하며, Firecrawl 검색 스니펫 방식(`docs/prd/jobboard-1000-collection-prd.md` 1장 참고, 수율이 매우 낮음)만 남습니다.

## 결과 병합 및 필터링

각 스크립트는 독립된 CSV를 생성합니다. 여러 플랫폼 결과를 하나로 합치려면 간단히 이어붙이면 됩니다:
```bash
python -c "
import pandas as pd
dfs = [pd.read_csv(f, encoding='utf-8-sig') for f in ['saramin_2026_09.csv', 'jobkorea_2026_09.csv']]
combined = pd.concat(dfs, ignore_index=True)
combined.to_csv('all_2026_09.csv', index=False, encoding='utf-8-sig')
print(len(combined), '건')
"
```
(플랫폼마다 컬럼명이 조금씩 다르므로 실제 병합 시 컬럼 매핑을 맞춰야 합니다.)

## 결과를 이 저장소의 job_postings 테이블에 반영하려면

`docs/prd/phase4-matching-integration-design.md`에서 설계한 대로, CSV의 각 행을 `job_postings` 테이블에
`status = DRAFT`로 먼저 넣고 담당자가 원문을 확인한 뒤 `ACTIVE`로 전환하는 것을 권장합니다. API로 받은
데이터는 마감일이 정확하므로(사람인 기준) 검색 스니펫 기반 수집보다 신뢰도가 훨씬 높지만, 그래도 대량
자동 반영 전에는 샘플을 사람이 검토하는 것을 권장합니다.
