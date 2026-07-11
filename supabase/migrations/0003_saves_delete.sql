-- 0003_saves_delete: reset'in bulut silmesi (spec §4.E/§4.I).
-- RLS using (user_id = auth.uid()) baskasinin satirini silmeyi engeller — yetki yukseltmesi yok.
grant delete on table public.saves to authenticated;
create policy saves_delete_own on public.saves
  for delete to authenticated using (user_id = auth.uid());
