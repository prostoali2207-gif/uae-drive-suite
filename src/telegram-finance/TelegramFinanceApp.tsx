import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./telegram-finance.css";

type TelegramWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  requestContact?: (callback?: (shared: boolean) => void) => void;
  HapticFeedback?: {
    impactOccurred?: (style: "light" | "medium" | "heavy") => void;
    notificationOccurred?: (type: "error" | "success" | "warning") => void;
  };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

type AccountKey = "cash_aed" | "ajman_aed" | "sber_rub";
type DirectionKey = "income" | "expense";

type OperationMatch = {
  row: number;
  article: string;
  label: string;
};

type AlternateDirection = {
  direction: DirectionKey;
  direction_label: string;
  matches: OperationMatch[];
};

type SessionResponse = {
  ok: boolean;
  bound: boolean;
  staff?: { id: string; full_name: string; role: string };
  context?: {
    period?: { start: string; end: string; label?: string };
  };
  code?: string;
  error?: string;
};

const API_URL =
  "https://vlcxjizieelcfunausll.supabase.co/functions/v1/fleetdesk-telegram-finance";

const ACCOUNTS: Array<{ key: AccountKey; label: string; currency: "AED" | "RUB" }> = [
  { key: "cash_aed", label: "Касса", currency: "AED" },
  { key: "ajman_aed", label: "AJMAN", currency: "AED" },
  { key: "sber_rub", label: "СБЕР", currency: "RUB" },
];

const DIRECTIONS: Array<{ key: DirectionKey; label: string }> = [
  { key: "income", label: "Приход" },
  { key: "expense", label: "Расход" },
];

function loadTelegramSdk(): Promise<TelegramWebApp | null> {
  if (window.Telegram?.WebApp) return Promise.resolve(window.Telegram.WebApp);

  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-fleetdesk-telegram="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Telegram?.WebApp || null), { once: true });
      existing.addEventListener("error", () => resolve(null), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js?63";
    script.async = true;
    script.dataset.fleetdeskTelegram = "1";
    script.onload = () => resolve(window.Telegram?.WebApp || null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

function splitLabel(label: string) {
  const parts = label.split(" · ").map((part) => part.trim()).filter(Boolean);
  return {
    primary: parts[0] || label,
    secondary: parts.slice(1).join(" · "),
  };
}

function formatAmount(value: string, currency: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
  }).format(amount) + " " + currency;
}

function TelegramFinanceApp() {
  const [telegram, setTelegram] = useState<TelegramWebApp | null>(null);
  const [phase, setPhase] = useState<
    "loading" | "outside" | "setup" | "unbound" | "ready" | "error"
  >("loading");
  const [sessionError, setSessionError] = useState("");
  const [staffName, setStaffName] = useState("");

  const [account, setAccount] = useState<AccountKey | "">("");
  const [direction, setDirection] = useState<DirectionKey | "">("");
  const [query, setQuery] = useState("");
  const [operation, setOperation] = useState<OperationMatch | null>(null);
  const [matches, setMatches] = useState<OperationMatch[]>([]);
  const [alternate, setAlternate] = useState<AlternateDirection | null>(null);
  const [searching, setSearching] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess] = useState<{
    article: string;
    amount: number;
    currency: string;
  } | null>(null);
  const requestIdRef = useRef("");

  const selectedAccount = useMemo(
    () => ACCOUNTS.find((item) => item.key === account) || null,
    [account],
  );

  const selectedDirection = useMemo(
    () => DIRECTIONS.find((item) => item.key === direction) || null,
    [direction],
  );

  const api = useCallback(
    async <T,>(payload: Record<string, unknown>): Promise<T> => {
      if (!telegram?.initData) throw new Error("Открой FleetDesk из Telegram.");

      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, initData: telegram.initData }),
      });

      const data = (await response.json().catch(() => null)) as
        | (T & { ok?: boolean; code?: string; error?: string })
        | null;

      if (!response.ok || data?.ok === false) {
        const error = new Error(data?.error || "Не удалось выполнить операцию.") as Error & {
          code?: string;
        };
        error.code = data?.code;
        throw error;
      }

      return data as T;
    },
    [telegram],
  );

  const refreshSession = useCallback(async () => {
    if (!telegram?.initData) {
      setPhase("outside");
      return false;
    }

    try {
      const data = await api<SessionResponse>({ action: "session" });
      if (!data.bound) {
        setPhase("unbound");
        return false;
      }

      setStaffName(data.staff?.full_name || "");
      setPhase("ready");
      return true;
    } catch (error) {
      const typed = error as Error & { code?: string };
      if (typed.code === "telegram_setup_required") {
        setPhase("setup");
        return false;
      }
      setSessionError(typed.message);
      setPhase("error");
      return false;
    }
  }, [api, telegram]);

  useEffect(() => {
    let cancelled = false;

    loadTelegramSdk().then((webApp) => {
      if (cancelled) return;
      if (!webApp?.initData) {
        setPhase("outside");
        return;
      }

      webApp.ready();
      webApp.expand();
      setTelegram(webApp);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!telegram) return;
    void refreshSession();
  }, [telegram, refreshSession]);

  useEffect(() => {
    if (phase !== "ready" || !account || !direction || operation || query.trim().length < 1) {
      setMatches([]);
      setAlternate(null);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            action: "search",
            initData: telegram?.initData,
            account,
            direction,
            query: query.trim(),
          }),
        });
        const data = await response.json().catch(() => null);

        if (!response.ok || data?.ok === false) {
          if (!controller.signal.aborted) {
            setMatches([]);
            setAlternate(null);
            setSubmitError(data?.error || "Не удалось найти операции.");
          }
          return;
        }

        if (!controller.signal.aborted) {
          setMatches(Array.isArray(data?.matches) ? data.matches : []);
          setAlternate(data?.alternate || null);
          setSubmitError("");
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setMatches([]);
          setAlternate(null);
          setSubmitError(error instanceof Error ? error.message : "Не удалось выполнить поиск.");
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [account, direction, operation, phase, query, telegram]);

  const clearOperation = useCallback(() => {
    setOperation(null);
    setQuery("");
    setMatches([]);
    setAlternate(null);
    setSubmitError("");
    requestIdRef.current = "";
  }, []);

  const chooseAccount = (next: AccountKey) => {
    if (next === account) return;
    setAccount(next);
    clearOperation();
    telegram?.HapticFeedback?.impactOccurred?.("light");
  };

  const chooseDirection = (next: DirectionKey) => {
    if (next === direction) return;
    setDirection(next);
    clearOperation();
    telegram?.HapticFeedback?.impactOccurred?.("light");
  };

  const chooseOperation = (match: OperationMatch) => {
    setOperation(match);
    setQuery(match.label);
    setMatches([]);
    setAlternate(null);
    setSubmitError("");
    requestIdRef.current = "";
    telegram?.HapticFeedback?.impactOccurred?.("light");
  };

  const switchToAlternate = () => {
    if (!alternate) return;
    setDirection(alternate.direction);
    setMatches(alternate.matches);
    setAlternate(null);
    setSubmitError("");
    requestIdRef.current = "";
    telegram?.HapticFeedback?.impactOccurred?.("light");
  };

  const canReview =
    Boolean(account) &&
    Boolean(direction) &&
    Boolean(operation) &&
    Number.isFinite(Number(amount)) &&
    Number(amount) > 0;

  const openReview = () => {
    if (!canReview) return;
    setSubmitError("");
    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    setReviewOpen(true);
    telegram?.HapticFeedback?.impactOccurred?.("medium");
  };

  const submit = async () => {
    if (!account || !direction || !operation || !selectedAccount || submitting) return;

    setSubmitting(true);
    setSubmitError("");

    try {
      const data = await api<{
        ok: true;
        status: string;
        duplicate?: boolean;
        result?: { amount?: number; article?: string; currency?: string; status?: string };
      }>({
        action: "record",
        request_id: requestIdRef.current || crypto.randomUUID(),
        account,
        direction,
        article: operation.article,
        row: operation.row,
        amount: Number(amount),
        note: note.trim(),
      });

      if (data.status !== "applied" || !data.result) {
        if (data.status === "failed") requestIdRef.current = "";
        throw new Error(
          (data.result as { error?: string } | undefined)?.error ||
            "Таблица не подтвердила запись.",
        );
      }

      setSuccess({
        article: operation.label,
        amount: Number(data.result.amount ?? amount),
        currency: String(data.result.currency || selectedAccount.currency),
      });
      setReviewOpen(false);
      telegram?.HapticFeedback?.notificationOccurred?.("success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось записать операцию.";
      setSubmitError(message);
      telegram?.HapticFeedback?.notificationOccurred?.("error");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForNext = () => {
    setSuccess(null);
    clearOperation();
    setAmount("");
    setNote("");
    requestIdRef.current = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const requestContact = () => {
    if (!telegram?.requestContact) {
      setSessionError("Обнови Telegram и попробуй снова.");
      return;
    }

    setSessionError("");
    telegram.requestContact(async (shared) => {
      if (!shared) return;

      for (let attempt = 0; attempt < 6; attempt++) {
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        if (await refreshSession()) return;
      }

      setSessionError("Номер отправлен, но привязка ещё не завершилась. Нажми «Проверить».");
    });
  };

  if (phase === "loading") {
    return (
      <main className="tg-finance-shell tg-finance-center">
        <div className="tg-finance-loader" aria-label="Загрузка" />
      </main>
    );
  }

  if (phase === "outside") {
    return (
      <main className="tg-finance-shell tg-finance-center">
        <section className="tg-finance-state">
          <h1>FleetDesk</h1>
          <p>Открой Финансы через Telegram-бот FleetDesk.</p>
        </section>
      </main>
    );
  }

  if (phase === "setup") {
    return (
      <main className="tg-finance-shell tg-finance-center">
        <section className="tg-finance-state">
          <h1>FleetDesk</h1>
          <p>Telegram-бот ещё не подключён к FleetDesk.</p>
        </section>
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="tg-finance-shell tg-finance-center">
        <section className="tg-finance-state">
          <h1>Не удалось открыть Финансы</h1>
          <p>{sessionError}</p>
          <button className="tg-primary-button" type="button" onClick={() => void refreshSession()}>
            Повторить
          </button>
        </section>
      </main>
    );
  }

  if (phase === "unbound") {
    return (
      <main className="tg-finance-shell tg-finance-center">
        <section className="tg-finance-state">
          <div className="tg-eyebrow">FleetDesk</div>
          <h1>Подтверди номер</h1>
          <p>Один раз свяжем Telegram с твоим сотрудником FleetDesk.</p>
          {sessionError ? <div className="tg-inline-error">{sessionError}</div> : null}
          <button className="tg-primary-button" type="button" onClick={requestContact}>
            Подтвердить номер
          </button>
          <button className="tg-secondary-button" type="button" onClick={() => void refreshSession()}>
            Проверить
          </button>
        </section>
      </main>
    );
  }

  if (success) {
    return (
      <main className="tg-finance-shell tg-finance-center">
        <section className="tg-finance-success">
          <div className="tg-success-mark" aria-hidden="true">✓</div>
          <div className="tg-eyebrow">Записано</div>
          <h1>{formatAmount(String(success.amount), success.currency)}</h1>
          <p>{success.article}</p>
          <button className="tg-primary-button" type="button" onClick={resetForNext}>
            Добавить ещё
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="tg-finance-shell">
      <header className="tg-finance-header">
        <div>
          <div className="tg-eyebrow">FleetDesk</div>
          <h1>Финансы</h1>
        </div>
        {staffName ? <div className="tg-staff-name">{staffName}</div> : null}
      </header>

      <section className="tg-form-section">
        <label className="tg-field-label">Счёт</label>
        <div className="tg-segmented tg-segmented-three" role="group" aria-label="Счёт">
          {ACCOUNTS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={account === item.key ? "is-active" : ""}
              onClick={() => chooseAccount(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="tg-form-section">
        <label className="tg-field-label">Тип</label>
        <div className="tg-segmented" role="group" aria-label="Приход или расход">
          {DIRECTIONS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={direction === item.key ? "is-active" : ""}
              onClick={() => chooseDirection(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="tg-form-section tg-operation-section">
        <label className="tg-field-label" htmlFor="tg-operation-search">Операция</label>
        <div className="tg-search-wrap">
          <input
            id="tg-operation-search"
            className="tg-input"
            type="text"
            value={query}
            disabled={!account || !direction}
            autoComplete="off"
            placeholder={
              !account || !direction
                ? "Сначала выбери счёт и тип"
                : "Начни печатать: аренда, ремонт, номер авто…"
            }
            onChange={(event) => {
              setQuery(event.target.value);
              setOperation(null);
              setAlternate(null);
              requestIdRef.current = "";
            }}
          />
          {operation ? (
            <button className="tg-clear-search" type="button" onClick={clearOperation} aria-label="Сменить операцию">
              ×
            </button>
          ) : searching ? (
            <span className="tg-search-spinner" aria-label="Поиск" />
          ) : null}
        </div>

        {!operation && matches.length > 0 ? (
          <div className="tg-search-results" role="listbox" aria-label="Найденные операции">
            {matches.map((match) => {
              const label = splitLabel(match.label);
              return (
                <button
                  key={`${match.row}-${match.article}`}
                  type="button"
                  className="tg-search-result"
                  onClick={() => chooseOperation(match)}
                  role="option"
                >
                  <span>{label.primary}</span>
                  {label.secondary ? <small>{label.secondary}</small> : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {!operation && alternate && matches.length === 0 ? (
          <button className="tg-direction-suggestion" type="button" onClick={switchToAlternate}>
            <span>Есть в «{alternate.direction_label}»</span>
            <strong>{alternate.matches[0]?.label || "Показать"}</strong>
          </button>
        ) : null}

        {!operation && query.trim() && !searching && matches.length === 0 && !alternate && account && direction ? (
          <div className="tg-helper">Ничего не найдено. Уточни запрос.</div>
        ) : null}
      </section>

      <section className="tg-form-section tg-two-fields">
        <div>
          <label className="tg-field-label" htmlFor="tg-amount">Сумма</label>
          <div className="tg-amount-wrap">
            <input
              id="tg-amount"
              className="tg-input tg-amount-input"
              inputMode="decimal"
              type="text"
              value={amount}
              placeholder="0"
              onChange={(event) => {
                const next = event.target.value.replace(",", ".").replace(/[^0-9.]/g, "");
                if ((next.match(/\./g) || []).length <= 1) {
                  setAmount(next);
                  requestIdRef.current = "";
                }
              }}
            />
            <span>{selectedAccount?.currency || "AED"}</span>
          </div>
        </div>
      </section>

      <section className="tg-form-section">
        <label className="tg-field-label" htmlFor="tg-note">Примечание</label>
        <textarea
          id="tg-note"
          className="tg-input tg-note"
          value={note}
          maxLength={500}
          rows={3}
          placeholder="Необязательно"
          onChange={(event) => {
            setNote(event.target.value);
            requestIdRef.current = "";
          }}
        />
      </section>

      {submitError ? <div className="tg-inline-error">{submitError}</div> : null}

      <div className="tg-submit-area">
        <button
          className="tg-primary-button"
          type="button"
          disabled={!canReview}
          onClick={openReview}
        >
          Проверить
        </button>
      </div>

      {reviewOpen && operation && selectedAccount && selectedDirection ? (
        <div className="tg-review-backdrop" role="presentation" onMouseDown={() => !submitting && setReviewOpen(false)}>
          <section
            className="tg-review-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tg-review-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="tg-review-handle" aria-hidden="true" />
            <div className="tg-eyebrow">Проверь перед записью</div>
            <h2 id="tg-review-title">{formatAmount(amount, selectedAccount.currency)}</h2>

            <dl className="tg-review-list">
              <div>
                <dt>Счёт</dt>
                <dd>{selectedAccount.label}</dd>
              </div>
              <div>
                <dt>Тип</dt>
                <dd>{selectedDirection.label}</dd>
              </div>
              <div>
                <dt>Операция</dt>
                <dd>{operation.label}</dd>
              </div>
              {note.trim() ? (
                <div>
                  <dt>Примечание</dt>
                  <dd>{note.trim()}</dd>
                </div>
              ) : null}
            </dl>

            {submitError ? <div className="tg-inline-error">{submitError}</div> : null}

            <button className="tg-primary-button" type="button" disabled={submitting} onClick={() => void submit()}>
              {submitting ? "Записываю…" : "Записать"}
            </button>
            <button
              className="tg-secondary-button"
              type="button"
              disabled={submitting}
              onClick={() => setReviewOpen(false)}
            >
              Назад
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default TelegramFinanceApp;
