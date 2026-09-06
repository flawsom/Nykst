alter table public.nykst_subscriptions
  add column if not exists plan text not null default 'monthly';

alter table public.nykst_subscriptions
  add constraint nykst_subscriptions_plan_check check (plan in ('monthly', 'annual'));

alter table public.nykst_payment_submissions
  drop constraint if exists nykst_payment_submissions_amount_npr_check;

alter table public.nykst_payment_submissions
  add constraint nykst_payment_submissions_amount_npr_check check (amount_npr in (999, 9999));

alter table public.nykst_payment_submissions
  add column if not exists plan text not null default 'monthly';

alter table public.nykst_payment_submissions
  add constraint nykst_payment_submissions_plan_check check (plan in ('monthly', 'annual'));
