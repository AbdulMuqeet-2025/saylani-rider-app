BEGIN;

CREATE TABLE IF NOT EXISTS public.rider_box_condition_reports (
  report_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id varchar(16) NOT NULL REFERENCES public.donation_boxes(box_id),
  rider_id varchar(16) NOT NULL REFERENCES public.riders(rider_id),
  task_id varchar(20) NOT NULL UNIQUE REFERENCES public.rider_tasks(task_id),
  reported_by_team_id varchar(40) NOT NULL REFERENCES public.team_members(team_id),
  condition_status varchar(16) NOT NULL CHECK (condition_status IN ('Fresh', 'Damaged')),
  condition_note text,
  reported_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT damaged_box_requires_note CHECK (
    condition_status <> 'Damaged' OR (condition_note IS NOT NULL AND length(btrim(condition_note)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS rider_box_condition_reports_box_time_idx
  ON public.rider_box_condition_reports (box_id, reported_at DESC);

COMMIT;
