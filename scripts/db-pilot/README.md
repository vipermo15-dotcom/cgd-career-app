# DB 연동 파일럿 스크립트

컴그 에이전트 구축(홍보팀/취업팀/행정팀) 통합 전, 운영 DB에서 각 팀 설계가 실제로 맞는지
확인하기 위한 읽기 전용(+선택적 쓰기 테스트) 스크립트입니다.

**이 저장소를 다루는 Claude Code 세션에서는 `hpzpojvywpqputbzfwqo.supabase.co` 접속이
조직 네트워크 정책으로 차단되어 있음을 확인했습니다** (`curl` → `403 connect_rejected`).
실행하려면 세션 환경 설정(클라우드 환경 메뉴 → Edit → Network access)에서 Allowed domains에
이 호스트를 추가하거나, 네트워크 제한이 없는 별도 환경에서 실행하세요.

## 실행

```bash
cd scripts/db-pilot
pip install requests

# 선택: 다른 프로젝트/키를 쓰려면 override (기본값은 js/config.js의 공개 anon key 내장)
# export SUPABASE_URL="..."
# export SUPABASE_ANON_KEY="..."
export PILOT_COHORT_ID="a0000000-0000-0000-0000-000000000022"   # 기본값, 필요시 교체
export PILOT_STUDENT_ID="<실제 학생 uuid>"                        # 매칭 테스트용

python run_pilot.py               # 1~5번 읽기 전용 체크
python run_pilot.py --write-test  # 6번(지원 등록, 쓰기) 까지 — 담당자 승인 후에만
```

결과는 `pilot_report_<타임스탬프>.json`으로 저장됩니다. 체크리스트 1~6번의 의미는
`컴그에이젼트구축_27/오케스트레이터/02_DB연동파일럿/pilot-plan.md`에서 설명합니다.
