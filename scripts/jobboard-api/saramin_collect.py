"""
사람인(Saramin) 공식 Open API로 채용공고를 수집하는 스크립트.

사전 준비:
1. https://oapi.saramin.co.kr/join 에서 이용신청 후 승인을 받는다.
2. https://oapi.saramin.co.kr/guide/1 에서 access-key를 발급받는다.
3. 이 스크립트를 access-key 및 API 도메인이 차단되지 않은 환경(회사 PC 등)에서 실행한다.
   (claude.ai / Claude Code on the web 세션은 oapi.saramin.co.kr 접속이 조직 네트워크
   정책으로 차단되어 있어 이 스크립트를 그 환경에서 실행할 수 없다.)

사용법:
    pip install requests
    export SARAMIN_ACCESS_KEY="발급받은-access-key"
    python saramin_collect.py --keywords "그래픽디자이너,편집디자이너,BX디자이너" \
        --deadline-month 2026-09 --out saramin_2026_09.csv

참고 문서: https://oapi.saramin.co.kr/guide/job-search
"""
import argparse
import csv
import os
import sys
import time
from datetime import datetime

import requests

API_URL = "https://oapi.saramin.co.kr/job-search"
PAGE_SIZE = 110  # 사람인 API 1회 최대 반환 건수(공식 가이드 기준, 문서 재확인 권장)
DAILY_CALL_LIMIT = 500  # 1일 최대 호출 횟수 (공식 가이드 기준)


def fetch_page(access_key: str, keyword: str, start: int) -> dict:
    params = {
        "access-key": access_key,
        "keyword": keyword,
        "start": start,
        "count": PAGE_SIZE,
        "fields": "expiration-timestamp,posting-timestamp",
        "sr": "directhire",  # 직접등록 공고만 원하면 유지, 전체를 원하면 제거 (가이드 확인)
    }
    resp = requests.get(API_URL, params=params, headers={"Accept": "application/json"}, timeout=20)
    resp.raise_for_status()
    return resp.json()


def in_target_month(expiration_date: str, target_month: str) -> bool:
    """expiration-date 예: '2026-09-30T23:59:59+0900'. target_month 예: '2026-09'."""
    if not expiration_date:
        return False
    return expiration_date.startswith(target_month)


def collect(access_key: str, keywords: list[str], target_month: str, out_path: str):
    seen_ids = set()
    rows = []
    call_count = 0

    for keyword in keywords:
        start = 0
        while True:
            if call_count >= DAILY_CALL_LIMIT:
                print(f"[경고] 일일 호출 한도({DAILY_CALL_LIMIT}회)에 도달해 중단합니다.", file=sys.stderr)
                break

            data = fetch_page(access_key, keyword, start)
            call_count += 1
            jobs = data.get("jobs", {})
            job_list = jobs.get("job", [])
            if isinstance(job_list, dict):  # 결과가 1건이면 dict로 오는 경우 방어
                job_list = [job_list]
            if not job_list:
                break

            for job in job_list:
                job_id = job.get("id")
                if job_id in seen_ids:
                    continue
                expiration_date = job.get("expiration-date", "")
                if not in_target_month(expiration_date, target_month):
                    continue
                seen_ids.add(job_id)
                position = job.get("position", {})
                company = job.get("company", {}).get("detail", {})
                rows.append({
                    "id": job_id,
                    "keyword": keyword,
                    "company": company.get("name", ""),
                    "title": position.get("title", ""),
                    "location": position.get("location", {}).get("name", ""),
                    "job_type": position.get("job-type", {}).get("name", ""),
                    "experience": position.get("experience-level", {}).get("name", ""),
                    "education": position.get("required-education-level", {}).get("name", ""),
                    "expiration_date": expiration_date,
                    "url": job.get("url", ""),
                })

            total = int(jobs.get("total", 0))
            start += PAGE_SIZE
            if start >= total:
                break
            time.sleep(0.3)  # API 서버 부담을 줄이기 위한 짧은 대기

        if call_count >= DAILY_CALL_LIMIT:
            break

    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "id", "keyword", "company", "title", "location", "job_type",
            "experience", "education", "expiration_date", "url",
        ])
        writer.writeheader()
        writer.writerows(rows)

    print(f"완료: {len(rows)}건 저장 → {out_path} (API 호출 {call_count}회)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="사람인 Open API 채용공고 수집")
    parser.add_argument("--keywords", required=True, help="쉼표로 구분된 검색 키워드 목록")
    parser.add_argument("--deadline-month", required=True, help="마감 연월, 예: 2026-09")
    parser.add_argument("--out", default="saramin_output.csv", help="출력 CSV 경로")
    args = parser.parse_args()

    access_key = os.environ.get("SARAMIN_ACCESS_KEY")
    if not access_key:
        print("환경변수 SARAMIN_ACCESS_KEY를 설정하세요.", file=sys.stderr)
        sys.exit(1)

    keywords = [k.strip() for k in args.keywords.split(",") if k.strip()]
    collect(access_key, keywords, args.deadline_month, args.out)
