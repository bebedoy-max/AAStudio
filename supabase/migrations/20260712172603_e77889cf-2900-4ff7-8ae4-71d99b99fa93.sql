CREATE TYPE public.app_role AS ENUM ('admin', 'editor', 'user');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.route_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route_key TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, route_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.route_permissions TO authenticated;
GRANT ALL ON public.route_permissions TO service_role;
ALTER TABLE public.route_permissions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.has_route_permission(_user_id UUID, _route_key TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.route_permissions
      WHERE user_id = _user_id AND route_key = _route_key
        AND (expires_at IS NULL OR expires_at > now())
    )
$$;

CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_admin_select" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_admin_update" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_admin_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_admin_delete" ON public.profiles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_self_select" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "route_perm_self_select" ON public.route_permissions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "route_perm_admin_all" ON public.route_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _first_user BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO _first_user;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN _first_user THEN 'admin'::public.app_role ELSE 'user'::public.app_role END);
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_route_permission(uuid, text) TO authenticated, service_role;

CREATE TABLE public.feature_prices (
  route_key text PRIMARY KEY,
  label text NOT NULL,
  price_idr integer NOT NULL DEFAULT 50000,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.feature_prices TO anon, authenticated;
GRANT ALL ON public.feature_prices TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.feature_prices TO authenticated;
ALTER TABLE public.feature_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY fp_read ON public.feature_prices FOR SELECT USING (true);
CREATE POLICY fp_admin_write ON public.feature_prices FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY fp_admin_update ON public.feature_prices FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY fp_admin_delete ON public.feature_prices FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER fp_touch BEFORE UPDATE ON public.feature_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.feature_prices (route_key, label, price_idr) VALUES
  ('generate.motion','Motion Control',50000),
  ('generate.storyboard','Produk Storyboard',50000),
  ('generate.bulk-fashion','Bulk Fashion Generator',50000),
  ('generate.image-to-video','Image To Video',50000),
  ('generate.naratif','Naratif Video Maker',50000),
  ('__full_access__','Full Akses (Semua Fitur)',200000);

CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('qris','bank','ewallet','custom')),
  name text NOT NULL,
  instructions text,
  account_number text,
  account_holder text,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_methods TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY pm_read_active ON public.payment_methods FOR SELECT USING (is_active OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY pm_admin_all ON public.payment_methods FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER pm_touch BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route_key text NOT NULL,
  price_idr integer NOT NULL,
  payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  payment_method_name text,
  proof_image_url text,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  activated_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.purchase_requests TO authenticated;
GRANT ALL ON public.purchase_requests TO service_role;
ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY pr_self_select ON public.purchase_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY pr_self_insert ON public.purchase_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');
CREATE POLICY pr_admin_update ON public.purchase_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER pr_touch BEFORE UPDATE ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.on_purchase_approved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _new_expiry timestamptz; _existing timestamptz;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    SELECT expires_at INTO _existing FROM public.route_permissions
      WHERE user_id = NEW.user_id AND route_key = NEW.route_key;
    _new_expiry := GREATEST(COALESCE(_existing, now()), now()) + interval '30 days';
    INSERT INTO public.route_permissions (user_id, route_key, expires_at)
    VALUES (NEW.user_id, NEW.route_key, _new_expiry)
    ON CONFLICT (user_id, route_key)
    DO UPDATE SET expires_at = EXCLUDED.expires_at;
    NEW.activated_until := _new_expiry;
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
    NEW.reviewed_by := COALESCE(NEW.reviewed_by, auth.uid());
  ELSIF NEW.status = 'rejected' AND (OLD.status IS DISTINCT FROM 'rejected') THEN
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
    NEW.reviewed_by := COALESCE(NEW.reviewed_by, auth.uid());
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER pr_on_approved BEFORE UPDATE ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.on_purchase_approved();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_purchase_approved() FROM PUBLIC, anon, authenticated;

CREATE TABLE public.ai_characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  gender text,
  age int,
  nationality text,
  language text,
  occupation text,
  niche text,
  style text,
  personality_text text,
  background_story text,
  hobby text,
  relationship_status text,
  favorite_color text,
  fashion_style text,
  hair_style text,
  body_type text,
  voice text,
  description text,
  negative_prompt text,
  avatar_url text,
  status text NOT NULL DEFAULT 'draft',
  last_generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_characters TO authenticated;
GRANT ALL ON public.ai_characters TO service_role;
ALTER TABLE public.ai_characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own characters" ON public.ai_characters FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER ai_characters_updated_at BEFORE UPDATE ON public.ai_characters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ai_character_personality (
  character_id uuid PRIMARY KEY REFERENCES public.ai_characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  funny int NOT NULL DEFAULT 50,
  elegant int NOT NULL DEFAULT 50,
  luxury int NOT NULL DEFAULT 50,
  cute int NOT NULL DEFAULT 50,
  professional int NOT NULL DEFAULT 50,
  energetic int NOT NULL DEFAULT 50,
  luxury_lifestyle int NOT NULL DEFAULT 50,
  minimalist int NOT NULL DEFAULT 50,
  emotional int NOT NULL DEFAULT 50,
  luxury_fashion int NOT NULL DEFAULT 50,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_character_personality TO authenticated;
GRANT ALL ON public.ai_character_personality TO service_role;
ALTER TABLE public.ai_character_personality ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own personality" ON public.ai_character_personality FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER ai_character_personality_updated_at BEFORE UPDATE ON public.ai_character_personality
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ai_character_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES public.ai_characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  url text NOT NULL,
  parsed_style jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_character_references TO authenticated;
GRANT ALL ON public.ai_character_references TO service_role;
ALTER TABLE public.ai_character_references ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own references" ON public.ai_character_references FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.ai_character_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES public.ai_characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scene text NOT NULL,
  prompt text,
  caption text,
  output_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_character_scenarios TO authenticated;
GRANT ALL ON public.ai_character_scenarios TO service_role;
ALTER TABLE public.ai_character_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own scenarios" ON public.ai_character_scenarios FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER ai_character_scenarios_updated_at BEFORE UPDATE ON public.ai_character_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ai_character_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES public.ai_characters(id) ON DELETE CASCADE,
  scenario_id uuid REFERENCES public.ai_character_scenarios(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  url text,
  content text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_character_assets TO authenticated;
GRANT ALL ON public.ai_character_assets TO service_role;
ALTER TABLE public.ai_character_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own assets" ON public.ai_character_assets FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.ai_influencer_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES public.ai_characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scene_key text NOT NULL,
  count int NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  UNIQUE (character_id, scene_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_influencer_memory TO authenticated;
GRANT ALL ON public.ai_influencer_memory TO service_role;
ALTER TABLE public.ai_influencer_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own memory" ON public.ai_influencer_memory FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.ai_content_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES public.ai_characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week int NOT NULL,
  content_type text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_content_plan TO authenticated;
GRANT ALL ON public.ai_content_plan TO service_role;
ALTER TABLE public.ai_content_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own plan" ON public.ai_content_plan FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER ai_content_plan_updated_at BEFORE UPDATE ON public.ai_content_plan
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX ai_characters_user_idx ON public.ai_characters(user_id, created_at DESC);
CREATE INDEX ai_scenarios_char_idx ON public.ai_character_scenarios(character_id, created_at DESC);

-- AI Digital Human Studio ----------------------------------------------------

CREATE TABLE public.ai_influencer_brain (
  character_id uuid PRIMARY KEY REFERENCES public.ai_characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  persona jsonb NOT NULL DEFAULT '{}'::jsonb,
  memory jsonb NOT NULL DEFAULT '{}'::jsonb,
  learning jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_influencer_brain TO authenticated;
GRANT ALL ON public.ai_influencer_brain TO service_role;
ALTER TABLE public.ai_influencer_brain ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own brain" ON public.ai_influencer_brain FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER ai_brain_updated_at BEFORE UPDATE ON public.ai_influencer_brain
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ai_influencer_strategy (
  character_id uuid PRIMARY KEY REFERENCES public.ai_characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weekly jsonb NOT NULL DEFAULT '[]'::jsonb,
  ratios jsonb NOT NULL DEFAULT '{}'::jsonb,
  goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_influencer_strategy TO authenticated;
GRANT ALL ON public.ai_influencer_strategy TO service_role;
ALTER TABLE public.ai_influencer_strategy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own strategy" ON public.ai_influencer_strategy FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER ai_strategy_updated_at BEFORE UPDATE ON public.ai_influencer_strategy
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ai_influencer_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES public.ai_characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_label text,
  slot_time text,
  platform text,
  idea text NOT NULL,
  caption text,
  hashtag text,
  thumbnail_url text,
  status text NOT NULL DEFAULT 'waiting',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_for timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_influencer_queue TO authenticated;
GRANT ALL ON public.ai_influencer_queue TO service_role;
ALTER TABLE public.ai_influencer_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own queue" ON public.ai_influencer_queue FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER ai_queue_updated_at BEFORE UPDATE ON public.ai_influencer_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX ai_queue_char_idx ON public.ai_influencer_queue(character_id, scheduled_for DESC);

CREATE TABLE public.ai_influencer_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES public.ai_characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  url text,
  content text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_influencer_assets TO authenticated;
GRANT ALL ON public.ai_influencer_assets TO service_role;
ALTER TABLE public.ai_influencer_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own influencer assets" ON public.ai_influencer_assets FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ai_influencer_assets_char_idx ON public.ai_influencer_assets(character_id, created_at DESC);

CREATE TABLE public.ai_influencer_publisher_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id uuid REFERENCES public.ai_characters(id) ON DELETE SET NULL,
  platform text NOT NULL,
  handle text NOT NULL,
  webhook_url text,
  access_token text,
  status text NOT NULL DEFAULT 'connected',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, handle)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_influencer_publisher_accounts TO authenticated;
GRANT ALL ON public.ai_influencer_publisher_accounts TO service_role;
ALTER TABLE public.ai_influencer_publisher_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own publisher accounts" ON public.ai_influencer_publisher_accounts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER ai_pub_accounts_updated_at BEFORE UPDATE ON public.ai_influencer_publisher_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();