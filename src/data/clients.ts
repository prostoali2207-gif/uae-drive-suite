export interface ClientRecord {
  id: string;
  name: string;
  phone: string;
  emiratesId: string;
  nationality: string;
  email?: string;
  licenseNumber: string;
  licenseExpiry: string; // ISO date
  passportNumber: string;
}

export interface ClientContract {
  id: string;
  number: string;
  clientId: string;
  carPlate: string;
  carModel: string;
  startDate: string;
  endDate: string;
  totalAmount: number;
  paidAmount: number;
  status: "Active" | "Expiring Soon" | "Overdue" | "Completed";
}

export const initialClients: ClientRecord[] = [
  {
    id: "c1",
    name: "Ahmed Al Mansoori",
    phone: "+971 50 123 4567",
    emiratesId: "784-1985-1234567-1",
    nationality: "UAE",
    email: "ahmed.m@example.ae",
    licenseNumber: "DXB-2231908",
    licenseExpiry: "2027-08-12",
    passportNumber: "A12345678",
  },
  {
    id: "c2",
    name: "Sara Hassan",
    phone: "+971 55 998 1122",
    emiratesId: "784-1990-7654321-2",
    nationality: "Egypt",
    email: "sara.h@example.com",
    licenseNumber: "DXB-1180223",
    licenseExpiry: "2026-05-30",
    passportNumber: "E55512233",
  },
  {
    id: "c3",
    name: "Layla Ibrahim",
    phone: "+971 52 444 7788",
    emiratesId: "784-1992-2233445-3",
    nationality: "Lebanon",
    licenseNumber: "AUH-9981002",
    licenseExpiry: "2025-11-04",
    passportNumber: "LB9912233",
  },
  {
    id: "c4",
    name: "Omar Saeed",
    phone: "+971 56 332 1009",
    emiratesId: "784-1988-9988776-4",
    nationality: "Jordan",
    email: "omar.s@example.com",
    licenseNumber: "DXB-7720144",
    licenseExpiry: "2026-02-18",
    passportNumber: "J88123456",
  },
  {
    id: "c5",
    name: "Fatima Al Zaabi",
    phone: "+971 50 776 5544",
    emiratesId: "784-1995-1122334-5",
    nationality: "UAE",
    licenseNumber: "AUH-3320918",
    licenseExpiry: "2028-01-22",
    passportNumber: "A98765432",
  },
  {
    id: "c6",
    name: "Khalid Rahman",
    phone: "+971 54 221 8870",
    emiratesId: "784-1986-5544332-6",
    nationality: "Pakistan",
    email: "khalid.r@example.com",
    licenseNumber: "SHJ-5510028",
    licenseExpiry: "2025-09-15",
    passportNumber: "PK77123456",
  },
];

export const initialClientContracts: ClientContract[] = [
  { id: "1", number: "CT-1042", clientId: "c1", carPlate: "DXB A 12345", carModel: "Toyota Corolla", startDate: "2026-03-15", endDate: "2026-04-22", totalAmount: 4560, paidAmount: 4560, status: "Active" },
  { id: "1b", number: "CT-1010", clientId: "c1", carPlate: "DXB K 09812", carModel: "Toyota Yaris", startDate: "2025-11-01", endDate: "2025-12-01", totalAmount: 3000, paidAmount: 3000, status: "Completed" },
  { id: "2", number: "CT-1041", clientId: "c2", carPlate: "DXB F 87231", carModel: "Nissan Sunny", startDate: "2026-04-01", endDate: "2026-04-25", totalAmount: 2280, paidAmount: 1000, status: "Active" },
  { id: "3", number: "CT-1040", clientId: "c3", carPlate: "DXB N 55891", carModel: "Kia Pegas", startDate: "2026-04-05", endDate: "2026-05-10", totalAmount: 3850, paidAmount: 3850, status: "Active" },
  { id: "4", number: "CT-1039", clientId: "c4", carPlate: "DXB Q 71234", carModel: "Chevrolet Spark", startDate: "2026-03-20", endDate: "2026-04-15", totalAmount: 2080, paidAmount: 0, status: "Overdue" },
  { id: "5", number: "CT-1038", clientId: "c5", carPlate: "AUH B 44120", carModel: "Hyundai Elantra", startDate: "2026-02-10", endDate: "2026-03-12", totalAmount: 4030, paidAmount: 4030, status: "Completed" },
  { id: "6", number: "CT-1037", clientId: "c6", carPlate: "SHJ 1 22019", carModel: "Mitsubishi Attrage", startDate: "2026-04-10", endDate: "2026-04-30", totalAmount: 1700, paidAmount: 800, status: "Active" },
];

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
