import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewContract from "./NewContract";

const { supabase } = vi.hoisted(() => {
  const clients = [{
    id: "22222222-2222-4222-8222-222222222222",
    full_name: "Sulima Kateryna",
    license_number: "380970640650",
    license_expiry: "2027-08-02",
  }];
  const cars = [{
    id: "33333333-3333-4333-8333-333333333333",
    plate: "73556",
    make: "Toyota",
    model: "Corolla",
    status: "Available",
    mileage_unit: "km",
  }];
  return {
    supabase: {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "11111111-1111-4111-8111-111111111111" } } })),
      },
      from: vi.fn((table: string) => {
        const result = table === "clients" ? clients : table === "cars" ? cars : [];
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          order: vi.fn(async () => ({ data: result, error: null })),
        };
        return query;
      }),
    },
  };
});

vi.mock("@/lib/supabase", () => ({ supabase }));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/SignContractModal", () => ({ SignContractModal: () => null }));

Object.defineProperty(globalThis, "ResizeObserver", {
  writable: true,
  value: class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  writable: true,
  value: () => {},
});

describe("NewContract searchable dropdowns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finds clients and vehicles by visible details and keeps both lists light", async () => {
    render(
      <MemoryRouter initialEntries={["/contracts/new"]}>
        <NewContract />
      </MemoryRouter>,
    );

    const clientTrigger = await screen.findByRole("button", { name: /select client/i });
    fireEvent.click(clientTrigger);
    const clientSearch = screen.getByPlaceholderText("Search client");
    fireEvent.change(clientSearch, { target: { value: "Suli" } });
    expect(await screen.findByText("Sulima Kateryna")).toBeInTheDocument();
    expect(clientSearch.closest("[cmdk-root]")).toHaveClass("!bg-white", "!text-slate-950");
    fireEvent.click(screen.getByText("Sulima Kateryna"));
    await waitFor(() => expect(clientTrigger).toHaveTextContent("Sulima Kateryna"));

    const carTrigger = screen.getByRole("button", { name: /select available vehicle/i });
    fireEvent.click(carTrigger);
    const carSearch = screen.getByPlaceholderText("Search plate or model");
    fireEvent.change(carSearch, { target: { value: "735" } });
    expect(await screen.findByText(/73556.*Toyota Corolla/)).toBeInTheDocument();
    expect(carSearch.closest("[cmdk-root]")).toHaveClass("!bg-white", "!text-slate-950");
  });

  it("stacks rental dates and times and keeps the total card non-sticky on narrow screens", async () => {
    render(
      <MemoryRouter initialEntries={["/contracts/new"]}>
        <NewContract />
      </MemoryRouter>,
    );

    await screen.findByRole("button", { name: /select client/i });

    const dateGrid = screen.getByText("Start date *").parentElement?.parentElement;
    const timeGrid = screen.getByText("Start time *").parentElement?.parentElement;
    const totalCard = screen.getByText("Contract total").parentElement?.parentElement?.parentElement;

    expect(dateGrid).toHaveClass("grid", "gap-3", "sm:grid-cols-2");
    expect(dateGrid).not.toHaveClass("grid-cols-2");
    expect(timeGrid).toHaveClass("grid", "gap-3", "sm:grid-cols-2");
    expect(timeGrid).not.toHaveClass("grid-cols-2");
    expect(totalCard).toHaveClass("md:sticky", "md:bottom-4", "md:z-10");
    expect(totalCard).not.toHaveClass("sticky", "bottom-20", "z-10");
  });
});
