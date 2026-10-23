# 마이그레이션 적용 전 확인사항

이 저장소에는 지금까지 SQL 마이그레이션 파일이 없었습니다(스키마가 저장소 밖, Supabase
대시보드나 별도 레포에서 관리된 것으로 보입니다). `20261023000000_add_attendance.sql`은
행정팀 에이전트(`컴그에이젼트구축_27/행정팀/`) 설계를 반영한 첫 마이그레이션 제안입니다.

## 적용 전 필수 확인

이 세션은 운영 Supabase(`hpzpojvywpqputbzfwqo.supabase.co`) 접속이 네트워크 정책으로
차단되어 있어, 아래 사항을 실제 DB에서 확인하지 못했습니다:

1. `profiles` 테이블의 실제 컬럼명이 `js/auth.js`/`js/data.js`에서 본 것과 동일한지
   (`user_id`, `role`, `student_id`).
2. `students.id`가 실제 PK 타입(uuid)과 일치하는지.
3. 기존에 비슷한 RLS 정책 네이밍 규칙이 있는지 (이 파일의 정책명은 추정값).

## 적용 방법

```bash
# Supabase CLI를 쓰는 경우
supabase db push

# 또는 Supabase 대시보드 → SQL Editor에 파일 내용을 그대로 붙여넣어 실행
```

적용 후 `scripts/db-pilot/run_pilot.py`로 `students`/`job_postings` 등 기존 테이블 확인을
먼저 진행하고, 이 마이그레이션은 그 다음에 적용하는 순서를 권장합니다.
