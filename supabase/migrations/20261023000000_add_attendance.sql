-- 행정팀 에이전트 1차 구축 — 출결 테이블 신설
-- 설계 근거: 다운로드 폴더에 전달한 컴그에이젼트구축_27/행정팀/03_산출물/attendance-and-completion-design-draft.md
-- 이 저장소에는 기존 마이그레이션 파일이 없어(스키마가 저장소 밖에서 관리됨), 이번이 첫 SQL 파일입니다.
-- 적용 전 운영 DB에서 students/profiles 실제 컬럼명을 확인하세요 (이 세션은 네트워크 차단으로 미확인).

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade not null,
  class_date date not null,
  status text not null check (status in ('출석', '지각', '결석', '공결')),
  note text,
  created_at timestamptz default now(),
  unique (student_id, class_date)
);

alter table attendance enable row level security;

-- 학생: 본인 출결만 조회 (profiles.user_id → profiles.student_id 매핑 기준, js/auth.js 참고)
create policy "students_select_own_attendance"
  on attendance for select
  using (
    student_id in (
      select student_id from profiles where profiles.user_id = auth.uid()
    )
  );

-- 강사/관리자: 전체 출결 조회·등록·수정 (js/data.js의 profiles.role 체계 기준)
create policy "staff_manage_attendance"
  on attendance for all
  using (
    exists (
      select 1 from profiles
      where profiles.user_id = auth.uid()
        and profiles.role in ('instructor', 'admin')
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.user_id = auth.uid()
        and profiles.role in ('instructor', 'admin')
    )
  );

comment on table attendance is '행정팀 에이전트 — 학생별 수업일 출결 기록 (출석/지각/결석/공결)';
