"""
운영 Supabase DB 연동 파일럿 스크립트.

docs/prd (또는 Downloads/컴그에이젼트구축_27/오케스트레이터/02_DB연동파일럿/pilot-plan.md)에서
정의한 체크리스트 1~5번(읽기 전용)을 실행하고 결과를 JSON으로 저장한다.

*** 이 스크립트는 이 환경(Claude Code on the web)에서 바로 실행되지 않을 수 있다 ***
hpzpojvywpqputbzfwqo.supabase.co 가 조직 네트워크 정책으로 차단된 상태로 확인되었다
(curl 테스트: 403 connect_rejected). 세션 환경 설정에서 Allowed domains에 이 호스트를
추가한 뒤 실행하거나, 네트워크 제한이 없는 별도 환경에서 실행한다.

사용법:
    pip install requests
    # config.js에 공개 anon key가 커밋되어 있으므로 기본값으로도 동작하지만,
    # 다른 프로젝트/키를 쓰려면 아래 env var로 override 가능.
    export SUPABASE_URL="https://hpzpojvywpqputbzfwqo.supabase.co"      # 선택, 기본값 내장
    export SUPABASE_ANON_KEY="sb_publishable_..."                        # 선택, 기본값 내장
    export PILOT_COHORT_ID="a0000000-0000-0000-0000-000000000022"        # 기본값: config.js의 DEFAULT_COHORT_ID
    export PILOT_STUDENT_ID="<실제 학생 uuid>"                           # 4,5번 항목에 필요

    python run_pilot.py                 # 1~5번(읽기 전용) 실행
    python run_pilot.py --write-test    # 6번(지원 등록, 쓰기) 까지 실행 — 담당자 승인 후에만 사용
"""
import argparse
import json
import os
import sys
from datetime import datetime

import requests

DEFAULT_SUPABASE_URL = "https://hpzpojvywpqputbzfwqo.supabase.co"
DEFAULT_ANON_KEY = "sb_publishable_aC65d9tYvcsKsStTP4hYhg_n1ZaH-tg"
DEFAULT_COHORT_ID = "a0000000-0000-0000-0000-000000000022"


def client(url: str, key: str):
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

    def rest_get(path: str, params: dict | None = None):
        r = requests.get(f"{url}/rest/v1/{path}", headers=headers, params=params, timeout=20)
        return {"status": r.status_code, "body": safe_json(r)}

    def rpc(fn: str, payload: dict):
        r = requests.post(f"{url}/rest/v1/rpc/{fn}", headers=headers, json=payload, timeout=20)
        return {"status": r.status_code, "body": safe_json(r)}

    def rest_post(path: str, payload: dict):
        r = requests.post(f"{url}/rest/v1/{path}", headers={**headers, "Prefer": "return=representation"},
                           json=payload, timeout=20)
        return {"status": r.status_code, "body": safe_json(r)}

    return rest_get, rpc, rest_post


def safe_json(resp):
    try:
        return resp.json()
    except ValueError:
        return resp.text[:500]


def run(write_test: bool):
    url = os.environ.get("SUPABASE_URL", DEFAULT_SUPABASE_URL)
    key = os.environ.get("SUPABASE_ANON_KEY", DEFAULT_ANON_KEY)
    cohort_id = os.environ.get("PILOT_COHORT_ID", DEFAULT_COHORT_ID)
    student_id = os.environ.get("PILOT_STUDENT_ID")

    rest_get, rpc, rest_post = client(url, key)
    report = {"ran_at": datetime.utcnow().isoformat() + "Z", "checks": {}}

    # 1) students 테이블 실명 필드 존재 여부 확인
    report["checks"]["1_students_columns"] = rest_get("students", {"limit": 1})

    # 2) 기수 대시보드
    report["checks"]["2_dashboard_summary"] = rpc("dashboard_summary", {"p_cohort": cohort_id})

    # 3) ACTIVE 공고 존재 여부
    report["checks"]["3_active_job_postings"] = rest_get(
        "job_postings", {"status": "eq.ACTIVE", "select": "id,company,title,job_category,deadline", "limit": 20}
    )

    if student_id:
        # 4) 학생 매칭
        report["checks"]["4_top_matches"] = rpc("top_matches", {"p_student": student_id})

        # 5) GAP 분석 (매칭 결과가 있으면 첫 공고로 테스트)
        matches = report["checks"]["4_top_matches"].get("body")
        first_posting_id = None
        if isinstance(matches, list) and matches:
            first_posting_id = matches[0].get("posting_id") or matches[0].get("job_posting_id")
        if first_posting_id:
            report["checks"]["5_gap_analysis"] = rpc(
                "gap_analysis", {"p_student": student_id, "p_posting": first_posting_id}
            )
        else:
            report["checks"]["5_gap_analysis"] = "SKIPPED (4번에서 posting_id를 찾지 못함)"

        if write_test:
            if first_posting_id:
                report["checks"]["6_apply_to_posting_WRITE"] = rest_post(
                    "applications",
                    {
                        "student_id": student_id,
                        "job_posting_id": first_posting_id,
                        "status": "INTERESTED",
                        "source": "db-pilot-test",
                    },
                )
            else:
                report["checks"]["6_apply_to_posting_WRITE"] = "SKIPPED (posting_id 없음)"
    else:
        report["checks"]["4_top_matches"] = "SKIPPED (PILOT_STUDENT_ID 환경변수 미설정)"
        report["checks"]["5_gap_analysis"] = "SKIPPED"
        if write_test:
            report["checks"]["6_apply_to_posting_WRITE"] = "SKIPPED (PILOT_STUDENT_ID 환경변수 미설정)"

    out_path = f"pilot_report_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"완료: {out_path} 에 결과 저장")
    for k, v in report["checks"].items():
        status = v.get("status") if isinstance(v, dict) else v
        print(f"  - {k}: {status}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="운영 DB 연동 파일럿 (1~5번 읽기전용, --write-test로 6번 포함)")
    parser.add_argument("--write-test", action="store_true",
                         help="6번(지원 등록, 쓰기 작업)까지 실행 — 담당자 승인 후에만 사용")
    args = parser.parse_args()

    try:
        run(args.write_test)
    except requests.exceptions.ConnectionError as e:
        print(
            "[네트워크 오류] 이 환경에서 Supabase 도메인에 접속할 수 없습니다. "
            "세션 환경 설정의 Network access에서 Allowed domains에 "
            "hpzpojvywpqputbzfwqo.supabase.co 를 추가한 뒤 다시 실행하세요.",
            file=sys.stderr,
        )
        sys.exit(1)
