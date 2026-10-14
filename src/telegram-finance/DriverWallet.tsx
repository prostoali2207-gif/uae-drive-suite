import { useCallback, useEffect, useRef, useState } from "react";
import "./driver-wallet.css";

type DriverMovement = {
  id: string;
  kind: "advance" | "expense" | "return" | "reimbursement";
  amount: number;
  status: "pending" | "applied" | "failed";
  sheet_sync_status: "pending" | "synced" | "failed";
  article?: string | null;
  note?: string | null;
  created_at: string;
};
type Wallet = {
  staff_id: string;
  name: string;
  balance: number;
  issued: number;
  spent: number;
  returned: number;
  reimbursed: number;
  pending_sync: number;
  movements: DriverMovement[];
};
type Props = {
  api: <T>(payload: Record<string, unknown>) => Promise<T>;
  onBack: () => void;
  onNewExpense: () => void;
};
const OPTIONS = [
  { value: "advance", label: "Выдать деньги" },
  { value: "return", label: "Принять возврат" },
  { value: "reimbursement", label: "Компенсировать расход" },
] as const;
const LABELS: Record<string, string> = {
  advance: "Выдача", return: "Возврат", reimbursement: "Компенсация", expense: "Расход",
};
function money(value: number) {
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + " AED";
}

export default function DriverWallet({ api, onBack, onNewExpense }: Props) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [selected, setSelected] = useState("");
  const [kind, setKind] = useState<(typeof OPTIONS)[number]["value"]>("advance");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ ok: true; wallets: Wallet[]; can_manage: boolean }>({ action: "wallet" });
      const next = data.wallets || [];
      setWallets(next);
      setCanManage(Boolean(data.can_manage));
      setSelected((old) => next.some((w) => w.staff_id === old) ? old : (next[0]?.staff_id || ""));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить баланс.");
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => { void refresh(); }, [refresh]);
  const wallet = wallets.find((w) => w.staff_id === selected);
  const amountNum = Number(amount.replace(",", "."));
  const valid = Number.isFinite(amountNum) && amountNum > 0 && amountNum <= 1000000;

  const submit = async () => {
    if (!wallet || !valid || saving) return;
    setSaving(true);
    setError("");
    try {
      if (!requestId.current) requestId.current = crypto.randomUUID();
      await api({
        action: "wallet_adjust", driver_staff_id: wallet.staff_id,
        kind, amount: amountNum, note: note.trim(), request_id: requestId.current,
      });
      setAmount("");
      setNote("");
      setConfirm(false);
      requestId.current = "";
      await refresh();
    } catch (e) {
      // Keep request_id for retry; the server and Google Sheet are idempotent.
      setError(e instanceof Error ? e.message : "Не удалось сохранить операцию.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="tg-finance-shell driver-wallet">
      <header className="tg-finance-header">
        <div><div className="tg-eyebrow">Автосалон</div><h1>Водители</h1></div>
        <button className="tg-secondary-button" type="button" onClick={onBack}>Назад</button>
      </header>
      <section className="driver-wallet-body">
        {loading && wallets.length === 0 && <p>Загрузка остатков…</p>}
        {canManage && wallets.length > 1 && (
          <label className="driver-wallet-field">Водитель
            <select className="tg-input" value={selected} onChange={(e) => { setSelected(e.target.value); setConfirm(false); }}>
              {wallets.map((w) => <option key={w.staff_id} value={w.staff_id}>{w.name}</option>)}
            </select>
          </label>
        )}
        {wallet && (
          <>
            <div className="driver-wallet-balance">
              <div className="tg-eyebrow">{wallet.name}</div>
              <strong>{money(wallet.balance)}</strong>
              <p>{wallet.balance < 0 ? "Компания должна водителю" : "У водителя на руках"}</p>
            </div>
            {wallet.pending_sync > 0 && (
              <div className="tg-inline-error">Есть операции без подтверждённой синхронизации с Google Sheets: {wallet.pending_sync}</div>
            )}
            {canManage ? (
              <section className="driver-wallet-panel">
                <h2>Движение денег</h2>
                <label className="driver-wallet-field">Действие
                  <select className="tg-input" value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setConfirm(false); requestId.current = ""; }}>
                    {OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="driver-wallet-field">Сумма, AED
                  <input className="tg-input" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setConfirm(false); requestId.current = ""; }} placeholder="0.00" />
                </label>
                <label className="driver-wallet-field">Примечание (необязательно)
                  <input className="tg-input" maxLength={500} value={note} onChange={(e) => { setNote(e.target.value); setConfirm(false); requestId.current = ""; }} />
                </label>
                {!confirm ? (
                  <button className="tg-primary-button" type="button" disabled={!valid} onClick={() => setConfirm(true)}>Продолжить</button>
                ) : (
                  <div className="driver-wallet-confirm">
                    <p><strong>{OPTIONS.find((o) => o.value === kind)?.label}: {money(amountNum)}</strong> — {wallet.name}</p>
                    <p>Основная Касса не меняется. Запись появится в листе «Водители».</p>
                    <button className="tg-primary-button" disabled={saving} onClick={() => void submit()}>{saving ? "Записываю…" : "Подтвердить"}</button>
                    <button className="tg-secondary-button" disabled={saving} onClick={() => setConfirm(false)}>Назад</button>
                  </div>
                )}
              </section>
            ) : (
              <button className="tg-primary-button" type="button" onClick={onNewExpense}>Добавить расход</button>
            )}
            <section className="driver-wallet-panel">
              <div className="driver-wallet-history-header"><h2>История</h2><button type="button" onClick={() => void refresh()}>Обновить</button></div>
              {wallet.movements.length === 0 ? <p>Операций пока нет.</p> : (
                <ul className="driver-wallet-list">
                  {wallet.movements.map((e) => (
                    <li key={e.id}>
                      <div><strong>{LABELS[e.kind] || e.kind}</strong><small>{new Date(e.created_at).toLocaleDateString("ru-RU")}{e.article ? " · " + e.article : ""}</small></div>
                      <div className="driver-wallet-amount">{e.kind === "advance" || e.kind === "reimbursement" ? "+" : "−"}{money(e.amount)}
                        {e.status !== "applied" || e.sheet_sync_status !== "synced" ? <small>Проверить синхронизацию</small> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
        {error && <div className="tg-inline-error" role="alert">{error}</div>}
      </section>
    </main>
  );
}
