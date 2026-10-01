
create table if not exists public.showroom_finance_operation_catalog (
  sort_order integer primary key,
  article text not null,
  direction text not null check (direction in ('Приход', 'Расход')),
  cash_row integer,
  ajman_row integer,
  search_terms text not null default '',
  active boolean not null default true,
  source_updated_at timestamptz not null default now(),
  constraint showroom_finance_operation_has_mapping
    check (cash_row is not null or ajman_row is not null),
  constraint showroom_finance_operation_unique
    unique (article, direction)
);

alter table public.showroom_finance_operation_catalog enable row level security;
revoke all on table public.showroom_finance_operation_catalog from anon, authenticated;

insert into public.showroom_finance_operation_catalog
  (sort_order, article, direction, cash_row, ajman_row, search_terms)
values
  (1,'Приход от продажи собственных авто','Приход',6,6,'продажа собственных авто'),
  (2,'Приход от продажи инвесторских авто','Приход',22,22,'продажа инвесторских авто'),
  (3,'комиссия от продажи авто (наши средства 100%)','Приход',28,28,'комиссия продажа авто'),
  (4,'Услуги сопровождения (мои)','Приход',34,34,'сопровождение услуги'),
  (5,'Депозит','Приход',40,40,'депозит'),
  (6,'Прочие','Приход',52,52,'прочие приход'),
  (7,'получено в долг','Приход',57,57,'долг получено'),
  (8,'приход со счета AJMAN','Приход',59,null,'перевод ajman в кассу'),
  (9,'приход со счета в сбере','Приход',60,60,'приход сбер перевод'),
  (10,'приход из кассы','Приход',null,61,'перевод касса в ajman'),
  (11,'покупка авто для перепродажи','Расход',66,66,'покупка выкуп авто'),
  (12,'выплата за проданное авто инвестору (100% инвест)','Расход',77,77,'выплата инвестору продажа авто'),
  (13,'расходы связанные с подгатовкой авто','Расход',83,83,'подготовка авто'),
  (14,'Расходы связанные с регистрацией авто','Расход',89,89,'регистрация авто'),
  (15,'Возврат депозита','Расход',95,95,'возврат депозита'),
  (16,'Оплата труда з/п','Расход',101,101,'зарплата зп'),
  (17,'телефон','Расход',109,109,'телефон связь'),
  (18,'интернет','Расход',110,110,'интернет связь'),
  (19,'э\\энергия','Расход',112,112,'электричество энергия коммунальные'),
  (20,'вода','Расход',113,113,'вода коммунальные'),
  (21,'Налоги','Расход',119,119,'налоги'),
  (22,'реклама автосалона','Расход',124,124,'реклама салон'),
  (23,'мойка авто','Расход',125,125,'мойка'),
  (24,'аренда стоянки','Расход',126,126,'стоянка аренда'),
  (25,'Прочие выплаты','Расход',127,127,'прочие выплаты'),
  (26,'Прочие (мелочь)','Расход',132,132,'мелочь прочие'),
  (27,'выплочен долг','Расход',140,140,'долг выплата'),
  (28,'перевод на счет в AJMAN','Расход',142,null,'перевод касса ajman'),
  (29,'перевод на счет в СБЕР','Расход',143,143,'перевод сбер'),
  (30,'перевод в КАССУ','Расход',null,144,'перевод ajman касса')
on conflict (sort_order) do update
set article = excluded.article,
    direction = excluded.direction,
    cash_row = excluded.cash_row,
    ajman_row = excluded.ajman_row,
    search_terms = excluded.search_terms,
    active = true,
    source_updated_at = now();
