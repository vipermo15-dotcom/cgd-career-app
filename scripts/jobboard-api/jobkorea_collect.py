"""
잡코리아(JobKorea) 공식 API로 채용공고를 수집하는 템플릿 스크립트.

*** 중요: 이 스크립트는 템플릿입니다 ***
이 세션은 jobkorea.co.kr 도메인 접속이 조직 네트워크 정책으로 차단되어 있어
https://www.jobkorea.co.kr/service/api 페이지의 정확한 요청 URL·파라미터명·
응답 스키마를 직접 확인하지 못했습니다. 아래 코드는 사람인 API와 유사한
REST/쿼리 파라미터 패턴을 가정한 뼈대이며, 실제 실행 전 반드시 담당자가
차단되지 않은 환경에서 https://www.jobkorea.co.kr/service/api 페이지를 열어
(1) 정확한 엔드포인트 URL, (2) 인증 방식(access-key인지 별도 토큰인지),
(3) 응답 필드명(특히 마감일 필드명)을 확인하고 아래 TODO 부분을 수정해야 합니다.

사전 준비:
1. https://www.jobkorea.co.kr/service/api 에서 API 이용 신청.
2. 승인 후 발급받은 인증 정보를 환경변수로 설정.
3. 위 페이지에서 실제 파라미터명을 확인해 아래 TODO들을 수정.

사용법 (파라미터 확인 후):
    pip install requests
    export JOBKOREA_API_KEY="발급받은-키"
    python jobkorea_collect.py --keywords "그래픽디자이너,편집디자이너" \
        --deadline-month 2026-09 --out jobkorea_2026_09.csv
"""
import argparse
import csv
import os
import sys
import time

import requests

# TODO: 공식 문서(jobkorea.co.kr/service/api)에서 정확한 엔드포인트로 교체
API_URL = "https://openapi.jobkorea.co.kr/v1/job-search"  # 추정값, 반드시 확인 필요
PAGE_SIZE = 100
DAILY_CALL_LIMIT = 500  # 공지 기준(매일 최대 500개 공고 제공) — 호출 횟수 제한과는 다를 수 있어 확인 필요


def fetch_page(api_key: str, keyword: str, start: int) -> dict:
    # TODO: 인증 방식이 헤더(Authorization: Bearer ...)인지 쿼리 파라미터인지 확인 필요
    headers = {"Authorization": f"Bearer {api_key}", "Accept": "application/json"}
    params = {
        "keyword": keyword,
        "start": start,
        "count": PAGE_SIZE,
    }
    resp = requests.get(API_URL, params=params, headers=headers, timeout=20)
    resp.raise_for_status()
    return resp.json()


def in_target_month(expiration_date: str, target_month: str) -> bool:
    if not expiration_date:
        return False
    return expiration_date.startswith(target_month)


def collect(api_key: str, keywords: list[str], target_month: str, out_path: str):
    seen_ids = set()
    rows = []
    call_count = 0

    for keyword in keywords:
        start = 0
        while True:
            if call_count >= DAILY_CALL_LIMIT:
                print(f"[경고] 일일 호출 한도({DAILY_CALL_LIMIT}회)에 도달해 중단합니다.", file=sys.stderr)
                break

            data = fetch_page(api_key, keyword, start)
            call_count += 1

            # TODO: 실제 응답 구조에 맞게 아래 파싱 로직 수정
            job_list = data.get("jobs", []) or data.get("data", [])
            if not job_list:
                break

            for job in job_list:
                job_id = job.get("id") or job.get("jobId")
                if job_id in seen_ids:
                    continue
                # TODO: 실제 마감일 필드명으로 교체 (예: "expirationDate", "closeDate" 등)
                expiration_date = job.get("expirationDate", "") or job.get("closeDate", "")
                if not in_target_month(expiration_date, target_month):
                    continue
                seen_ids.add(job_id)
                rows.append({
                    "id": job_id,
                    "keyword": keyword,
                    "company": job.get("companyName", ""),
                    "title": job.get("title", ""),
                    "location": job.get("location", ""),
                    "expiration_date": expiration_date,
                    "url": job.get("url", ""),
                })

            if len(job_list) < PAGE_SIZE:
                break
            start += PAGE_SIZE
            time.sleep(0.3)

        if call_count >= DAILY_CALL_LIMIT:
            break

    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "id", "keyword", "company", "title", "location", "expiration_date", "url",
        ])
        writer.writeheader()
        writer.writerows(rows)

    print(f"완료: {len(rows)}건 저장 → {out_path} (API 호출 {call_count}회)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="잡코리아 API 채용공고 수집 (템플릿 — 파라미터 확인 필요)")
    parser.add_argument("--keywords", required=True, help="쉼표로 구분된 검색 키워드 목록")
    parser.add_argument("--deadline-month", required=True, help="마감 연월, 예: 2026-09")
    parser.add_argument("--out", default="jobkorea_output.csv", help="출력 CSV 경로")
    args = parser.parse_args()

    api_key = os.environ.get("JOBKOREA_API_KEY")
    if not api_key:
        print("환경변수 JOBKOREA_API_KEY를 설정하세요.", file=sys.stderr)
        sys.exit(1)

    print(
        "[안내] 이 스크립트는 템플릿입니다. 실행 전 jobkorea.co.kr/service/api 문서를 "
        "직접 확인해 API_URL과 파싱 로직의 TODO 항목을 수정하세요.",
        file=sys.stderr,
    )

    keywords = [k.strip() for k in args.keywords.split(",") if k.strip()]
    collect(api_key, keywords, args.deadline_month, args.out)
