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

type LedgerKey = "rental" | "showroom";
type AccountKey = "cash_aed" | "ajman_aed" | "sber_rub";
type DirectionKey = "income" | "expense";
type FinanceView = "entry" | "history";

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

type CatalogItem = {
  reference_row: number;
  article: string;
  direction: "Приход" | "Расход";
  search_terms?: string;
  rows: Partial<Record<AccountKey, number | null>>;
};

type HistoryItem = {
  id: string;
  ledger: LedgerKey;
  account: AccountKey | string;
  account_label: string;
  direction: DirectionKey;
  article: string;
  label: string;
  amount: number;
  currency: string;
  note: string;
  date: string;
  created_at: string;
  actor_name: string;
};

type SessionResponse = {
  ok: boolean;
  bound: boolean;
  staff?: { id: string; full_name: string; role: string };
  catalog?: CatalogItem[];
  catalogs?: {
    rental?: CatalogItem[];
    showroom?: CatalogItem[];
  };
  code?: string;
  error?: string;
};

const API_URL =
  "https://vlcxjizieelcfunausll.supabase.co/functions/v1/fleetdesk-telegram-finance";

const LEDGERS: Array<{ key: LedgerKey; label: string }> = [
  { key: "rental", label: "Прокат" },
  { key: "showroom", label: "Автосалон" },
];

const RENTAL_ACCOUNTS: Array<{ key: AccountKey; label: string; currency: "AED" | "RUB" }> = [
  { key: "cash_aed", label: "Касса", currency: "AED" },
  { key: "ajman_aed", label: "AJMAN", currency: "AED" },
  { key: "sber_rub", label: "СБЕР", currency: "RUB" },
];

const SHOWROOM_ACCOUNTS: Array<{ key: AccountKey; label: string; currency: "AED" | "RUB" }> = [
  { key: "cash_aed", label: "Касса", currency: "AED" },
  { key: "ajman_aed", label: "AJMAN", currency: "AED" },
];

const DIRECTIONS: Array<{ key: DirectionKey; label: string }> = [
  { key: "income", label: "Приход" },
  { key: "expense", label: "Расход" },
];

const SHOWROOM_VEHICLE_PURCHASE_ARTICLE = "покупка авто для перепродажи";
const VEHICLE_OPTIONS_PATTERN = /\[\[vehicles:([^\]]*)\]\]/i;

function catalogSearchTerms(value: string | undefined) {
  return String(value || "").replace(VEHICLE_OPTIONS_PATTERN, " ").trim();
}

function vehicleOptionsFromCatalog(catalog: CatalogItem[]) {
  const item = catalog.find((candidate) => candidate.article === SHOWROOM_VEHICLE_PURCHASE_ARTICLE);
  const match = String(item?.search_terms || "").match(VEHICLE_OPTIONS_PATTERN);
  if (!match?.[1]) return [];

  return Array.from(
    new Set(
      match[1]
        .split("|")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

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

function formatHistoryTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= b.length; j++) previous[j] = current[j];
  }

  return previous[b.length];
}

function tokenMatchesQuery(token: string, haystackTokens: string[]) {
  return haystackTokens.some((candidate) => {
    if (candidate.includes(token) || token.includes(candidate)) return true;
    if (token.length < 4 || candidate.length < 4) return false;

    const maxDistance = Math.max(token.length, candidate.length) >= 8 ? 2 : 1;
    return editDistance(token, candidate) <= maxDistance;
  });
}

function searchCatalog(
  catalog: CatalogItem[],
  account: AccountKey,
  directionLabel: "Приход" | "Расход",
  query: string,
  limit: number,
): OperationMatch[] {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return [];

  const tokens = normalizedQuery.split(" ").filter(Boolean);

  return catalog
    .filter((item) => item.direction === directionLabel && Number(item.rows?.[account]) > 0)
    .map((item) => {
      const haystack = normalizeSearch(`${item.article} ${catalogSearchTerms(item.search_terms)}`);
      const haystackTokens = haystack.split(" ").filter(Boolean);
      const matchedTokens = tokens.filter((token) => tokenMatchesQuery(token, haystackTokens)).length;
      const fullMatch = haystack.includes(normalizedQuery);
      return {
        item,
        score: fullMatch ? 100 + tokens.length : matchedTokens,
      };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.reference_row - b.item.reference_row)
    .slice(0, limit)
    .map(({ item }) => ({
      row: Number(item.rows?.[account]),
      article: item.article,
      label: item.article.replace(new RegExp("^" + directionLabel + "\\s*·\\s*", "i"), ""),
    }));
}

function TelegramFinanceApp() {
  const [telegram, setTelegram] = useState<TelegramWebApp | null>(null);
  const [phase, setPhase] = useState<
    "loading" | "outside" | "setup" | "unbound" | "ready" | "error"
  >("loading");
  const [sessionError, setSessionError] = useState("");
  const [staffName, setStaffName] = useState("");
  const [catalogs, setCatalogs] = useState<Record<LedgerKey, CatalogItem[]>>({
    rental: [],
    showroom: [],
  });

  const [view, setView] = useState<FinanceView>("entry");
  const [ledger, setLedger] = useState<LedgerKey>("rental");
  const [historyLedger, setHistoryLedger] = useState<LedgerKey>("rental");
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
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
    requestId: string;
    status: "received" | "applied" | "failed";
    error?: string;
    ledger: LedgerKey;
  } | null>(null);
  const requestIdRef = useRef("");

  const activeAccounts = useMemo(
    () => (ledger === "showroom" ? SHOWROOM_ACCOUNTS : RENTAL_ACCOUNTS),
    [ledger],
  );

  const catalog = catalogs[ledger];

  const selectedAccount = useMemo(
    () => activeAccounts.find((item) => item.key === account) || null,
    [account, activeAccounts],
  );

  const selectedDirection = useMemo(
    () => DIRECTIONS.find((item) => item.key === direction) || null,
    [direction],
  );

  const isVehiclePurchaseOperation =
    ledger === "showroom" && operation?.article === SHOWROOM_VEHICLE_PURCHASE_ARTICLE;

  const vehicleOptions = useMemo(
    () => vehicleOptionsFromCatalog(catalog),
    [catalog],
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
      setCatalogs({
        rental: Array.isArray(data.catalogs?.rental)
          ? data.catalogs!.rental!
          : Array.isArray(data.catalog)
            ? data.catalog
            : [],
        showroom: Array.isArray(data.catalogs?.showroom) ? data.catalogs!.showroom! : [],
      });
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
    if (phase !== "ready" || view !== "history") return;

    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError("");

    void api<{ ok: true; items: HistoryItem[] }>({
      action: "history",
      ledger: historyLedger,
      limit: 80,
    })
      .then((data) => {
        if (cancelled) return;
        setHistoryItems(Array.isArray(data.items) ? data.items : []);
      })
      .catch((error) => {
        if (cancelled) return;
        setHistoryItems([]);
        setHistoryError(error instanceof Error ? error.message : "Не удалось загрузить историю.");
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [api, historyLedger, phase, view]);

  useEffect(() => {
    if (phase !== "ready" || !account || !direction || operation || query.trim().length < 1) {
      setMatches([]);
      setAlternate(null);
      setSearching(false);
      return;
    }

    const directionLabel = direction === "income" ? "Приход" : "Расход";
    const localMatches = searchCatalog(catalog, account, directionLabel, query, 12);
    setMatches(localMatches);
    setSearching(false);
    setSubmitError("");

    if (localMatches.length > 0) {
      setAlternate(null);
      return;
    }

    const alternateDirection: DirectionKey = direction === "income" ? "expense" : "income";
    const alternateLabel = alternateDirection === "income" ? "Приход" : "Расход";
    const alternateMatches = searchCatalog(catalog, account, alternateLabel, query, 5);

    setAlternate(
      alternateMatches.length > 0
        ? {
            direction: alternateDirection,
            direction_label: alternateLabel,
            matches: alternateMatches,
          }
        : null,
    );
  }, [account, catalog, direction, operation, phase, query]);

  useEffect(() => {
    if (!success || success.status !== "received") return;

    let cancelled = false;
    let timer = 0;

    const poll = async () => {
      try {
        const data = await api<{
          ok: true;
          status: "received" | "applied" | "failed";
          result?: {
            amount?: number;
            article?: string;
            currency?: string;
            error?: string;
          } | null;
        }>({
          action: "status",
          ledger: success.ledger,
          request_id: success.requestId,
        });

        if (cancelled) return;

        if (data.status === "applied") {
          setSuccess((current) =>
            current
              ? {
                  ...current,
                  status: "applied",
                  amount: Number(data.result?.amount ?? current.amount),
                  currency: String(data.result?.currency || current.currency),
                  error: undefined,
                }
              : current,
          );
          telegram?.HapticFeedback?.notificationOccurred?.("success");
          return;
        }

        if (data.status === "failed") {
          setSuccess((current) =>
            current
              ? {
                  ...current,
                  status: "failed",
                  error: data.result?.error || "Не удалось синхронизировать запись.",
                }
              : current,
          );
          telegram?.HapticFeedback?.notificationOccurred?.("error");
          return;
        }
      } catch {
        // Keep polling: the write itself continues on the server.
      }

      timer = window.setTimeout(poll, 900);
    };

    timer = window.setTimeout(poll, 650);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [api, success?.requestId, success?.status, telegram]);

  const clearOperation = useCallback(() => {
    setOperation(null);
    setQuery("");
    setMatches([]);
    setAlternate(null);
    setNote("");
    setSubmitError("");
    requestIdRef.current = "";
  }, []);

  const chooseLedger = (next: LedgerKey) => {
    if (next === ledger) return;
    setLedger(next);
    setAccount("");
    setDirection("");
    clearOperation();
    setAmount("");
    setNote("");
    setReviewOpen(false);
    setSubmitError("");
    requestIdRef.current = "";
    telegram?.HapticFeedback?.impactOccurred?.("light");
  };

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
    setNote("");
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
    (!isVehiclePurchaseOperation || Boolean(note.trim())) &&
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
    if (isVehiclePurchaseOperation && !note.trim()) {
      setSubmitError("Выбери машину.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    const activeRequestId = requestIdRef.current || crypto.randomUUID();
    requestIdRef.current = activeRequestId;

    try {
      const data = await api<{
        ok: true;
        status: "received" | "applied" | "failed";
        duplicate?: boolean;
        request_id?: string;
        result?: {
          amount?: number;
          article?: string;
          currency?: string;
          status?: string;
          error?: string;
        } | null;
      }>({
        action: "record",
        ledger,
        request_id: activeRequestId,
        account,
        direction,
        article: operation.article,
        row: operation.row,
        amount: Number(amount),
        note: note.trim(),
      });

      if (data.status === "failed") {
        throw new Error(data.result?.error || "Не удалось синхронизировать запись.");
      }

      setSuccess({
        article: operation.label,
        amount: Number(data.result?.amount ?? amount),
        currency: String(data.result?.currency || selectedAccount.currency),
        requestId: data.request_id || activeRequestId,
        status: data.status,
        ledger,
      });
      setReviewOpen(false);

      if (data.status === "applied") {
        telegram?.HapticFeedback?.notificationOccurred?.("success");
      } else {
        telegram?.HapticFeedback?.impactOccurred?.("light");
      }
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
    const isPending = success.status === "received";
    const isFailed = success.status === "failed";

    return (
      <main className="tg-finance-shell tg-finance-center">
        <section className="tg-finance-success">
          <div
            className={`tg-success-mark${isPending ? " is-pending" : ""}${isFailed ? " is-failed" : ""}`}
            aria-hidden="true"
          >
            {isFailed ? "!" : "✓"}
          </div>
          <div className="tg-eyebrow">
            {isFailed ? "Не синхронизировано" : isPending ? "Принято" : "Записано"}
          </div>
          <h1>{formatAmount(String(success.amount), success.currency)}</h1>
          <p>{success.article}</p>

          {isPending ? (
            <div className="tg-sync-state">Синхронизация с Google Sheet идёт в фоне…</div>
          ) : null}

          {isFailed ? (
            <>
              <div className="tg-inline-error">
                {success.error || "Не удалось синхронизировать запись."}
              </div>
              <button
                className="tg-primary-button"
                type="button"
                onClick={() => {
                  setSuccess(null);
                  setReviewOpen(true);
                }}
              >
                Повторить
              </button>
            </>
          ) : (
            <button className="tg-primary-button" type="button" onClick={resetForNext}>
              Добавить ещё
            </button>
          )}
        </section>
      </main>
    );
  }

  if (view === "history") {
    return (
      <main className="tg-finance-shell">
        <header className="tg-finance-header">
          <div>
            <div className="tg-eyebrow">FleetDesk</div>
            <h1>История</h1>
          </div>
          <button
            className="tg-header-icon-button"
            type="button"
            aria-label="Вернуться к внесению"
            onClick={() => setView("entry")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </header>

        <section className="tg-history-toolbar">
          <label className="tg-history-ledger-label" htmlFor="tg-history-ledger">Учёт</label>
          <select
            id="tg-history-ledger"
            className="tg-history-ledger-select"
            value={historyLedger}
            onChange={(event) => setHistoryLedger(event.target.value as LedgerKey)}
          >
            {LEDGERS.map((item) => (
              <option key={item.key} value={item.key}>{item.label}</option>
            ))}
          </select>
        </section>

        <section className="tg-history-section">
          {historyLoading ? (
            <div className="tg-history-loading">
              <span className="tg-finance-loader" aria-label="Загрузка истории" />
            </div>
          ) : historyError ? (
            <div className="tg-inline-error">{historyError}</div>
          ) : historyItems.length === 0 ? (
            <div className="tg-history-empty">Пока нет записей.</div>
          ) : (
            <div className="tg-history-list">
              {historyItems.map((item) => (
                <article key={item.id} className={`tg-history-item is-${item.direction}`}>
                  <div className="tg-history-copy">
                    <div className="tg-history-title">{item.label || item.article}</div>
                    {item.note ? <div className="tg-history-note">{item.note}</div> : null}
                    <div className="tg-history-meta">
                      {item.account_label}
                      {item.created_at ? ` · ${formatHistoryTime(item.created_at)}` : ""}
                      {item.actor_name ? ` · ${item.actor_name}` : ""}
                    </div>
                  </div>
                  <div className={`tg-history-amount is-${item.direction}`}>
                    {item.direction === "expense" ? "−" : "+"}
                    {formatAmount(String(item.amount), item.currency)}
                  </div>
                </article>
              ))}
            </div>
          )}
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
        <div className="tg-header-actions">
          {staffName ? <div className="tg-staff-name">{staffName}</div> : null}
          <button
            className="tg-header-icon-button"
            type="button"
            aria-label="Открыть историю"
            onClick={() => {
              setHistoryLedger(ledger);
              setView("history");
              telegram?.HapticFeedback?.impactOccurred?.("light");
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <path d="M3 4v5h5" />
              <path d="M12 7v5l3 2" />
            </svg>
          </button>
        </div>
      </header>

      <section className="tg-form-section">
        <label className="tg-field-label">Учёт</label>
        <div className="tg-segmented" role="group" aria-label="Раздел финансов">
          {LEDGERS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={ledger === item.key ? "is-active" : ""}
              onClick={() => chooseLedger(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="tg-form-section">
        <label className="tg-field-label">Счёт</label>
        <div
          className={ledger === "showroom" ? "tg-segmented" : "tg-segmented tg-segmented-three"}
          role="group"
          aria-label="Счёт"
        >
          {activeAccounts.map((item) => (
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
                : ledger === "showroom"
                  ? "Начни печатать: продажа, регистрация, реклама…"
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
        {isVehiclePurchaseOperation ? (
          <>
            <label className="tg-field-label" htmlFor="tg-vehicle-note">Машина</label>
            <select
              id="tg-vehicle-note"
              className="tg-input tg-vehicle-select"
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                requestIdRef.current = "";
              }}
            >
              <option value="">Выбери машину</option>
              {vehicleOptions.map((vehicle) => (
                <option key={vehicle} value={vehicle}>{vehicle}</option>
              ))}
            </select>
            {vehicleOptions.length === 0 ? (
              <div className="tg-helper">Список машин пока пуст.</div>
            ) : null}
          </>
        ) : (
          <>
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
          </>
        )}
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
                <dt>Раздел</dt>
                <dd>{ledger === "showroom" ? "Автосалон" : "Прокат"}</dd>
              </div>
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
                  <dt>{isVehiclePurchaseOperation ? "Машина" : "Примечание"}</dt>
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
