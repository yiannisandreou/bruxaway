-- Profile prompt settings (cron needs these server-side) --------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS prompts_per_day int NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS start_hour int NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS end_hour int NOT NULL DEFAULT 22;

-- Push subscriptions ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient manages own push subscriptions" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Prompt events (tracks each fired prompt, for capping + adherence) --------
CREATE TABLE IF NOT EXISTS public.prompt_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fired_at timestamptz NOT NULL DEFAULT now(),
  answered boolean NOT NULL DEFAULT false
);

CREATE INDEX prompt_events_user_day_idx ON public.prompt_events (user_id, fired_at DESC);

GRANT SELECT ON public.prompt_events TO authenticated;
GRANT ALL ON public.prompt_events TO service_role;
ALTER TABLE public.prompt_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient reads own prompt events" ON public.prompt_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Allow patients to mark a fired prompt as answered ----------------------
CREATE POLICY "patient answers own prompt events" ON public.prompt_events
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);