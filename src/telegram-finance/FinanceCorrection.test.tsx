import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FinanceCorrection, { correctionOptions, type CorrectableRecord } from "./FinanceCorrection";

const item: CorrectableRecord = { id: "fixture", account: "cash_aed", account_label: "Касса", direction: "expense", article: "Ремонт", amount: 100, currency: "AED", note: "Первоначально", date: "2026-10-15", vehicle: "Toyota", version: 1, can_correct: true, sheet_snapshot: { vehicle: "Toyota" } };
const catalog = [
  { article: "Ремонт", direction: "Расход" as const, rows: { cash_aed: 3 } },
  { article: "Реклама", direction: "Расход" as const, rows: { cash_aed: 4 } },
  { article: "перевод на счет в AJMAN", direction: "Расход" as const, rows: { cash_aed: 5 } },
  { article: "Продажа", direction: "Приход" as const, rows: { cash_aed: 6 } },
];
afterEach(() => { cleanup(); sessionStorage.clear(); });
describe("showroom correction", () => {
  it("restricts categories and reviews old/new values before save", async () => {
    const api = vi.fn().mockResolvedValue({ ok: true, status: "applied" });
    render(<FinanceCorrection item={item} kind="edit" catalog={catalog} api={api} onClose={vi.fn()} />);
    expect(correctionOptions(catalog, item).map(x => x.article)).toEqual(["Ремонт", "Реклама"]);
    fireEvent.change(screen.getByLabelText("Сумма, AED"), { target: { value: "125" } });
    fireEvent.change(screen.getByLabelText("Операция"), { target: { value: "Реклама" } });
    fireEvent.click(screen.getByText("Проверить изменения"));
    expect(screen.getByText("100 AED")).toBeInTheDocument();
    expect(screen.getByText("125 AED")).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Сохранить изменения"));
    await screen.findByText("Изменения сохранены");
    expect(api.mock.calls[0][0]).toMatchObject({ action: "correct_showroom_finance", expected_version: 1, expected_sheet: item.sheet_snapshot, values: { amount: 125, article: "Реклама", row: 4, vehicle: "Toyota" } });
  });
  it("confirms cancellation and prevents simultaneous duplicate sends", async () => {
    let complete!: (value: unknown) => void;
    const api = vi.fn(() => new Promise(resolve => { complete = resolve; }));
    render(<FinanceCorrection item={item} kind="cancel" catalog={catalog} api={api as never} onClose={vi.fn()} />);
    expect(screen.getByText(/Запись об отмене и её автор/)).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
    const button = screen.getByText("Удалить и отменить влияние");
    fireEvent.click(button); fireEvent.click(button);
    expect(api).toHaveBeenCalledTimes(1);
    complete({ ok: true, status: "applied" });
    await screen.findByText("Запись отменена");
  });
  it("preserves the same request and draft after lost response and remount", async () => {
    const api = vi.fn().mockRejectedValueOnce(new Error("Сбой сети")).mockResolvedValue({ ok: true, status: "applied" });
    const props = { item, kind: "edit" as const, catalog, api, onClose: vi.fn() };
    const first = render(<FinanceCorrection {...props} />);
    fireEvent.change(screen.getByLabelText("Сумма, AED"), { target: { value: "250" } });
    fireEvent.click(screen.getByText("Проверить изменения"));
    fireEvent.click(screen.getByText("Сохранить изменения"));
    await screen.findByRole("alert");
    const original = api.mock.calls[0][0];
    first.unmount();
    render(<FinanceCorrection {...props} />);
    expect(screen.getByText("250 AED")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Проверить / повторить синхронизацию"));
    await screen.findByText("Изменения сохранены");
    expect(api.mock.calls[1][0]).toEqual(original);
  });
  it("does not claim success for pending sync and resumes server correction", async () => {
    const api = vi.fn().mockResolvedValue({ ok: true, status: "pending" });
    render(<FinanceCorrection item={{ ...item, pending_correction: { id: "correction-fixture", request_id: "request", kind: "cancel", after_payload: { amount: 0, article: item.article, row: 3, vehicle: "Toyota", note: "" } } }} kind="cancel" catalog={catalog} api={api} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Проверить / повторить синхронизацию"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Синхронизация ещё не завершена"));
    expect(screen.queryByText("Запись отменена")).not.toBeInTheDocument();
    expect(api.mock.calls[0][0]).toEqual({ action: "retry_showroom_correction", ledger: "showroom", correction_id: "correction-fixture" });
  });
  it("allows history reload only after definitive server rejection", async () => {
    const api = vi.fn().mockResolvedValue({ ok: true, status: "rejected", error: "Запись изменилась", correction_rejected: true, applied: false });
    const close = vi.fn();
    render(<FinanceCorrection item={item} kind="cancel" catalog={catalog} api={api} onClose={close} />);
    fireEvent.click(screen.getByText("Удалить и отменить влияние"));
    await screen.findByText("Обновить историю");
    expect(sessionStorage.getItem("finance-correction:fixture")).toBeNull();
    expect(screen.queryByText("Проверить / повторить синхронизацию")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Обновить историю"));
    expect(close).toHaveBeenCalledWith(false);
  });
});
