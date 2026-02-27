"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import MiningPendingTable from "../components/MiningPendingTable";
import WithdrawRequestsPanel from "../components/WithdrawRequestsPanel";
import NotifyPanel from "../components/NotifyPanel";
import SupportChatPanel from "../components/SupportChatPanel";

type Asset = "USDT" | "BTC" | "ETH" | "SOL" | "XRP";
type TopupMode = "ADD" | "SUBTRACT";
type TradePermissionMode = "BUY_ALL_WIN" | "SELL_ALL_WIN" | "RANDOM_WIN_LOSS" | "ALL_LOSS";
const ASSETS: Asset[] = ["USDT", "BTC", "ETH", "SOL", "XRP"];

type UserRow = {
  id: string;
  username?: string | null;
  email?: string | null;
  phone?: string | null;
  managed_by?: string | null;
  managed_by_username?: string | null;
  balance?: number | null;
  usdt?: number | null;
  btc?: number | null;
  eth?: number | null;
  sol?: number | null;
  xrp?: number | null;
  created_at?: string | null;
  trade_restricted?: boolean | null;
  mining_restricted?: boolean | null;
  restricted?: boolean | null;
};

type UsersResponse = {
  users?: UserRow[];
  error?: string;
};

type TopupResponse = {
  ok?: boolean;
  error?: string;
  asset?: Asset;
  mode?: TopupMode;
  newUsdtBalance?: number | null;
};

type AddressMap = Record<Asset, string>;

type DepositAddressResponse = {
  ok?: boolean;
  error?: string;
  canEdit?: boolean;
  addresses?: Partial<Record<Asset, string>>;
};

type TradePermissionUser = {
  id: string;
  username?: string | null;
  email?: string | null;
  permissionMode?: TradePermissionMode;
  buyEnabled?: boolean;
  sellEnabled?: boolean;
  source?: "db" | "memory" | "default";
};

type TradePermissionListResponse = {
  users?: TradePermissionUser[];
  error?: string;
};

type TradePermissionUpdateResponse = {
  ok?: boolean;
  error?: string;
  permissionMode?: TradePermissionMode;
  buyEnabled?: boolean;
  sellEnabled?: boolean;
};

type RestrictionUpdateResponse = {
  ok?: boolean;
  error?: string;
  restricted?: boolean;
  tradeRestricted?: boolean;
  miningRestricted?: boolean;
};

type PasswordResetResponse = {
  ok?: boolean;
  error?: string;
  generated?: boolean;
  temporaryPassword?: string | null;
};

type DeleteUserResponse = {
  ok?: boolean;
  error?: string;
  userId?: string;
};

type DepositRequestRow = {
  id: string;
  userId: string;
  adminId?: string | null;
  username?: string | null;
  email?: string | null;
  asset: Asset;
  amount: number;
  walletAddress: string;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  createdAt: string;
};

type DepositRequestListResponse = {
  ok?: boolean;
  error?: string;
  pendingCount?: number;
  requests?: DepositRequestRow[];
};

type DepositRequestActionResponse = {
  ok?: boolean;
  error?: string;
  pendingCount?: number;
  request?: DepositRequestRow;
};

type WithdrawRequestRow = {
  id: string;
  userId: string;
  adminId?: string | null;
  username?: string | null;
  email?: string | null;
  asset: Asset;
  amount: number;
  walletAddress: string;
  status: "PENDING" | "CONFIRMED" | "FROZEN";
  note?: string | null;
  createdAt: string;
  updatedAt: string;
};

type WithdrawRequestListResponse = {
  ok?: boolean;
  error?: string;
  pendingCount?: number;
  requests?: WithdrawRequestRow[];
};

type OverviewCardKey =
  | "PLATFORM_USERS"
  | "MONTHLY_PERFORMANCE"
  | "MONTHLY_WITHDRAW"
  | "LARGE_ACCOUNTS";

type UserDetailBalances = {
  usdt: number;
  btc: number;
  eth: number;
  sol: number;
  xrp: number;
};

type UserDetailAccess = {
  tradeRestricted: boolean;
  miningRestricted: boolean;
  restricted: boolean;
};

type UserDetailRow = {
  id: string;
  username?: string | null;
  email?: string | null;
  phone?: string | null;
  createdAt?: string | null;
  managedBy?: string | null;
  managedByUsername?: string | null;
  balances?: UserDetailBalances;
  access?: UserDetailAccess;
};

type UserDetailActivity = {
  id: string;
  source: "BALANCE" | "DEPOSIT" | "WITHDRAW" | "MINING";
  title: string;
  detail: string;
  status: string;
  createdAt: string;
};

type DetailActivityFilter = "ALL" | UserDetailActivity["source"];

type UserDetailsResponse = {
  ok?: boolean;
  error?: string;
  user?: UserDetailRow;
  activities?: UserDetailActivity[];
};

async function readJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    return {} as T;
  }
}

function fmtDate(v?: string | null) {
  return (v || "").toString().slice(0, 10) || "-";
}

function fmtDateTime(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function fmtManagedBy(user: UserRow) {
  const id = String(user.managed_by || "");
  const name = String(user.managed_by_username || "").trim();
  if (!id) return "-";
  if (name) return `${name} (${id.slice(0, 8)}...)`;
  return `${id.slice(0, 10)}...`;
}

function fmtAsset(v: number | null | undefined, asset: Asset) {
  const n = toFiniteNumber(v);
  const maxFractionDigits = asset === "USDT" ? 2 : 8;
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits });
}

function toFiniteNumber(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(value?: string | null) {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function pad2(v: number) {
  return String(v).padStart(2, "0");
}

function monthInputFromDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function parseMonthInput(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 0 || month > 11) return null;
  return { year, month };
}

function isInMonth(value: string | null | undefined, year: number, month: number) {
  const d = parseDate(value);
  return Boolean(d && d.getFullYear() === year && d.getMonth() === month);
}

function linePath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
}

function emptyAddressMap(): AddressMap {
  return {
    USDT: "",
    BTC: "",
    ETH: "",
    SOL: "",
    XRP: "",
  };
}

const PERMISSION_MODE_OPTIONS: Array<{ value: TradePermissionMode; label: string }> = [
  { value: "BUY_ALL_WIN", label: "Buy all win" },
  { value: "SELL_ALL_WIN", label: "Sell all win" },
  { value: "RANDOM_WIN_LOSS", label: "All random win/loss" },
  { value: "ALL_LOSS", label: "All loss" },
];

const DETAIL_ACTIVITY_FILTER_OPTIONS: Array<{ value: DetailActivityFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "BALANCE", label: "Balance" },
  { value: "DEPOSIT", label: "Deposit" },
  { value: "WITHDRAW", label: "Withdraw" },
  { value: "MINING", label: "Mining" },
];

function detailFilterLabel(value: DetailActivityFilter, lang: "en" | "zh") {
  if (lang === "zh") {
    if (value === "ALL") return "全部";
    if (value === "BALANCE") return "余额";
    if (value === "DEPOSIT") return "充值";
    if (value === "WITHDRAW") return "提现";
    return "挖矿";
  }

  if (value === "ALL") return "All";
  if (value === "BALANCE") return "Balance";
  if (value === "DEPOSIT") return "Deposit";
  if (value === "WITHDRAW") return "Withdraw";
  return "Mining";
}

function normalizePermissionMode(v: unknown): TradePermissionMode {
  const raw = String(v || "").toUpperCase().trim();
  if (raw === "BUY_ALL_WIN" || raw === "SELL_ALL_WIN" || raw === "RANDOM_WIN_LOSS" || raw === "ALL_LOSS") {
    return raw as TradePermissionMode;
  }
  return "ALL_LOSS";
}

function permissionModeLabel(mode: TradePermissionMode, lang: "en" | "zh" = "en") {
  if (lang === "zh") {
    if (mode === "BUY_ALL_WIN") return "买入全赢";
    if (mode === "SELL_ALL_WIN") return "卖出全赢";
    if (mode === "RANDOM_WIN_LOSS") return "随机盈亏";
    return "全部亏损";
  }

  if (mode === "BUY_ALL_WIN") return "Buy all win";
  if (mode === "SELL_ALL_WIN") return "Sell all win";
  if (mode === "RANDOM_WIN_LOSS") return "All random win/loss";
  return "All loss";
}

function permissionSessionLabel(mode: TradePermissionMode, lang: "en" | "zh" = "en") {
  if (lang === "zh") {
    if (mode === "BUY_ALL_WIN") return "买入赢 / 卖出亏";
    if (mode === "SELL_ALL_WIN") return "卖出赢 / 买入亏";
    if (mode === "RANDOM_WIN_LOSS") return "随机（偏亏损）";
    return "买入+卖出都亏";
  }

  if (mode === "BUY_ALL_WIN") return "BUY win / SELL loss";
  if (mode === "SELL_ALL_WIN") return "SELL win / BUY loss";
  if (mode === "RANDOM_WIN_LOSS") return "Random (loss-heavy)";
  return "BUY+SELL loss";
}

function activityStatusClass(status: string) {
  const s = status.trim().toUpperCase();
  if (s === "ACTIVE" || s === "CONFIRMED" || s === "DONE" || s === "COMPLETED") {
    return "border-emerald-300/30 bg-emerald-500/10 text-emerald-200";
  }
  if (s === "PENDING") {
    return "border-yellow-300/30 bg-yellow-500/10 text-yellow-200";
  }
  if (s === "REJECTED" || s === "DECLINED" || s === "ABORTED" || s === "FROZEN") {
    return "border-rose-300/30 bg-rose-500/10 text-rose-200";
  }
  return "border-white/20 bg-white/5 text-white/70";
}

function AdminPageInner() {
  const sp = useSearchParams();
  const tab = (sp.get("tab") || "overview").toLowerCase();
  const managedBy = String(sp.get("managedBy") || "ALL").trim() || "ALL";
  const lang = sp.get("lang") === "zh" ? "zh" : "en";
  const isZh = lang === "zh";
  const copy = useMemo(
    () => ({
      overview: isZh ? "总览" : "Overview",
      overviewDesc: isZh
        ? "平台用户、月度历史、充值表现和提现汇总。"
        : "Platform users, monthly history, deposit performance and withdraw summary.",
      refresh: isZh ? "刷新" : "Refresh",
      loading: isZh ? "加载中..." : "Loading...",
      platformUsersCard: isZh ? "平台用户数量" : "Number of Platform Users",
      selectedPerformanceCard: isZh ? "总表现（所选月份）" : "Total Performance (Selected Month)",
      selectedWithdrawCard: isZh ? "总提现（所选月份）" : "Total Withdraw (Selected Month)",
      largeAccountsCard: isZh ? "大额账户（>10,000）" : "Large Amount Accounts (>10,000)",
      allUsersHint: isZh ? "当前筛选下的全部用户" : "All users on current filter",
      depositHint: (monthLabel: string) =>
        isZh ? `${monthLabel} 充值请求` : `${monthLabel} deposit requests`,
      withdrawHint: (monthLabel: string) =>
        isZh ? `${monthLabel} 全部提现请求` : `${monthLabel} all withdraw requests`,
      largeHint: isZh ? "USDT 余额大于 10,000" : "USDT balance higher than 10,000",
      platformUsersTitle: isZh ? "平台用户" : "Platform Users",
      depositRequestsTitle: (monthLabel: string) =>
        isZh ? `充值请求 - ${monthLabel}` : `Deposit Requests - ${monthLabel}`,
      withdrawRequestsTitle: (monthLabel: string) =>
        isZh ? `提现请求 - ${monthLabel}` : `Withdraw Requests - ${monthLabel}`,
      largeUsersTitle: isZh ? "大额账户（>10,000 USDT）" : "Large Amount Accounts (>10,000 USDT)",
      openHistory: isZh ? "点击用户行查看完整历史。" : "Open a user row to view full detail history.",
      perfDesc: isZh ? "表现数据仅按充值请求统计。" : "Performance is calculated from deposit requests only.",
      withdrawDesc: isZh ? "提现总额包含全部提现请求。" : "Withdraw total includes all withdraw requests.",
      largeDesc: isZh ? "USDT 余额高于 10,000 的用户。" : "Users with USDT balance above 10,000.",
      user: isZh ? "用户" : "User",
      email: isZh ? "邮箱" : "Email",
      usdt: "USDT",
      managedBy: isZh ? "管理者" : "Managed By",
      created: isZh ? "创建时间" : "Created",
      history: isZh ? "历史" : "History",
      details: isZh ? "详情" : "Details",
      asset: isZh ? "资产" : "Asset",
      amount: isZh ? "金额" : "Amount",
      status: isZh ? "状态" : "Status",
      date: isZh ? "日期" : "Date",
      noUsersForCard: isZh ? "该卡片暂无用户数据。" : "No users found for this card.",
      noDepositInMonth: (monthLabel: string) =>
        isZh ? `${monthLabel} 没有充值请求。` : `No deposit requests in ${monthLabel}.`,
      noWithdrawInMonth: (monthLabel: string) =>
        isZh ? `${monthLabel} 没有提现请求。` : `No withdraw requests in ${monthLabel}.`,
      chartTitle: (monthLabel: string) =>
        isZh ? `表现与提现（${monthLabel}）` : `Performance vs Withdraw (${monthLabel})`,
      perfLegend: isZh ? "表现（充值）" : "Performance (Deposit)",
      withdrawLegend: isZh ? "提现" : "Withdraw",
      usersTitle: isZh ? "用户管理" : "Users",
      username: isZh ? "用户名" : "Username",
      balance: isZh ? "余额" : "Balance",
      access: isZh ? "权限" : "Access",
      action: isZh ? "操作" : "Action",
      active: isZh ? "正常" : "Active",
      restricted: isZh ? "已限制" : "Restricted",
      resetPassword: isZh ? "重置密码" : "Reset Password",
      resetting: isZh ? "重置中..." : "Resetting...",
      restrict: isZh ? "限制" : "Restrict",
      unrestrict: isZh ? "解除限制" : "Unrestrict",
      saving: isZh ? "保存中..." : "Saving...",
      deleting: isZh ? "删除中..." : "Deleting...",
      userDetails: isZh ? "用户详情" : "User Details",
      profileInfoAndActivity: isZh
        ? "用户资料信息与最近活动记录。"
        : "Profile information and latest account activities.",
      close: isZh ? "关闭" : "Close",
      profile: isZh ? "资料" : "Profile",
      phone: isZh ? "电话" : "Phone",
      balanceAccess: isZh ? "资产与权限" : "Balance & Access",
      dangerZone: isZh ? "危险操作区" : "Danger Zone",
      dangerZoneDesc: isZh
        ? "永久删除该客户账号及相关记录。"
        : "Permanently delete this customer account and related records.",
      deleteCustomer: isZh ? "删除客户" : "Delete Customer",
      recentActivities: isZh ? "最近活动" : "Recent Activities",
      noActivityForFilter: isZh ? "该筛选下暂无活动记录。" : "No activity for this filter.",
      depositPermission: isZh ? "充值权限" : "Deposit Permission",
      depositPermissionDesc: isZh
        ? "在 More 中管理余额，并在下方审批充值请求。"
        : "Manage balances in More, and approve/decline deposit requests below.",
      refreshRequests: isZh ? "刷新请求" : "Refresh Requests",
      refreshingRequests: isZh ? "刷新中..." : "Refreshing...",
      depositWalletAddresses: isZh ? "充值钱包地址（链上）" : "Deposit Wallet Addresses (ON-CHAIN)",
      depositWalletAddressesDesc: isZh
        ? "这些超级管理员地址会显示在所有用户的充值页面。"
        : "These superadmin addresses are shown to all users on Deposit page.",
      readOnlyAddresses: isZh ? "只读：仅主超级管理员可编辑地址。" : "Read only: only primary superadmin can edit addresses.",
      saveAddresses: isZh ? "保存地址" : "Save Addresses",
      queueTitle: isZh ? "充值请求队列" : "Deposit Request Queue",
      queueDesc: isZh ? "审批或拒绝待处理充值请求。" : "Approve or decline pending deposit requests.",
      allPending: isZh ? "全部待处理" : "All pending",
      noPendingForFilter: isZh ? "当前筛选下无待处理充值请求。" : "No pending deposit requests for this filter.",
      requested: isZh ? "请求时间" : "Requested",
      wallet: isZh ? "钱包地址" : "Wallet",
      approve: isZh ? "通过" : "Approve",
      decline: isZh ? "拒绝" : "Decline",
      processing: isZh ? "处理中..." : "Processing...",
      requests: isZh ? "请求" : "Requests",
      more: isZh ? "更多" : "More",
      userInformation: isZh ? "用户信息" : "User Information",
      reviewUserInfo: isZh ? "查看用户信息并调整余额。" : "Review user info and adjust balances.",
      deductBalance: isZh ? "扣减余额" : "Deduct Balance",
      topupBalance: isZh ? "增加余额" : "Top up Balance",
      actionLabel: isZh ? "操作" : "Action",
      topup: isZh ? "加款" : "Top up",
      deduct: isZh ? "扣减" : "Deduct",
      amountToDeduct: isZh ? "输入扣减金额" : "Amount to deduct",
      amountToTopup: isZh ? "输入加款金额" : "Amount to top up",
      noteOptional: isZh ? "备注（可选）" : "Note (optional)",
      cancel: isZh ? "取消" : "Cancel",
      confirmDeduct: isZh ? "确认扣减" : "Confirm Deduct",
      confirmTopup: isZh ? "确认加款" : "Confirm Top up",
      tradePermissions: isZh ? "交易权限" : "Trade Permissions",
      tradePermissionDesc: isZh ? "为每个用户选择交易权限模式。" : "Select a trade permission mode per user.",
      session: isZh ? "会话" : "Session",
      permission: isZh ? "权限模式" : "Permission",
      save: isZh ? "保存" : "Save",
      noUsersFound: isZh ? "没有找到用户。" : "No users found.",
      refreshPermissions: isZh ? "刷新权限" : "Refresh Permissions",
      unknownTab: isZh ? "未知页面标签。" : "Unknown tab.",
      languageErrFallback: isZh ? "操作失败" : "Operation failed",
      failedLoadUsers: isZh ? "加载用户失败" : "Failed to load users",
      failedLoadDepositAddresses: isZh ? "加载充值地址失败" : "Failed to load deposit addresses",
      onlyPrimaryCanEditAddresses: isZh
        ? "只有主超级管理员可以更新充值地址"
        : "Only primary superadmin can update deposit addresses",
      failedSaveDepositAddresses: isZh ? "保存充值地址失败" : "Failed to save deposit addresses",
      depositAddressesSaved: isZh ? "充值钱包地址已保存" : "Deposit wallet addresses saved",
      failedLoadDepositRequests: isZh ? "加载充值请求失败" : "Failed to load deposit requests",
      failedLoadWithdrawRequests: isZh ? "加载提现请求失败" : "Failed to load withdraw requests",
      failedLoadOverview: isZh ? "加载总览失败" : "Failed to load overview",
      failedLoadTradePermissions: isZh ? "加载交易权限失败" : "Failed to load trade permissions",
      failedSavePermission: isZh ? "保存权限失败" : "Failed to save permission",
      failedLoadUserDetails: isZh ? "加载用户详情失败" : "Failed to load user details",
      failedUpdateRestriction: isZh ? "更新限制失败" : "Failed to update restriction",
      restrictedInfo: (name: string) =>
        isZh
          ? `${name} 已被限制（交易/挖矿已禁用）。`
          : `${name} is now restricted (trade/mining disabled).`,
      unRestrictedInfo: (name: string) =>
        isZh ? `${name} 已解除限制。` : `${name} is now un-restricted.`,
      resetPasswordPrompt: isZh
        ? "设置新密码。留空并点击确定可自动生成临时密码（至少 8 位）。"
        : "Set new password. Leave blank and press OK to auto-generate a temporary password (min 8 chars).",
      newPasswordMin8: isZh
        ? "新密码至少需要 8 个字符。"
        : "New password must be at least 8 characters.",
      failedResetPassword: isZh ? "重置密码失败" : "Failed to reset password",
      tempPasswordInfo: (name: string, password: string) =>
        isZh ? `${name} 的临时密码：${password}` : `Temporary password for ${name}: ${password}`,
      resetPasswordDone: (name: string) =>
        isZh ? `${name} 的密码重置已完成。` : `Password reset completed for ${name}.`,
      deleteConfirm: (name: string) =>
        isZh ? `确认删除 ${name} 账号？此操作不可撤销。` : `Delete ${name} account? This action cannot be undone.`,
      failedDeleteCustomer: isZh ? "删除客户账号失败" : "Failed to delete customer account",
      deletedCustomerInfo: (name: string) => (isZh ? `${name} 账号已删除。` : `${name} account deleted.`),
      amountGreaterThanZero: isZh ? "金额必须大于 0" : "Amount must be greater than 0",
      topupFailed: isZh ? "调账失败" : "Topup failed",
      topupSuccessInfo: (mode: TopupMode, assetCode: Asset) => {
        if (mode === "SUBTRACT") {
          if (assetCode === "USDT") {
            return isZh ? "扣减成功（USDT 余额已更新）" : "Deduct success (USDT balance updated)";
          }
          return isZh ? `扣减成功（${assetCode}）` : `Deduct success (${assetCode})`;
        }
        if (assetCode === "USDT") {
          return isZh ? "加款成功（USDT 余额已更新）" : "Topup success (USDT balance updated)";
        }
        return isZh ? `加款成功（${assetCode}）` : `Topup success (${assetCode})`;
      },
      requestActionFailed: (action: "APPROVE" | "DECLINE") => {
        if (isZh) return action === "APPROVE" ? "审批通过请求失败" : "拒绝请求失败";
        return `Failed to ${action.toLowerCase()} request`;
      },
      depositApprovedInfo: isZh
        ? "充值请求已通过并已入账。"
        : "Deposit request approved and credited.",
      depositDeclinedInfo: isZh ? "充值请求已拒绝。" : "Deposit request declined.",
      thisCustomer: isZh ? "该客户" : "this customer",
    }),
    [isZh]
  );

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersErr, setUsersErr] = useState("");

  const [topupOpen, setTopupOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState<Asset>("USDT");
  const [topupMode, setTopupMode] = useState<TopupMode>("ADD");
  const [note, setNote] = useState("");
  const [topupErr, setTopupErr] = useState("");
  const [topupInfo, setTopupInfo] = useState("");
  const [topupLoading, setTopupLoading] = useState(false);
  const [depositAddresses, setDepositAddresses] = useState<AddressMap>(emptyAddressMap());
  const [canEditDepositAddresses, setCanEditDepositAddresses] = useState(false);
  const [depositAddressLoading, setDepositAddressLoading] = useState(false);
  const [depositAddressSaving, setDepositAddressSaving] = useState(false);
  const [depositAddressErr, setDepositAddressErr] = useState("");
  const [depositAddressInfo, setDepositAddressInfo] = useState("");
  const [permissionUsers, setPermissionUsers] = useState<TradePermissionUser[]>([]);
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [permissionErr, setPermissionErr] = useState("");
  const [permissionSavingUserId, setPermissionSavingUserId] = useState("");
  const [restrictionSavingUserId, setRestrictionSavingUserId] = useState("");
  const [restrictionErr, setRestrictionErr] = useState("");
  const [restrictionInfo, setRestrictionInfo] = useState("");
  const [passwordResetSavingUserId, setPasswordResetSavingUserId] = useState("");
  const [passwordResetErr, setPasswordResetErr] = useState("");
  const [passwordResetInfo, setPasswordResetInfo] = useState("");
  const [deleteUserSavingId, setDeleteUserSavingId] = useState("");
  const [deleteUserErr, setDeleteUserErr] = useState("");
  const [deleteUserInfo, setDeleteUserInfo] = useState("");
  const [depositRequests, setDepositRequests] = useState<DepositRequestRow[]>([]);
  const [depositRequestsLoading, setDepositRequestsLoading] = useState(false);
  const [depositRequestsErr, setDepositRequestsErr] = useState("");
  const [depositRequestsInfo, setDepositRequestsInfo] = useState("");
  const [depositRequestActionId, setDepositRequestActionId] = useState("");
  const [pendingDepositCount, setPendingDepositCount] = useState(0);
  const [depositRequestUserFilter, setDepositRequestUserFilter] = useState("ALL");
  const [overviewDepositRequests, setOverviewDepositRequests] = useState<DepositRequestRow[]>([]);
  const [overviewWithdrawRequests, setOverviewWithdrawRequests] = useState<WithdrawRequestRow[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewErr, setOverviewErr] = useState("");
  const [overviewMonth, setOverviewMonth] = useState(() => monthInputFromDate(new Date()));
  const [activeOverviewCard, setActiveOverviewCard] = useState<OverviewCardKey>("PLATFORM_USERS");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState("");
  const [detailUser, setDetailUser] = useState<UserDetailRow | null>(null);
  const [detailActivities, setDetailActivities] = useState<UserDetailActivity[]>([]);
  const [detailActivityFilter, setDetailActivityFilter] = useState<DetailActivityFilter>("ALL");

  const needUsers = tab === "overview" || tab === "users" || tab === "topups";
  const monthContext = useMemo(() => {
    const now = new Date();
    const parsed = parseMonthInput(overviewMonth);
    const year = parsed?.year ?? now.getFullYear();
    const month = parsed?.month ?? now.getMonth();
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const label = start.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
      month: "long",
      year: "numeric",
    });
    const value = monthInputFromDate(start);

    return {
      year,
      month,
      daysInMonth,
      label,
      value,
      fromIso: start.toISOString(),
      toIso: end.toISOString(),
    };
  }, [overviewMonth, lang]);

  const fetchUsersList = useCallback(async () => {
    const params = new URLSearchParams();
    if (managedBy.toUpperCase() !== "ALL") {
      params.set("managedBy", managedBy);
    }
    const qs = params.toString();

    const r = await fetch(`/api/admin/users${qs ? `?${qs}` : ""}`, {
      method: "GET",
      cache: "no-store",
    });
    const j = await readJson<UsersResponse>(r);
    if (!r.ok) throw new Error(j?.error || copy.failedLoadUsers);
    return Array.isArray(j?.users) ? j.users : [];
  }, [managedBy, copy.failedLoadUsers]);

  async function reloadUsers() {
    setLoadingUsers(true);
    setUsersErr("");
    try {
      const rows = await fetchUsersList();
      setUsers(rows);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : copy.failedLoadUsers;
      setUsersErr(message);
    } finally {
      setLoadingUsers(false);
    }
  }

  const fetchDepositAddresses = useCallback(async () => {
    const r = await fetch("/api/admin/deposit-addresses", {
      method: "GET",
      cache: "no-store",
    });
    const j = await readJson<DepositAddressResponse>(r);
    if (!r.ok || !j?.ok) {
      throw new Error(j?.error || copy.failedLoadDepositAddresses);
    }

    return {
      canEdit: Boolean(j.canEdit),
      addresses: {
        USDT: String(j.addresses?.USDT || ""),
        BTC: String(j.addresses?.BTC || ""),
        ETH: String(j.addresses?.ETH || ""),
        SOL: String(j.addresses?.SOL || ""),
        XRP: String(j.addresses?.XRP || ""),
      } as AddressMap,
    };
  }, [copy.failedLoadDepositAddresses]);

  async function reloadDepositAddresses() {
    setDepositAddressLoading(true);
    setDepositAddressErr("");
    try {
      const result = await fetchDepositAddresses();
      setCanEditDepositAddresses(result.canEdit);
      setDepositAddresses(result.addresses);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : copy.failedLoadDepositAddresses;
      setDepositAddressErr(message);
    } finally {
      setDepositAddressLoading(false);
    }
  }

  async function saveDepositAddresses() {
    if (!canEditDepositAddresses) {
      setDepositAddressErr(copy.onlyPrimaryCanEditAddresses);
      setDepositAddressInfo("");
      return;
    }

    setDepositAddressSaving(true);
    setDepositAddressErr("");
    setDepositAddressInfo("");
    try {
      const r = await fetch("/api/admin/deposit-addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses: depositAddresses }),
      });
      const j = await readJson<DepositAddressResponse>(r);
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || copy.failedSaveDepositAddresses);
      }

      setCanEditDepositAddresses(Boolean(j.canEdit));
      setDepositAddresses({
        USDT: String(j.addresses?.USDT || ""),
        BTC: String(j.addresses?.BTC || ""),
        ETH: String(j.addresses?.ETH || ""),
        SOL: String(j.addresses?.SOL || ""),
        XRP: String(j.addresses?.XRP || ""),
      });
      setDepositAddressInfo(copy.depositAddressesSaved);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : copy.failedSaveDepositAddresses;
      setDepositAddressErr(message);
    } finally {
      setDepositAddressSaving(false);
    }
  }

  const fetchDepositRequests = useCallback(async (userId?: string) => {
    const params = new URLSearchParams();
    params.set("status", "PENDING");
    params.set("limit", "300");
    if (userId) params.set("userId", userId);
    if (managedBy.toUpperCase() !== "ALL") params.set("managedBy", managedBy);

    const r = await fetch(`/api/admin/deposit-requests?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
    });
    const j = await readJson<DepositRequestListResponse>(r);
    if (!r.ok || !j?.ok) {
      throw new Error(j?.error || copy.failedLoadDepositRequests);
    }

    return {
      requests: Array.isArray(j?.requests) ? j.requests : [],
      pendingCount: Number(j?.pendingCount ?? 0),
    };
  }, [managedBy, copy.failedLoadDepositRequests]);

  async function reloadDepositRequests() {
    setDepositRequestsLoading(true);
    setDepositRequestsErr("");
    try {
      const result = await fetchDepositRequests();
      setDepositRequests(result.requests);
      setPendingDepositCount(result.pendingCount);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : copy.failedLoadDepositRequests;
      setDepositRequestsErr(message);
    } finally {
      setDepositRequestsLoading(false);
    }
  }

  const fetchOverviewDeposits = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("status", "ALL");
    params.set("limit", "2000");
    params.set("from", monthContext.fromIso);
    params.set("to", monthContext.toIso);
    if (managedBy.toUpperCase() !== "ALL") params.set("managedBy", managedBy);

    const r = await fetch(`/api/admin/deposit-requests?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
    });
    const j = await readJson<DepositRequestListResponse>(r);
    if (!r.ok || !j?.ok) {
      throw new Error(j?.error || copy.failedLoadDepositRequests);
    }
    return Array.isArray(j.requests) ? j.requests : [];
  }, [managedBy, monthContext.fromIso, monthContext.toIso, copy.failedLoadDepositRequests]);

  const fetchOverviewWithdraws = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("status", "ALL");
    params.set("limit", "2000");
    params.set("from", monthContext.fromIso);
    params.set("to", monthContext.toIso);
    if (managedBy.toUpperCase() !== "ALL") params.set("managedBy", managedBy);

    const r = await fetch(`/api/admin/withdraw-requests?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
    });
    const j = await readJson<WithdrawRequestListResponse>(r);
    if (!r.ok || !j?.ok) {
      throw new Error(j?.error || copy.failedLoadWithdrawRequests);
    }
    return Array.isArray(j.requests) ? j.requests : [];
  }, [managedBy, monthContext.fromIso, monthContext.toIso, copy.failedLoadWithdrawRequests]);

  async function reloadOverview() {
    setOverviewLoading(true);
    setOverviewErr("");
    try {
      const [deposits, withdraws] = await Promise.all([
        fetchOverviewDeposits(),
        fetchOverviewWithdraws(),
      ]);
      setOverviewDepositRequests(deposits);
      setOverviewWithdrawRequests(withdraws);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : copy.failedLoadOverview;
      setOverviewErr(message);
    } finally {
      setOverviewLoading(false);
    }
  }

  async function processDepositRequest(requestId: string, action: "APPROVE" | "DECLINE") {
    setDepositRequestActionId(requestId);
    setDepositRequestsErr("");
    setDepositRequestsInfo("");
    try {
      const r = await fetch("/api/admin/deposit-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });

      const j = await readJson<DepositRequestActionResponse>(r);
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || copy.requestActionFailed(action));
      }

      setDepositRequests((prev) => prev.filter((x) => x.id !== requestId));
      setPendingDepositCount(Number(j?.pendingCount ?? 0));
      setOverviewDepositRequests((prev) =>
        prev.map((row) =>
          row.id === requestId
            ? {
                ...row,
                status: action === "APPROVE" ? "CONFIRMED" : "REJECTED",
              }
            : row
        )
      );
      setDepositRequestsInfo(
        action === "APPROVE" ? copy.depositApprovedInfo : copy.depositDeclinedInfo
      );

      await reloadUsers();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : copy.requestActionFailed(action);
      setDepositRequestsErr(message);
    } finally {
      setDepositRequestActionId("");
    }
  }

  const fetchPermissionUsers = useCallback(async () => {
    const params = new URLSearchParams();
    if (managedBy.toUpperCase() !== "ALL") {
      params.set("managedBy", managedBy);
    }
    const qs = params.toString();
    const r = await fetch(`/api/admin/trade-permission${qs ? `?${qs}` : ""}`, {
      method: "GET",
      cache: "no-store",
    });
    const j = await readJson<TradePermissionListResponse>(r);
    if (!r.ok) throw new Error(j?.error || copy.failedLoadTradePermissions);
    const rows = Array.isArray(j?.users) ? j.users : [];
    return rows.map((u) => ({
      ...u,
      permissionMode: normalizePermissionMode(u.permissionMode),
    }));
  }, [managedBy, copy.failedLoadTradePermissions]);

  async function reloadPermissionUsers() {
    setPermissionLoading(true);
    setPermissionErr("");
    try {
      const rows = await fetchPermissionUsers();
      setPermissionUsers(rows);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : copy.failedLoadTradePermissions;
      setPermissionErr(message);
    } finally {
      setPermissionLoading(false);
    }
  }

  async function savePermission(userId: string, permissionMode: TradePermissionMode) {
    setPermissionSavingUserId(userId);
    setPermissionErr("");
    try {
      const r = await fetch("/api/admin/trade-permission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, permissionMode }),
      });
      const j = await readJson<TradePermissionUpdateResponse>(r);
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || copy.failedSavePermission);
      }
      const savedMode = normalizePermissionMode(j?.permissionMode || permissionMode);
      setPermissionUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                permissionMode: savedMode,
              }
            : u
        )
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : copy.failedSavePermission;
      setPermissionErr(message);
    } finally {
      setPermissionSavingUserId("");
    }
  }

  useEffect(() => {
    if (!needUsers) return;

    let cancelled = false;

    const run = async () => {
      setLoadingUsers(true);
      setUsersErr("");
      try {
        const rows = await fetchUsersList();
        if (!cancelled) setUsers(rows);
      } catch (e: unknown) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : copy.failedLoadUsers;
        setUsersErr(message);
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [needUsers, fetchUsersList, copy.failedLoadUsers]);

  useEffect(() => {
    if (tab !== "orders") return;

    let cancelled = false;

    const run = async () => {
      setPermissionLoading(true);
      setPermissionErr("");
      try {
        const rows = await fetchPermissionUsers();
        if (!cancelled) setPermissionUsers(rows);
      } catch (e: unknown) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : copy.failedLoadTradePermissions;
        setPermissionErr(message);
      } finally {
        if (!cancelled) setPermissionLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [tab, fetchPermissionUsers, copy.failedLoadTradePermissions]);

  useEffect(() => {
    if (tab !== "topups") return;

    let cancelled = false;

    const run = async () => {
      setDepositAddressLoading(true);
      setDepositRequestsLoading(true);
      setDepositAddressErr("");
      setDepositRequestsErr("");
      try {
        const [addressResult, depositResult] = await Promise.all([
          fetchDepositAddresses(),
          fetchDepositRequests(),
        ]);
        if (!cancelled) {
          setCanEditDepositAddresses(addressResult.canEdit);
          setDepositAddresses(addressResult.addresses);
          setDepositRequests(depositResult.requests);
          setPendingDepositCount(depositResult.pendingCount);
        }
      } catch (e: unknown) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : copy.failedLoadDepositAddresses;
        setDepositAddressErr(message);
        setDepositRequestsErr(message);
      } finally {
        if (!cancelled) {
          setDepositAddressLoading(false);
          setDepositRequestsLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [tab, fetchDepositRequests, fetchDepositAddresses, copy.failedLoadDepositAddresses]);

  useEffect(() => {
    if (tab !== "overview") return;

    let cancelled = false;

    const run = async () => {
      setOverviewLoading(true);
      setOverviewErr("");
      try {
        const [deposits, withdraws] = await Promise.all([
          fetchOverviewDeposits(),
          fetchOverviewWithdraws(),
        ]);
        if (!cancelled) {
          setOverviewDepositRequests(deposits);
          setOverviewWithdrawRequests(withdraws);
        }
      } catch (e: unknown) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : copy.failedLoadOverview;
        setOverviewErr(message);
      } finally {
        if (!cancelled) setOverviewLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [tab, fetchOverviewDeposits, fetchOverviewWithdraws, copy.failedLoadOverview]);

  useEffect(() => {
    if (overviewMonth === monthContext.value) return;
    setOverviewMonth(monthContext.value);
  }, [overviewMonth, monthContext.value]);

  useEffect(() => {
    if (tab !== "overview") return;

    const syncToNewMonthIfNeeded = () => {
      const now = new Date();
      if (now.getDate() !== 1) return;
      const currentMonth = monthInputFromDate(now);
      setOverviewMonth((prev) => (prev === currentMonth ? prev : currentMonth));
    };

    syncToNewMonthIfNeeded();
    const timer = window.setInterval(syncToNewMonthIfNeeded, 60 * 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [tab]);

  const usersForTable = useMemo(() => users, [users]);
  const pendingByUserId = useMemo(() => {
    const map = new Map<string, number>();
    depositRequests.forEach((r) => {
      const key = String(r.userId || "");
      if (!key) return;
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [depositRequests]);
  const requestUserOptions = useMemo(() => {
    const seen = new Set<string>();
    const rows: Array<{ id: string; label: string }> = [];

    depositRequests.forEach((r) => {
      const id = String(r.userId || "").trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      const matched = usersForTable.find((u) => u.id === id);
      const username = String(r.username || matched?.username || id.slice(0, 8));
      const email = String(r.email || matched?.email || "").trim();
      rows.push({
        id,
        label: email ? `${username} (${email})` : username,
      });
    });

    return rows;
  }, [depositRequests, usersForTable]);
  const filteredDepositRequests = useMemo(() => {
    if (depositRequestUserFilter === "ALL") return depositRequests;
    return depositRequests.filter((r) => r.userId === depositRequestUserFilter);
  }, [depositRequestUserFilter, depositRequests]);

  useEffect(() => {
    if (depositRequestUserFilter === "ALL") return;
    const stillExists = depositRequests.some((r) => r.userId === depositRequestUserFilter);
    if (!stillExists) {
      setDepositRequestUserFilter("ALL");
    }
  }, [depositRequestUserFilter, depositRequests]);

  const usersById = useMemo(() => {
    const map = new Map<string, UserRow>();
    usersForTable.forEach((row) => {
      map.set(row.id, row);
    });
    return map;
  }, [usersForTable]);

  const monthlyPerformanceRows = useMemo(
    () =>
      overviewDepositRequests.filter((row) =>
        isInMonth(row.createdAt, monthContext.year, monthContext.month)
      ),
    [overviewDepositRequests, monthContext]
  );

  const monthlyWithdrawRows = useMemo(
    () =>
      overviewWithdrawRequests.filter((row) =>
        isInMonth(row.createdAt, monthContext.year, monthContext.month)
      ),
    [overviewWithdrawRequests, monthContext]
  );

  const largeAmountUsers = useMemo(
    () => usersForTable.filter((row) => toFiniteNumber(row.usdt ?? row.balance ?? 0) > 10000),
    [usersForTable]
  );

  const totalPerformanceThisMonth = useMemo(
    () => monthlyPerformanceRows.reduce((sum, row) => sum + toFiniteNumber(row.amount), 0),
    [monthlyPerformanceRows]
  );

  const totalWithdrawThisMonth = useMemo(
    () => monthlyWithdrawRows.reduce((sum, row) => sum + toFiniteNumber(row.amount), 0),
    [monthlyWithdrawRows]
  );

  const overviewCards = useMemo(
    () => [
      {
        key: "PLATFORM_USERS" as const,
        title: copy.platformUsersCard,
        value: String(usersForTable.length),
        hint: copy.allUsersHint,
      },
      {
        key: "MONTHLY_PERFORMANCE" as const,
        title: copy.selectedPerformanceCard,
        value: fmtAsset(totalPerformanceThisMonth, "USDT"),
        hint: copy.depositHint(monthContext.label),
      },
      {
        key: "MONTHLY_WITHDRAW" as const,
        title: copy.selectedWithdrawCard,
        value: fmtAsset(totalWithdrawThisMonth, "USDT"),
        hint: copy.withdrawHint(monthContext.label),
      },
      {
        key: "LARGE_ACCOUNTS" as const,
        title: copy.largeAccountsCard,
        value: String(largeAmountUsers.length),
        hint: copy.largeHint,
      },
    ],
    [
      copy,
      usersForTable.length,
      totalPerformanceThisMonth,
      totalWithdrawThisMonth,
      largeAmountUsers.length,
      monthContext.label,
    ]
  );

  const activeOverviewTitle = useMemo(() => {
    if (activeOverviewCard === "PLATFORM_USERS") return copy.platformUsersTitle;
    if (activeOverviewCard === "MONTHLY_PERFORMANCE") return copy.depositRequestsTitle(monthContext.label);
    if (activeOverviewCard === "MONTHLY_WITHDRAW") return copy.withdrawRequestsTitle(monthContext.label);
    return copy.largeUsersTitle;
  }, [activeOverviewCard, copy, monthContext.label]);

  const activeOverviewDescription = useMemo(() => {
    if (activeOverviewCard === "PLATFORM_USERS") return copy.openHistory;
    if (activeOverviewCard === "MONTHLY_PERFORMANCE") return copy.perfDesc;
    if (activeOverviewCard === "MONTHLY_WITHDRAW") return copy.withdrawDesc;
    return copy.largeDesc;
  }, [activeOverviewCard, copy]);

  const activeOverviewUsers = useMemo(
    () => (activeOverviewCard === "LARGE_ACCOUNTS" ? largeAmountUsers : usersForTable),
    [activeOverviewCard, largeAmountUsers, usersForTable]
  );

  const overviewChart = useMemo(() => {
    const daySeries = Array.from({ length: monthContext.daysInMonth }, (_, idx) => ({
      day: idx + 1,
      performance: 0,
      withdraw: 0,
    }));

    monthlyPerformanceRows.forEach((row) => {
      const d = parseDate(row.createdAt);
      if (!d) return;
      const idx = d.getDate() - 1;
      if (idx < 0 || idx >= daySeries.length) return;
      daySeries[idx].performance += toFiniteNumber(row.amount);
    });

    monthlyWithdrawRows.forEach((row) => {
      const d = parseDate(row.createdAt);
      if (!d) return;
      const idx = d.getDate() - 1;
      if (idx < 0 || idx >= daySeries.length) return;
      daySeries[idx].withdraw += toFiniteNumber(row.amount);
    });

    const width = 980;
    const height = 280;
    const padLeft = 46;
    const padRight = 16;
    const padTop = 16;
    const padBottom = 30;
    const innerWidth = width - padLeft - padRight;
    const innerHeight = height - padTop - padBottom;
    const maxValue = Math.max(
      1,
      ...daySeries.flatMap((row) => [row.performance, row.withdraw])
    );
    const divisor = Math.max(daySeries.length - 1, 1);

    const performancePoints = daySeries.map((row, idx) => ({
      x: padLeft + (idx / divisor) * innerWidth,
      y: padTop + innerHeight - (row.performance / maxValue) * innerHeight,
    }));
    const withdrawPoints = daySeries.map((row, idx) => ({
      x: padLeft + (idx / divisor) * innerWidth,
      y: padTop + innerHeight - (row.withdraw / maxValue) * innerHeight,
    }));

    const xTickIndexes = Array.from(
      new Set([
        0,
        Math.floor((daySeries.length - 1) / 3),
        Math.floor(((daySeries.length - 1) * 2) / 3),
        daySeries.length - 1,
      ])
    );
    const xTicks = xTickIndexes.map((idx) => ({
      x: performancePoints[idx]?.x ?? padLeft,
      label: String(daySeries[idx]?.day ?? ""),
    }));
    const yTicks = [maxValue, maxValue / 2, 0];

    return {
      width,
      height,
      padLeft,
      padTop,
      innerHeight,
      performancePath: linePath(performancePoints),
      withdrawPath: linePath(withdrawPoints),
      xTicks,
      yTicks,
      daySeries,
    };
  }, [monthContext.daysInMonth, monthlyPerformanceRows, monthlyWithdrawRows]);

  const openTopup = (u: UserRow) => {
    setSelectedUser(u);
    setAmount("");
    setAsset("USDT");
    setTopupMode("ADD");
    setNote("");
    setTopupErr("");
    setTopupInfo("");
    setDepositRequestsErr("");
    setDepositRequestsInfo("");
    setTopupOpen(true);
  };

  const closeTopup = () => {
    setTopupOpen(false);
    setSelectedUser(null);
    setAmount("");
    setTopupMode("ADD");
    setNote("");
    setTopupErr("");
  };

  const filteredDetailActivities = useMemo(() => {
    if (detailActivityFilter === "ALL") return detailActivities;
    return detailActivities.filter((item) => item.source === detailActivityFilter);
  }, [detailActivities, detailActivityFilter]);

  const closeDetail = () => {
    setDetailOpen(false);
    setDetailErr("");
    setDeleteUserErr("");
    setDetailLoading(false);
    setDetailUser(null);
    setDetailActivities([]);
    setDetailActivityFilter("ALL");
  };

  const openDetail = async (u: UserRow) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailErr("");
    setDeleteUserErr("");
    setDetailActivityFilter("ALL");
    setDetailUser({
      id: u.id,
      username: u.username ?? null,
      email: u.email ?? null,
      phone: u.phone ?? null,
      createdAt: u.created_at ?? null,
      managedBy: u.managed_by ?? null,
      managedByUsername: u.managed_by_username ?? null,
      balances: {
        usdt: Number(u.usdt ?? u.balance ?? 0),
        btc: Number(u.btc ?? 0),
        eth: Number(u.eth ?? 0),
        sol: Number(u.sol ?? 0),
        xrp: Number(u.xrp ?? 0),
      },
      access: {
        tradeRestricted: Boolean(u.trade_restricted),
        miningRestricted: Boolean(u.mining_restricted),
        restricted: Boolean(u.restricted || u.trade_restricted || u.mining_restricted),
      },
    });
    setDetailActivities([]);

    try {
      const params = new URLSearchParams();
      params.set("userId", u.id);
      params.set("limit", "20");
      const r = await fetch(`/api/admin/user-details?${params.toString()}`, {
        cache: "no-store",
      });
      const j = await readJson<UserDetailsResponse>(r);
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || copy.failedLoadUserDetails);
      }

      setDetailUser(j.user ?? null);
      setDetailActivities(Array.isArray(j.activities) ? j.activities : []);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : copy.failedLoadUserDetails;
      setDetailErr(message);
    } finally {
      setDetailLoading(false);
    }
  };

  const isUserRestricted = (u: UserRow) =>
    Boolean(u.restricted || u.trade_restricted || u.mining_restricted);

  const toggleUserRestriction = async (u: UserRow) => {
    const nextRestricted = !isUserRestricted(u);

    setRestrictionSavingUserId(u.id);
    setRestrictionErr("");
    setRestrictionInfo("");

    try {
      const r = await fetch("/api/admin/user-restrictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: u.id,
          restricted: nextRestricted,
        }),
      });

      const j = await readJson<RestrictionUpdateResponse>(r);
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || copy.failedUpdateRestriction);
      }

      setUsers((prev) =>
        prev.map((row) =>
          row.id === u.id
            ? {
                ...row,
                restricted: Boolean(j.restricted),
                trade_restricted: Boolean(j.tradeRestricted),
                mining_restricted: Boolean(j.miningRestricted),
              }
            : row
        )
      );

      setRestrictionInfo(
        nextRestricted
          ? copy.restrictedInfo(u.username ?? u.email ?? copy.user)
          : copy.unRestrictedInfo(u.username ?? u.email ?? copy.user)
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : copy.failedUpdateRestriction;
      setRestrictionErr(message);
    } finally {
      setRestrictionSavingUserId("");
    }
  };

  const resetUserPassword = async (u: UserRow) => {
    const input = window.prompt(copy.resetPasswordPrompt, "");
    if (input === null) return;

    const nextPassword = String(input || "").trim();
    if (nextPassword.length > 0 && nextPassword.length < 8) {
      setPasswordResetErr(copy.newPasswordMin8);
      setPasswordResetInfo("");
      return;
    }

    setPasswordResetSavingUserId(u.id);
    setPasswordResetErr("");
    setPasswordResetInfo("");

    try {
      const r = await fetch("/api/admin/reset-user-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: u.id,
          newPassword: nextPassword || undefined,
        }),
      });

      const j = await readJson<PasswordResetResponse>(r);
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || copy.failedResetPassword);
      }

      const label = u.username ?? u.email ?? copy.user;
      if (j.generated && j.temporaryPassword) {
        setPasswordResetInfo(copy.tempPasswordInfo(label, j.temporaryPassword));
      } else {
        setPasswordResetInfo(copy.resetPasswordDone(label));
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : copy.failedResetPassword;
      setPasswordResetErr(message);
    } finally {
      setPasswordResetSavingUserId("");
    }
  };

  const deleteCustomerAccount = async () => {
    const target = detailUser;
    if (!target?.id) return;

    const label = target.username ?? target.email ?? copy.thisCustomer;
    const confirmed = window.confirm(copy.deleteConfirm(label));
    if (!confirmed) return;

    setDeleteUserSavingId(target.id);
    setDeleteUserErr("");
    setDeleteUserInfo("");

    try {
      const r = await fetch("/api/admin/delete-user", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: target.id }),
      });

      const j = await readJson<DeleteUserResponse>(r);
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || copy.failedDeleteCustomer);
      }

      setUsers((prev) => prev.filter((row) => row.id !== target.id));
      setPermissionUsers((prev) => prev.filter((row) => row.id !== target.id));
      setDepositRequests((prev) => {
        const next = prev.filter((row) => row.userId !== target.id);
        setPendingDepositCount(next.length);
        return next;
      });
      setOverviewDepositRequests((prev) => prev.filter((row) => row.userId !== target.id));
      setOverviewWithdrawRequests((prev) => prev.filter((row) => row.userId !== target.id));

      if (selectedUser?.id === target.id) {
        closeTopup();
      }

      closeDetail();
      setDeleteUserInfo(copy.deletedCustomerInfo(label));
      void reloadUsers();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : copy.failedDeleteCustomer;
      setDeleteUserErr(message);
    } finally {
      setDeleteUserSavingId("");
    }
  };

  const confirmTopup = async () => {
    if (!selectedUser) return;

    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setTopupErr(copy.amountGreaterThanZero);
      return;
    }

    setTopupLoading(true);
    setTopupErr("");
    setTopupInfo("");

    try {
      const r = await fetch("/api/admin/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          amount: n,
          asset,
          mode: topupMode,
          note: note || null,
        }),
      });

      const j = await readJson<TopupResponse>(r);
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || copy.topupFailed);
      }

      if (asset === "USDT" && typeof j.newUsdtBalance === "number") {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === selectedUser.id
              ? {
                  ...u,
                  balance: Number(j.newUsdtBalance),
                  usdt: Number(j.newUsdtBalance),
                }
              : u
          )
        );
      }

      setTopupInfo(copy.topupSuccessInfo(topupMode, asset));

      closeTopup();
      await reloadUsers();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : copy.topupFailed;
      setTopupErr(message);
    } finally {
      setTopupLoading(false);
    }
  };

  const detailModal = detailOpen ? (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-[#0b0b0b] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{copy.userDetails}</div>
            <div className="mt-1 text-xs text-white/60">
              {copy.profileInfoAndActivity}
            </div>
          </div>
          <button
            type="button"
            onClick={closeDetail}
            disabled={deleteUserSavingId === detailUser?.id}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-60"
          >
            {copy.close}
          </button>
        </div>

        {detailErr ? <div className="mt-3 text-sm text-red-300">{detailErr}</div> : null}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-sm">
            <div className="text-xs uppercase tracking-wide text-white/45">{copy.profile}</div>
            <div className="mt-2 flex justify-between gap-3">
              <span className="text-white/60">{copy.username}</span>
              <span className="text-white">{detailUser?.username || "-"}</span>
            </div>
            <div className="mt-1 flex justify-between gap-3">
              <span className="text-white/60">{copy.email}</span>
              <span className="text-white break-all">{detailUser?.email || "-"}</span>
            </div>
            <div className="mt-1 flex justify-between gap-3">
              <span className="text-white/60">{copy.phone}</span>
              <span className="text-white">{detailUser?.phone || "-"}</span>
            </div>
            <div className="mt-1 flex justify-between gap-3">
              <span className="text-white/60">{copy.created}</span>
              <span className="text-white">{fmtDateTime(detailUser?.createdAt)}</span>
            </div>
            <div className="mt-1 flex justify-between gap-3">
              <span className="text-white/60">{copy.managedBy}</span>
              <span className="text-white">
                {detailUser?.managedByUsername
                  ? `${detailUser.managedByUsername} (${String(detailUser.managedBy || "").slice(0, 8)}...)`
                  : detailUser?.managedBy
                    ? `${String(detailUser.managedBy).slice(0, 10)}...`
                    : "-"}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-sm">
            <div className="text-xs uppercase tracking-wide text-white/45">{copy.balanceAccess}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-white/10 px-2 py-1.5">
                <div className="text-white/50">USDT</div>
                <div className="mt-1 text-white">{fmtAsset(detailUser?.balances?.usdt, "USDT")}</div>
              </div>
              <div className="rounded-lg border border-white/10 px-2 py-1.5">
                <div className="text-white/50">BTC</div>
                <div className="mt-1 text-white">{fmtAsset(detailUser?.balances?.btc, "BTC")}</div>
              </div>
              <div className="rounded-lg border border-white/10 px-2 py-1.5">
                <div className="text-white/50">ETH</div>
                <div className="mt-1 text-white">{fmtAsset(detailUser?.balances?.eth, "ETH")}</div>
              </div>
              <div className="rounded-lg border border-white/10 px-2 py-1.5">
                <div className="text-white/50">SOL</div>
                <div className="mt-1 text-white">{fmtAsset(detailUser?.balances?.sol, "SOL")}</div>
              </div>
              <div className="rounded-lg border border-white/10 px-2 py-1.5">
                <div className="text-white/50">XRP</div>
                <div className="mt-1 text-white">{fmtAsset(detailUser?.balances?.xrp, "XRP")}</div>
              </div>
              <div className="rounded-lg border border-white/10 px-2 py-1.5">
                <div className="text-white/50">{copy.access}</div>
                <div className="mt-1 text-white">
                  {detailUser?.access?.restricted ? copy.restricted : copy.active}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-rose-200">{copy.dangerZone}</div>
              <div className="mt-1 text-xs text-rose-100/80">
                {copy.dangerZoneDesc}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void deleteCustomerAccount()}
              disabled={detailLoading || !detailUser?.id || deleteUserSavingId === detailUser?.id}
              className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60 hover:bg-rose-500"
            >
              {deleteUserSavingId === detailUser?.id ? copy.deleting : copy.deleteCustomer}
            </button>
          </div>
          {deleteUserErr ? <div className="mt-2 text-xs text-rose-200">{deleteUserErr}</div> : null}
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">{copy.recentActivities}</div>
            {detailLoading ? <div className="text-xs text-white/55">{copy.loading}</div> : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {DETAIL_ACTIVITY_FILTER_OPTIONS.map((opt) => {
              const active = detailActivityFilter === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDetailActivityFilter(opt.value)}
                  className={
                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold " +
                    (active
                      ? "border-blue-400/40 bg-blue-500/20 text-blue-200"
                      : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10")
                  }
                >
                  {detailFilterLabel(opt.value, lang)}
                </button>
              );
            })}
          </div>

          {filteredDetailActivities.length === 0 && !detailLoading ? (
            <div className="mt-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/55">
              {copy.noActivityForFilter}
            </div>
          ) : null}

          {filteredDetailActivities.length > 0 ? (
            <div className="mt-3 max-h-72 overflow-auto pr-1">
              <div className="space-y-2">
                {filteredDetailActivities.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-white">{item.title}</div>
                      <div className="inline-flex items-center gap-2">
                        <span
                          className={
                            "rounded-full border px-2 py-0.5 text-[10px] font-semibold " +
                            activityStatusClass(item.status)
                          }
                        >
                          {item.status}
                        </span>
                        <span className="text-white/55">{fmtDateTime(item.createdAt)}</span>
                      </div>
                    </div>
                    <div className="mt-1 text-white/70 break-all">{item.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  ) : null;

  if (tab === "overview") {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <div className="text-xl font-semibold">{copy.overview}</div>
            <div className="mt-1 text-sm text-white/60">
              {copy.overviewDesc}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="overview-month" className="sr-only">
              {copy.overview}
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 inline-flex items-center text-white/55">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                  <path
                    d="M16 2v4M8 2v4M3 10h18M5 6h14a2 2 0 0 1 2 2v11a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a2 2 0 0 1 2-2Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <input
                id="overview-month"
                type="month"
                value={overviewMonth}
                max={monthInputFromDate(new Date())}
                onChange={(e) => setOverviewMonth(e.target.value)}
                className="rounded-xl border border-white/10 bg-white/5 py-2 pr-3 pl-9 text-sm outline-none focus:border-blue-400/50"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                void Promise.all([reloadUsers(), reloadOverview()]);
              }}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
            >
              {copy.refresh}
            </button>
          </div>
        </div>

        {loadingUsers || overviewLoading ? <div className="mb-4 text-white/60">{copy.loading}</div> : null}
        {usersErr ? <div className="mb-3 text-red-400">{usersErr}</div> : null}
        {overviewErr ? <div className="mb-3 text-red-400">{overviewErr}</div> : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {overviewCards.map((card) => {
            const active = activeOverviewCard === card.key;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => setActiveOverviewCard(card.key)}
                className={
                  "rounded-2xl border p-4 text-left transition " +
                  (active
                    ? "border-blue-400/45 bg-blue-500/15 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]"
                    : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]")
                }
              >
                <div className="text-xs text-white/60">{card.title}</div>
                <div className="mt-2 text-2xl font-semibold text-white">{card.value}</div>
                <div className="mt-1 text-xs text-white/45">{card.hint}</div>
              </button>
            );
          })}
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-base font-semibold">{activeOverviewTitle}</div>
              <div className="mt-1 text-xs text-white/60">{activeOverviewDescription}</div>
            </div>
          </div>

          {(activeOverviewCard === "PLATFORM_USERS" || activeOverviewCard === "LARGE_ACCOUNTS") && (
            <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[900px]">
                <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-white/60">
                  <tr>
                    <th className="px-3 py-2.5">{copy.user}</th>
                    <th className="px-3 py-2.5">{copy.email}</th>
                    <th className="px-3 py-2.5 text-right">USDT</th>
                    <th className="px-3 py-2.5">{copy.managedBy}</th>
                    <th className="px-3 py-2.5">{copy.created}</th>
                    <th className="px-3 py-2.5 text-right">{copy.history}</th>
                  </tr>
                </thead>
                <tbody>
                  {activeOverviewUsers.map((u) => (
                    <tr key={u.id} className="border-t border-white/10 text-sm">
                      <td className="px-3 py-2.5">{u.username ?? "-"}</td>
                      <td className="px-3 py-2.5">{u.email ?? "-"}</td>
                      <td className="px-3 py-2.5 text-right">{fmtAsset(u.usdt ?? u.balance, "USDT")}</td>
                      <td className="px-3 py-2.5">{fmtManagedBy(u)}</td>
                      <td className="px-3 py-2.5 text-xs text-white/70">{fmtDateTime(u.created_at)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => void openDetail(u)}
                          className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                        >
                          {copy.details}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {activeOverviewUsers.length === 0 ? (
                    <tr>
                      <td className="px-3 py-5 text-sm text-white/60" colSpan={6}>
                        {copy.noUsersForCard}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}

          {activeOverviewCard === "MONTHLY_PERFORMANCE" && (
            <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[900px]">
                <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-white/60">
                  <tr>
                    <th className="px-3 py-2.5">{copy.user}</th>
                    <th className="px-3 py-2.5">{copy.email}</th>
                    <th className="px-3 py-2.5">{copy.asset}</th>
                    <th className="px-3 py-2.5 text-right">{copy.amount}</th>
                    <th className="px-3 py-2.5">{copy.status}</th>
                    <th className="px-3 py-2.5">{copy.date}</th>
                    <th className="px-3 py-2.5 text-right">{copy.history}</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyPerformanceRows.map((row) => {
                    const u = usersById.get(row.userId);
                    const userForDetail: UserRow = u ?? {
                      id: row.userId,
                      username: row.username ?? null,
                      email: row.email ?? null,
                    };
                    return (
                      <tr key={row.id} className="border-t border-white/10 text-sm">
                        <td className="px-3 py-2.5">{row.username || u?.username || "-"}</td>
                        <td className="px-3 py-2.5">{row.email || u?.email || "-"}</td>
                        <td className="px-3 py-2.5">{row.asset}</td>
                        <td className="px-3 py-2.5 text-right">{fmtAsset(row.amount, row.asset)}</td>
                        <td className="px-3 py-2.5">
                          <span className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-xs">
                            {row.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-white/70">{fmtDateTime(row.createdAt)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => void openDetail(userForDetail)}
                            className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {copy.details}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {monthlyPerformanceRows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-5 text-sm text-white/60" colSpan={7}>
                        {copy.noDepositInMonth(monthContext.label)}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}

          {activeOverviewCard === "MONTHLY_WITHDRAW" && (
            <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[900px]">
                <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-white/60">
                  <tr>
                    <th className="px-3 py-2.5">{copy.user}</th>
                    <th className="px-3 py-2.5">{copy.email}</th>
                    <th className="px-3 py-2.5">{copy.asset}</th>
                    <th className="px-3 py-2.5 text-right">{copy.amount}</th>
                    <th className="px-3 py-2.5">{copy.status}</th>
                    <th className="px-3 py-2.5">{copy.date}</th>
                    <th className="px-3 py-2.5 text-right">{copy.history}</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyWithdrawRows.map((row) => {
                    const u = usersById.get(row.userId);
                    const userForDetail: UserRow = u ?? {
                      id: row.userId,
                      username: row.username ?? null,
                      email: row.email ?? null,
                    };
                    return (
                      <tr key={row.id} className="border-t border-white/10 text-sm">
                        <td className="px-3 py-2.5">{row.username || u?.username || "-"}</td>
                        <td className="px-3 py-2.5">{row.email || u?.email || "-"}</td>
                        <td className="px-3 py-2.5">{row.asset}</td>
                        <td className="px-3 py-2.5 text-right">{fmtAsset(row.amount, row.asset)}</td>
                        <td className="px-3 py-2.5">
                          <span className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-xs">
                            {row.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-white/70">{fmtDateTime(row.createdAt)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => void openDetail(userForDetail)}
                            className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            {copy.details}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {monthlyWithdrawRows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-5 text-sm text-white/60" colSpan={7}>
                        {copy.noWithdrawInMonth(monthContext.label)}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="mb-2 text-sm font-semibold">{copy.chartTitle(monthContext.label)}</div>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-white/70">
            <span className="inline-flex items-center gap-2">
              <span className="h-0.5 w-6 bg-blue-400" />
              {copy.perfLegend}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-0.5 w-6 bg-red-400" />
              {copy.withdrawLegend}
            </span>
          </div>
          <div className="overflow-x-auto">
            <svg
              viewBox={`0 0 ${overviewChart.width} ${overviewChart.height}`}
              className="h-[280px] min-w-[820px] w-full"
              role="img"
              aria-label="Performance and withdraw line chart"
            >
              <rect x="0" y="0" width={overviewChart.width} height={overviewChart.height} fill="transparent" />

              {overviewChart.yTicks.map((tick) => {
                const y =
                  overviewChart.padTop +
                  overviewChart.innerHeight -
                  (tick / Math.max(overviewChart.yTicks[0], 1)) * overviewChart.innerHeight;
                return (
                  <g key={`ytick-${tick}`}>
                    <line
                      x1={overviewChart.padLeft}
                      x2={overviewChart.width - 16}
                      y1={y}
                      y2={y}
                      stroke="rgba(255,255,255,0.12)"
                      strokeDasharray="4 4"
                    />
                    <text x={8} y={y + 4} fill="rgba(255,255,255,0.6)" fontSize={11}>
                      {Math.round(tick).toLocaleString()}
                    </text>
                  </g>
                );
              })}

              {overviewChart.xTicks.map((tick) => (
                <text
                  key={`xtick-${tick.label}`}
                  x={tick.x}
                  y={overviewChart.height - 8}
                  fill="rgba(255,255,255,0.65)"
                  fontSize={11}
                  textAnchor="middle"
                >
                  {tick.label}
                </text>
              ))}

              <path
                d={overviewChart.performancePath}
                fill="none"
                stroke="rgb(59,130,246)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={overviewChart.withdrawPath}
                fill="none"
                stroke="rgb(248,113,113)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {detailModal}
      </div>
    );
  }

  if (tab === "users") {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="mb-4 text-xl font-semibold">{copy.usersTitle}</div>

        {loadingUsers ? <div className="text-white/60">{copy.loading}</div> : null}
        {usersErr ? <div className="text-red-400">{usersErr}</div> : null}
        {restrictionErr ? <div className="mb-3 text-sm text-red-300">{restrictionErr}</div> : null}
        {restrictionInfo ? <div className="mb-3 text-sm text-emerald-300">{restrictionInfo}</div> : null}
        {passwordResetErr ? <div className="mb-3 text-sm text-red-300">{passwordResetErr}</div> : null}
        {passwordResetInfo ? <div className="mb-3 text-sm text-emerald-300">{passwordResetInfo}</div> : null}
        {deleteUserErr ? <div className="mb-3 text-sm text-red-300">{deleteUserErr}</div> : null}
        {deleteUserInfo ? <div className="mb-3 text-sm text-emerald-300">{deleteUserInfo}</div> : null}

        {!loadingUsers && !usersErr && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px]">
              <thead>
                <tr className="text-left text-white/60">
                  <th className="py-3">{copy.username.toUpperCase()}</th>
                  <th className="py-3">{copy.email.toUpperCase()}</th>
                  <th className="py-3 text-right">{copy.balance.toUpperCase()}</th>
                  <th className="py-3 text-center">{copy.access.toUpperCase()}</th>
                  <th className="py-3 text-right">{copy.created.toUpperCase()}</th>
                  <th className="py-3 text-right">{copy.action.toUpperCase()}</th>
                </tr>
              </thead>
              <tbody>
                {usersForTable.map((u) => {
                  const restricted = isUserRestricted(u);
                  const isSaving = restrictionSavingUserId === u.id;
                  const isResetting = passwordResetSavingUserId === u.id;
                  const isDeleting = deleteUserSavingId === u.id;

                  return (
                    <tr key={u.id} className="border-t border-white/10">
                      <td className="py-3">{u.username ?? "-"}</td>
                      <td className="py-3">{u.email ?? "-"}</td>
                      <td className="py-3 text-right">{fmtAsset(u.usdt ?? u.balance, "USDT")}</td>
                      <td className="py-3 text-center">
                        <span
                          className={
                            "inline-flex rounded-full border px-3 py-1 text-xs font-semibold " +
                            (restricted
                              ? "border-rose-300/30 bg-rose-500/10 text-rose-200"
                              : "border-emerald-300/30 bg-emerald-500/10 text-emerald-200")
                          }
                        >
                          {restricted ? copy.restricted : copy.active}
                        </span>
                      </td>
                      <td className="py-3 text-right">{fmtDate(u.created_at)}</td>
                      <td className="py-3 pr-1 text-right">
                        <div className="inline-flex max-w-[280px] flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void openDetail(u)}
                            disabled={isSaving || isResetting || isDeleting}
                            className="rounded-full border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-white whitespace-nowrap disabled:opacity-60 hover:bg-white/10"
                          >
                            {copy.details}
                          </button>
                          <button
                            type="button"
                            onClick={() => void resetUserPassword(u)}
                            disabled={isResetting || isSaving || isDeleting}
                            className="rounded-full bg-blue-600 px-3 py-2 text-xs font-semibold text-white whitespace-nowrap disabled:opacity-60 hover:bg-blue-500"
                          >
                            {isResetting ? copy.resetting : copy.resetPassword}
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleUserRestriction(u)}
                            disabled={isSaving || isResetting || isDeleting}
                            className={
                              "rounded-full px-3 py-2 text-xs font-semibold text-white whitespace-nowrap disabled:opacity-60 " +
                              (restricted
                                ? "bg-emerald-600 hover:bg-emerald-500"
                                : "bg-rose-600 hover:bg-rose-500")
                            }
                          >
                            {isDeleting
                              ? copy.deleting
                              : isSaving
                                ? copy.saving
                                : restricted
                                  ? copy.unrestrict
                                  : copy.restrict}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {detailModal}
      </div>
    );
  }

  if (tab === "topups") {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="text-xl font-semibold">{copy.depositPermission}</div>
              <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-rose-500 px-2 py-0.5 text-xs font-semibold text-white">
                {pendingDepositCount}
              </span>
            </div>
            <div className="mt-1 text-sm text-white/60">
              {copy.depositPermissionDesc}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void reloadDepositRequests()}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
          >
            {depositRequestsLoading ? copy.refreshingRequests : copy.refreshRequests}
          </button>
        </div>
        <div className="mb-6 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-base font-semibold">{copy.depositWalletAddresses}</div>
          <div className="mt-1 text-sm text-white/60">
            {copy.depositWalletAddressesDesc}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {ASSETS.map((a) => (
              <label key={a} className="block">
                <div className="mb-1 text-xs text-white/60">{a === "SOL" ? "Solana (SOL)" : a}</div>
                <input
                  value={depositAddresses[a] || ""}
                  readOnly={!canEditDepositAddresses}
                  disabled={!canEditDepositAddresses}
                  onChange={(e) =>
                    setDepositAddresses((prev) => ({
                      ...prev,
                      [a]: e.target.value,
                    }))
                  }
                  placeholder={`${a} wallet address`}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-70"
                />
              </label>
            ))}
          </div>

          {!canEditDepositAddresses ? (
            <div className="mt-3 text-xs text-amber-200">{copy.readOnlyAddresses}</div>
          ) : null}
          {depositAddressErr ? <div className="mt-3 text-sm text-red-300">{depositAddressErr}</div> : null}
          {depositAddressInfo ? <div className="mt-3 text-sm text-emerald-300">{depositAddressInfo}</div> : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={depositAddressSaving || !canEditDepositAddresses}
              onClick={() => void saveDepositAddresses()}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {depositAddressSaving ? copy.saving : copy.saveAddresses}
            </button>
            <button
              type="button"
              onClick={() => void reloadDepositAddresses()}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
            >
              {depositAddressLoading ? copy.refreshingRequests : copy.refresh}
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold">{copy.queueTitle}</div>
              <div className="mt-1 text-xs text-white/60">
                {copy.queueDesc}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-white/60" htmlFor="topups-deposit-request-user-filter">
                {copy.user}
              </label>
              <select
                id="topups-deposit-request-user-filter"
                value={depositRequestUserFilter}
                onChange={(e) => setDepositRequestUserFilter(e.target.value)}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none"
              >
                <option value="ALL" className="bg-black">
                  {copy.allPending}
                </option>
                {requestUserOptions.map((opt) => (
                  <option key={opt.id} value={opt.id} className="bg-black">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredDepositRequests.length === 0 ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/60">
              {copy.noPendingForFilter}
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-white/55">
                    <th className="py-2">{copy.user}</th>
                    <th className="py-2">{copy.email}</th>
                    <th className="py-2">{copy.asset}</th>
                    <th className="py-2 text-right">{copy.amount}</th>
                    <th className="py-2">{copy.wallet}</th>
                    <th className="py-2">{copy.requested}</th>
                    <th className="py-2 pr-1 text-right">{copy.action}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDepositRequests.map((req) => {
                    const user = usersForTable.find((u) => u.id === req.userId);
                    const username = req.username || user?.username || "-";
                    const email = req.email || user?.email || "-";

                    return (
                      <tr key={req.id} className="border-t border-white/10 text-sm">
                        <td className="py-2">{username}</td>
                        <td className="py-2">{email}</td>
                        <td className="py-2">{req.asset}</td>
                        <td className="py-2 text-right">{fmtAsset(req.amount, req.asset)}</td>
                        <td className="max-w-[220px] py-2 text-xs text-white/70 break-all">{req.walletAddress}</td>
                        <td className="py-2 text-xs text-white/70">{fmtDateTime(req.createdAt)}</td>
                        <td className="py-2 pr-1 text-right">
                          <div className="inline-flex max-w-[220px] flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              disabled={depositRequestActionId === req.id}
                              onClick={() => void processDepositRequest(req.id, "APPROVE")}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white whitespace-nowrap disabled:opacity-60"
                            >
                              {depositRequestActionId === req.id ? copy.processing : copy.approve}
                            </button>
                            <button
                              type="button"
                              disabled={depositRequestActionId === req.id}
                              onClick={() => void processDepositRequest(req.id, "DECLINE")}
                              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white whitespace-nowrap disabled:opacity-60"
                            >
                              {depositRequestActionId === req.id ? copy.processing : copy.decline}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {loadingUsers ? <div className="text-white/60">{copy.loading}</div> : null}
        {usersErr ? <div className="text-red-400">{usersErr}</div> : null}
        {topupInfo ? <div className="mb-3 text-emerald-300">{topupInfo}</div> : null}
        {depositRequestsErr ? <div className="mb-3 text-red-300">{depositRequestsErr}</div> : null}
        {depositRequestsInfo ? <div className="mb-3 text-emerald-300">{depositRequestsInfo}</div> : null}

        {!loadingUsers && !usersErr && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px]">
                <thead>
                  <tr className="text-left text-white/60">
                    <th className="py-3">{copy.user.toUpperCase()}</th>
                    <th className="py-3">{copy.email.toUpperCase()}</th>
                    <th className="py-3 text-right">USDT</th>
                    <th className="py-3 text-right">BTC</th>
                    <th className="py-3 text-right">ETH</th>
                    <th className="py-3 text-right">SOL</th>
                    <th className="py-3 text-right">XRP</th>
                    <th className="py-3 pr-1 text-right">{copy.action.toUpperCase()}</th>
                  </tr>
                </thead>
                <tbody>
                  {usersForTable.map((u) => {
                    const pendingCount = pendingByUserId.get(u.id) ?? 0;
                    return (
                      <tr key={u.id} className="border-t border-white/10">
                        <td className="py-3">{u.username ?? "-"}</td>
                        <td className="py-3">{u.email ?? "-"}</td>
                        <td className="py-3 text-right">{fmtAsset(u.usdt ?? u.balance, "USDT")}</td>
                        <td className="py-3 text-right">{fmtAsset(u.btc, "BTC")}</td>
                        <td className="py-3 text-right">{fmtAsset(u.eth, "ETH")}</td>
                        <td className="py-3 text-right">{fmtAsset(u.sol, "SOL")}</td>
                        <td className="py-3 text-right">{fmtAsset(u.xrp, "XRP")}</td>
                        <td className="py-3 pr-1 text-right">
                          <div className="inline-flex max-w-[220px] flex-wrap items-center justify-end gap-2">
                            {pendingCount > 0 ? (
                              <button
                                type="button"
                                onClick={() => setDepositRequestUserFilter(u.id)}
                                className="rounded-full border border-rose-400/40 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-200 whitespace-nowrap"
                              >
                                {copy.requests} {pendingCount}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => openTopup(u)}
                              className="rounded-full bg-yellow-500 px-3 py-1.5 text-sm font-semibold text-black whitespace-nowrap"
                            >
                              {copy.more}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {topupOpen && selectedUser && (
              <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
                <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b0b0b] p-5">
                  <div className="text-lg font-semibold">{copy.userInformation}</div>
                  <div className="mt-1 text-sm text-white/60">
                    {copy.reviewUserInfo}
                  </div>

                  <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-white/60">{copy.username}</span>
                      <span className="text-white">{selectedUser.username ?? "-"}</span>
                    </div>
                    <div className="mt-1 flex justify-between gap-3">
                      <span className="text-white/60">{copy.email}</span>
                      <span className="text-white">{selectedUser.email ?? "-"}</span>
                    </div>
                    <div className="mt-1 flex justify-between gap-3">
                      <span className="text-white/60">USDT</span>
                      <span className="text-white">{fmtAsset(selectedUser.usdt ?? selectedUser.balance, "USDT")}</span>
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center justify-between rounded-lg border border-white/10 px-2 py-1">
                        <span className="text-white/50">BTC</span>
                        <span>{fmtAsset(selectedUser.btc, "BTC")}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-white/10 px-2 py-1">
                        <span className="text-white/50">ETH</span>
                        <span>{fmtAsset(selectedUser.eth, "ETH")}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-white/10 px-2 py-1">
                        <span className="text-white/50">SOL</span>
                        <span>{fmtAsset(selectedUser.sol, "SOL")}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-white/10 px-2 py-1">
                        <span className="text-white/50">XRP</span>
                        <span>{fmtAsset(selectedUser.xrp, "XRP")}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-2 text-sm font-semibold">
                      {topupMode === "SUBTRACT" ? copy.deductBalance : copy.topupBalance}
                    </div>
                    <div className="mb-2 text-xs text-white/60">{copy.actionLabel}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setTopupMode("ADD")}
                        className={
                          "rounded-xl px-4 py-2 text-sm font-semibold border " +
                          (topupMode === "ADD"
                            ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-200"
                            : "border-white/10 bg-black/30 text-white/70")
                        }
                      >
                        {copy.topup}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTopupMode("SUBTRACT")}
                        className={
                          "rounded-xl px-4 py-2 text-sm font-semibold border " +
                          (topupMode === "SUBTRACT"
                            ? "border-rose-400/50 bg-rose-500/20 text-rose-200"
                            : "border-white/10 bg-black/30 text-white/70")
                        }
                      >
                        {copy.deduct}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-2 text-xs text-white/60">{copy.asset}</div>
                    <select
                      value={asset}
                      onChange={(e) => setAsset(e.target.value as Asset)}
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
                    >
                      {ASSETS.map((a) => (
                        <option key={a} value={a} className="bg-black">
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>

                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={topupMode === "SUBTRACT" ? copy.amountToDeduct : copy.amountToTopup}
                    className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
                  />

                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={copy.noteOptional}
                    className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
                  />

                  {topupErr ? <div className="mt-3 text-sm text-red-300">{topupErr}</div> : null}

                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      onClick={closeTopup}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2"
                    >
                      {copy.cancel}
                    </button>
                    <button
                      disabled={topupLoading}
                      onClick={confirmTopup}
                      className={
                        "rounded-xl px-4 py-2 font-semibold disabled:opacity-60 " +
                        (topupMode === "SUBTRACT" ? "bg-rose-600" : "bg-blue-600")
                      }
                    >
                      {topupLoading
                        ? copy.processing
                        : topupMode === "SUBTRACT"
                          ? copy.confirmDeduct
                          : copy.confirmTopup}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  if (tab === "mining") {
    return <MiningPendingTable />;
  }

  if (tab === "orders") {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="mb-4 text-xl font-semibold">{copy.tradePermissions}</div>
        <div className="mb-4 text-sm text-white/60">
          {copy.tradePermissionDesc}
        </div>

        {permissionLoading ? <div className="text-white/60">{copy.loading}</div> : null}
        {permissionErr ? <div className="mb-3 text-red-400">{permissionErr}</div> : null}

        {!permissionLoading && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="text-left text-white/60">
                  <th className="py-3">{copy.user.toUpperCase()}</th>
                  <th className="py-3">{copy.email.toUpperCase()}</th>
                  <th className="py-3">{copy.session.toUpperCase()}</th>
                  <th className="py-3">{copy.permission.toUpperCase()}</th>
                  <th className="py-3 text-right">{copy.action.toUpperCase()}</th>
                </tr>
              </thead>
              <tbody>
                {permissionUsers.map((u) => (
                  <tr key={u.id} className="border-t border-white/10">
                    <td className="py-3">{u.username ?? "-"}</td>
                    <td className="py-3">
                      <div>{u.email ?? "-"}</div>
                      <div className="mt-1 text-xs text-white/45">
                        {permissionModeLabel(normalizePermissionMode(u.permissionMode), lang)}
                      </div>
                    </td>
                    <td className="py-3">
                      <span className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-white/80">
                        {permissionSessionLabel(normalizePermissionMode(u.permissionMode), lang)}
                      </span>
                    </td>
                    <td className="py-3">
                      <select
                        value={normalizePermissionMode(u.permissionMode)}
                        onChange={(e) => {
                          const mode = normalizePermissionMode(e.target.value);
                          setPermissionUsers((prev) =>
                            prev.map((x) => (x.id === u.id ? { ...x, permissionMode: mode } : x))
                          );
                        }}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500/30"
                      >
                        {PERMISSION_MODE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {permissionModeLabel(opt.value, lang)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        disabled={permissionSavingUserId === u.id}
                        onClick={() =>
                          void savePermission(u.id, normalizePermissionMode(u.permissionMode))
                        }
                        className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {permissionSavingUserId === u.id ? copy.saving : copy.save}
                      </button>
                    </td>
                  </tr>
                ))}
                {permissionUsers.length === 0 ? (
                  <tr>
                    <td className="py-6 text-white/60" colSpan={5}>
                      {copy.noUsersFound}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

        <button
          type="button"
          onClick={() => void reloadPermissionUsers()}
          className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
        >
          {copy.refreshPermissions}
        </button>
      </div>
    );
  }

  if (tab === "withdraw") {
    return <WithdrawRequestsPanel />;
  }

  if (tab === "notify") {
    return <NotifyPanel />;
  }

  if (tab === "support") {
    return <SupportChatPanel />;
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="text-white/60">{copy.unknownTab}</div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">Loading...</div>}>
      <AdminPageInner />
    </Suspense>
  );
}
