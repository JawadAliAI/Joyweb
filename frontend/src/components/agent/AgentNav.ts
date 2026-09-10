/**
 * Agent back-office navigation.
 *
 * Mirrors the reference panel's five menu groups, in English.
 *
 * Two of the reference's order screens are deliberately absent: this platform
 * settles fixed-duration positions only, so it has no contract or block order
 * book to list.
 */
import {
  Activity, ArrowDownToLine, ArrowUpFromLine, BadgeCheck, KeyRound,
  LayoutDashboard, ListOrdered, Settings, UserCog, Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface AgentNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface AgentNavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: AgentNavItem[];
}

export const AGENT_NAV: AgentNavGroup[] = [
  {
    id: 'home',
    label: 'Home',
    icon: LayoutDashboard,
    items: [
      { href: '/agent', label: 'Console', icon: LayoutDashboard },
    ],
  },
  {
    id: 'users',
    label: 'Users',
    icon: Users,
    items: [
      { href: '/agent/members', label: 'Members', icon: Users },
      { href: '/agent/verification', label: 'Verification', icon: BadgeCheck },
      { href: '/agent/sub-agents', label: 'Sub-agents', icon: UserCog },
    ],
  },
  {
    id: 'orders',
    label: 'Orders',
    icon: ListOrdered,
    items: [
      { href: '/agent/live', label: 'Live positions', icon: Activity },
      { href: '/agent/orders', label: 'Delivery orders', icon: ListOrdered },
    ],
  },
  {
    id: 'funds',
    label: 'Funds',
    icon: ArrowDownToLine,
    items: [
      { href: '/agent/deposits', label: 'Deposits', icon: ArrowDownToLine },
      { href: '/agent/withdrawals', label: 'Withdrawals', icon: ArrowUpFromLine },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    items: [
      { href: '/agent/password', label: 'Change password', icon: KeyRound },
      { href: '/agent/profile', label: 'Profile', icon: UserCog },
    ],
  },
];

/** Flat lookup, used by the tab strip to name a route. */
export const AGENT_ROUTES: AgentNavItem[] = AGENT_NAV.flatMap((group) => group.items);

export function agentRoute(href: string): AgentNavItem | undefined {
  return AGENT_ROUTES.find((item) => item.href === href);
}
