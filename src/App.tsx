import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { OverviewTab } from './components/OverviewTab';
import { FootprintManager } from './components/FootprintManager';
import { AiBrokerConsole } from './components/AiBrokerConsole';
import { MarketplaceOffers } from './components/MarketplaceOffers';
import { BrokerExposureAudit } from './components/BrokerExposureAudit';
import { WithdrawModal } from './components/WithdrawModal';
import { DataSampleModal } from './components/DataSampleModal';
import { CompensationEngine } from './components/CompensationEngine';
import { PrivacyTechLab } from './components/PrivacyTechLab';
import { DataControlDashboard } from './components/DataControlDashboard';
import { GmailGovernanceTab } from './components/GmailGovernanceTab';
import { DriveGovernanceTab } from './components/DriveGovernanceTab';
import { AiModelsCollaborationManagement } from './components/AiModelsCollaborationManagement';
import { AiCodeSentinelManagement } from './components/AiCodeSentinelManagement';
import { InternetAccountsFederation } from './components/InternetAccountsFederation';
import { PatentDisclosureDossier } from './components/PatentDisclosureDossier';
import { ComplianceScientistBot } from './components/ComplianceScientistBot';
import { WorkTogetherWithGptStudio } from './components/WorkTogetherWithGptStudio';
import { IndependentComputeLayer } from './components/IndependentComputeLayer';
import { IntegrationControl } from './components/IntegrationControl';
import { AICeoControl } from './components/AICeoControl';
import { AiScientistFleetConsole } from './components/AiScientistFleetConsole';
import { MediatorDashboard } from './components/MediatorDashboard';
import { OpportunityDiscoveryDashboard } from './components/OpportunityDiscoveryDashboard';
import { RevenueVerifiedDashboard } from './components/RevenueVerifiedDashboard';
import { ConnectionAuthorizationDashboard } from './components/ConnectionAuthorizationDashboard';
import { GlobalCollaborationDashboard } from './components/GlobalCollaborationDashboard';
import { MonetizationSprint } from './components/MonetizationSprint';

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
import { 
  auth, 
  loginWithGoogle, 
  completeGoogleRedirectSignIn, 
  logout, 
  testFirestoreConnection 
} from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  saveUserPolicy, 
  saveActiveGrant, 
  recordTelemetryEvent, 
  subscribeToUserPolicy, 
  subscribeToUserGrants 
} from './services/firestoreService';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');
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

  // Initialize Firebase Auth listener and test Firestore connection
  useEffect(() => {
    testFirestoreConnection();

    // Complete Google OAuth redirect sign-in after Firebase returns to the app.
    // This is required for mobile browsers and popup-restricted environments.
    completeGoogleRedirectSignIn().catch((error) => {
      console.error('Google redirect sign-in completion failed:', error);
    });

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });

    return () => unsubscribe();
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
        if (Array.isArray(remote.offers) && remote.offers.length) setOffers(remote.offers);
        if (Array.isArray(remote.grants) && remote.grants.length) setGrants(remote.grants);
        if (Array.isArray(remote.telemetryEvents)) setTelemetryEvents(remote.telemetryEvents);
        if (Array.isArray(remote.transactions)) setTransactions(remote.transactions);
        if (Array.isArray(remote.footprints) && remote.footprints.length) setFootprints(remote.footprints);
        if (Array.isArray(remote.exposures)) setExposures(remote.exposures);
        if (remote.sentinelState) setSentinelState(prev => ({ ...prev, ...remote.sentinelState }));
        if (remote.stats) setStats(prev => ({ ...prev, ...remote.stats }));
      } catch (error) {
        console.error('Command Center state load failed:', error);
      }
    };
    void loadCommandCenterState();
    return () => { cancelled = true; };
  }, [currentUser]);

  // Keep the existing Firestore policy/grant compatibility layer, but no longer treat
  // local React state as the authoritative Command Center store.
  useEffect(() => {
    if (!currentUser) return;
    const unsubPolicy = subscribeToUserPolicy(currentUser.uid, (remotePolicy) => {
      if (remotePolicy) setPolicy(remotePolicy);
    });
    const unsubGrants = subscribeToUserGrants(currentUser.uid, (remoteGrants) => {
      if (remoteGrants && remoteGrants.length) setGrants(remoteGrants);
    });
    return () => { unsubPolicy(); unsubGrants(); };
  }, [currentUser]);

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (err) {
      console.error('Login error:', err);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

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

  const recordEstimatedOpportunity = async (action: string, amountUsd: number, description: string) => {
    const result = await recordGovernedAction(action, {
      description,
      estimatedAmountUsd: amountUsd,
      economicTruth: { verified: false, estimatesAreNotRevenue: true }
    });
    return result;
  };

  // Toggle footprint monetization
  const handleToggleFootprint = (id: string) => {
    setFootprints(prev => {
      const next = prev.map(f => {
        if (f.id === id) {
          const willMonetize = !f.isMonetized;
          return {
            ...f,
            isMonetized: willMonetize,
            status: willMonetize ? ('active-monetizing' as const) : ('shielded-private' as const),
            userMonthlyCompUsd: willMonetize ? Math.round(f.marketMonthlyValueUsd * 0.8) : 0
          };
        }
        return f;
      });

      // Recalculate stats
      const activeCount = next.filter(f => f.isMonetized).length;
      const totalComp = next.filter(f => f.isMonetized).reduce((sum, f) => sum + f.userMonthlyCompUsd, 0);
      setStats(s => ({
        ...s,
        activeDataStreamsCount: activeCount,
        monthlyPacingUsd: totalComp
      }));
      void persistAppState({ footprints: next });
      void recordGovernedAction('footprint-monetization-policy-change', { footprintId: id, enabled: next.find(f => f.id === id)?.isMonetized === true });

      return next;
    });
  };

  // Update privacy tier & epsilon
  const handleUpdatePrivacyTier = (id: string, tier: PrivacyTier, epsilon: number) => {
    setFootprints(prev => {
      const next = prev.map(f => {
        if (f.id === id) {
          const multiplier = epsilon < 0.25 ? 0.65 : epsilon < 0.6 ? 0.8 : 0.95;
          const adjustedComp = f.isMonetized ? Math.round(f.marketMonthlyValueUsd * multiplier) : 0;
          return { ...f, privacyTier: tier, privacyEpsilon: epsilon, userMonthlyCompUsd: adjustedComp };
        }
        return f;
      });
      void persistAppState({ footprints: next });
      void recordGovernedAction('footprint-privacy-policy-change', { footprintId: id, privacyTier: tier, epsilon });
      return next;
    });
  };

  // Update policy with dynamic shield calculation
  const handleUpdatePolicy = (newPolicy: Partial<MonetizationPolicy>) => {
    setPolicy(prev => {
      const updated = { ...prev, ...newPolicy };
      
      // Calculate dynamic privacy shield score based on policy protections
      let baseShield = 91;
      if (updated.brokerMode === 'strict-sovereign') {
        baseShield = 95;
      } else if (updated.brokerMode === 'balanced-protective') {
        baseShield = 91;
      } else {
        baseShield = 84;
      }

      // Epsilon strength factor (lower epsilon = more noise = stronger mathematical shield)
      if (updated.globalEpsilon <= 0.15) {
        baseShield += 2;
      } else if (updated.globalEpsilon <= 0.35) {
        baseShield += 1;
      } else if (updated.globalEpsilon >= 0.60) {
        baseShield -= 2;
      }

      // Protective constraints
      if (!updated.allowAdTargeting) baseShield += 1;
      if (!updated.allowInsuranceRiskProfiling) baseShield += 1;
      if (!updated.allowAiModelPretraining) baseShield += 1;

      const finalShield = Math.min(100, Math.max(50, baseShield));

      // Calculate estimated pacing
      let pacing = 215.30;
      if (updated.brokerMode === 'autonomous-maximize') {
        pacing = 382.40;
      } else if (updated.brokerMode === 'strict-sovereign') {
        pacing = 145.00;
      }

      setStats(s => ({ 
        ...s, 
        monthlyPacingUsd: pacing, 
        privacyShieldIndex: finalShield 
      }));

      if (currentUser) {
        saveUserPolicy(currentUser.uid, updated).catch(console.error);
        void recordGovernedAction('monetization-policy-change', { policy: updated });
      }

      return updated;
    });
  };

  // Accept offer
  const handleAcceptOffer = (offerId: string) => {
    setOffers(prev => {
      const next = prev.map(o => o.id === offerId ? { ...o, status: 'ACCEPTED' as const } : o);
      void persistAppState({ offers: next });
      return next;
    });

    const accepted = offers.find(o => o.id === offerId);
    if (accepted) {
      // Acceptance is not settlement. Keep it in pipeline state until external acceptance
      // and qualifying payment evidence are observed by the authoritative revenue system.
      setStats(s => ({
        ...s,
        monthlyPacingUsd: s.monthlyPacingUsd + accepted.offeredCompUsd
      }));
    }
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
  const handleDispatchClawback = (expId: string) => {
    void recordGovernedAction('statutory-clawback-request', {
      exposureId: expId,
      executionStatus: 'pending_authorized_integration'
    });
  };

  // A payout success callback is only allowed to update state after an authoritative
  // payout provider has returned qualifying settlement evidence.
  const handleWithdrawSuccess = (amount: number, method: string, txHash: string) => {
    void recordGovernedAction('payout-settlement-callback', {
      amount,
      method,
      txHash,
      note: 'UI callback recorded for audit; authoritative payout ledger remains source of truth.'
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
  const handleTriggerSimulatedUsage = async (model: 'Per-Query' | 'Data Shapley' | 'Cohort Subscription' | 'Proof Attestation') => {
    await recordGovernedAction('telemetry-simulation-blocked', {
      model,
      reason: 'Synthetic usage events cannot create earnings or settlement records.'
    });
  };

  // Settlement controls are evidence-first: UI actions never fabricate a payment.
  const handleClearSettlement = async () => {
    await recordGovernedAction('settlement-clear-request', {
      requestedAmountUsd: stats.pendingSettlementUsd,
      executionStatus: 'pending_authorized_settlement',
      reason: 'Settlement can only be cleared after qualifying external payment evidence is recorded.'
    });
  };

  // Batch clear settlement

  // Accounts handlers
  const handleUpdateAccount = (updated: InternetAccount) => {
    void recordGovernedAction('internet-account-local-change', { accountId: updated.id, requestedState: updated });
  };

  const handleAuthenticateAllAccounts = async () => {
    try {
      const response = await fetch('/api/connections', { cache: 'no-store' });
      if (!response.ok) throw new Error('Connection registry unavailable');
      const registry = await response.json();
      const authorizedIds = new Set((registry.connections || []).filter((x: any) => x.status === 'authorized').map((x: any) => x.id));
      setAccounts(prev => prev.map(a => authorizedIds.has(a.id) ? ({ ...a, authStatus: 'authenticated', syncStatus: 'synced', lastAttestedAt: 'Just now' }) : a));
      void recordGovernedAction('account-authentication-sync', { authorizedConnectionIds: Array.from(authorizedIds) });
    } catch (error) {
      console.error('Account authentication sync failed:', error);
    }
  };

  const handleBatchAccountAction = (action: 'shield_all' | 'sync_all' | 'purge_all') => {
    void recordGovernedAction('internet-account-batch-action', {
      action,
      executionStatus: action === 'purge_all' ? 'pending_authorized_integration' : 'recorded'
    });
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
          id: `log-${Date.now()}`,
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
          id: `log-${Date.now()}`,
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Platform Navigation Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        stats={stats}
        policy={policy}
        onOpenWithdraw={() => setIsWithdrawOpen(true)}
        pendingOffersCount={pendingOffersCount}
        currentUser={currentUser}
      />

      {/* Main View Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'mediator' && <MediatorDashboard />}
        {activeTab === 'discovery' && <OpportunityDiscoveryDashboard />}
        {activeTab === 'revenue_verified' && <RevenueVerifiedDashboard />}
        {activeTab === 'monetization_sprint' && <MonetizationSprint onOpenWithdraw={() => setIsWithdrawOpen(true)} userReference={currentUser?.uid || 'anonymous'} />}
        {activeTab === 'connections' && <ConnectionAuthorizationDashboard />}
        {activeTab === 'global_collaboration' && <GlobalCollaborationDashboard />}

        {activeTab === 'overview' && (
          <OverviewTab
            stats={stats}
            footprints={footprints}
            policy={policy}
            onUpdatePolicy={handleUpdatePolicy}
            onToggleFootprint={handleToggleFootprint}
            onOpenWithdraw={() => setIsWithdrawOpen(true)}
            onNavigateToTab={setActiveTab}
            transactions={transactions}
          />
        )}

        {activeTab === 'scientists' && (
          <AiScientistFleetConsole
            onAddEarnings={(amount, desc) => { void recordEstimatedOpportunity('scientist-fleet-yield-observation', amount, desc); }}
          />
        )}

        {activeTab === 'sentinel' && (
          <AiCodeSentinelManagement
            errors={sentinelErrors}
            sentinelState={sentinelState}
            onUpdateError={handleUpdateSentinelError}
            onDeleteError={handleDeleteSentinelError}
            onCreateError={handleCreateSentinelError}
            onAutoFixError={handleAutoFixSentinelError}
            onToggleMonitoring={(enabled) => { setSentinelState(s => ({ ...s, isMonitoringActive: enabled })); void persistAppState({ sentinelState: { ...sentinelState, isMonitoringActive: enabled } }); }}
            onToggleAutoHeal={(enabled) => { setSentinelState(s => ({ ...s, autoHealEnabled: enabled })); void persistAppState({ sentinelState: { ...sentinelState, autoHealEnabled: enabled } }); }}
            onOpenCoWorkingStudio={() => setActiveTab('gpt_cowork')}
          />
        )}

        {activeTab === 'accounts' && (
          <InternetAccountsFederation
            accounts={accounts}
            onUpdateAccount={handleUpdateAccount}
            onAuthenticateAll={handleAuthenticateAllAccounts}
            onBatchAction={handleBatchAccountAction}
          />
        )}

        {activeTab === 'control' && (
          <DataControlDashboard
            grants={grants}
            onRevokeGrant={handleRevokeGrant}
            onUpdateGrantPermissions={handleUpdateGrantPermissions}
          />
        )}

        {activeTab === 'gmail' && (
          <GmailGovernanceTab
            currentUser={currentUser}
            onLogin={handleLogin}
            onAddEarnings={(amount, desc) => { void recordEstimatedOpportunity('gmail-governance-yield-observation', amount, desc); }}
          />
        )}

        {activeTab === 'drive' && (
          <DriveGovernanceTab
            currentUser={currentUser}
            onLogin={handleLogin}
            onAddEarnings={(amount, desc) => { void recordEstimatedOpportunity('drive-governance-yield-observation', amount, desc); }}
          />
        )}

        {activeTab === 'compensation' && (
          <CompensationEngine
            telemetryEvents={telemetryEvents}
            onPreviewUsage={handleTriggerSimulatedUsage}
            onClearSettlement={handleClearSettlement}
            totalPendingUsd={stats.pendingSettlementUsd}
          />
        )}

        {activeTab === 'privacy_lab' && (
          <PrivacyTechLab />
        )}

        {activeTab === 'footprints' && (
          <FootprintManager
            footprints={footprints}
            onToggleMonetization={handleToggleFootprint}
            onUpdatePrivacyTier={handleUpdatePrivacyTier}
            onInspectDataSamples={(fp) => setInspectingFootprint(fp)}
          />
        )}

        {activeTab === 'broker' && (
          <AiBrokerConsole
            policy={policy}
            onUpdatePolicy={handleUpdatePolicy}
            footprints={footprints}
          />
        )}

        {activeTab === 'gpt_cowork' && (
          <WorkTogetherWithGptStudio
            policy={policy}
            onUpdatePolicy={handleUpdatePolicy}
            footprints={footprints}
            onOpenSentinelTab={() => setActiveTab('sentinel')}
          />
        )}

        {activeTab === 'ai_collaboration' && (
          <AiModelsCollaborationManagement
            policy={policy}
            onUpdatePolicy={handleUpdatePolicy}
            footprints={footprints}
            onOpenBrokerTab={() => setActiveTab('broker')}
          />
        )}

        {activeTab === 'marketplace' && (
          <MarketplaceOffers
            offers={offers}
            onAcceptOffer={handleAcceptOffer}
            onRejectOffer={handleRejectOffer}
            onCounterOffer={handleCounterOffer}
            policy={policy}
          />
        )}

        {activeTab === 'patent' && (
          <PatentDisclosureDossier
            onOpenBrokerTab={() => setActiveTab('broker')}
            onOpenSentinelTab={() => setActiveTab('sentinel')}
            onOpenGptCoWorkTab={() => setActiveTab('gpt_cowork')}
          />
        )}

        {activeTab === 'compute' && (
          <IndependentComputeLayer />
        )}

        {activeTab === 'ai_ceo' && (
          <AICeoControl />
        )}

        {activeTab === 'integrations' && (
          <IntegrationControl />
        )}

        {activeTab === 'compliance' && (
          <ComplianceScientistBot
            policy={policy}
            footprints={footprints}
            exposures={exposures}
            onOpenClawbackTab={() => setActiveTab('exposures')}
            onOpenPrivacyLabTab={() => setActiveTab('privacy_lab')}
            onOpenGptCoWorkTab={() => setActiveTab('gpt_cowork')}
          />
        )}

        {activeTab === 'exposures' && (
          <BrokerExposureAudit
            exposures={exposures}
            onDispatchClawback={handleDispatchClawback}
            onOpenComplianceBot={() => setActiveTab('compliance')}
          />
        )}
      </main>

      {/* Withdraw Modal */}
      {isWithdrawOpen && (
        <WithdrawModal
          stats={stats}
          policy={policy}
          onClose={() => setIsWithdrawOpen(false)}
          onWithdrawSuccess={handleWithdrawSuccess}
          onUpdatePolicy={handleUpdatePolicy}
        />
      )}

      {/* Data Noise & Sample Inspector Modal */}
      {inspectingFootprint && (
        <DataSampleModal
          footprint={inspectingFootprint}
          onClose={() => setInspectingFootprint(null)}
          onUpdateEpsilon={(id, eps) => handleUpdatePrivacyTier(id, inspectingFootprint.privacyTier, eps)}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/60 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>GLORIFIER AI &bull; Provider-Neutral Intelligence Orchestration</span>
          <div className="flex items-center gap-4 font-mono text-[11px]">
            <span>ZK-Attestation: Active</span>
            <span>Differential Privacy: \u03b5={policy.globalEpsilon}</span>
            <span>CCPA / GDPR Statutory Rights: Protected</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
