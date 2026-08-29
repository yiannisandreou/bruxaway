-- Roles ---------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('patient', 'physician');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT, INSERT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "claim own role" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles ------------------------------------------------------------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Care links ----------------------------------------------------------
CREATE TABLE public.care_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  physician_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (physician_id, patient_id)
);

GRANT SELECT, INSERT, DELETE ON public.care_links TO authenticated;
GRANT ALL ON public.care_links TO service_role;
ALTER TABLE public.care_links ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_care_linked(_physician_id uuid, _patient_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.care_links
    WHERE physician_id = _physician_id AND patient_id = _patient_id
  )
$$;

CREATE POLICY "physician reads own links" ON public.care_links
  FOR SELECT TO authenticated USING (auth.uid() = physician_id);
CREATE POLICY "patient reads own links" ON public.care_links
  FOR SELECT TO authenticated USING (auth.uid() = patient_id);
CREATE POLICY "physician removes own links" ON public.care_links
  FOR DELETE TO authenticated USING (auth.uid() = physician_id);
CREATE POLICY "patient revokes own links" ON public.care_links
  FOR DELETE TO authenticated USING (auth.uid() = patient_id);

CREATE POLICY "physician reads linked patient profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'physician') AND public.is_care_linked(auth.uid(), id));

-- Entries -------------------------------------------------------------
CREATE TABLE public.entries (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  ts timestamptz NOT NULL,
  behavior text NOT NULL,
  contexts text[] NOT NULL DEFAULT '{}',
  stress smallint NOT NULL DEFAULT 3,
  note text,
  prompted boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX entries_user_ts_idx ON public.entries (user_id, ts DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entries TO authenticated;
GRANT ALL ON public.entries TO service_role;
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient reads own entries" ON public.entries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "patient writes own entries" ON public.entries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "patient updates own entries" ON public.entries
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "patient deletes own entries" ON public.entries
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "physician reads linked patient entries" ON public.entries
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'physician') AND public.is_care_linked(auth.uid(), user_id));
