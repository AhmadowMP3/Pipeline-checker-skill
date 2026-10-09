# Learning platform (LMS) playbook

## Signals
Models: Course, Module, Lesson, Enrollment, Progress, Quiz/Question/Attempt, Certificate, Instructor. Routes: /courses, /learn/[course]/[lesson], /dashboard, /certificates.

## Journeys
**Guest** — catalog, course page, syllabus, preview lessons; locked lessons really locked (open URL directly).
**Student** — enroll (free, or paid in test mode) → course in dashboard; open lessons in order; mark complete → progress % updates and persists after reload; video/media loads; quiz: wrong and right answers, scoring, retake rules, can't see answers before submitting; completion → certificate generated with correct name/course.
**Cross-role** — non-enrolled user can't access paid lesson content or its API; student can't access instructor tools.
**Instructor/Admin** → `admin.md` (course/lesson CRUD, publish, see enrollments and grades).

## Domain bug checklist
| Bug | Severity |
|---|---|
| Paid/locked lesson content reachable without enrollment | critical |
| Quiz answers exposed in page/API before submission | high |
| Progress not saved / resets | high |
| Certificate with wrong data or available before completion | medium |
| Media fails on mobile | medium |
