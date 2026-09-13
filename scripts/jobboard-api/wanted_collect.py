"""
원티드(Wanted) 공식 OpenAPI로 채용공고를 수집하는 템플릿 스크립트.

*** 중요: 이 스크립트는 템플릿입니다 ***
openapi.wanted.jobs 도 이 세션에서 접속이 차단되어 있어 정확한 응답 스키마를
직접 확인하지 못했습니다. 원티드 OpenAPI는 신청 후 "3일 이내" 이메일로
인증키를 받는 방식이며, Jobs API는 정렬/연차/직원수/스킬/직군/직무 필터를
지원한다고 안내되어 있습니다(https://openapi.wanted.jobs/). 실제 실행 전
담당자가 https://openapi.wanted.jobs/api-docs/v1/ (또는 v2) 문서를 열어
정확한 엔드포인트·인증 헤더·응답 필드명을 확인하고 TODO를 수정해야 합니다.

원티드는 채용공고에 잡코리아·사람인처럼 명시적 "접수 마감일"이 없는 상시채용
비중이 높다는 점도 참고 — "9월 마감" 필터링이 사람인/잡코리아만큼 깔끔하게
되지 않을 수 있습니다.

사전 준비:
1. https://openapi.wanted.jobs/apply/ 에서 API Key 발급 신청 (Jobs 권한).
2. 3일 이내 이메일로 인증키 수령.
3. https://openapi.wanted.jobs/api-docs/v1/ 에서 정확한 파라미터 확인 후 TODO 수정.

사용법 (파라미터 확인 후):
    pip install requests
    export WANTED_API_KEY="발급받은-키"
    python wanted_collect.py --job-group "디자인" --out wanted_output.csv
"""
import argparse
import csv
import os
import sys
import time

import requests

# TODO: 공식 문서(openapi.wanted.jobs/api-docs/v1/)에서 정확한 엔드포인트로 교체
API_URL = "https://openapi.wanted.jobs/v1/jobs"  # 추정값, 반드시 확인 필요
PAGE_SIZE = 50


def fetch_page(api_key: str, job_group: str, offset: int) -> dict:
    # TODO: 인증 방식(Authorization 헤더 vs 쿼리 파라미터) 확인 필요
    headers = {"Authorization": f"Bearer {api_key}", "Accept": "application/json"}
    params = {
        "job_group": job_group,  # TODO: 실제 파라미터명 확인 (job_category 등일 수 있음)
        "offset": offset,
        "limit": PAGE_SIZE,
    }
    resp = requests.get(API_URL, params=params, headers=headers, timeout=20)
    resp.raise_for_status()
    return resp.json()


def collect(api_key: str, job_group: str, out_path: str):
    rows = []
    offset = 0

    while True:
        data = fetch_page(api_key, job_group, offset)
        # TODO: 실제 응답 구조에 맞게 수정 (예: data.get("data", []))
        job_list = data.get("jobs", []) or data.get("data", [])
        if not job_list:
            break

        for job in job_list:
            rows.append({
                "id": job.get("id", ""),
                "company": job.get("company_name", "") or job.get("company", {}).get("name", ""),
                "title": job.get("position", "") or job.get("title", ""),
                "location": job.get("address", "") or job.get("location", ""),
                # 원티드는 명시적 마감일이 없는 상시채용이 많음 — 있다면 필드명 확인 후 채우기
                "deadline": job.get("due_time", ""),
                "url": job.get("url", "") or f"https://www.wanted.co.kr/wd/{job.get('id', '')}",
            })

        if len(job_list) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
        time.sleep(0.3)

    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=["id", "company", "title", "location", "deadline", "url"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"완료: {len(rows)}건 저장 → {out_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="원티드 OpenAPI 채용공고 수집 (템플릿 — 파라미터 확인 필요)")
    parser.add_argument("--job-group", default="디자인", help="직군 필터 (예: 디자인)")
    parser.add_argument("--out", default="wanted_output.csv", help="출력 CSV 경로")
    args = parser.parse_args()

    api_key = os.environ.get("WANTED_API_KEY")
    if not api_key:
        print("환경변수 WANTED_API_KEY를 설정하세요.", file=sys.stderr)
        sys.exit(1)

    print(
        "[안내] 이 스크립트는 템플릿입니다. 실행 전 openapi.wanted.jobs/api-docs 문서를 "
        "직접 확인해 API_URL과 파싱 로직의 TODO 항목을 수정하세요. 원티드는 마감일이 "
        "없는 상시채용이 많아 '9월 마감' 필터링이 부정확할 수 있습니다.",
        file=sys.stderr,
    )

    collect(api_key, args.job_group, args.out)
