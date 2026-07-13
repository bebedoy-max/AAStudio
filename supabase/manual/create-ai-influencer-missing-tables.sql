-- Missing AI Influencer tables. Jalankan di Supabase SQL Editor project qlsczwntaxxxmvcxtxzu.
-- Aman untuk dijalankan ulang: pakai IF NOT EXISTS + DROP TRIGGER IF EXISTS.

-- 1) ai_influencer_brain (1 row per character)
CREATE TABLE IF NOT EXISTS public.ai_influencer_brain (
  character_id UUID PRIMARY KEY REFERENCES public.ai_characters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  persona JSONB NOT NULL DEFAULT '{}'::jsonb,
  memory JSONB NOT NULL DEFAULT '{}'::jsonb,
  learning JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_influencer_brain TO authenticated;
GRANT ALL ON public.ai_influencer_brain TO service_role;
ALTER TABLE public.ai_influencer_brain ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brain_owner_all ON public.ai_influencer_brain;
CREATE POLICY brain_owner_all ON public.ai_influencer_brain FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS ai_influencer_brain_touch ON public.ai_influencer_brain;
CREATE TRIGGER ai_influencer_brain_touch BEFORE UPDATE ON public.ai_influencer_brain
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) ai_influencer_assets
CREATE TABLE IF NOT EXISTS public.ai_influencer_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES public.ai_characters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  url TEXT,
  content TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_influencer_assets TO authenticated;
GRANT ALL ON public.ai_influencer_assets TO service_role;
ALTER TABLE public.ai_influencer_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inf_assets_owner_all ON public.ai_influencer_assets;
CREATE POLICY inf_assets_owner_all ON public.ai_influencer_assets FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3) ai_influencer_queue
CREATE TABLE IF NOT EXISTS public.ai_influencer_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES public.ai_characters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idea TEXT NOT NULL,
  caption TEXT,
  hashtag TEXT,
  platform TEXT,
  day_label TEXT,
  slot_time TEXT,
  scheduled_for TIMESTAMPTZ,
  thumbnail_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_influencer_queue TO authenticated;
GRANT ALL ON public.ai_influencer_queue TO service_role;
ALTER TABLE public.ai_influencer_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inf_queue_owner_all ON public.ai_influencer_queue;
CREATE POLICY inf_queue_owner_all ON public.ai_influencer_queue FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS ai_influencer_queue_touch ON public.ai_influencer_queue;
CREATE TRIGGER ai_influencer_queue_touch BEFORE UPDATE ON public.ai_influencer_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) ai_influencer_strategy (1 row per character)
CREATE TABLE IF NOT EXISTS public.ai_influencer_strategy (
  character_id UUID PRIMARY KEY REFERENCES public.ai_characters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goals JSONB NOT NULL DEFAULT '{}'::jsonb,
  ratios JSONB NOT NULL DEFAULT '{}'::jsonb,
  weekly JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_influencer_strategy TO authenticated;
GRANT ALL ON public.ai_influencer_strategy TO service_role;
ALTER TABLE public.ai_influencer_strategy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inf_strategy_owner_all ON public.ai_influencer_strategy;
CREATE POLICY inf_strategy_owner_all ON public.ai_influencer_strategy FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS ai_influencer_strategy_touch ON public.ai_influencer_strategy;
CREATE TRIGGER ai_influencer_strategy_touch BEFORE UPDATE ON public.ai_influencer_strategy
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) ai_influencer_publisher_accounts
CREATE TABLE IF NOT EXISTS public.ai_influencer_publisher_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id UUID REFERENCES public.ai_characters(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  access_token TEXT,
  webhook_url TEXT,
  status TEXT NOT NULL DEFAULT 'connected',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_influencer_publisher_accounts TO authenticated;
GRANT ALL ON public.ai_influencer_publisher_accounts TO service_role;
ALTER TABLE public.ai_influencer_publisher_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inf_pub_owner_all ON public.ai_influencer_publisher_accounts;
CREATE POLICY inf_pub_owner_all ON public.ai_influencer_publisher_accounts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS ai_influencer_publisher_accounts_touch ON public.ai_influencer_publisher_accounts;
CREATE TRIGGER ai_influencer_publisher_accounts_touch BEFORE UPDATE ON public.ai_influencer_publisher_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
