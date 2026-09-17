-- Gate command queue: commands pushed to the external gate readers
-- (https://cek.goepoet.com/card-command.php) and their feedback
-- (https://cek.goepoet.com/command-result.php).
create table if not exists gate_commands (
  id             uuid primary key default uuid_generate_v4(),
  action         text not null check (action in ('ADD','UPDATE','DELETE')),
  uid            text not null,
  blok           text not null default '',
  no_rumah       text not null default '',
  status         text not null default 'QUEUED'
                 check (status in ('QUEUED','SENDING','WAITING_RESULT','DONE','FAILED')),
  attempt_count  integer not null default 0,
  response_json  jsonb,
  feedback_json  jsonb,
  error_message  text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create index if not exists gate_commands_uid_idx on gate_commands(uid);
create index if not exists gate_commands_status_idx on gate_commands(status);
create index if not exists gate_commands_created_idx on gate_commands(created_at desc);

drop trigger if exists gate_commands_updated_at on gate_commands;
create trigger gate_commands_updated_at before update on gate_commands
  for each row execute function set_updated_at();

alter table gate_commands enable row level security;