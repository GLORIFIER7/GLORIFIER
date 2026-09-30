import { verifyBinanceReadOnlyConnection } from './binance-readonly';
import { authenticationStatus, initializeAuthenticationBackend } from './auth/backend-auth';

type AutonomousVerificationSnapshot = {
  running: boolean;
  cycleCount: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  authentication: ReturnType<typeof authenticationStatus> & {
    initialization: 'verified' | 'failed' | 'not-attempted';
    error: string | null;
  };
  binance: {
    authentication: 'verified' | 'failed' | 'not-tested';
    safeForReadOnly: boolean;
    evidenceRecorded: boolean;
    evidenceId: string | null;
    errorCode: number | null;
    error: string | null;
    checkedAt: string | null;
  };
  repairPolicy: {
    automatic: string[];
    humanRequired: string[];
  };
};

const INTERVAL_MS = 10 * 60 * 1000;
let timer: NodeJS.Timeout | null = null;
let running = false;
let inFlight: Promise<void> | null = null;
let cycleCount = 0;
let lastRunAt: string | null = null;
let nextRunAt: string | null = null;
let authInitialization: 'verified' | 'failed' | 'not-attempted' = 'not-attempted';
let authError: string | null = null;
let lastBinance: AutonomousVerificationSnapshot['binance'] = {
  authentication: 'not-tested',
  safeForReadOnly: false,
  evidenceRecorded: false,
  evidenceId: null,
  errorCode: null,
  error: null,
  checkedAt: null
};

export async function runAutonomousAuthenticationVerification(reason = 'manual') {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    cycleCount += 1;
    lastRunAt = new Date().toISOString();

    try {
      await initializeAuthenticationBackend();
      authInitialization = 'verified';
      authError = null;
    } catch (error) {
      authInitialization = 'failed';
      authError = error instanceof Error ? error.message : String(error);
      console.warn('[AutonomousVerification] Firebase backend initialization failed:', authError);
    }

    try {
      const result = await verifyBinanceReadOnlyConnection();
      lastBinance = {
        authentication: result.authentication,
        safeForReadOnly: result.safeForReadOnly,
        evidenceRecorded: result.evidenceRecorded,
        evidenceId: result.evidenceId,
        errorCode: result.authenticationErrorCode,
        error: result.authenticationError,
        checkedAt: result.checkedAt
      };

      if (result.authentication === 'verified' && result.safeForReadOnly && result.evidenceRecorded) {
        console.log('[AutonomousVerification] Binance read-only authentication and evidence verified.');
      } else {
        console.warn('[AutonomousVerification] Binance verification remains unverified:', {
          authentication: result.authentication,
          safeForReadOnly: result.safeForReadOnly,
          evidenceRecorded: result.evidenceRecorded,
          errorCode: result.authenticationErrorCode
        });
      }
    } catch (error) {
      lastBinance = {
        authentication: 'failed',
        safeForReadOnly: false,
        evidenceRecorded: false,
        evidenceId: null,
        errorCode: null,
        error: error instanceof Error ? error.message : String(error),
        checkedAt: new Date().toISOString()
      };
      console.warn('[AutonomousVerification] Binance verification cycle failed:', lastBinance.error);
    }

    nextRunAt = new Date(Date.now() + INTERVAL_MS).toISOString();
    console.log('[AutonomousVerification] cycle complete:', { reason, cycleCount, lastRunAt, nextRunAt });
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

export function startAutonomousAuthenticationVerificationDaemon() {
  if (running) return getAutonomousAuthenticationVerificationSnapshot();
  running = true;
  void runAutonomousAuthenticationVerification('startup');
  timer = setInterval(() => {
    void runAutonomousAuthenticationVerification('scheduled').catch((error) =>
      console.warn('[AutonomousVerification] scheduled cycle deferred:', error)
    );
  }, INTERVAL_MS);
  nextRunAt = new Date(Date.now() + INTERVAL_MS).toISOString();
  console.log('[AutonomousVerification] 24/7 authentication and verification daemon initialized.');
  return getAutonomousAuthenticationVerificationSnapshot();
}

export function stopAutonomousAuthenticationVerificationDaemon() {
  if (timer) clearInterval(timer);
  timer = null;
  running = false;
  nextRunAt = null;
  return getAutonomousAuthenticationVerificationSnapshot();
}

export function getAutonomousAuthenticationVerificationSnapshot(): AutonomousVerificationSnapshot {
  return {
    running,
    cycleCount,
    lastRunAt,
    nextRunAt,
    authentication: {
      ...authenticationStatus(),
      initialization: authInitialization,
      error: authError
    },
    binance: lastBinance,
    repairPolicy: {
      automatic: [
        'retry Firebase Admin initialization when configuration is available',
        'retry signed Binance read-only authentication',
        're-record qualifying Binance evidence after successful verification',
        'evaluate and execute only pre-authorized LOW-risk credential rotations when an authorized provider-native rotation operation exists',
        'never enable withdrawals, transfers, margin, futures, options, or trading permissions'
      ],
      humanRequired: [
        'provide or create missing credentials',
        'high-risk credential rotation or any permission-scope change',
        'change Binance API permissions or IP restrictions',
        'approve account ownership or OAuth authorization',
        'execute financial transactions or move funds'
      ]
    }
  };
}
