/**
 * Agent back office.
 *
 * A third area beside the customer app and `/admin`, sharing the session
 * cookie and API client but wearing the light layui theme from
 * `globals.css`.
 */
import type { ReactNode } from 'react';
import { AgentShell } from '@/components/agent/AgentShell';

export default function AgentLayout({ children }: { children: ReactNode }) {
  return <AgentShell>{children}</AgentShell>;
}
