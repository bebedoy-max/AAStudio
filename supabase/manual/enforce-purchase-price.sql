-- Menutup celah kritis: price_idr pada purchase_requests sepenuhnya dikontrol
-- klien (insert langsung lewat PostgREST), sehingga siapa pun bisa membuat
-- pesanan Rp1 lalu mendapatkan token/fitur penuh setelah membayar Rp1.
--
-- Trigger di bawah menghitung ulang harga otoritatif dari katalog server
-- (token_bank_prices / feature_prices) pada setiap INSERT dan menolak/menimpa
-- nilai kiriman klien. Harga bundle = 70% dari total harga fitur terpilih,
-- sama seperti aturan bisnis di UI.
--
-- Jalankan di Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.enforce_purchase_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cart_json   text;
  cart        jsonb;
  item        jsonb;
  computed    bigint := 0;
  qty         integer;
  unit        integer;
  keys        text[];
  marker_pos  integer;
BEGIN
  -- 1) Keranjang Token Bank: [TOKEN_BANK_CART][{"provider":"...","qty":n}, ...]
  marker_pos := position('[TOKEN_BANK_CART]' IN COALESCE(NEW.note, ''));
  IF marker_pos > 0 THEN
    cart_json := substr(NEW.note, marker_pos + length('[TOKEN_BANK_CART]'));
    BEGIN
      cart := cart_json::jsonb;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Keranjang pesanan tidak valid';
    END;

    IF jsonb_typeof(cart) <> 'array' THEN
      RAISE EXCEPTION 'Keranjang pesanan tidak valid';
    END IF;

    FOR item IN SELECT * FROM jsonb_array_elements(cart) LOOP
      qty := GREATEST(0, floor(COALESCE((item->>'qty')::numeric, 0))::int);
      IF qty = 0 THEN CONTINUE; END IF;
      SELECT p.price_idr INTO unit
        FROM public.token_bank_prices p
       WHERE p.provider::text = (item->>'provider')
         AND p.is_active;
      IF unit IS NULL OR unit <= 0 THEN
        RAISE EXCEPTION 'Token % tidak dijual', item->>'provider';
      END IF;
      computed := computed + (unit::bigint * qty);
    END LOOP;

  -- 2) Paket fitur: [FEATURES:key1,key2] (+ opsional [BUNDLE: ...])
  ELSE
    marker_pos := position('[FEATURES:' IN COALESCE(NEW.note, ''));
    IF marker_pos > 0 THEN
      keys := string_to_array(
        split_part(substr(NEW.note, marker_pos + length('[FEATURES:')), ']', 1),
        ','
      );
      SELECT COALESCE(sum(f.price_idr), 0) INTO computed
        FROM public.feature_prices f
       WHERE f.route_key = ANY(keys)
         AND f.is_active;

      IF position('[BUNDLE:' IN COALESCE(NEW.note, '')) > 0 THEN
        computed := round(computed * 0.7);
      END IF;

    -- 3) Pembelian fitur tunggal lewat route_key
    ELSIF NEW.route_key IS NOT NULL THEN
      SELECT COALESCE(f.price_idr, 0) INTO computed
        FROM public.feature_prices f
       WHERE f.route_key = NEW.route_key
         AND f.is_active;
    END IF;
  END IF;

  IF computed IS NULL OR computed <= 0 THEN
    RAISE EXCEPTION 'Harga pesanan tidak dapat divalidasi di server';
  END IF;

  -- Harga selalu ditentukan server, apa pun yang dikirim klien.
  NEW.price_idr := computed;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_purchase_price() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_enforce_purchase_price ON public.purchase_requests;
CREATE TRIGGER trg_enforce_purchase_price
  BEFORE INSERT ON public.purchase_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_purchase_price();

-- Cegah klien mengubah harga/status pesanan setelah dibuat.
DROP POLICY IF EXISTS pr_self_update ON public.purchase_requests;
