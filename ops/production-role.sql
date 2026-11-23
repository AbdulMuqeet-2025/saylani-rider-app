-- Run manually as a PostgreSQL administrator after reviewing the target database.
-- Replace the password placeholder before executing. This script is not run by the app.
CREATE ROLE saylani_rider_app LOGIN PASSWORD 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD';

GRANT CONNECT ON DATABASE neondb TO saylani_rider_app;
GRANT USAGE ON SCHEMA public TO saylani_rider_app;

GRANT SELECT ON TABLE
  public.team_members,
  public.roles,
  public.riders,
  public.cities,
  public.donation_boxes,
  public.rider_tasks,
  public.partners,
  public.collections,
  public.field_collection_logs,
  public.rider_box_condition_reports
TO saylani_rider_app;

GRANT UPDATE (task_status, workflow_stage, notes, completed_at, completion_time, workflow_events, notification_read_at)
ON public.rider_tasks TO saylani_rider_app;

GRANT INSERT ON public.collections TO saylani_rider_app;
GRANT INSERT ON public.field_collection_logs TO saylani_rider_app;
GRANT INSERT ON public.activity_audit_log TO saylani_rider_app;
GRANT INSERT ON public.rider_box_condition_reports TO saylani_rider_app;
GRANT UPDATE (box_id, rider_id, reported_by_team_id, condition_status, condition_note, reported_at)
ON public.rider_box_condition_reports TO saylani_rider_app;
