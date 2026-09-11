'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type AdminLanguage = 'en' | 'zh';

const ZH_DICTIONARY: Record<string, string> = {
  // Navigation items
  'Dashboard': '控制面板',
  'Users': '用户管理',
  'KYC Verification': '实名认证审核',
  'Invites': '邀请管理',
  'Markets': '交易市场',
  'Live Positions': '实时持仓',
  'Outcomes & Payments': '结算与打款',
  'Demo Trading': '交易设置',
  'Trading': '交易监控',
  'Demo Wallets': '钱包资产',
  'Wallets': '钱包管理',
  'Withdrawals': '出金审核',
  'Transfers': '内部划转',
  'Transactions': '资金流水',
  'Credit Scores': '信用评级',
  'Support': '客服工单',
  'Audit Logs': '操作日志',
  'Settings': '系统设置',
  'Agent portal': '代理后台',
  'Logout': '退出登录',
  'Administration': '管理后台',

  // Roles
  'Super admin': '超级管理员',
  'SUPER_ADMIN': '超级管理员',
  'Admin': '管理员',
  'ADMIN': '管理员',
  'Agent': '代理人',
  'AGENT': '代理人',
  'USER': '普通用户',

  // Page Titles & Descriptions
  'Demo accounts and their simulated balances': '用户账户列表及余额资产管理',
  'Withdrawal requests': '提币申请审核与出金处理',
  'Simulated withdrawal requests — no blockchain transfer is involved': '提币申请审核与出金处理',
  'Simulated withdrawal requests – no blockchain transfer is involved': '提币申请审核与出金处理',
  'Platform activity at a glance': '全站运营数据与关键指标概览',
  'Simulated platform activity at a glance': '全站运营数据与关键指标概览',
  'Tradable pairs offered on the demo trade screen': '行情币对及交易参数设置',
  'Duration and payout options for the trade screen': '秒合约交割周期与收益率结算规则配置',
  'Duration and payout options for the simulated trade screen': '秒合约交割周期与收益率结算规则配置',
  'Single-use registration links — registration is invitation-only': '注册邀请码与专属注册链接管理',
  'Single-use registration links – registration is invitation-only': '注册邀请码与专属注册链接管理',
  'Customer tickets and staff replies': '用户工单与客服交流处理',
  'Every audited administrative action': '管理员操作安全审计记录',
  'Runtime configuration for the simulator': '系统基础参数与偏好配置',
  'Internal demo account score changes': '用户信用分调整与评级记录',
  'Every balance movement on the platform': '全站资金变动明细与账单',
  'Every simulated balance movement on the platform': '全站资金变动明细与账单',
  'Transfers between accounts': '站内账户间资金划转记录',
  'Simulated transfers between demo accounts': '站内账户间资金划转记录',
  'Balances per customer': '各币种钱包余额与资产统计',
  'Simulated balances per customer': '各币种钱包余额与资产统计',
  'Live positions (Delivery orders)': '实时持仓与交割合约订单监控',

  // Dashboard Metrics & Cards
  'Total users': '用户总数',
  'Active users': '活跃用户',
  'Frozen users': '已冻结用户',
  'Total demo balances': '全站总资产',
  'Demo trades today': '今日订单数',
  'Demo trade volume': '今日交易量',
  'Pending demo withdrawals': '待审核出金',
  'Open tickets': '待处理工单',
  'User registrations': '用户注册趋势',
  'New demo accounts per day': '每日新增注册用户数',
  'Demo trading volume': '交易量走势',
  'Stake placed per day': '每日订单交易金额走势',
  'Simulated stake placed per day': '每日订单交易金额走势',
  'Demo deposits': '入金充值趋势',
  'Deposits per day': '每日入金到账金额走势',
  'Simulated deposits per day': '每日入金到账金额走势',
  'Demo withdrawals': '出金提币趋势',
  'Withdrawals per day': '每日出金提币金额走势',
  'Simulated withdrawals per day — no blockchain transfer is involved': '每日出金提币金额走势',
  'Demo balances by asset': '各币种资产分布',
  'Units held across every customer wallet': '平台用户各币种钱包资产汇总',
  'Simulated units held across every customer wallet': '平台用户各币种钱包资产汇总',
  'No simulated balances yet.': '暂无资产数据。',
  'Could not load the dashboard': '无法加载控制面板数据',

  // Common Table Headers and Labels
  'Asset': '币种',
  'Available': '可用余额',
  'Locked': '冻结金额',
  'Total': '总计',
  'User': '用户',
  'Email': '邮箱',
  'Phone': '手机号',
  'Amount': '金额',
  'Currency': '币种',
  'Address': '钱包地址',
  'Date': '时间',
  'Created': '创建时间',
  'Balance': '账户余额',
  'Status': '状态',
  'Role': '角色',
  'Action': '操作',
  'Actions': '操作',
  'View': '查看',
  'Details': '详情',
  'Edit': '编辑',
  'Delete': '删除',
  'Save': '保存',
  'Cancel': '取消',
  'Confirm': '确认',
  'Approve': '审核通过',
  'Reject': '拒绝申请',
  'Submit': '提交',
  'Filter': '筛选',
  'Search': '搜索',
  'All': '全部',
  'All statuses': '全部状态',
  'Active': '正常',
  'Frozen': '已冻结',
  'Suspended': '已停用',
  'PENDING': '待审核',
  'APPROVED': '已通过',
  'REJECTED': '已拒绝',
  'SUCCESS': '成功',
  'FAILED': '失败',
  'COMPLETED': '已完成',
  'PROCESSING': '处理中',

  // Pagination & States
  'Previous': '上一页',
  'Next': '下一页',
  'Nothing to show': '暂无数据',
  'Could not load this data': '无法加载数据',
  'Please try again.': '请重试。',
  'Administrator access only': '仅限管理员访问',
  'Open navigation': '打开菜单',
  'Close navigation': '关闭菜单',
  'Loading administration': '正在加载管理后台...',
  'Loading table data': '正在加载表格数据...',
  'Win': '盈利 (Win)',
  'Loss': '亏损 (Loss)',
  'Draw': '平局 (Draw)',
  'WIN': '盈利 (Win)',
  'LOSS': '亏损 (Loss)',
  'DRAW': '平局 (Draw)',
  'Reason (required)': '处理原因（必填）',
  'A reason is required.': '请输入原因。',
  'Explain why this action is being taken.': '请输入执行此操作的说明或审核备注。',

  // KYC Verification
  'Review and approve customer identity verification submissions': '审核与处理用户实名身份认证申请',
  'Pending Review': '待审核',
  'All Submissions': '全部提交',
  'Basic': '基础认证',
  'Advanced': '高级认证',
  'BASIC': '基础认证',
  'ADVANCED': '高级认证',
  'Level': '认证级别',
  'Full legal name': '真实姓名',
  'Document Type & Number': '证件类型与号码',
  'Documents': '证件材料',
  'Submitted At': '提交时间',
  'Approve KYC': '通过认证',
  'Reject KYC': '拒绝认证',
  'Front': '正面',
  'Back': '背面',
  'Open original full size': '查看原图',
  'Applicant': '申请人',
  'Approval Note (Required)': '审核通过备注（必填）',
  'Rejection Reason (Required)': '拒绝原因说明（必填）',
};

interface AdminLanguageContextValue {
  lang: AdminLanguage;
  setLang: (lang: AdminLanguage) => void;
  t: (key: string, fallback?: string) => string;
}

const AdminLanguageContext = createContext<AdminLanguageContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (key, fallback) => fallback ?? key,
});

const STORAGE_KEY = 'cpt_admin_lang';

export function AdminLanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AdminLanguage>('en');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as AdminLanguage | null;
      if (saved === 'en' || saved === 'zh') {
        setLangState(saved);
      }
    } catch {
      // Ignore local storage error
    }
  }, []);

  const setLang = (nextLang: AdminLanguage) => {
    setLangState(nextLang);
    try {
      localStorage.setItem(STORAGE_KEY, nextLang);
    } catch {
      // Ignore local storage error
    }
  };

  const t = useMemo(() => {
    return (key: string, fallback?: string): string => {
      if (lang !== 'zh') {
        return fallback ?? key;
      }
      if (!key) return '';
      // Direct lookup
      if (ZH_DICTIONARY[key]) return ZH_DICTIONARY[key];
      // Trimmed lookup
      const trimmed = key.trim();
      if (ZH_DICTIONARY[trimmed]) return ZH_DICTIONARY[trimmed];
      return fallback ?? key;
    };
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, t]);

  return (
    <AdminLanguageContext.Provider value={value}>
      {children}
    </AdminLanguageContext.Provider>
  );
}

export function useAdminLanguage() {
  return useContext(AdminLanguageContext);
}

export const useAdminLang = useAdminLanguage;
