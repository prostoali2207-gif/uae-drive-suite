import { useEffect, useRef, useState } from "react";
import "./finance-correction.css";

export type CorrectionValues = { amount: number; article: string; row: number; vehicle: string; note: string };
export type CorrectableRecord = {
  id: string; account: string; account_label: string; direction: "income" | "expense";
  article: string; amount: number; currency: string; note: string; date: string;
  version?: number; vehicle?: string; cancelled?: boolean; can_correct?: boolean;
  correction_block_reason?: string; correction_actor_name?: string; corrected_at?: string;
  sheet_snapshot?: Record<string, unknown>;
  pending_correction?: { id: string; request_id: string; kind: "edit" | "cancel"; after_payload: CorrectionValues };
};
type Catalog = { article: string; direction: "Приход" | "Расход"; rows: Partial<Record<string, number | null>> };
type Api = <T>(payload: Record<string, unknown>) => Promise<T>;
const transfer = /перевод|перечислен.*(?:касс|ajman)|приход из кассы|приход со счета AJMAN/i;
type SavedRequest = Record<string, unknown> & { kind: "edit" | "cancel"; values?: CorrectionValues };
function readSaved(id: string): SavedRequest | null {
  try { return JSON.parse(sessionStorage.getItem(`finance-correction:${id}`) || "null") as SavedRequest | null; }
  catch { return null; }
}
export function correctionOptions(catalog: Catalog[], item: CorrectableRecord) {
  return catalog.filter(option => option.direction === (item.direction === "expense" ? "Расход" : "Приход") &&
    Number(option.rows[item.account]) > 0 && !transfer.test(option.article));
}

export default function FinanceCorrection({ item, kind, catalog, api, onClose }: {
  item: CorrectableRecord; kind: "edit" | "cancel"; catalog: Catalog[]; api: Api;
  onClose: (applied: boolean) => void;
}) {
  const pending = item.pending_correction;
  const [saved] = useState(() => readSaved(item.id));
  kind = pending?.kind || saved?.kind || kind;
  const initial = pending?.after_payload || saved?.values;
  const options = correctionOptions(catalog, item);
  const [amount, setAmount] = useState(String(initial?.amount ?? item.amount));
  const [article, setArticle] = useState(initial?.article ?? item.article);
  const [vehicle, setVehicle] = useState(initial?.vehicle ?? item.vehicle ?? "");
  const [note, setNote] = useState(initial?.note ?? item.note);
  const [review, setReview] = useState(kind === "cancel" || Boolean(pending || saved));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(Boolean(pending || saved));
  const [applied, setApplied] = useState(false);
  const [rejected, setRejected] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [review, applied]);
  const lock = useRef(false);
  const payload = useRef<Record<string, unknown> | null>(pending ? null : saved);
  const operation = options.find(option => option.article === article);
  const values: CorrectionValues = { amount: Number(amount.replace(",", ".")), article,
    row: Number(operation?.rows[item.account]), vehicle: vehicle.trim(), note: note.trim() };
  const valid = Number.isFinite(values.amount) && values.amount > 0 && /^\d+(?:[.,]\d{1,2})?$/.test(amount) && Boolean(operation);
  const changed = values.amount !== item.amount || article !== item.article || values.vehicle !== (item.vehicle || "") || values.note !== item.note;

  async function save() {
    if (lock.current || applied || (!pending && !item.can_correct)) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setRejected(false);
    if (!payload.current) payload.current = pending
      ? { action: "retry_showroom_correction", ledger: "showroom", correction_id: pending.id }
      : { action: "correct_showroom_finance", ledger: "showroom", audit_id: item.id,
        request_id: crypto.randomUUID(), expected_version: item.version ?? 0, expected_sheet: item.sheet_snapshot, kind,
        ...(kind === "edit" ? { values } : {}) };
    try { if (!pending) sessionStorage.setItem(`finance-correction:${item.id}`, JSON.stringify(payload.current)); } catch { /* In-memory retry remains available. */ }
    // Once sent, the request and draft stay frozen even if the response is lost.
    setUncertain(true);
    try {
      const result = await api<{ ok: boolean; status: "applied" | "pending" | "rejected"; correction_rejected?: boolean; error?: string }>(payload.current);
      if (result.correction_rejected === true) throw Object.assign(new Error(result.error || "Сервер отклонил изменение."), { correction_rejected: true });
      if (result.ok && result.status === "applied") {
        setApplied(true);
        try { sessionStorage.removeItem(`finance-correction:${item.id}`); } catch { /* No persistent storage. */ }
      }
      else setError(result.error || "Синхронизация ещё не завершена. Повтори проверку тем же запросом.");
    } catch (failure) {
      const definitelyRejected = failure instanceof Error && (failure as Error & { correction_rejected?: boolean }).correction_rejected === true;
      if (definitelyRejected) {
        setRejected(true);
        setUncertain(false);
        payload.current = null;
        try { sessionStorage.removeItem(`finance-correction:${item.id}`); } catch { /* No persistent storage. */ }
        setError(failure.message + " Изменения не применены. Обнови запись в истории перед новой попыткой.");
      } else setError((failure instanceof Error ? failure.message : "Ответ сервера не получен.") + " Повторная проверка не создаст новую операцию.");
    } finally { lock.current = false; setBusy(false); }
  }

  return <main className="tg-finance-shell tg-correction-shell"><section className="tg-correction" aria-labelledby="correction-title">
    <div className="tg-eyebrow">Автосалон · История</div>
    <h1 id="correction-title" ref={heading} tabIndex={-1}>{applied ? (kind === "cancel" ? "Запись отменена" : "Изменения сохранены") : kind === "cancel" ? "Удалить запись?" : review ? "Проверь изменения" : "Редактировать запись"}</h1>
    <p className="tg-helper">{item.account_label} · {item.date} · {item.direction === "expense" ? "Расход" : "Приход"}</p>
    {applied ? <><p role="status">Синхронизация завершена. Финансовое влияние обновлено, история изменений сохранена.</p>
      <button className="tg-primary-button" onClick={() => onClose(true)}>К истории</button></> : <>
      {kind === "cancel" && <p>Операция «{item.article}» на <bdi>{item.amount} {item.currency}</bdi> перестанет влиять на остатки, месячный отчёт и связанные расчёты водителя и автомобиля. Запись об отмене и её автор останутся в истории.</p>}
      {kind === "edit" && !review ? <form onSubmit={event => { event.preventDefault(); if (valid && changed) setReview(true); }}>
        <label className="tg-field-label" htmlFor="correction-amount">Сумма, {item.currency}</label>
        <input id="correction-amount" className="tg-input" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} />
        <label className="tg-field-label" htmlFor="correction-operation">Операция</label>
        <select id="correction-operation" className="tg-input" value={article} onChange={event => setArticle(event.target.value)}>
          {!operation && <option value={article}>{article} — недоступна</option>}
          {options.map(option => <option key={option.article} value={option.article}>{option.article}</option>)}
        </select>
        <p className="tg-helper">Доступны операции того же типа и счёта. Переводы изменяются только парой и здесь недоступны.</p>
        <label className="tg-field-label" htmlFor="correction-vehicle">Авто / объект</label>
        <input id="correction-vehicle" className="tg-input" maxLength={160} value={vehicle} onChange={event => setVehicle(event.target.value)} />
        <label className="tg-field-label" htmlFor="correction-note">Примечание</label>
        <textarea id="correction-note" className="tg-input" rows={3} maxLength={500} value={note} onChange={event => setNote(event.target.value)} />
        {!valid && <p className="tg-helper">Укажи сумму больше нуля (до двух знаков после запятой) и доступную операцию.</p>}
        <button className="tg-primary-button" disabled={!valid || !changed}>Проверить изменения</button>
      </form> : kind === "edit" ? <><div className="tg-correction-review">
        {[["Сумма", `${item.amount} ${item.currency}`, `${values.amount} ${item.currency}`], ["Операция", item.article, article],
          ["Авто / объект", item.vehicle || "—", vehicle || "—"], ["Примечание", item.note || "—", note || "—"]].map(([label, before, after]) =>
          <div key={label}><strong>{label}</strong><span><small>Было</small><bdi>{before}</bdi></span><span><small>Станет</small><bdi>{after}</bdi></span></div>)}
      </div><p className="tg-helper">Остатки, месячный отчёт и связанные расчёты водителя и автомобиля будут пересчитаны. Дата и счёт сохраняются.</p></> : null}
      {error && <div className="tg-inline-error" role="alert">{error}</div>}
      {uncertain && <p className="tg-helper" role="status">Запрос отправлен. Результат пока не подтверждён; новые изменения заблокированы до завершения синхронизации.</p>}
      {review && !rejected && <button type="button" className="tg-primary-button" disabled={busy} onClick={() => void save()}>{busy ? "Синхронизация…" : uncertain ? "Проверить / повторить синхронизацию" : kind === "cancel" ? "Удалить и отменить влияние" : "Сохранить изменения"}</button>}
      {review && kind === "edit" && !uncertain && !rejected && <button type="button" className="tg-secondary-button" onClick={() => setReview(false)}>Назад к редактированию</button>}
      <button type="button" className="tg-secondary-button" disabled={busy} onClick={() => onClose(false)}>{rejected ? "Обновить историю" : uncertain ? "К истории — запрос сохранён" : "Отмена"}</button>
    </>}
  </section></main>;
}
