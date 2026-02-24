// lib/miningMock.ts

export type MiningPlan = {
  id: string;
  name: string;
  cycleDays: number;
  min: number;
  max: number; // large number = "unlimited"
  dailyRate: number; // e.g. 0.043 = 4.3%
  abortFee: number; // e.g. 0.05 = 5%
};

export const MINING_PLANS: MiningPlan[] = [
  {
    id: "m1",
    name: "AI Strategic Vault Prime",
    cycleDays: 120,
    min: 200_000,
    max: 99_999_999,
    dailyRate: 0.043,
    abortFee: 0.05,
  },
  {
    id: "m2",
    name: "AI Momentum Vault Pro",
    cycleDays: 60,
    min: 80_000,
    max: 99_999_999,
    dailyRate: 0.031,
    abortFee: 0.05,
  },
  {
    id: "m3",
    name: "AI Quant Core Vault",
    cycleDays: 30,
    min: 50_000,
    max: 99_999_999,
    dailyRate: 0.028,
    abortFee: 0.05,
  },
  {
    id: "m4",
    name: "AI Dynamic Yield Vault",
    cycleDays: 10,
    min: 10_000,
    max: 999_999,
    dailyRate: 0.02,
    abortFee: 0.05,
  },
  {
    id: "m5",
    name: "AI Smart Start Vault",
    cycleDays: 5,
    min: 500,
    max: 999_999,
    dailyRate: 0.015,
    abortFee: 0.05,
  },
];
