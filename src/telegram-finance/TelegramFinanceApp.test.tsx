import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TelegramFinanceApp from "./TelegramFinanceApp";

const groups = [
  { article: "комиссия от продажи авто (наши средства 100%)", direction: "Приход", cars: ["b23440", "и46347", "b93453", "santafe", "b23370", "b13188", "b96275", "b62650", "b73364", "b71265", "yaris 2021 abdullah", "xpander abdullah", "ertiga abdullah", "Шевролет абдуллы"] },
  { article: "покупка авто для перепродажи", direction: "Расход", cars: ["yaris 2021 abdullah", "xpander abdullah", "ertiga abdullah", "camry 2017", "Шевролет абдуллы", "Lexus"] },
  { article: "Приход от продажи инвесторских авто", direction: "Приход", cars: ["yaris 2021 abdullah", "xpander abdullah", "ertiga abdullah", "Шевролет абдуллы"] },
  { article: "Приход от продажи собственных авто", direction: "Приход", cars: ["camry 2017", "Lexus"] },
];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete window.Telegram; });

describe("showroom vehicle selection", () => {
  for (const group of groups) it(group.article + ": exact options and separate vehicle payload", async () => {
    window.Telegram = { WebApp: { initData: "local-fixture-only", ready: vi.fn(), expand: vi.fn() } };
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      const payload = JSON.parse(init.body);
      requests.push(payload);
      const data = payload.action === "session" ? {
        ok: true, bound: true, staff: { id: "fixture", full_name: "QA", role: "owner" },
        catalogs: { showroom: groups.map((g, i) => ({ article: g.article, direction: g.direction,
          reference_row: i + 2, rows: { cash_aed: i + 20 }, search_terms: "[[vehicles:" + g.cars.join("|") + "]]" })), rental: [] },
      } : { ok: true, status: "applied", request_id: "fixture", result: {} };
      return { ok: true, json: async () => data };
    }));
    render(<TelegramFinanceApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Автосалон", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Касса", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: group.direction, exact: true }));
    fireEvent.change(screen.getByLabelText("Операция"), { target: { value: group.article } });
    fireEvent.click(await screen.findByRole("option", { name: group.article }));
    const select = screen.getByLabelText("Машина") as HTMLSelectElement;
    expect(Array.from(select.options).map(x => x.value).filter(Boolean)).toEqual(group.cars);
    fireEvent.change(screen.getByLabelText("Сумма"), { target: { value: "12.34" } });
    expect(screen.getByRole("button", { name: "Проверить", exact: true })).toBeDisabled();
    for (const car of group.cars) {
      fireEvent.change(select, { target: { value: car } });
      expect(select.value).toBe(car);
    }
    const car = group.cars.at(-1)!;
    fireEvent.click(screen.getByRole("button", { name: "Проверить", exact: true }));
    expect(requests.some(x => x.action === "record")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Записать", exact: true }));
    await waitFor(() => expect(requests.some(x => x.vehicle === car && x.article === group.article)).toBe(true));
  });
});
