create or replace function public.handle_new_auth_user_preferences()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_preferences (user_id, preferences)
  values (new.id::text, '{}'::jsonb)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_preferences on auth.users;

create trigger on_auth_user_created_preferences
after insert on auth.users
for each row
execute function public.handle_new_auth_user_preferences();

drop policy if exists "Users can read own preferences" on public.user_preferences;
drop policy if exists "Users can insert own preferences" on public.user_preferences;
drop policy if exists "Users can update own preferences" on public.user_preferences;
drop policy if exists "Users can delete own preferences" on public.user_preferences;

create policy "Users can read own preferences"
on public.user_preferences
for select
to authenticated
using (user_id = auth.uid()::text);

create policy "Users can insert own preferences"
on public.user_preferences
for insert
to authenticated
with check (user_id = auth.uid()::text);

create policy "Users can update own preferences"
on public.user_preferences
for update
to authenticated
using (user_id = auth.uid()::text)
with check (user_id = auth.uid()::text);

create policy "Users can delete own preferences"
on public.user_preferences
for delete
to authenticated
using (user_id = auth.uid()::text);
