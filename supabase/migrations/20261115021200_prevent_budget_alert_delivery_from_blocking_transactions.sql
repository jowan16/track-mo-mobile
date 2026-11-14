
create or replace function public.notify_budget_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_project_url text;
  v_secret_key text;
  v_record jsonb;
  v_old_record jsonb;
begin
  if tg_op = 'DELETE' then
    v_record := to_jsonb(old);
  else
    v_record := to_jsonb(new);
  end if;

  if tg_op = 'UPDATE' then
    v_old_record := to_jsonb(old);
  end if;

  begin
    select decrypted_secret
      into v_project_url
    from vault.decrypted_secrets
    where name = 'project_url';

    select decrypted_secret
      into v_secret_key
    from vault.decrypted_secrets
    where name = 'secret_key';

    if v_project_url is null or v_secret_key is null then
      raise warning 'Budget alert webhook credentials are missing.';
    else
      perform net.http_post(
        url := rtrim(v_project_url, '/') || '/functions/v1/budget-alert',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', v_secret_key
        ),
        body := jsonb_build_object(
          'type', tg_op,
          'table', tg_table_name,
          'schema', tg_table_schema,
          'record', v_record,
          'old_record', v_old_record
        ),
        timeout_milliseconds := 5000
      );
    end if;
  exception when others then
    -- Alert delivery is asynchronous and must never block expense or budget writes.
    raise warning 'Budget alert webhook enqueue failed: %', sqlerrm;
  end;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;
