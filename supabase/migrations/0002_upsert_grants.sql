-- 0002_upsert_grants: PostgREST upsert (ON CONFLICT DO UPDATE) icerir PK kolonunu
-- SET listesinde bile deger degismese de — bu yuzden UPDATE grant'i PK'da da sart.
-- RLS with check (user_id/id = auth.uid()) zaten baskasinin satirina yazilmasini engelliyor,
-- bu grant tek basina yetki yukseltmesi yaratmiyor.

grant update (user_id, payload, schema_version) on table public.saves to authenticated;
grant update (id, nickname) on table public.profiles to authenticated;
