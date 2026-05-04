# 📦 CHUNK 3b — Firebase Cloud Sync (SPEC ONLY — not yet built)

> Saved verbatim. To be implemented after Chunk 3a is verified in production use.

## Context

Chunks 1, 2, 3a are built and verified. The app has full functionality with
localStorage persistence, JSON manual backup/restore, and works offline-first.
Now add Firebase Firestore sync so progress mirrors across devices automatically.

**Architecture principle**: localStorage is the source of truth. Firebase is a
mirror. The app must work identically with Firebase disabled or offline.

## Critical: Don't Break Anything

- localStorage save path stays synchronous and unchanged
- All UI renders from localStorage first, never blocks on Firebase
- App must work fully with no Firebase config (existing user flow)
- After Chunk 3b, all Chunks 1–3a functionality works identically when Firebase
  is unconfigured/offline

## Schema Additions (v1 → v2 bump)

```javascript
// New root state fields:
{
  schemaVersion: 2,                    // bump
  deviceId: "uuid-v4",                 // generated once per install
  lastModified: 1735000000000,         // updated on every saveState()
  lastSyncedAt: null,                  // last successful cloud push
  pendingSync: false,                  // set when offline save happens
  firebase: {                          // null until configured
    apiKey: "...",
    authDomain: "...",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "...",
    enabled: true
  },
  authUid: null                        // set after Google sign-in
}
```

## Migration v1 → v2

```javascript
function migrate_1_to_2(state) {
  state.schemaVersion = 2;
  state.deviceId = state.deviceId || crypto.randomUUID();
  state.lastModified = state.lastModified || Date.now();
  state.lastSyncedAt = null;
  state.pendingSync = false;
  state.firebase = null;
  state.authUid = null;
  return state;
}
```

Add to migrations map. `CURRENT_SCHEMA = 2`.

## Firebase SDK Loading

Add to `<head>` (BEFORE the main app script):

```html
<script type="module">
  import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
  import {
    getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
  } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
  import {
    getFirestore, doc, setDoc, getDoc, onSnapshot, serverTimestamp
  } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

  window.__fb = {
    initializeApp, getAuth, GoogleAuthProvider, signInWithPopup, signOut,
    onAuthStateChanged, getFirestore, doc, setDoc, getDoc, onSnapshot, serverTimestamp,
    app: null, auth: null, db: null, unsubscribe: null
  };
</script>
```

Main app code uses `window.__fb.*`. If `window.__fb` is undefined or any field
null, treat as Firebase unavailable and continue with localStorage only.

## Sync Module

```javascript
const sync = {
  status: 'unconfigured', // 'unconfigured' | 'offline' | 'syncing' | 'synced' | 'error'
  online: navigator.onLine,
  pushDebounceTimer: null,

  init() {
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
    this.online = navigator.onLine;
    if (state.firebase?.enabled && state.firebase?.apiKey) {
      this.connect();
    } else {
      this.setStatus('unconfigured');
    }
  },

  setStatus(s) {
    this.status = s;
    renderSyncIndicator();
  },

  async connect() {
    if (!window.__fb || !state.firebase?.apiKey) {
      this.setStatus('unconfigured');
      return;
    }
    try {
      window.__fb.app = window.__fb.initializeApp(state.firebase);
      window.__fb.auth = window.__fb.getAuth(window.__fb.app);
      window.__fb.db = window.__fb.getFirestore(window.__fb.app);
      window.__fb.onAuthStateChanged(window.__fb.auth, (user) => {
        if (user) {
          state.authUid = user.uid;
          saveStateLocal(); // local only, don't trigger sync yet
          this.startListener();
          this.pullThenReconcile();
        } else {
          state.authUid = null;
          saveStateLocal();
          this.stopListener();
          this.setStatus('unconfigured');
        }
      });
    } catch (err) {
      console.error('Firebase init failed', err);
      this.setStatus('error');
      showToast('Firebase config invalid', 'error');
    }
  },

  async signIn() {
    if (!window.__fb?.auth) { showToast('Firebase not configured', 'error'); return; }
    try {
      const provider = new window.__fb.GoogleAuthProvider();
      await window.__fb.signInWithPopup(window.__fb.auth, provider);
    } catch (err) {
      showToast('Sign-in failed', 'error');
    }
  },

  async signOutUser() {
    if (window.__fb?.auth) await window.__fb.signOut(window.__fb.auth);
  },

  handleOnline() {
    this.online = true;
    if (state.pendingSync && state.authUid) this.pushNow();
    else if (state.authUid) this.setStatus('synced');
  },

  handleOffline() {
    this.online = false;
    this.setStatus('offline');
  },

  schedulePush() {
    if (!state.authUid || !this.online) {
      state.pendingSync = true;
      saveStateLocal();
      return;
    }
    clearTimeout(this.pushDebounceTimer);
    this.setStatus('syncing');
    this.pushDebounceTimer = setTimeout(() => this.pushNow(), 2000);
  },

  async pushNow() {
    if (!state.authUid || !window.__fb?.db) return;
    try {
      const ref = window.__fb.doc(window.__fb.db, 'users', state.authUid, 'data', 'state');
      // Strip firebase config and authUid before pushing — config is per-device
      const { firebase, authUid, ...payload } = state;
      payload.lastModified = state.lastModified;
      payload.deviceId = state.deviceId;
      await window.__fb.setDoc(ref, payload);
      state.lastSyncedAt = Date.now();
      state.pendingSync = false;
      saveStateLocal();
      this.setStatus('synced');
    } catch (err) {
      console.error('Push failed', err);
      state.pendingSync = true;
      saveStateLocal();
      this.setStatus('error');
    }
  },

  async pullThenReconcile() {
    if (!state.authUid || !window.__fb?.db) return;
    try {
      this.setStatus('syncing');
      const ref = window.__fb.doc(window.__fb.db, 'users', state.authUid, 'data', 'state');
      const snap = await window.__fb.getDoc(ref);
      if (!snap.exists()) {
        // First time: push local up
        await this.pushNow();
        return;
      }
      const remote = snap.data();
      this.reconcile(remote);
    } catch (err) {
      console.error('Pull failed', err);
      this.setStatus('error');
    }
  },

  reconcile(remote) {
    const localTime = state.lastModified || 0;
    const remoteTime = remote.lastModified || 0;

    // Same device's own write echoed back: ignore
    if (remote.deviceId === state.deviceId && remoteTime === localTime) {
      this.setStatus('synced');
      return;
    }

    const HOUR = 3600000;
    const diff = Math.abs(localTime - remoteTime);

    if (remoteTime > localTime && diff > HOUR) {
      // Significant divergence: prompt user
      showConflictModal(remote, localTime, remoteTime);
      return;
    }

    if (remoteTime > localTime) {
      // Cloud newer, recent: just adopt
      applyRemoteState(remote);
      this.setStatus('synced');
      showToast('Synced from cloud', 'success');
    } else {
      // Local newer or equal: push up
      this.pushNow();
    }
  },

  startListener() {
    if (!state.authUid || !window.__fb?.db) return;
    this.stopListener();
    const ref = window.__fb.doc(window.__fb.db, 'users', state.authUid, 'data', 'state');
    window.__fb.unsubscribe = window.__fb.onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const remote = snap.data();
      // Ignore own echoes
      if (remote.deviceId === state.deviceId && remote.lastModified === state.lastModified) return;
      this.reconcile(remote);
    });
  },

  stopListener() {
    if (window.__fb?.unsubscribe) {
      window.__fb.unsubscribe();
      window.__fb.unsubscribe = null;
    }
  }
};
```

## Hooking Sync into Save Path

Existing `saveState()` becomes:

```javascript
function saveStateLocal() {
  // Synchronous, never blocks. Existing logic.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveState() {
  state.lastModified = Date.now();
  saveStateLocal();
  sync.schedulePush();
}
```

All existing call sites continue to call `saveState()`. They get cloud sync
for free.

## applyRemoteState

```javascript
function applyRemoteState(remote) {
  // Preserve device-local fields
  const preservedFirebase = state.firebase;
  const preservedAuthUid = state.authUid;
  const preservedDeviceId = state.deviceId;

  Object.keys(state).forEach(k => delete state[k]);
  Object.assign(state, remote);

  state.firebase = preservedFirebase;
  state.authUid = preservedAuthUid;
  state.deviceId = preservedDeviceId;
  state.pendingSync = false;
  state.lastSyncedAt = Date.now();

  saveStateLocal();
  rerenderEverything();
}
```

`rerenderEverything()` = re-render current tab + stats row + header. Use whatever
full-app re-render hook you already have.

## Conflict Modal

When local and remote diverge by >1 hour, show modal:

- Title: "Sync conflict"
- Body: "This device was last updated {localTimeAgo}. Cloud was last updated
  {remoteTimeAgo} from {remoteDevice}."
- Three buttons:
  - "Use Cloud" → `applyRemoteState(remote)`, push back to confirm
  - "Keep Local" → `sync.pushNow()` (overwrites cloud)
  - "Merge" → run merge function below, then push

## Merge Function

```javascript
function mergeStates(local, remote) {
  const merged = JSON.parse(JSON.stringify(local));

  // Cards: per-key, take card with higher totalReviews
  for (const [k, rCard] of Object.entries(remote.cards || {})) {
    const lCard = merged.cards[k];
    if (!lCard || (rCard.totalReviews || 0) > (lCard.totalReviews || 0)) {
      merged.cards[k] = rCard;
    }
  }

  // Test attempts: per-key, take entry with higher attempts
  for (const [k, rAtt] of Object.entries(remote.testAttempts || {})) {
    const lAtt = merged.testAttempts[k];
    if (!lAtt || (rAtt.attempts || 0) > (lAtt.attempts || 0)) {
      merged.testAttempts[k] = rAtt;
    }
  }

  // Streak: take max
  merged.streak = Math.max(local.streak || 0, remote.streak || 0);

  // Activity log: union of dates, max counts per date
  merged.activity = { ...(local.activity || {}) };
  for (const [date, rDay] of Object.entries(remote.activity || {})) {
    const lDay = merged.activity[date];
    if (!lDay) merged.activity[date] = rDay;
    else {
      merged.activity[date] = {
        cardsReviewed: Math.max(lDay.cardsReviewed || 0, rDay.cardsReviewed || 0),
        testsAnswered: Math.max(lDay.testsAnswered || 0, rDay.testsAnswered || 0)
      };
    }
  }

  // Stories data + test packs: union (remote wins on key collision)
  merged.storiesData = { ...(local.storiesData || {}), ...(remote.storiesData || {}) };
  merged.testPacks = { ...(local.testPacks || {}), ...(remote.testPacks || {}) };

  // Languages: union (local wins on collision — preserves user's local theme tweaks)
  merged.languages = { ...(remote.languages || {}), ...(local.languages || {}) };

  merged.lastModified = Date.now();
  return merged;
}
```

## Settings Tab — New Section

Replace Section 4 (Backup) with "Sync & Backup" containing two subsections:

### Subsection: Cloud Sync (Firebase)

- Status indicator (color-coded glass pill):
  - 🟢 Synced
  - 🟡 Syncing
  - 🔴 Error
  - ⚫ Offline
  - ⚪ Not configured
- "Last synced: {timeago}" or "Never"
- If not configured: "Configure Firebase" gradient button → modal with 6 inputs
  (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId).
  Save: `state.firebase = {...inputs, enabled: true}`, then `sync.connect()`
- If configured but signed out: "Sign in with Google" gradient button → `sync.signIn()`
- If signed in: show user email, "Sign Out" button, "Force Push Now" small button
  (manual sync trigger)
- "Disconnect Firebase" button (with confirmation) → clears `state.firebase` and
  `state.authUid`, `sync.signOutUser()`, `sync.stopListener()`

### Subsection: Manual Backup (existing)

Keep all existing 3a backup functionality unchanged. JSON export/import remains
as fallback.

## Sync Status Indicator in Header

Add small glass pill next to the language pill in the header:

- Same color codes as Settings status
- Tap → opens Settings → Sync section
- Hidden if status is unconfigured (don't clutter header for users not using Firebase)

## Boot Sequence Update

In existing app boot:

```javascript
function boot() {
  loadState();        // existing — reads localStorage
  runMigrations();    // existing — now includes 1→2
  ensureSettings();   // existing
  if (!state.deviceId) state.deviceId = crypto.randomUUID();
  saveStateLocal();

  initRender();       // existing — renders from localStorage immediately

  sync.init();        // new — async, non-blocking
}
```

User sees app instantly. Sync happens in background.

## Firestore Security Rules

Paste into Firebase console:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/data/{doc} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

## README Updates

Add a "Cloud Sync Setup" section:

```markdown
## Cloud Sync Setup (Optional)

To sync progress across iPad/Mac/iPhone:

1. Go to https://console.firebase.google.com → Add project (free Spark plan)
2. Authentication → Sign-in method → Enable Google
3. Firestore Database → Create database → Start in production mode
4. Project Settings → General → Your apps → Web app → register → copy the config
5. Open this app → Settings → Cloud Sync → Configure Firebase → paste the 6 fields
6. Sign in with Google
7. Repeat steps 5–6 on every device using the same Google account

Paste these Firestore security rules in Firebase console → Firestore → Rules:
[paste the rules block above]

Free tier: 50K reads / 20K writes per day. You will not hit this limit.
```

## GitHub Pages Hosting Note

```markdown
## Hosting on GitHub Pages

1. Create a public GitHub repo
2. Push german-app.html (rename to index.html for clean URL, or keep as-is)
3. Repo Settings → Pages → Source: main branch, root folder
4. Open https://{username}.github.io/{repo}/ on iPad → Share → Add to Home Screen
5. Configure Firebase in Settings → cloud sync active across devices
```

## Test Checklist

- App boots and renders instantly with no Firebase configured (status pill hidden)
- Configure Firebase with valid config → status changes to ⚪ → sign in → 🟢 Synced
- Grade a card → 2-second debounce → status briefly 🟡 → 🟢
- Open same Firebase account on second device (e.g. Mac browser) → app pulls
  cloud state, renders updated progress
- Grade card on device A, wait 3 seconds, switch to device B → snapshot listener
  picks it up, B re-renders with new card state
- Disable wifi on iPad → grade cards → status ⚫ Offline → re-enable wifi →
  auto-pushes pending changes → 🟢
- Edit `lastModified` in browser localStorage to be 2 hours older than cloud →
  reload → conflict modal appears with 3 options
- "Use Cloud" → local replaced with cloud state, app re-renders correctly
- "Keep Local" → cloud overwritten, second device pulls local-as-newer
- "Merge" → both devices' card progress preserved, max streak retained
- Disconnect Firebase → status ⚪, all sync stops, manual JSON backup still works
- Wrong Firebase config → graceful error toast, no crash, app continues working
  in local-only mode
- Sign out → snapshot listener stops, `state.authUid` cleared, status ⚪
- Same-device echo: own push comes back via `onSnapshot` → ignored (no infinite
  loop)

## Build Order

1. Schema migration (currently v2 → bump to v3, see notes below) + boot order update
2. Firebase SDK loading in `<head>` + `window.__fb` fallback handling
3. `sync` module skeleton (status, online/offline events)
4. Connect / signIn / signOut flows
5. `saveState()` splits into `saveState` + `saveStateLocal`, hooks `schedulePush`
6. `pushNow` + debounce
7. `pullThenReconcile` + `applyRemoteState`
8. `onSnapshot` listener with own-echo filtering
9. Conflict modal + merge function
10. Settings Section 4 redesign (Sync subsection + Manual Backup subsection)
11. Header sync status pill
12. README updates (Firebase setup + security rules + GitHub Pages)
13. Final test pass

## Things That Could Bite

- **Own-echo loops**: every push triggers `onSnapshot`. The
  `deviceId === state.deviceId && lastModified === state.lastModified` guard
  must be exact. If you accidentally update `lastModified` between push and
  echo arrival, you'll loop. Push first, then snapshot fires, then guard catches.
- **Firebase config in localStorage**: the user's Firebase API key sits in their
  browser. This is fine for client SDK use (Firestore enforces auth via security
  rules), but document this in README so the user understands.
- **Firestore document size limit**: 1 MB per document. With cards growing over
  years, monitor `JSON.stringify(state).length`. Heavy users might hit this in
  2–3 years. Future migration: shard cards into subcollection.
- **Rapid-fire grading**: 2-second debounce means quick session of 30 cards =
  1 push, not 30. Good.
- **First-device-ever flow**: new account, no cloud doc → `pullThenReconcile`
  sees no doc → pushes local. Make sure this doesn't show conflict modal.

## Deliverable

- Updated `german-app.html` (single file, new schema version)
- README updated with Firebase + GitHub Pages sections
- Test checklist with checkmarks
- Summary: total lines, lines added in 3b, anything flagged

---

# Implementation Notes (mismatches with current code state — must reconcile when building)

The spec was written assuming current schema is v1. After Chunk 2's first-attempt
patch we already bumped to **v2**, and Chunk 3a left it at v2. So:

1. **Schema bump must be v2 → v3, not v1 → v2.** The new migration is
   `migrations[3] = (data) => { ... }` and `CURRENT_SCHEMA = 3`. The body of the
   migration stays the same as `migrate_1_to_2` above.
2. **`state.activity`** is referenced in `mergeStates` but **does not exist** in
   the current state shape. The Library Progress sparkline derives activity
   from `state.sessions`. Either:
   - (a) Update `mergeStates` to merge `state.sessions` instead of
     `state.activity`. Sessions array → group by date+langId+storyId, max
     `count`/`correct`. More work but matches current code.
   - (b) Add `state.activity = {}` as a new field that gets populated alongside
     sessions, and have the sparkline read from whichever has more data.
     Spec-faithful but adds a field.
   - Recommended: **(a)** — sessions is already the source of truth, no point
     duplicating.
3. **`state.streak`** is referenced in `mergeStates` but **does not exist** —
   streak is derived from sessions via `getStreak()`. The merged state's streak
   will be implicitly correct after sessions merge. Drop the
   `merged.streak = Math.max(...)` line.
4. **`rerenderEverything()`** in spec maps to existing `render()` function.
5. **Settings Section 4 ("Backup")** in chunk 3a will become "Sync & Backup".
   Existing export/import buttons move into the "Manual Backup" subsection
   below the new Sync subsection.
6. **iPad Safari + popup auth**: `signInWithPopup` may be blocked by Safari's
   strict popup policies. Worth testing on iPad first; fallback to
   `signInWithRedirect` if blocked.
7. **`window.__fb` is set by an inline `<script type="module">`** which is
   async-loaded by the browser. The main app script may execute before the
   module finishes. The current sync flow handles this: `sync.init()` runs at
   end of boot but only `connect()`s if `state.firebase?.enabled`. For users
   without Firebase configured, `__fb` not being ready is fine — we never call
   it. For users WITH Firebase configured, we may need a small wait/poll for
   `window.__fb` to exist before calling `sync.connect()`. Add a short retry.
8. **Strip `pendingSync` and `lastSyncedAt`** from the pushed payload too,
   along with `firebase` and `authUid` — they're device-local. The spec's
   `pushNow` only strips `firebase` and `authUid`; revisit before shipping.
