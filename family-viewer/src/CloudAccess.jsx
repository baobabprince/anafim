import React, { useEffect, useRef, useState } from 'react';
import { t } from './i18n/index.js';
import {
  Cloud,
  CloudOff,
  LockKeyhole,
  ShieldCheck,
  KeyRound,
  RefreshCw,
  Download,
  LogOut,
  Upload,
  Check,
  Copy,
  Eye,
  EyeOff,
  AlertTriangle,
  LoaderCircle,
  ChevronLeft,
  Fingerprint,
  History,
  Trash2,
} from 'lucide-react';
import {
  loadCloudConfig,
  saveCloudConfig,
  makeCloudClient,
  cloudEnvironment,
  VaultGateway,
  VaultConflict,
} from './cloud-service.js';
import {
  createVault,
  unlockWithPasskey,
  unlockWithPassword,
  unlockWithRecovery,
  addPasskey,
  snapshotFromBundle,
  snapshotFingerprint,
  validateEnvelope,
  hasPasswordWrap,
  hasPasskeyWrap,
  PASSWORD_MIN_LENGTH,
} from './vault-crypto.js';
import { registerPasskey, authenticatePasskey, passkeyEnvironment } from './vault-passkey.js';
import {
  loadRememberDevicePref,
  saveRememberDevicePref,
  saveDeviceVaultKey,
  loadDeviceVaultKey,
  saveDeviceVaultCache,
  loadDeviceVaultCache,
  loadAnyDeviceVaultForUser,
  clearDeviceVaultState,
} from './vault-device-key.js';
import setupSQL from '../supabase/migrations/202610180001_private_vault.sql?raw';

const AUTO_SYNC_PREF_KEY = 'anafim-cloud-autosync-v1';
const OAUTH_PENDING_KEY = 'anafim-cloud-oauth-pending-v1';

function markOAuthPending() {
  try {
    sessionStorage.setItem(OAUTH_PENDING_KEY, '1');
  } catch {}
}

function clearOAuthPending() {
  try {
    sessionStorage.removeItem(OAUTH_PENDING_KEY);
  } catch {}
}

function consumeOAuthPending() {
  try {
    if (sessionStorage.getItem(OAUTH_PENDING_KEY) === '1') {
      sessionStorage.removeItem(OAUTH_PENDING_KEY);
      return true;
    }
  } catch {}
  return false;
}

function loadAutoSyncPref() {
  try {
    return localStorage.getItem(AUTO_SYNC_PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

function saveAutoSyncPref(enabled) {
  try {
    localStorage.setItem(AUTO_SYNC_PREF_KEY, enabled ? '1' : '0');
  } catch {}
}

const dateLabel = value => (value ? new Date(value).toLocaleString('he-IL') : t('cloud.notSaved'));

function download(name, text, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  if (!ok) throw new Error('העתקה אינה זמינה בדפדפן זה');
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.97-3.38.97-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.41 13.93a6 6 0 0 1 0-3.86V7.48H3.07a10 10 0 0 0 0 9.04l3.34-2.59Z" />
      <path fill="#EA4335" d="M12 5.95c1.47 0 2.78.5 3.82 1.49l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.48l3.34 2.59C7.2 7.71 9.4 5.95 12 5.95Z" />
    </svg>
  );
}

function PasswordField({ label, value, onChange, dir, autoComplete, minLength, placeholder, enterKeyHint, hint, hintTone = '' }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="cloud-field">
      <span>{label}</span>
      <span className="cloud-password-wrap">
        <input
          type={visible ? 'text' : 'password'}
          dir={dir}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint={enterKeyHint}
          minLength={minLength}
          placeholder={placeholder}
          onFocus={e => {
            const el = e.currentTarget;
            if (typeof window !== 'undefined' && window.innerWidth <= 600) {
              setTimeout(() => el.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 180);
            }
          }}
        />
        <button
          type="button"
          className="cloud-password-toggle"
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'הסתרת סיסמה' : 'הצגת סיסמה'}
          title={visible ? 'הסתרת סיסמה' : 'הצגת סיסמה'}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
      {hint && <small className={`cloud-field-hint ${hintTone ? `is-${hintTone}` : ''}`}>{hint}</small>}
    </label>
  );
}

export default function CloudAccess({
  Dialog,
  bundle,
  selectedId,
  onApplySnapshot,
  onClear,
  onUpload,
  isModalOpen,
  openSignal = 0,
  onDialogOpen,
  onToast,
  onStatusChange,
}) {
  const [config, setConfig] = useState(loadCloudConfig);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(config?.url || '');
  const [publicKey, setPublicKey] = useState(config?.key || '');
  const [user, setUser] = useState(null);
  const [head, setHead] = useState(null);
  const [phase, setPhase] = useState('signed-out');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [auto, setAuto] = useState(loadAutoSyncPref);
  const [recovery, setRecovery] = useState('');
  const [recoveryInput, setRecoveryInput] = useState('');
  const [recoverySaved, setRecoverySaved] = useState(false);
  const [recoveryCopied, setRecoveryCopied] = useState(false);
  const [history, setHistory] = useState([]);
  const [showRecovery, setShowRecovery] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [vaultPassword, setVaultPassword] = useState('');
  const [vaultPassword2, setVaultPassword2] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  const [rememberDevice, setRememberDevice] = useState(loadRememberDevicePref);

  const clientRef = useRef(null);
  const gatewayRef = useRef(null);
  const keyRef = useRef(null);
  const headRef = useRef(null);
  const pendingRef = useRef(null);
  const baselineRef = useRef(null);
  const epochRef = useRef(0);
  const busyRef = useRef(false);
  const pollRef = useRef(false);
  const userIdRef = useRef(null);
  const previousUserRef = useRef(null);
  const lastOpenSignalRef = useRef(openSignal);

  const propsRef = useRef({ bundle, selectedId, onApplySnapshot, onClear, isModalOpen, onDialogOpen, onToast });
  propsRef.current = { bundle, selectedId, onApplySnapshot, onClear, isModalOpen, onDialogOpen, onToast };
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const rememberDeviceRef = useRef(rememberDevice);
  rememberDeviceRef.current = rememberDevice;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const updateHead = h => {
    headRef.current = h;
    setHead(h);
  };

  const setAutoSync = next => {
    setAuto(next);
    saveAutoSyncPref(next);
  };

  const updateRememberDevice = next => {
    setRememberDevice(next);
    saveRememberDevicePref(next);
    if (!next) {
      clearDeviceVaultState();
    } else if (keyRef.current && userIdRef.current && headRef.current?.vault_id) {
      saveDeviceVaultKey(userIdRef.current, headRef.current.vault_id, keyRef.current);
      if (!propsRef.current.bundle.isDemo) {
        saveDeviceVaultCache(userIdRef.current, headRef.current, currentSnapshot(), keyRef.current);
      }
    }
  };

  const openDialog = () => {
    propsRef.current.onDialogOpen?.();
    setConfirmAction(null);
    setOpen(true);
    setError('');
  };

  useEffect(() => {
    if (openSignal > lastOpenSignalRef.current) {
      lastOpenSignalRef.current = openSignal;
      openDialog();
    }
  }, [openSignal]);

  const currentSnapshot = () => snapshotFromBundle(propsRef.current.bundle, propsRef.current.selectedId);

  const assertEpoch = stamp => {
    if (stamp !== epochRef.current) {
      const e = new Error(t('cloud.cancelled'));
      e.name = 'AbortError';
      throw e;
    }
  };

  const wipe = (clearView = true) => {
    epochRef.current++;
    keyRef.current = null;
    pendingRef.current = null;
    baselineRef.current = null;
    setRecovery('');
    setRecoveryInput('');
    setRecoverySaved(false);
    setRecoveryCopied(false);
    setHistory([]);
    setShowRecovery(false);
    setShowHistory(false);
    setConfirmAction(null);
    if (clearView) propsRef.current.onClear();
  };

  const lock = () => {
    clearDeviceVaultState(userIdRef.current, headRef.current?.vault_id);
    wipe();
    setPhase(headRef.current ? 'locked' : 'needs-create');
    setNotice('הכספת ננעלה והמפתח הוסר מהמכשיר. לפתיחה מחדש יש להקליד סיסמה.');
  };

  async function task(operation) {
    if (busyRef.current) return;
    const stamp = epochRef.current;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation(stamp);
    } catch (e) {
      if (e.name === 'AbortError' || stamp !== epochRef.current) return;
      if (e instanceof VaultConflict) {
        if (pendingRef.current?.initial) {
          pendingRef.current = null;
          setRecovery('');
          setRecoveryCopied(false);
        }
        setPhase('conflict');
        setError(e.message);
      } else {
        setError(e.message || t('cloud.actionIncomplete'));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!config || !cloudEnvironment()) return;
    const client = makeCloudClient(config);
    clientRef.current = client;
    let active = true;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (active) setUser(session?.user || null);
    });
    client.auth.getSession().then(({ data, error }) => {
      if (active) {
        if (error) setError(t('cloud.relogin'));
        setUser(data.session?.user || null);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
      client.removeAllChannels();
      client.auth.stopAutoRefresh();
      if (clientRef.current === client) clientRef.current = null;
    };
  }, [config]);

  useEffect(() => {
    const old = previousUserRef.current;
    previousUserRef.current = user?.id || null;
    userIdRef.current = user?.id || null;
    wipe(!!old && old !== user?.id);
    updateHead(null);
    gatewayRef.current = null;
    if (!user) {
      setPhase('signed-out');
      return;
    }
    if (consumeOAuthPending()) {
      propsRef.current.onDialogOpen?.();
      setConfirmAction(null);
      setOpen(true);
      setError('');
    }
    const stamp = epochRef.current;
    const gateway = new VaultGateway(clientRef.current, user.id);
    gatewayRef.current = gateway;
    setPhase('loading');
    gateway
      .head()
      .then(async h => {
        assertEpoch(stamp);
        if (h) validateEnvelope(h.envelope, user.id);
        updateHead(h);
        if (!h) {
          setPhase('needs-create');
          return;
        }
        if (rememberDeviceRef.current) {
          const storedKey = await loadDeviceVaultKey(user.id, h.vault_id);
          assertEpoch(stamp);
          if (storedKey) {
            keyRef.current = storedKey;
            try {
              await readChoice(stamp, h, { silentAuto: true });
              return;
            } catch (err) {
              if (err?.name === 'AbortError' || stamp !== epochRef.current) return;
              keyRef.current = null;
              await clearDeviceVaultState(user.id, h.vault_id);
            }
          }
        }
        if (stamp === epochRef.current) setPhase('locked');
      })
      .catch(async err => {
        if (err?.name === 'AbortError' || stamp !== epochRef.current) return;
        if (rememberDeviceRef.current) {
          try {
            const offline = await loadAnyDeviceVaultForUser(user.id);
            if (stamp !== epochRef.current) return;
            if (offline?.key && offline?.head && offline?.payload) {
              validateEnvelope(offline.head.envelope, user.id);
              keyRef.current = offline.key;
              updateHead(offline.head);
              if (offline.payload.raw && propsRef.current.bundle.isDemo && !propsRef.current.isModalOpen) {
                await applyRemoteSnapshot(stamp, { head: offline.head, payload: offline.payload }, { closeDialog: true, silent: true });
              } else {
                baselineRef.current = await snapshotFingerprint(offline.payload);
                setPhase('ready');
              }
              setNotice('נפתח מהעותק המוצפן במכשיר (ללא חיבור). יסונכרן אוטומטית כשהחיבור יחזור.');
              return;
            }
          } catch {}
        }
        if (stamp === epochRef.current) {
          setError('לא ניתן לקרוא את הכספת. נסו שוב בעוד רגע.');
          setPhase('connection-error');
        }
      });
    return () => {
      epochRef.current++;
      keyRef.current = null;
    };
  }, [user?.id, config]);

  async function applyRemoteSnapshot(stamp, item, { closeDialog = false, silent = false } = {}) {
    if (propsRef.current.isModalOpen) throw new Error(t('cloud.closeUploadFirst'));
    assertEpoch(stamp);
    const originalBundle = propsRef.current.bundle;
    await propsRef.current.onApplySnapshot(item.payload, {
      shouldApply: () => stamp === epochRef.current && propsRef.current.bundle === originalBundle,
    });
    assertEpoch(stamp);
    baselineRef.current = await snapshotFingerprint(item.payload);
    updateHead(item.head);
    pendingRef.current = null;
    setPhase('ready');
    setNotice(t('cloud.loadedFromCloud'));
    if (!silent) propsRef.current.onToast?.('האילן נטען מהענן');
    if (closeDialog) setOpen(false);
  }

  async function readChoice(stamp, h = headRef.current, { silentAuto = false } = {}) {
    if (!h) throw new Error(t('cloud.noVault'));
    validateEnvelope(h.envelope, userIdRef.current);
    let payload = null;
    if (rememberDeviceRef.current) {
      const cached = await loadDeviceVaultCache(userIdRef.current, h.vault_id, keyRef.current);
      assertEpoch(stamp);
      if (cached?.head?.revision_id === h.revision_id) {
        payload = cached.payload;
      }
    }
    if (!payload) {
      payload = await gatewayRef.current.read(keyRef.current, h);
      assertEpoch(stamp);
      if (rememberDeviceRef.current) {
        saveDeviceVaultCache(userIdRef.current, h, payload, keyRef.current);
      }
    }
    pendingRef.current = { head: h, payload };
    const same = (await snapshotFingerprint(currentSnapshot())) === (await snapshotFingerprint(payload));
    assertEpoch(stamp);
    if (same || (!payload.raw && propsRef.current.bundle.isDemo)) {
      baselineRef.current = await snapshotFingerprint(payload);
      updateHead(h);
      pendingRef.current = null;
      setPhase('ready');
      setNotice(t('cloud.openCanAuto'));
    } else if (payload.raw && propsRef.current.bundle.isDemo && !propsRef.current.isModalOpen) {
      // Local view is only the demo tree: load the user's cloud tree immediately.
      await applyRemoteSnapshot(stamp, { head: h, payload }, { closeDialog: true, silent: silentAuto });
    } else {
      updateHead(h);
      setPhase('choice');
    }
  }

  async function takeRemote(stamp) {
    const item = pendingRef.current;
    if (!item) throw new Error(t('cloud.needRefresh'));
    await applyRemoteSnapshot(stamp, item, { closeDialog: true });
  }

  async function saveCurrent(stamp, envelope = headRef.current?.envelope, expected = headRef.current?.revision_id) {
    if (!keyRef.current || !envelope) throw new Error(t('cloud.openFirst'));
    if (propsRef.current.bundle.isDemo) throw new Error('משפחת ההדגמה אינה נשמרת בענן. פתחו את קובץ ה־GEDCOM שלכם.');
    const payload = currentSnapshot();
    const h = await gatewayRef.current.save(keyRef.current, envelope, payload, expected);
    assertEpoch(stamp);
    const fp = await snapshotFingerprint(payload);
    assertEpoch(stamp);
    baselineRef.current = fp;
    updateHead(h);
    if (rememberDeviceRef.current && userIdRef.current) {
      saveDeviceVaultCache(userIdRef.current, h, payload, keyRef.current);
    }
    pendingRef.current = null;
    setPhase('ready');
    setNotice(t('cloud.savedEncrypted'));
  }

  async function poll() {
    if (pollRef.current || busyRef.current || !gatewayRef.current || !keyRef.current || phaseRef.current !== 'ready') return;
    pollRef.current = true;
    const stamp = epochRef.current;
    try {
      const latest = await gatewayRef.current.head();
      assertEpoch(stamp);
      if (!latest) {
        lock();
        updateHead(null);
        setPhase('needs-create');
        setNotice(t('cloud.deletedClosed'));
        return;
      }
      if (latest.revision_id === headRef.current?.revision_id) {
        if (autoRef.current && !propsRef.current.bundle.isDemo && !propsRef.current.isModalOpen) {
          const dirty = (await snapshotFingerprint(currentSnapshot())) !== baselineRef.current;
          assertEpoch(stamp);
          if (dirty) await task(s => saveCurrent(s));
        }
        return;
      }
      if (latest.vault_id !== headRef.current?.vault_id || latest.generation < headRef.current?.generation) {
        lock();
        setError(t('cloud.identityChanged'));
        updateHead(latest);
        return;
      }
      const clean = (await snapshotFingerprint(currentSnapshot())) === baselineRef.current;
      assertEpoch(stamp);
      if (!clean || !autoRef.current || propsRef.current.isModalOpen) {
        setPhase('conflict');
        setNotice('יש עדכון במכשיר אחר. בחרו איזה עותק להמשיך; שום נתון לא נדרס.');
        return;
      }
      const payload = await gatewayRef.current.read(keyRef.current, latest);
      assertEpoch(stamp);
      // Re-check after the asynchronous download so a newly imported local file is not replaced.
      if ((await snapshotFingerprint(currentSnapshot())) !== baselineRef.current) {
        setPhase('conflict');
        setNotice(t('cloud.localWhileUpdate'));
        return;
      }
      assertEpoch(stamp);
      const originalBundle = propsRef.current.bundle;
      await propsRef.current.onApplySnapshot(payload, {
        shouldApply: () => stamp === epochRef.current && propsRef.current.bundle === originalBundle && !propsRef.current.isModalOpen,
      });
      assertEpoch(stamp);
      baselineRef.current = await snapshotFingerprint(payload);
      updateHead(latest);
      if (rememberDeviceRef.current && userIdRef.current) {
        saveDeviceVaultCache(userIdRef.current, latest, payload, keyRef.current);
      }
      setNotice(t('cloud.remoteUpdate'));
    } catch {
      if (stamp === epochRef.current) setNotice('הסנכרון ממתין לחיבור. האילן הפתוח נשמר; לא נדרסו גרסאות.');
    } finally {
      pollRef.current = false;
    }
  }

  const pollLatestRef = useRef(poll);
  pollLatestRef.current = poll;

  useEffect(() => {
    if (!user || !gatewayRef.current) return;
    const notify = () => pollLatestRef.current();
    const stop = gatewayRef.current.subscribe(notify);
    const timer = setInterval(notify, 20000);
    const visible = () => {
      if (document.visibilityState === 'visible') notify();
    };
    window.addEventListener('online', notify);
    window.addEventListener('focus', notify);
    document.addEventListener('visibilitychange', visible);
    return () => {
      stop();
      clearInterval(timer);
      window.removeEventListener('online', notify);
      window.removeEventListener('focus', notify);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [user?.id, phase === 'loading']);

  useEffect(() => {
    if (!auto || phase !== 'ready' || bundle.isDemo || !keyRef.current) return;
    const stamp = epochRef.current;
    const timer = setTimeout(async () => {
      if (busyRef.current) return;
      try {
        const fp = await snapshotFingerprint(currentSnapshot());
        assertEpoch(stamp);
        if (fp !== baselineRef.current) task(s => saveCurrent(s));
      } catch {}
    }, 1400);
    return () => clearTimeout(timer);
  }, [bundle.raw, bundle.filename, auto, phase]);

  useEffect(() => {
    if (rememberDevice) return;
    if (phase !== 'ready' && phase !== 'choice' && phase !== 'conflict') return;
    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (keyRef.current) lock();
      }, 2 * 24 * 60 * 60 * 1000);
    };
    reset();
    window.addEventListener('pointerdown', reset);
    window.addEventListener('keydown', reset);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('keydown', reset);
    };
  }, [phase, rememberDevice]);

  const configure = () => {
    try {
      if (user) throw new Error(t('cloud.logoutBeforeProject'));
      const safe = saveCloudConfig({ url, key: publicKey });
      wipe(false);
      setConfig(safe);
      setError('');
      setNotice('הפרויקט הוגדר. יש לוודא שגם SQL ו־Google OAuth הוגדרו לפני ההתחברות.');
    } catch (e) {
      setError(e.message);
    }
  };

  const login = () =>
    task(async () => {
      if (!cloudEnvironment()) throw new Error(t('cloud.httpsOnly'));
      markOAuthPending();
      const { error } = await clientRef.current.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: location.origin + location.pathname,
          scopes: 'openid email profile',
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) {
        clearOAuthPending();
        throw error;
      }
    });

  const create = () =>
    task(async stamp => {
      if (vaultPassword.length < PASSWORD_MIN_LENGTH) {
        throw new Error(`סיסמת הכספת חייבת להכיל לפחות ${PASSWORD_MIN_LENGTH} תווים.`);
      }
      if (vaultPassword !== vaultPassword2) throw new Error('שתי הסיסמאות אינן זהות.');
      const initial = await createVault(user.id, { password: vaultPassword });
      assertEpoch(stamp);
      pendingRef.current = { initial };
      setRecovery(initial.recovery);
      setRecoverySaved(false);
      setRecoveryCopied(false);
      setVaultPassword('');
      setVaultPassword2('');
      setPhase('recovery-setup');
    });

  const handleCopyRecovery = async () => {
    try {
      await copyText(recovery);
      setRecoveryCopied(true);
      setError('');
    } catch (e) {
      setError(e.message || 'לא ניתן להעתיק ללוח. אפשר להוריד כקובץ.');
    }
  };

  const handleDownloadRecovery = () => {
    download(
      'anafim-recovery-key.txt',
      `ענפים — ${t('cloud.recovery')} פרטי\nאל תשלחו אותו למפתח או לתמיכה.\n\n${recovery}\n\nכתובת האתר: ${location.origin}\nהחשבון: ${user?.email || ''}\n`
    );
  };

  const finishCreate = () =>
    task(async stamp => {
      if (!recoverySaved) throw new Error(t('cloud.saveRecovery'));
      const initial = pendingRef.current?.initial;
      if (!initial) throw new Error(t('cloud.createCancelled'));
      const payload = currentSnapshot();
      const h = await gatewayRef.current.save(initial.key, initial.envelope, payload, null);
      assertEpoch(stamp);
      keyRef.current = initial.key;
      baselineRef.current = await snapshotFingerprint(payload);
      updateHead(h);
      if (rememberDeviceRef.current && user?.id) {
        await saveDeviceVaultKey(user.id, h.vault_id, initial.key);
        await saveDeviceVaultCache(user.id, h, payload, initial.key);
      }
      pendingRef.current = null;
      setRecovery('');
      setRecoveryCopied(false);
      setPhase('ready');
      setNotice(t('cloud.created'));
    });

  async function finishUnlock(stamp, key) {
    const latest = await gatewayRef.current.head();
    assertEpoch(stamp);
    if (!latest || latest.vault_id !== headRef.current?.vault_id) {
      keyRef.current = null;
      updateHead(latest);
      setPhase(latest ? 'locked' : 'needs-create');
      throw new Error('הכספת השתנתה בזמן שהייתה נעולה. יש לפתוח את הכספת המעודכנת.');
    }
    keyRef.current = key;
    if (rememberDeviceRef.current) {
      await saveDeviceVaultKey(user.id, latest.vault_id, key);
    } else {
      await clearDeviceVaultState(user.id, latest.vault_id);
    }
    await readChoice(stamp, latest);
  }

  const unlockPasskey = () =>
    task(async stamp => {
      validateEnvelope(headRef.current.envelope, user.id);
      const result = await authenticatePasskey(headRef.current.envelope);
      assertEpoch(stamp);
      const key = await unlockWithPasskey(headRef.current.envelope, user.id, result.credentialId, result.secret);
      assertEpoch(stamp);
      await finishUnlock(stamp, key);
    });

  const unlockRecovery = () =>
    task(async stamp => {
      const key = await unlockWithRecovery(headRef.current.envelope, user.id, recoveryInput);
      assertEpoch(stamp);
      setRecoveryInput('');
      setShowRecovery(false);
      await finishUnlock(stamp, key);
    });

  const openWithVaultPassword = () =>
    task(async stamp => {
      const key = await unlockWithPassword(headRef.current.envelope, user.id, unlockPassword);
      assertEpoch(stamp);
      setUnlockPassword('');
      await finishUnlock(stamp, key);
    });

  const refresh = () =>
    task(async stamp => {
      const h = await gatewayRef.current.head();
      assertEpoch(stamp);
      if (h) validateEnvelope(h.envelope, user.id);
      if (keyRef.current && h && h.vault_id === headRef.current?.vault_id) {
        await readChoice(stamp, h);
      } else {
        if (keyRef.current) wipe();
        updateHead(h);
        setPhase(h ? 'locked' : 'needs-create');
      }
    });

  const syncNow = () =>
    task(async stamp => {
      const latest = await gatewayRef.current.head();
      assertEpoch(stamp);
      if (!latest) {
        lock();
        updateHead(null);
        setPhase('needs-create');
        setNotice(t('cloud.deletedClosed'));
        return;
      }
      validateEnvelope(latest.envelope, user.id);
      if (latest.vault_id !== headRef.current?.vault_id) {
        wipe();
        updateHead(latest);
        setPhase('locked');
        throw new Error(t('cloud.identityChanged'));
      }
      if (latest.revision_id !== headRef.current?.revision_id) {
        await readChoice(stamp, latest);
        return;
      }
      if (propsRef.current.bundle.isDemo) {
        await readChoice(stamp, latest);
        return;
      }
      const dirty = (await snapshotFingerprint(currentSnapshot())) !== baselineRef.current;
      assertEpoch(stamp);
      if (dirty) {
        await saveCurrent(stamp, latest.envelope, latest.revision_id);
        propsRef.current.onToast?.('האילן סונכרן בענן');
      } else {
        updateHead(latest);
        setNotice('הכול מעודכן — העותק במכשיר זהה לענן.');
      }
    });

  const enroll = () =>
    task(async stamp => {
      const e = headRef.current.envelope;
      const passkey = await registerPasskey(user, e);
      assertEpoch(stamp);
      const next = await addPasskey(e, keyRef.current, passkey);
      assertEpoch(stamp);
      await saveCurrent(stamp, next, headRef.current.revision_id);
    });

  const performLogout = () =>
    task(async () => {
      setConfirmAction(null);
      await clearDeviceVaultState();
      wipe();
      updateHead(null);
      const { error } = await clientRef.current.auth.signOut({ scope: 'local' });
      if (error) {
        setUser(null);
        throw new Error(t('cloud.lockPartialLogout'));
      }
      setUser(null);
      setPhase('signed-out');
    });

  const logout = () => {
    if (propsRef.current.bundle.isDemo) {
      performLogout();
      return;
    }
    setConfirmAction('logout');
  };

  const loadHistory = () =>
    task(async stamp => {
      const rows = await gatewayRef.current.history();
      assertEpoch(stamp);
      setHistory(rows);
      setShowHistory(true);
    });

  const chooseHistory = row =>
    task(async stamp => {
      const payload = await gatewayRef.current.read(keyRef.current, row);
      assertEpoch(stamp);
      const latest = await gatewayRef.current.head();
      assertEpoch(stamp);
      pendingRef.current = { head: latest, payload };
      setShowHistory(false);
      setPhase('choice');
      setNotice('נבחרה גרסה קודמת. טעינתה לא מחליפה את גרסת הענן עד לשמירה מפורשת.');
    });

  const performErase = () =>
    task(async stamp => {
      setConfirmAction(null);
      await gatewayRef.current.delete(headRef.current.revision_id);
      assertEpoch(stamp);
      await clearDeviceVaultState();
      wipe();
      updateHead(null);
      setPhase('needs-create');
      setNotice(t('cloud.deletedGoogleRemains'));
    });

  const erase = () => {
    setConfirmAction('erase');
  };

  const confirmCancelSetup = () => {
    pendingRef.current = null;
    setRecovery('');
    setRecoveryCopied(false);
    setConfirmAction(null);
    setPhase('needs-create');
    setOpen(false);
  };

  const close = () => {
    if (phase === 'recovery-setup') {
      setConfirmAction('cancel-setup');
      return;
    }
    setConfirmAction(null);
    setOpen(false);
  };

  const unlocked = !!keyRef.current;
  const needsAction = phase === 'choice' || phase === 'conflict' || !!error;
  const stateLabel = !config
    ? t('cloud.syncUnavailable')
    : !cloudEnvironment()
      ? t('cloud.httpsRequired')
      : !user
        ? t('cloud.strip')
        : phase === 'loading'
          ? t('cloud.checking')
          : phase === 'ready'
            ? error
              ? t('cloud.openCheck')
              : auto
                ? t('cloud.synced')
                : t('cloud.statusOpen')
            : phase === 'choice' || phase === 'conflict'
              ? t('cloud.chooseVersion')
              : unlocked
                ? t('cloud.statusOpen')
                : t('cloud.locked');

  const stateDetail = !config
    ? t('cloud.optional')
    : !cloudEnvironment()
      ? 'זמין באתר HTTPS בלבד'
      : !user
        ? 'גיבוי מוצפן בין הטלפון למחשב'
        : phase === 'ready'
          ? `${user.email || t('cloud.connected')} · עודכן ${dateLabel(head?.updated_at)}`
          : user.email || t('cloud.connected');

  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  useEffect(() => {
    onStatusChangeRef.current?.({
      label: stateLabel,
      detail: stateDetail,
      unlocked,
      connected: !!user,
      phase,
      configured: !!config,
      needsAction,
    });
  }, [stateLabel, stateDetail, unlocked, user, phase, config, needsAction]);

  return (
    <section className="cloud-strip" aria-label={t('cloud.syncOptional')}>
      <span className={`cloud-strip-symbol ${unlocked ? 'is-unlocked' : ''}`}>
        {unlocked ? <ShieldCheck size={16} /> : <Cloud size={16} />}
      </span>
      <div>
        <strong>{stateLabel}</strong>
        <small>{!config ? t('cloud.optional') : user ? user.email || t('cloud.connected') : t('cloud.googlePassword')}</small>
      </div>
      <button type="button" className="cloud-entry cloud-entry-quiet" onClick={openDialog}>
        {user ? (unlocked ? 'ניהול' : 'פתיחה') : config ? t('cloud.connecting') : t('cloud.sync')}
        <ChevronLeft size={13} />
      </button>

      {open && (
        <Dialog
          title="סנכרון בין מכשירים"
          subtitle="גיבוי וסנכרון מוצפן במכשיר — רק לכם יש מפתח."
          onClose={close}
          className="cloud-dialog"
          backdropClassName="cloud-modal-backdrop"
          icon={unlocked ? <ShieldCheck size={24} /> : <LockKeyhole size={24} />}
        >
          {error && (
            <div className="cloud-error" role="alert">
              <AlertTriangle size={17} />
              <span>{error}</span>
            </div>
          )}
          {notice && (
            <p className="cloud-notice" role="status">
              {notice}
            </p>
          )}
          {confirmAction && (
            <div className={`cloud-inline-confirm ${confirmAction === 'erase' ? 'is-danger' : ''}`} role="alertdialog" aria-label="אישור פעולה">
              <div className="cloud-inline-confirm-copy">
                <AlertTriangle size={18} />
                <div>
                  <strong>
                    {confirmAction === 'erase'
                      ? 'מחיקת הכספת לצמיתות?'
                      : confirmAction === 'logout'
                        ? 'התנתקות מהחשבון?'
                        : 'ביטול הקמת הכספת?'}
                  </strong>
                  <p>
                    {confirmAction === 'erase'
                      ? 'הכספת וכל גרסאותיה יימחקו מהענן ללא אפשרות שחזור מתוך היישום.'
                      : confirmAction === 'logout'
                        ? 'ההתנתקות תסגור את האילן הפתוח ותמחק את העותק המקומי. העותק המוצפן בענן לא יימחק.'
                        : 'מפתח השחזור עדיין לא אושר והכספת עדיין לא נשמרה בענן.'}
                  </p>
                </div>
              </div>
              <div className="cloud-inline-confirm-actions">
                <button
                  type="button"
                  className={`button ${confirmAction === 'erase' ? 'button-danger' : 'button-primary'}`}
                  disabled={busy}
                  onClick={
                    confirmAction === 'erase'
                      ? performErase
                      : confirmAction === 'logout'
                        ? performLogout
                        : confirmCancelSetup
                  }
                >
                  {confirmAction === 'erase'
                    ? 'כן, למחוק לצמיתות'
                    : confirmAction === 'logout'
                      ? 'התנתקות'
                      : 'ביטול ההקמה'}
                </button>
                <button type="button" className="button button-white" disabled={busy} onClick={() => setConfirmAction(null)}>
                  חזרה
                </button>
              </div>
            </div>
          )}
          {!cloudEnvironment() && (
            <div className="cloud-warning">
              <CloudOff size={22} />
              <p>הצפנה וכניסה עם Google דורשות אתר HTTPS. קובץ HTML מקומי נשאר במצב מקומי בלבד.</p>
            </div>
          )}

          {!config && !user && (
            <div className="cloud-configuration">
              <h3>חיבור פרויקט Supabase</h3>
              <ol>
                <li>יוצרים פרויקט ומפעילים את Google בספקי האימות.</li>
                <li>מריצים את קובץ ה־SQL ומגדירים את כתובת האתר ואת כתובות החזרה המותרות.</li>
                <li>מזינים כאן כתובת פרויקט ומפתח ציבורי בלבד.</li>
              </ol>
              <button type="button" className="cloud-link" onClick={() => download('anafim-private-vault.sql', setupSQL)}>
                <Download size={15} />
                הורדת SQL להגדרת הענן
              </button>
              <label>
                כתובת פרויקט Supabase
                <input dir="ltr" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://your-project.supabase.co" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
              </label>
              <label>
                מפתח publishable / anon ציבורי
                <input dir="ltr" value={publicKey} onChange={e => setPublicKey(e.target.value)} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
              </label>
              <p>אין להזין Client Secret, סיסמת Google, service_role או sb_secret. מפתח ההצפנה לעולם אינו מוגדר כאן.</p>
              <button type="button" className="button button-primary" onClick={configure} disabled={busy}>
                שמירת הגדרות ציבוריות
              </button>
            </div>
          )}

          {config && !user && (
            <div className="cloud-login">
              <button type="button" className="google-signin" disabled={busy || !cloudEnvironment()} onClick={login}>
                <GoogleMark />
                {t('cloud.login')}
              </button>
              <p>התחברות עם Google משמשת לזיהוי בלבד. האילן מוצפן במכשיר שלכם עם סיסמה פרטית שרק אתם יודעים.</p>
            </div>
          )}

          {user && (
            <div className="cloud-account">
              <span dir="auto" title={user.email || ''}>{user.email}</span>
              <button type="button" className="cloud-account-logout" onClick={logout} disabled={busy}>
                <LogOut size={14} />
                התנתקות
              </button>
            </div>
          )}

          {user && phase === 'loading' && (
            <div className="cloud-loading-state" role="status">
              <LoaderCircle size={22} className="spin" />
              <span>{t('cloud.checkingVault')}</span>
            </div>
          )}

          {user && phase === 'needs-create' && (
            <div className="cloud-step">
              <div className="cloud-step-title-row">
                <span className="cloud-step-number">01</span>
                <h3>בחירת {t('cloud.password')}</h3>
              </div>
              <p>בחרו סיסמה פרטית לכספת (לפחות {PASSWORD_MIN_LENGTH} תווים, לא סיסמת Google). בשלב הבא תקבלו {t('cloud.recovery')} לשמירה.</p>
              <form
                className="cloud-recovery-form"
                onSubmit={e => {
                  e.preventDefault();
                  create();
                }}
              >
                <PasswordField
                  label={t('cloud.password')}
                  value={vaultPassword}
                  onChange={e => setVaultPassword(e.target.value)}
                  autoComplete="new-password"
                  enterKeyHint="next"
                  minLength={PASSWORD_MIN_LENGTH}
                  placeholder={`לפחות ${PASSWORD_MIN_LENGTH} תווים`}
                  hint={
                    vaultPassword.length === 0
                      ? ''
                      : vaultPassword.length >= PASSWORD_MIN_LENGTH
                        ? 'אורך הסיסמה תקין'
                        : `עוד ${PASSWORD_MIN_LENGTH - vaultPassword.length} תווים לפחות`
                  }
                  hintTone={vaultPassword.length >= PASSWORD_MIN_LENGTH ? 'ok' : 'warn'}
                />
                <PasswordField
                  label="אימות סיסמה"
                  value={vaultPassword2}
                  onChange={e => setVaultPassword2(e.target.value)}
                  autoComplete="new-password"
                  enterKeyHint="done"
                  minLength={PASSWORD_MIN_LENGTH}
                  placeholder="הקלידו שוב את הסיסמה"
                  hint={
                    vaultPassword2.length === 0
                      ? ''
                      : vaultPassword === vaultPassword2
                        ? 'הסיסמאות תואמות'
                        : 'הסיסמאות אינן זהות'
                  }
                  hintTone={vaultPassword === vaultPassword2 ? 'ok' : 'warn'}
                />
                <button
                  className="button button-primary button-full"
                  disabled={busy || vaultPassword.length < PASSWORD_MIN_LENGTH}
                  type="submit"
                >
                  <KeyRound size={17} />
                  המשך למפתח השחזור
                </button>
              </form>
            </div>
          )}

          {phase === 'recovery-setup' && (
            <div className="cloud-step">
              <div className="cloud-step-title-row">
                <span className="cloud-step-number">02</span>
                <h3>שמירת {t('cloud.recovery')}</h3>
              </div>
              <p>שמרו את המפתח במקום בטוח (למשל במנהל סיסמאות או קובץ פרטי). בלעדיו לא ניתן לשחזר את הכספת במקרה ששוכחים את הסיסמה.</p>
              <code className="cloud-recovery-code" dir="ltr">
                {recovery}
              </code>
              <div className="cloud-recovery-actions">
                <button type="button" className="button button-white" onClick={handleCopyRecovery}>
                  {recoveryCopied ? <Check size={16} /> : <Copy size={16} />}
                  {recoveryCopied ? 'הועתק!' : 'העתקת מפתח'}
                </button>
                <button type="button" className="button button-white" onClick={handleDownloadRecovery}>
                  <Download size={16} />
                  הורדה כקובץ
                </button>
              </div>
              <label className={`cloud-check ${recoverySaved ? 'is-checked' : ''}`}>
                <input type="checkbox" checked={recoverySaved} onChange={e => setRecoverySaved(e.target.checked)} />
                <span>שמרתי את מפתח השחזור במקום בטוח</span>
              </label>
              <button type="button" className="button button-primary button-full" disabled={busy || !recoverySaved} onClick={finishCreate}>
                <ShieldCheck size={17} />
                אישור והפעלת סנכרון מוצפן
              </button>
            </div>
          )}

          {user && phase === 'locked' && (
            <div className="cloud-step">
              <div className="cloud-step-header">
                <span className="cloud-step-badge">
                  <LockKeyhole size={20} />
                </span>
                <div>
                  <h3>{t('cloud.unlock')}</h3>
                  <p className="cloud-meta">
                    גרסה {head?.generation} · {dateLabel(head?.updated_at)}
                  </p>
                </div>
              </div>
              {hasPasskeyWrap(head?.envelope) && passkeyEnvironment() && (
                <button type="button" className="button button-primary button-full cloud-passkey-primary" onClick={unlockPasskey} disabled={busy}>
                  <Fingerprint size={18} />
                  {t('cloud.passkey')}
                </button>
              )}
              {hasPasskeyWrap(head?.envelope) && passkeyEnvironment() && hasPasswordWrap(head?.envelope) && (
                <div className="cloud-divider" aria-hidden="true">
                  <span>או עם סיסמת הכספת</span>
                </div>
              )}
              {hasPasswordWrap(head?.envelope) && (
                <form
                  className="cloud-recovery-form"
                  onSubmit={e => {
                    e.preventDefault();
                    openWithVaultPassword();
                  }}
                >
                  <PasswordField
                    label={t('cloud.password')}
                    value={unlockPassword}
                    onChange={e => setUnlockPassword(e.target.value)}
                    autoComplete="current-password"
                    enterKeyHint="done"
                    placeholder="הקלידו את סיסמת הכספת"
                  />
                  <button
                    className={`button ${hasPasskeyWrap(head?.envelope) && passkeyEnvironment() && !unlockPassword ? 'button-white' : 'button-primary'} button-full`}
                    disabled={busy || !unlockPassword}
                    type="submit"
                  >
                    <KeyRound size={17} />
                    פתיחת הכספת
                  </button>
                </form>
              )}
              {hasPasskeyWrap(head?.envelope) && !passkeyEnvironment() && (
                <button type="button" className="button button-white button-full" onClick={unlockPasskey} disabled>
                  <KeyRound size={16} />
                  {t('cloud.passkey')}
                </button>
              )}
              <label className={`cloud-check cloud-remember-check ${rememberDevice ? 'is-checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={e => updateRememberDevice(e.target.checked)}
                  disabled={busy}
                />
                <span>
                  <strong>{t('cloud.rememberDevice')}</strong>
                  <small>{t('cloud.rememberDeviceHint')}</small>
                </span>
              </label>
              <div className="cloud-secondary-links">
                <button type="button" className="cloud-secondary-btn" onClick={() => setShowRecovery(v => !v)} aria-expanded={showRecovery}>
                  שכחתם סיסמה? פתיחה עם {t('cloud.recovery')}
                </button>
                <button type="button" className="cloud-secondary-btn cloud-refresh-btn" disabled={busy} onClick={refresh}>
                  <RefreshCw size={14} />
                  רענון
                </button>
              </div>
              {showRecovery && (
                <form
                  className="cloud-recovery-form cloud-recovery-drawer"
                  onSubmit={e => {
                    e.preventDefault();
                    unlockRecovery();
                  }}
                >
                  <PasswordField
                    label={t('cloud.recovery')}
                    dir="ltr"
                    value={recoveryInput}
                    onChange={e => setRecoveryInput(e.target.value)}
                    autoComplete="off"
                    enterKeyHint="done"
                    placeholder="ANAFIM1.…"
                  />
                  <button className="button button-white button-full" disabled={busy || !recoveryInput} type="submit">
                    פתיחה באמצעות מפתח שחזור
                  </button>
                </form>
              )}
            </div>
          )}

          {phase === 'choice' && pendingRef.current?.payload && (
            <div className="cloud-step">
              <h3>איזה עותק לפתוח?</h3>
              <div className="cloud-choice-compare">
                <div className="cloud-choice-item">
                  <span>בענן</span>
                  <strong dir="auto">{pendingRef.current.payload.filename || 'כספת ללא אילן'}</strong>
                </div>
                <div className="cloud-choice-item">
                  <span>במכשיר</span>
                  <strong dir="auto">{bundle.filename}</strong>
                </div>
              </div>
              <p className="cloud-choice-note">גרסאות קודמות נשמרות מוצפנות בענן — שום נתון לא נמחק.</p>
              <div className="cloud-actions cloud-actions-stack">
                <button type="button" className="button button-primary button-full" disabled={busy} onClick={() => task(takeRemote)}>
                  <Download size={16} />
                  פתיחת העותק מהענן
                </button>
                {!bundle.isDemo && (
                  <button type="button" className="button button-white button-full" disabled={busy} onClick={() => task(s => saveCurrent(s))}>
                    <Upload size={16} />
                    שמירת האילן המקומי לענן
                  </button>
                )}
              </div>
            </div>
          )}

          {phase === 'conflict' && (
            <div className="cloud-step">
              <div className="cloud-step-header">
                <span className="cloud-step-badge is-alert">
                  <AlertTriangle size={20} />
                </span>
                <div>
                  <h3>נמצא עדכון במכשיר אחר</h3>
                  <p className="cloud-meta">שום נתון לא נדרס — בחרו איזו גרסה לשמור.</p>
                </div>
              </div>
              <button type="button" className="button button-primary button-full" disabled={busy} onClick={refresh}>
                <RefreshCw size={17} />
                בדיקת הגרסה החדשה ובחירת עותק
              </button>
            </div>
          )}

          {phase === 'ready' && (
            <div className="cloud-step">
              <div className="cloud-status-card">
                <span className="cloud-status-icon">
                  <ShieldCheck size={20} />
                </span>
                <div className="cloud-status-copy">
                  <strong>{auto ? 'הסנכרון פעיל ומאובטח' : t('cloud.open')}</strong>
                  <span dir="auto">{bundle.isDemo ? 'מוצגת משפחת הדגמה (לא מסונכרנת)' : bundle.filename}</span>
                  <small>
                    גרסה {head?.generation} · עודכן {dateLabel(head?.updated_at)}
                  </small>
                </div>
              </div>

              <label className="cloud-toggle-row">
                <span>
                  <strong>סנכרון אוטומטי בין מכשירים</strong>
                  <small>שומר ומעדכן ברקע כל עוד הכספת פתוחה במכשיר.</small>
                </span>
                <input type="checkbox" className="cloud-switch" checked={auto} onChange={e => setAutoSync(e.target.checked)} disabled={busy} />
              </label>

              <label className="cloud-toggle-row">
                <span>
                  <strong>{t('cloud.rememberDevice')}</strong>
                  <small>{t('cloud.rememberDeviceHint')}</small>
                </span>
                <input
                  type="checkbox"
                  className="cloud-switch"
                  checked={rememberDevice}
                  onChange={e => updateRememberDevice(e.target.checked)}
                  disabled={busy}
                />
              </label>

              <div className="cloud-actions">
                <button type="button" className="button button-primary" disabled={busy} onClick={syncNow}>
                  <RefreshCw size={16} />
                  סנכרון עכשיו
                </button>
                <button type="button" className="button button-white" disabled={busy} onClick={lock}>
                  <LockKeyhole size={16} />
                  {t('cloud.lock')}
                </button>
              </div>

              {bundle.isDemo && (
                <button
                  type="button"
                  className="button button-white button-full cloud-demo-upload-btn"
                  onClick={() => {
                    setOpen(false);
                    requestAnimationFrame(onUpload);
                  }}
                >
                  <Upload size={16} />
                  פתיחת קובץ GEDCOM לסנכרון
                </button>
              )}

              <details className="cloud-more">
                <summary>אפשרויות מתקדמות ופרטיות</summary>
                <div className="cloud-more-list">
                  <button type="button" className="cloud-more-item" disabled={busy || bundle.isDemo} onClick={enroll}>
                    <Fingerprint size={16} />
                    <span>הוספת Passkey במכשיר הזה</span>
                    <ChevronLeft size={14} className="cloud-more-arrow" />
                  </button>
                  <button type="button" className="cloud-more-item" disabled={busy} onClick={loadHistory}>
                    <History size={16} />
                    <span>עשר הגרסאות האחרונות בענן</span>
                    <ChevronLeft size={14} className="cloud-more-arrow" />
                  </button>
                  {showHistory && (
                    <div className="cloud-history">
                      <h4>גרסאות מוצפנות</h4>
                      {history.map(row => (
                        <button type="button" key={row.revision_id} disabled={busy} onClick={() => chooseHistory(row)}>
                          <strong>גרסה {row.generation}</strong>
                          <span>{dateLabel(row.updated_at)}</span>
                          <ChevronLeft size={14} />
                        </button>
                      ))}
                    </div>
                  )}
                  <button type="button" className="cloud-more-item cloud-danger" disabled={busy} onClick={erase}>
                    <Trash2 size={16} />
                    <span>מחיקת הכספת וכל גרסאותיה מהענן</span>
                  </button>
                </div>
                <p>
                  {rememberDevice
                    ? 'במכשיר הזה הכספת נשארת פתוחה עד לנעילה ידנית או התנתקות. '
                    : `${t('cloud.idleLock')} `}
                  גישה לענן אינה מעניקה מפתח פענוח — תוכן האילן מוצפן במכשיר לפני ההעלאה. אין לשלוח את מפתח השחזור לאף גורם.
                </p>
              </details>
            </div>
          )}

          {user && phase === 'connection-error' && (
            <div className="cloud-step">
              <button type="button" className="button button-white button-full" disabled={busy} onClick={refresh}>
                <RefreshCw size={16} />
                ניסיון חיבור נוסף
              </button>
            </div>
          )}

          {busy && (
            <div className="cloud-working" role="status">
              <LoaderCircle size={17} className="spin" />
              {t('cloud.workingSecure')}
            </div>
          )}
        </Dialog>
      )}
    </section>
  );
}
