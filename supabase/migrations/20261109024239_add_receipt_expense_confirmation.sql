
create unique index if not exists expense_receipts_user_storage_path_uidx
on public.expense_receipts (user_id, storage_path);

create or replace function public.save_receipt_expense(
  p_storage_path text, p_merchant_name text, p_receipt_date date,
  p_subtotal numeric, p_tax numeric, p_total numeric, p_currency text,
  p_category_id bigint, p_amount numeric, p_spent_on date,
  p_payment_method text, p_note text, p_items jsonb, p_recognition_data jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_receipt_id uuid;
  v_expense_id uuid;
  v_item jsonb;
begin
  if v_user_id is null then raise exception 'You must be signed in to save a receipt.'; end if;
  if p_storage_path is null or p_storage_path !~ ('^' || v_user_id::text || '/[^/]+$') then
    raise exception 'Invalid receipt storage path.';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 9999999.99 then
    raise exception 'Expense amount must be greater than zero and within the allowed limit.';
  end if;
  if p_spent_on is null or p_spent_on > current_date then raise exception 'Please provide a valid expense date.'; end if;
  if p_payment_method not in ('Cash', 'E-wallet', 'Card', 'Bank transfer') then raise exception 'Please select a valid payment method.'; end if;
  if length(coalesce(p_note, '')) > 200 then raise exception 'Expense note cannot exceed 200 characters.'; end if;
  if not exists (
    select 1 from public.categories c
    join public.user_categories uc on uc.category_id = c.id
    where c.id = p_category_id and c.is_active = true and c.show_in_picker = true and uc.user_id = v_user_id
  ) then raise exception 'Please select one of your active expense categories.'; end if;

  select id, expense_id into v_receipt_id, v_expense_id
  from public.expense_receipts
  where user_id = v_user_id and storage_path = p_storage_path
  for update;

  if v_expense_id is not null then return v_expense_id; end if;

  insert into public.expenses (user_id, category_id, amount, spent_on, payment_method, note, is_archived)
  values (v_user_id, p_category_id, p_amount, i_spent_on, p_payment_method, nullif(trim(coalesce(p_note, '')), ''), false)
  returning id into v_expense_id;

  if v_receipt_id is null then
    insert into public.expense_receipts (
      user_id, expense_id, storage_path, merchant_name, receipt_date,
      subtotal, tax, total, currency, recognition_status, recognition_data
    ) values (
      v_user_id, v_expense_id, p_storage_path, nullif(trim(coalesce(p_merchant_name, '')), ''),
      p_receipt_date, p_subtotal, p_tax, p_total, coalesce(nullif(p_currency, ''), 'PHP'),
      'completed', coalesce(p_recognition_data, '{}'::jsonb)
    ) returning id into v_receipt_id;
  else
    update public.expense_receipts
    set expense_id = v_expense_id, merchant_name = nullif(trim(coalesce(p_merchant_name, '')), ''),
        receipt_date = p_receipt_date, subtotal = p_subtotal, tax = p_tax, total = p_total,
        currency = coalesce(nullif(p_currency, ''), 'PHP'), recognition_status = 'completed',
        recognition_data = coalesce(p_recognition_data, '{}'::jsonb), updated_at = now()
    where id = v_receipt_id and user_id = v_user_id;
    delete from public.expense_receipt_items where receipt_id = v_receipt_id;
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) = 'array' then
    for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
    loop
      if nullif(trim(coalesce(v_item->>'item_name', '')), '') is not null then
        insert into public.expense_receipt_items (receipt_id, item_name, quantity, unit_price, line_total)
        values (
          v_receipt_id, left(trim(v_item->>'item_name'), 200),
          greatest(coalesce(nullif(v_item->>'quantity', '')::numeric, 1), 0.001),
          nullif(v_item->>'unit_price', '')::numeric, nullif(v_item->>'line_total', '')::numeric
        );
      end if;
    end loop;
  end if;
  return v_expense_id;
end;
$$;

grant execute on function public.save_receipt_expense(
  text, text, date, numeric, numeric, numeric, text, bigint, numeric, date,
  text, text, jsonb, jsonb
) to authenticated;
