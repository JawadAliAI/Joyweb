'use client';

/**
 * Which reseller's book the panel is showing.
 *
 * The panel is administrator-only, and an administrator has no downline of
 * their own, so the agent is chosen rather than inferred from the session. The
 * choice lives here and every screen reads it, so no screen can accidentally
 * query unscoped — and the API answers empty rather than platform-wide when the
 * parameter is missing, so a bug here shows as no data instead of the wrong
 * data.
 *
 * The selection is remembered per browser so a refresh does not drop you back
 * to "nobody selected".
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

const STORAGE_KEY = 'cd:agent-scope';

export interface AgentDirectoryEntry {
  id: string;
  username: string;
  email: string;
  fullName: string;
  memberCount: number;
}

interface ScopeState {
  agentId: string;
  setAgentId: (id: string) => void;
  agents: AgentDirectoryEntry[];
  current: AgentDirectoryEntry | null;
  isLoading: boolean;
  /** Query params to spread into any scoped request. */
  params: { agentId?: string };
}

const ScopeContext = createContext<ScopeState>({
  agentId: '',
  setAgentId: () => {},
  agents: [],
  current: null,
  isLoading: false,
  params: {},
});

export function AgentScopeProvider({ children }: { children: ReactNode }) {
  const [agentId, setAgentIdState] = useState('');

  const directory = useQuery({
    queryKey: ['agent', 'directory'],
    queryFn: () => api.get<{ items: AgentDirectoryEntry[] }>('/agent/directory'),
    staleTime: 60_000,
  });

  const agents = useMemo(() => directory.data?.items ?? [], [directory.data]);

  // Restore the last choice, then fall back to the first agent that has
  // members — landing on an empty book looks like a broken panel.
  useEffect(() => {
    if (agentId || agents.length === 0) return;
    let stored = '';
    try {
      stored = window.localStorage.getItem(STORAGE_KEY) ?? '';
    } catch {
      /* storage unavailable — fall through to the default */
    }
    const remembered = agents.find((agent) => agent.id === stored);
    const populated = agents.find((agent) => agent.memberCount > 0);
    setAgentIdState((remembered ?? populated ?? agents[0]).id);
  }, [agentId, agents]);

  const setAgentId = useCallback((id: string) => {
    setAgentIdState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* a forgotten choice is a small cost; never break the panel over it */
    }
  }, []);

  const value = useMemo<ScopeState>(
    () => ({
      agentId,
      setAgentId,
      agents,
      current: agents.find((agent) => agent.id === agentId) ?? null,
      isLoading: directory.isLoading,
      params: agentId ? { agentId } : {},
    }),
    [agentId, setAgentId, agents, directory.isLoading],
  );

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useAgentScope() {
  return useContext(ScopeContext);
}
