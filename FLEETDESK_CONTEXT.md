# FLEETDESK_CONTEXT.md
> Вставляй этот файл в начало каждой сессии с Claude.
> Источник истины: src/integrations/supabase/types.ts
> Последнее обновление: май 2026

---

## Проект

**FleetDesk** — UAE SaaS для управления арендой автомобилей.
Работает в production. Используется менеджерами компании, не клиентами.
Репозиторий: `github.com/prostoali2207-gif/uae-drive-suite`

---

## Стек

| Слой | Технология |
|---|---|
| Framework | React + TypeScript + Vite |
| Styling | Tailwind CSS |
| UI компоненты | shadcn/ui |
| Backend / DB | Supabase (database + storage + auth) |
| PDF | jsPDF (`src/lib/contractPdf.ts`) |
| Excel import | `src/lib/excelImport.ts` |
| Иконки | lucide-react |
| Шрифты | DM Sans (текст), IBM Plex Mono (числа, ID, номера) |
| Пакетный менеджер | Bun |

---

## Структура src/

```
src/
  components/ui/          # shadcn/ui примитивы — не трогать
  contexts/AuthContext.ts
  data/clients.ts, countries.ts
  hooks/use-mobile.tsx, use-toast.ts, useAuth.tsx
  integrations/supabase/
    client.ts             # ⚠️ КРИТИЧНО — не изменять
    types.ts              # ⚠️ КРИТИЧНО — не изменять
  lib/
    contractPdf.ts        # jsPDF — в процессе
    excelImport.ts
    supabase.ts
    utils.ts
    vehicleStatusSync.ts
  pages/
    Auth.tsx, AuthConfirm.tsx, ResetPassword.tsx
    Dashboard.tsx         # нужен редизайн
    Clients.tsx, ClientDetail.tsx
    Contracts.tsx
    ContractDetail.tsx    # ⚠️ КРИТИЧНО — никогда не переписывать
    Fleet.tsx
    Fines.tsx
    Payments.tsx
    Reports.tsx
    Settings.tsx
    server.js             # webhook handler, порт 3000
```

---

## Критические файлы — НИКОГДА не переписывать целиком

```
src/pages/ContractDetail.tsx       # финансовый леджер, все вкладки
src/integrations/supabase/client.ts
src/integrations/supabase/types.ts
src/App.tsx                        # роутер
```

---

## Статус модулей

| Модуль | Статус | Примечание |
|---|---|---|
| Fleet | ✅ Работает | Не трогать |
| Contracts (список) | ✅ Работает | Не трогать |
| ContractDetail | ✅ Работает | КРИТИЧНЫЙ файл |
| Clients | ✅ Работает | Storage uploads активны |
| Fines & Salik | ✅ Работает | Excel import подключён |
| Payments | ✅ Работает | |
| Reports | ✅ Работает | |
| Settings | ✅ Работает | |
| Dashboard | ⚠️ Неполный | Данные есть, визуал не готов |
| PDF Export | ⚠️ Неполный | jsPDF в contractPdf.ts |
| Tally Webhook | ❌ Сломан | Tally форма удалена, server.js на порту 3000 |

---

## Схема базы данных (из types.ts — источник истины)

### profiles
| Колонка | Тип | Nullable |
|---|---|---|
| id | string (uuid) | NO |
| email | string | NO |
| company_name | string | NO |
| logo_url | string | YES |
| created_at | string | NO |

### cars
| Колонка | Тип | Nullable |
|---|---|---|
| id | string (uuid) | NO |
| plate | string | NO |
| make | string | NO |
| model | string | NO |
| year | number | NO |
| status | string | NO — 'Available' \| 'Rented' \| 'Service' |
| insurance_expiry | string | YES |
| mulkiya_expiry | string | YES |
| tag_number | string | YES — Salik тег |
| owner_id | string | NO |
| created_at | string | NO |

### clients
| Колонка | Тип | Nullable |
|---|---|---|
| id | string (uuid) | NO |
| full_name | string | NO |
| phone | string | NO |
| email | string | YES |
| nationality | string | NO |
| client_type | string | NO — 'Resident' \| 'Tourist' |
| emirates_id | string | YES — только для Resident |
| emirates_id_expiry | string | YES |
| passport_number | string | YES — только для Tourist |
| passport_expiry | string | YES |
| license_number | string | NO |
| license_expiry | string | YES |
| owner_id | string | NO |
| created_at | string | NO |

⚠️ Следующие колонки добавлены через Supabase Dashboard напрямую — их НЕТ в types.ts.
TypeScript их не знает. При использовании нужен каст: `(client as any).passport_photo_url`

| Колонка | Тип | Nullable |
|---|---|---|
| date_of_birth | date | YES |
| passport_photo_url | text | YES |
| eid_front_url | text | YES |
| eid_back_url | text | YES |
| license_front_url | text | YES |
| license_back_url | text | YES |

⚠️ Эти колонки нужно добавить в types.ts и создать миграцию — иначе при regenerate types они пропадут.

### contracts
| Колонка | Тип | Nullable |
|---|---|---|
| id | string (uuid) | NO |
| client_id | string | NO |
| car_id | string | NO |
| start_date | string | NO |
| end_date | string | NO |
| start_time | string | NO — default '12:00' |
| end_time | string | NO — default '12:00' |
| rate_type | string | NO — 'Daily' \| 'Monthly' \| 'Yearly' |
| rate_amount | number | NO |
| total_amount | number | NO |
| deposit_amount | number | NO |
| initial_mileage | number | NO |
| fuel_level | string | NO — 'Full' \| 'Half' \| '3/4' \| '1/4' |
| status | string | NO — 'Active' \| 'Expiring Soon' \| 'Completed' \| 'Cancelled' |
| payment_status | string | NO — 'Paid' \| 'Partial' \| 'Unpaid' |
| notes | string | YES |
| owner_id | string | NO |
| created_at | string | NO |

⚠️ end_time существует в БД и в types.ts. Ранее вызывал баг при insert — проверяй перед использованием.

### fines
| Колонка | Тип | Nullable |
|---|---|---|
| id | string (uuid) | NO |
| car_id | string | YES |
| client_id | string | YES |
| contract_id | string | YES |
| fine_date | string | NO |
| fine_type | string | NO |
| fine_number | string | YES — уникальный per owner |
| amount | number | NO |
| original_amount | number | NO |
| service_fee | number | NO |
| source | string | NO |
| status | string | NO — 'Unpaid' \| 'Charged to Client' \| 'Paid' |
| notes | string | YES |
| owner_id | string | NO |
| created_at | string | NO |

### salik
| Колонка | Тип | Nullable |
|---|---|---|
| id | string (uuid) | NO |
| car_id | string | YES |
| client_id | string | YES |
| contract_id | string | YES |
| charge_date | string | NO |
| transaction_id | string | YES — уникальный per owner |
| tag_number | string | YES |
| toll_gate | string | YES |
| direction | string | YES |
| trips | number | NO |
| amount | number | NO |
| original_amount | number | NO |
| service_fee | number | NO |
| status | string | NO — 'Unpaid' \| 'Charged to Client' \| 'Paid' |
| owner_id | string | NO |
| created_at | string | NO |

### payments
| Колонка | Тип | Nullable |
|---|---|---|
| id | string (uuid) | NO |
| contract_id | string | YES |
| client_id | string | NO |
| amount | number | NO |
| payment_date | string | NO |
| method | string | NO — 'Cash' \| 'Bank Transfer' \| 'Card' |
| status | string | NO — 'Paid' \| 'Partial' \| 'Overdue' |
| owner_id | string | NO |
| created_at | string | NO |

---

## DB функции (из types.ts)

| Функция | Аргументы | Возвращает |
|---|---|---|
| compute_contract_status | _current_status: string, _end_date: string | string |
| refresh_contract_statuses | — | void |

---

## Автоматика контрактов (триггеры)

- `contracts_set_status` — вычисляет status по end_date при INSERT/UPDATE
- Логика: end_date прошёл → 'Completed', через ≤7 дней → 'Expiring Soon', иначе → 'Active'
- 'Cancelled' — терминальный статус, триггер не перезаписывает
- `refresh_contract_statuses()` — cron job каждый день в 00:05 UTC

## Автоматика статуса машин (триггеры)

- Контракт Active/Expiring Soon → cars.status = 'Rented'
- Контракт Completed/Cancelled + нет других активных → cars.status = 'Available'
- При смене машины в контракте — обновляются обе машины
- Файл: `src/lib/vehicleStatusSync.ts`

---

## Supabase Storage

| Bucket | Назначение | Публичный |
|---|---|---|
| client-documents | Документы клиентов | NO |
| company-logos | Логотип компании | NO |

Путь загрузки документов: `client-documents/{filename}`
⚠️ RLS политики устанавливаются ВРУЧНУЮ через Supabase Dashboard — AI не может это сделать.

---

## Известные баги и ограничения

| Проблема | Статус | Детали |
|---|---|---|
| PDF скачивается как текст | ⚠️ Не решён | jsPDF в contractPdf.ts |
| Tally webhook | ❌ Сломан | Tally форма удалена, server.js порт 3000 |
| end_time в contracts | ⚠️ Осторожно | Колонка есть, ранее вызывала баг при insert |
| ContractDetail.tsx | ⚠️ История | Сломан AI-перезаписью, восстановлен через git |
| Фото документов клиентов | ⚠️ Неясно | Колонок нет в types.ts — возможно добавлены через Dashboard без миграции |

---

## Правила разработки (обязательно)

1. **Одна задача — макс 2 файла**
2. **Не переписывать целиком** — только точечные правки
3. **Визуальные правки** — не трогать логику, props, data fetching
4. **Новый функционал** — новый файл, подключать после проверки
5. **App.tsx** — не трогать без явного подтверждения
6. **После каждой задачи** — git commit
7. **Перед рискованным изменением** — git commit с пометкой wip

```bash
git add . && git commit -m "описание"
git add . && git commit -m "wip: before [задача]"
git show HEAD~1:src/pages/FileName.tsx > src/pages/FileName.tsx
```

---

## UAE-специфика (бизнес-логика)

- **Salik** — платные дороги Дубая. Списываются по tag_number на машине. Клиент платит за поездки во время аренды.
- **Mulkiya** — техпаспорт машины UAE. Следить за сроком expiry.
- **Emirates ID** — национальный ID резидентов UAE. Туристы имеют только паспорт.
- **client_type: Resident** — есть Emirates ID, нет обязательного паспорта
- **client_type: Tourist** — есть паспорт, нет Emirates ID
- **Депозит** — берётся при подписании контракта, возвращается при закрытии за вычетом ущерба/штрафов
- **Типичные боли**: поздние платежи, штрафы после сдачи машины, споры по депозиту при возврате, мультиязычный персонал, WhatsApp как основной канал коммуникации


