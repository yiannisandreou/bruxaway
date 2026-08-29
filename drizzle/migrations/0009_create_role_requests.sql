CREATE TYPE public.app_role_request_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.role_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text,
  full_name text,
  status public.app_role_request_status NOT NULL DEFAULT 'pending',
  reviewer_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  UNIQUE (user_id)
);

GRANT SELECT, INSERT ON public.role_requests TO authenticated;
GRANT ALL ON public.role_requests TO service_role;

ALTER TABLE public.role_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user creates own request"
  ON public.role_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user reads own request"
  ON public.role_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'physician'::app_role));

CREATE POLICY "deny patient updates"
  ON public.role_requests
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "deny patient deletes"
  ON public.role_requests
  FOR DELETE
  TO authenticated
  USING (false);