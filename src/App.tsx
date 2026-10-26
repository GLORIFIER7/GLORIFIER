import React, { useState, useEffect, Suspense } from 'react';
import { newId } from './lib/new-id';
import { Header } from './components/Header';
import { ModuleErrorBoundary } from './components/ModuleErrorBoundary';
import { OverviewTab } from './components/OverviewTab';
const FootprintManager = React.lazy(() => import('./components/FootprintManager').then((module) => ({ default: module.FootprintManager })));
const AiBrokerConsole = React.lazy(() => import('./components/AiBrokerConsole').then((module) => ({ default: module.AiBrokerConsole })));
const DataControlDashboard = React.lazy(() => import('./components/DataControlDashboard').then((module) => ({ default: module.DataControlDashboard })));
const AiCodeSentinelManagement = React.lazy(() => import('./components/AiCodeSentinelManagement').then((module) => ({ default: module.AiCodeSentinelManagement })));
const ComplianceScientistBot = React.lazy(() => import('./components/ComplianceScientistBot').then((module) => ({ default: module.ComplianceScientistBot })));
const IntegrationControl = React.lazy(() => import('./components/IntegrationControl').then((module) => ({ default: module.IntegrationControl })));
const AICeoControl = React.lazy(() => import('./components/AICeoControl').then((module) => ({ default: module.AICeoControl })));
const AiScientistFleetConsole = React.lazy(() => import('./components/AiScientistFleetConsole').then((module) => ({ default: module.AiScientistFleetConsole })));
const OpportunityDiscoveryDashboard = React.lazy(() => import('./components/OpportunityDiscoveryDashboard').then((module) => ({ default: module.OpportunityDiscoveryDashboard })));
const ConnectionAuthorizationDashboard = React.lazy(() => import('./components/ConnectionAuthorizationDashboard').then((module) => ({ default: module.ConnectionAuthorizationDashboard })));
const GeasArchitectureScientistDashboard = React.lazy(() => import('./components/GeasArchitectureScientistDashboard').then((module) => ({ default: module.GeasArchitectureScientistDashboard })));
const MobileDeviceControl = React.lazy(() => import('./components/MobileDeviceControl').then((module) => ({ default: module.MobileDeviceControl })));
const AgentMinerDashboard = React.lazy(() => import('./components/AgentMinerDashboard').then((module) => ({ default: module.AgentMinerDashboard })));
const AgentNetworkDashboard = React.lazy(() => import('./components/AgentNetworkDashboard').then((module) => ({ default: module.AgentNetworkDashboard })));

import { 
  initialStats, 
  initialFootprints, 
  initialBuyerOffers, 
  initialBrokerExposures, 
  initialTransactions, 
  defaultPolicy,
  initialInternetAccounts,
  initialSentinelErrors,
  initialSentinelState
} from './data/initialData';
import { initialActiveGrants, initialUsageTelemetry } from './data/grantsAndTelemetryData';
import { 
  DataFootprintSource, 
  PrivacyTier, 
  MonetizationPolicy, 
  BuyerOffer, 
  CompensationTransaction, 
  DataBrokerExposure,
  ActiveDataGrant,
  UsageTelemetryEvent,
  InternetAccount,
  CodeSentinelError,
  SentinelBotState
} from './types';
import type { User } from 'firebase/auth';
import type { Auth0BrowserPrincipal } from './lib/auth/auth0-browser';
type AppIdentity = Pick<User, 'uid' | 'email'> & { displayName: string | null };

export default function App() {
  const [currentUser, setCurrentUser] = useState<AppIdentity | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const validTabs = new Set(['overview','geas_architecture','ai_ceo','integrations','agent_network','discovery','sentinel','connections','scientists','agent_miner','compliance','control','footprints','broker','mobile']);
  const [stats, setStats] = useState(initialStats);
  const [footprints, setFootprints] = useState<DataFootprintSource[]>(initialFootprints);
  const [offers, setOffers] = useState<BuyerOffer[]>(initialBuyerOffers);
  const [exposures, setExposures] = useState<DataBrokerExposure[]>(initialBrokerExposures);
  const [transactions, setTransactions] = useState<CompensationTransaction[]>(initialTransactions);
  const [policy, setPolicy] = useState<MonetizationPolicy>(defaultPolicy);
  const [grants, setGrants] = useState<ActiveDataGrant[]>(initialActiveGrants);
  const [telemetryEvents, setTelemetryEvents] = useState<UsageTelemetryEvent[]>(initialUsageTelemetry);

  // Internet Accounts & 24/7 AI Code Sentinel States
  const [accounts, setAccounts] = useState<InternetAccount[]>(initialInternetAccounts);
  const [sentinelErrors, setSentinelErrors] = useState<CodeSentinelError[]>(initialSentinelErrors);
  const [sentinelState, setSentinelState] = useState<SentinelBotState>(initialSentinelState);

  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [inspectingFootprint, setInspectingFootprint] = useState<DataFootprintSource | null>(null);

  const persistAppState = async (state: Record<string, unknown>) => {
    if (!currentUser) return;
    try {
      await fetch('/api/app-state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state })
      });
    } catch (error) {
      console.error('Command Center state persistence failed:', error);
    }
  };

  // Load Firebase only after the first paint so the initial shell can render quickly.
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    void import('./lib/firebase').then(async (firebase) => {
      if (!active) return;
      void firebase.testFirestoreConnection();
      void firebase.completeAuth0RedirectSignIn().then((auth0User: Auth0BrowserPrincipal | null) => {
        if (active && auth0User) setCurrentUser(auth0User);
      }).catch((error) => {
        console.error('Auth0 redirect sign-in completion failed:', error);
      });
      void firebase.completeGoogleRedirectSignIn().catch((error) => {
        console.error('Google redirect sign-in completion failed:', error);
      });
      const { onAuthStateChanged } = await import('firebase/auth');
      if (!active) return;
      unsubscribe = onAuthStateChanged(firebase.auth, (user) => {
        if (user) setCurrentUser(user);
        else setCurrentUser(firebase.getAuth0Principal() ?? null);
      });
    }).catch((error) => {
      console.error('Firebase authentication initialization failed:', error);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Verify the complete authenticated frontend → API → Neon session path.
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    const verifySession = async () => {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.authenticated || !payload?.database?.connected) {
          throw new Error(payload?.error || 'Authenticated session verification failed');
        }
        if (!cancelled) {
          console.info('[GLORIFIER Auth] frontend → API → Neon session verified', {
            uid: payload.identity?.uid,
            database: payload.database?.databaseName,
            authority: payload.database?.authority
          });
        }
      } catch (error) {
        console.error('[GLORIFIER Auth] end-to-end session verification failed:', error);
      }
    };
    void verifySession();
    return () => { cancelled = true; };
  }, [currentUser]);

  // Load authoritative Command Center state from Railway/Neon after authentication.
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    const loadCommandCenterState = async () => {
      try {
        const response = await fetch('/api/app-state', { cache: 'no-store' });
        if (!response.ok) throw new Error('Unable to load Command Center state');
        const payload = await response.json();
        const remote = payload.state;
        if (cancelled || !remote) return;
        if (remote.policy) setPolicy(remote.policy);

        // Drop known seeded demo IDs that may remain in older persisted app-state snapshots.
        const sampleFootprintIds = new Set([
          'fp-browsing', 'fp-ecommerce', 'fp-developer', 'fp-health', 'fp-social',
          'fp-location', 'fp-financial', 'fp-gmail', 'fp-drive'
        ]);
        const sampleGrantIds = new Set(['grant-01', 'grant-02', 'grant-03', 'grant-04', 'grant-05']);
        const sampleTelemetryIds = new Set(['telemetry-901', 'telemetry-902', 'telemetry-903', 'telemetry-904', 'telemetry-905']);
        if (Array.isArray(remote.offers)) setOffers(remote.offers);
        if (Array.isArray(remote.grants)) setGrants(remote.grants.filter((item: any) => !sampleGrantIds.has(String(item?.id))));
        if (Array.isArray(remote.telemetryEvents)) setTelemetryEvents(remote.telemetryEvents.filter((item: any) => !sampleTelemetryIds.has(String(item?.id))));
        if (Array.isArray(remote.transactions)) setTransactions(remote.transactions);
        if (Array.isArray(remote.footprints)) setFootprints(remote.footprints.filter((item: any) => !sampleFootprintIds.has(String(item?.id))));
        if (Array.isArray(remote.exposures)) setExposures(remote.exposures);
        if (remote.sentinelState) {
          setSentinelState(prev => ({
            ...prev,
            ...remote.sentinelState,
            sentinelLogs: Array.isArray(remote.sentinelState.sentinelLogs)
              ? remote.sentinelState.sentinelLogs.filter((item: any) => !['log-srv-1', 'log-srv-2'].includes(String(item?.id)))
              : []
          }));
        }
        if (remote.stats) setStats(prev => ({ ...prev, ...remote.stats }));
      } catch (error) {
        console.error('Command Center state load failed:', error);
      }
    };
    void loadCommandCenterState();
    return () => { cancelled = true; };
  }, [currentUser]);

  // Load the Firestore compatibility layer only for an authenticated session.
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    let unsubPolicy = () => {};
    let unsubGrants = () => {};
    void import('./services/firestoreService').then((service) => {
      if (cancelled) return;
      unsubPolicy = service.subscribeToUserPolicy(currentUser.uid, (remotePolicy) => {
        if (remotePolicy) setPolicy(remotePolicy);
      });
      unsubGrants = service.subscribeToUserGrants(currentUser.uid, (remoteGrants) => {
        if (remoteGrants && remoteGrants.length) setGrants(remoteGrants);
      });
    }).catch((error) => console.error('Firestore compatibility subscription unavailable:', error));
    return () => {
      cancelled = true;
      unsubPolicy();
      unsubGrants();
    };
  }, [currentUser]);

  const recordGovernedAction = async (action: string, details: Record<string, unknown>, evidence: unknown[] = []) => {
    if (!currentUser) return null;
    try {
      const response = await fetch('/api/governed-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userReference: currentUser.uid,
          action,
          actor: 'human-owner',
          details,
          evidence
        })
      });
      if (!response.ok) throw new Error(`Governed action HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Governed action recording failed:', error);
      return null;
    }
  };

  // This control changes a local preference only; it does not connect a source or create revenue.
  const handleToggleFootprint = (id: string) => {
    const next = footprints.map(f => f.id === id
      ? { ...f, isMonetized: !f.isMonetized, status: 'configured-not-verified' as const }
      : f);
    const requestedEnabled = next.find(f => f.id === id)?.isMonetized === true;
    setFootprints(next);
    void persistAppState({ footprints: next });
    void recordGovernedAction('footprint-local-configuration-change', {
      footprintId: id,
      requestedEnabled,
      externalDataConnectionVerified: false,
      monetizationVerified: false,
    });
  };

  // Privacy selections are stored as configuration only; this UI does not transform source data.
  const handleUpdatePrivacyTier = (id: string, tier: PrivacyTier, epsilon: number) => {
    const next = footprints.map(f => f.id === id
      ? { ...f, privacyTier: tier, privacyEpsilon: epsilon, status: 'configured-not-verified' as const }
      : f);
    setFootprints(next);
    void persistAppState({ footprints: next });
    void recordGovernedAction('footprint-privacy-configuration-change', {
      footprintId: id,
      privacyTier: tier,
      epsilon,
      runtimeEnforcementVerified: false,
    });
  };

  // Save policy preferences without inventing a privacy score or revenue forecast.
  const handleUpdatePolicy = (newPolicy: Partial<MonetizationPolicy>) => {
    const updated = { ...policy, ...newPolicy };
    setPolicy(updated);
    if (currentUser) {
      void import('./services/firestoreService')
        .then(({ saveUserPolicy }) => saveUserPolicy(currentUser.uid, updated))
        .catch(console.error);
      void recordGovernedAction('monetization-policy-change', {
        policy: updated,
        privacyRuntimeEnforcementVerified: false,
        revenueForecastVerified: false,
      });
    }
  };

  // Accept offer. Use the state transition itself as the source of truth so a rapid click
  // cannot read a stale `offers` closure or increment pacing twice.
  const handleAcceptOffer = (offerId: string) => {
    setOffers(prev => {
      const accepted = prev.find(o => o.id === offerId);
      if (!accepted || accepted.status !== 'PENDING') return prev;
      const next = prev.map(o => o.id === offerId ? { ...o, status: 'ACCEPTED' as const } : o);
      void persistAppState({ offers: next });
      void recordGovernedAction('marketplace-offer-acceptance', {
        offerId,
        offeredCompUsd: accepted.offeredCompUsd,
        settlementStatus: 'not-settled'
      });
      return next;
    });
  };

  // Reject offer
  const handleRejectOffer = (offerId: string) => {
    setOffers(prev => {
      const next = prev.map(o => o.id === offerId ? { ...o, status: 'REJECTED' as const } : o);
      void persistAppState({ offers: next });
      return next;
    });
  };

  // Counter offer
  const handleCounterOffer = (offerId: string, counterAmount: number) => {
    setOffers(prev => {
      const next = prev.map(o => o.id === offerId ? { ...o, status: 'COUNTERED' as const, counterOfferAmount: counterAmount } : o);
      void persistAppState({ offers: next });
      return next;
    });
  };

  // External clawback delivery requires an authorized provider integration.
    // A payout success callback is only allowed to update state after an authoritative
  // payout provider has returned qualifying settlement evidence.
  const handleWithdrawSuccess = (amount: number, method: string, txHash: string) => {
    void recordGovernedAction('payout-request-created', {
      amount,
      method,
      txHash,
      note: 'A payout request was recorded; no external transfer or settlement was confirmed by this UI callback.'
    }, [{ type: 'external-reference', ref: txHash }]);
  };

  // Handle grant revocation
  const handleRevokeGrant = (grantId: string) => {
    setGrants(prev => {
      const next = prev.map(g => g.id === grantId ? { ...g, status: 'revoked' as const, ttlHoursRemaining: 0 } : g);
      void persistAppState({ grants: next });
      return next;
    });
    void recordGovernedAction('data-grant-revocation', { grantId });
  };

  // Handle grant permission update
  const handleUpdateGrantPermissions = (grantId: string, updatedFields: string[]) => {
    setGrants(prev => {
      const next = prev.map(g => g.id === grantId ? { ...g, sharedFields: updatedFields } : g);
      void persistAppState({ grants: next });
      void recordGovernedAction('data-grant-permission-change', { grantId, sharedFields: updatedFields });
      return next;
    });
  };

  // Telemetry must originate from an observed provider event, never from a UI simulator.
  // Settlement controls are evidence-first: UI actions never fabricate a payment.
  // Settlement is evidence-first; no UI action is exposed until an authorized settlement provider exists.

  // Batch clear settlement

  // Accounts handlers
  const handleUpdateAccount = (updated: InternetAccount) => {
    setAccounts(prev => prev.map(account => account.id === updated.id ? updated : account));
    void persistAppState({ accounts: accounts.map(account => account.id === updated.id ? updated : account) });
    void recordGovernedAction('internet-account-local-change', { accountId: updated.id, requestedState: updated });
  };

  const handleAuthenticateAllAccounts = async () => {
    try {
      const response = await fetch('/api/connections', { cache: 'no-store' });
      if (!response.ok) throw new Error('Connection registry unavailable');
      const registry = await response.json();
      const authorizedIds = new Set((registry.connections || []).filter((x: any) => x.status === 'authorized').map((x: any) => x.id));
      setAccounts(prev => prev.map(a => authorizedIds.has(a.id) ? ({ ...a, authStatus: 'authorized-in-registry-only', syncStatus: 'not-verified', lastAttestedAt: 'NOT VERIFIED — registry authorization is not a live account session' }) : a));
      void recordGovernedAction('account-authentication-sync', { authorizedConnectionIds: Array.from(authorizedIds) });
    } catch (error) {
      console.error('Account authentication sync failed:', error);
    }
  };

  // Sentinel Bot handlers (CRUD on errors)
  const handleUpdateSentinelError = async (updated: CodeSentinelError) => {
    setSentinelErrors(prev => prev.map(e => e.id === updated.id ? updated : e));
    try {
      await fetch('/api/sentinel/crud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', errorId: updated.id, errorData: updated })
      });
    } catch {}
  };

  const handleDeleteSentinelError = async (errorId: string) => {
    void recordGovernedAction('sentinel-error-delete', { errorId });
    setSentinelErrors(prev => prev.filter(e => e.id !== errorId));
    setSentinelState(prev => ({
      ...prev,
      sentinelLogs: [
        {
          id: newId('log'),
          timestamp: new Date().toLocaleTimeString(),
          action: 'DELETE',
          details: `Error [${errorId}] purged by user from active monitoring alerts.`,
          errorId,
          model: 'OpenAI GPT-4o'
        },
        ...prev.sentinelLogs
      ]
    }));
    try {
      await fetch('/api/sentinel/crud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', errorId })
      });
    } catch {}
  };

  const handleCreateSentinelError = async (newErr: CodeSentinelError) => {
    setSentinelErrors(prev => [newErr, ...prev]);
    setSentinelState(prev => ({
      ...prev,
      sentinelLogs: [
        {
          id: newId('log'),
          timestamp: new Date().toLocaleTimeString(),
          action: 'DETECT',
          details: `Diagnostic watch probe created: ${newErr.code} (${newErr.source}).`,
          errorId: newErr.id,
          model: newErr.assignedBot
        },
        ...prev.sentinelLogs
      ]
    }));
    try {
      await fetch('/api/sentinel/crud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', errorData: newErr })
      });
    } catch {}
  };

  const handleAutoFixSentinelError = async (errorId: string) => {
    const response = await fetch('/api/sentinel/crud', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'autofix', errorId, assignedBot: 'Dual-Consensus-Healer' })
    });
    const data = await response.json().catch(() => ({}));
    void recordGovernedAction('sentinel-autofix-request', {
      errorId,
      status: data.status || 'pending_authorization',
      executed: data.executed === true
    });
    if (!data.executed) return;
    setSentinelErrors(prev => prev.map(e => e.id === errorId ? {
      ...e,
      status: 'resolved',
      autoFixedAt: new Date().toISOString()
    } : e));
  };

  const pendingOffersCount = offers.filter(o => o.status === 'PENDING').length;

  useEffect(() => {
    if (!validTabs.has(activeTab)) setActiveTab('overview');
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Platform Navigation Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingOffersCount={pendingOffersCount}
        currentUser={currentUser}
      />

      <aside role="status" aria-label="Evidence and sample-data notice" className="mx-auto mt-3 w-[calc(100%-2rem)] max-w-7xl rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-100">
        <strong>Evidence notice:</strong> Some modules start with local sample values. Treat account, AI-provider, balance, revenue, and external-connection status as <strong>NOT VERIFIED</strong> unless the relevant panel shows a successful server-backed check. A displayed estimate or sample value is not proof of a real transaction or earning.
      </aside>

      {/* Main View Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <ModuleErrorBoundary key={activeTab}>
        <Suspense fallback={<div role="status" className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">Loading module… live service status has not been checked by this loading state.</div>}>
        {activeTab === 'overview' && (
          <OverviewTab
            stats={stats}
            footprints={footprints}
            policy={policy}
            onUpdatePolicy={handleUpdatePolicy}
            onToggleFootprint={handleToggleFootprint}
            onNavigateToTab={setActiveTab}
            transactions={transactions}
          />
        )}
        {activeTab === 'geas_architecture' && <GeasArchitectureScientistDashboard />}
        {activeTab === 'ai_ceo' && <AICeoControl />}
        {activeTab === 'integrations' && <IntegrationControl />}
        {activeTab === 'agent_network' && <AgentNetworkDashboard />}
        {activeTab === 'discovery' && <OpportunityDiscoveryDashboard />}
        {activeTab === 'sentinel' && (
          <AiCodeSentinelManagement
            errors={sentinelErrors}
            sentinelState={sentinelState}
            onUpdateError={handleUpdateSentinelError}
            onDeleteError={handleDeleteSentinelError}
            onCreateError={handleCreateSentinelError}
            onAutoFixError={handleAutoFixSentinelError}
            onToggleMonitoring={(enabled) => setSentinelState(s => ({ ...s, isMonitoringActive: enabled }))}
            onToggleAutoHeal={(enabled) => setSentinelState(s => ({ ...s, autoHealEnabled: enabled }))}
          />
        )}
        {activeTab === 'connections' && <ConnectionAuthorizationDashboard />}
        {activeTab === 'mobile' && <MobileDeviceControl />}
        {activeTab === 'scientists' && <AiScientistFleetConsole />}
        {activeTab === 'agent_miner' && <AgentMinerDashboard />}
        {activeTab === 'compliance' && (
          <ComplianceScientistBot
            policy={policy}
            footprints={footprints}
            exposures={exposures}
            onOpenClawbackTab={() => setActiveTab('broker')}
            onOpenGptCoWorkTab={() => setActiveTab('ai_ceo')}
          />
        )}
        {activeTab === 'control' && (
          <DataControlDashboard
            grants={grants}
            onRevokeGrant={handleRevokeGrant}
            onUpdateGrantPermissions={handleUpdateGrantPermissions}
          />
        )}
        {activeTab === 'footprints' && (
          <FootprintManager
            footprints={footprints}
            onToggleMonetization={handleToggleFootprint}
            onUpdatePrivacyTier={handleUpdatePrivacyTier}
            onInspectDataSamples={() => undefined}
          />
        )}
        {activeTab === 'broker' && (
          <AiBrokerConsole
            policy={policy}
            onUpdatePolicy={handleUpdatePolicy}
            footprints={footprints}
          />
        )}
        </Suspense>
        </ModuleErrorBoundary>
      </main>
      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/60 py-5 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col items-center justify-between gap-3">
          <div className="flex flex-col items-center gap-1">
            <strong className="text-slate-200">GLORIFIER Services Advertising Company</strong>
            <span>Committed to Glorify, Passion to Evangelize</span>
            <span className="text-[11px]">Purpose • Stewardship • Service • Integrity</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-mono text-[11px]">
            <span>ZK attestation: NOT VERIFIED</span>
            <span>Privacy policy target ε={policy.globalEpsilon} (runtime enforcement not verified)</span>
            <span>CCPA / GDPR compliance: NOT VERIFIED by this interface</span>
          </div>
          <span className="text-[11px]">© 2026 GLORIFIER Services Advertising Company</span>
        </div>
      </footer>
    </div>
  );
}
