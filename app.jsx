/* app.jsx — root component: where the data lives (this phone or Supabase),
   signing in, tabs, header, About. */
const { useState, useEffect, useMemo, useRef } = React;

const EMPTY_SCORES = { byPlayer: new Map(), byQuestion: new Map(), latest: new Map(), crowds: new Map() };
const REFRESH_MS = 60000;

function App() {
  // On-phone data and settings. Online, only the settings (theme) are used.
  const [local, setLocal] = useState(() => loadState(Date.now()));
  const localRef = useRef(local);
  localRef.current = local;
  const commitLocal = (next) => { localRef.current = next; setLocal(next); };

  /* ---------- online ---------- */
  const mode = useMemo(() => dataMode(), []);
  const online = mode === "online";
  const client = useMemo(() => {
    if (!online) return null;
    const c = onlineConfig();
    return window.supabase.createClient(c.supabaseUrl, c.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }, []);
  // Who's signed in: undefined while checking, null when signed out.
  const [session, setSession] = useState(undefined);
  const uid = session?.user?.id || null;
  const uidRef = useRef(uid);
  uidRef.current = uid;
  // The last data read ({ uid, raw }), starting from the copy saved on the
  // phone so the app opens with something on screen.
  const [remote, setRemote] = useState(() => (online ? readOnlineCache() : null));
  const remoteRef = useRef(remote);
  remoteRef.current = remote;
  const [syncing, setSyncing] = useState(online);
  const [syncError, setSyncError] = useState(false);

  useEffect(() => {
    if (!client) return;
    let live = true;
    client.auth.getSession()
      .then(({ data }) => { if (live) setSession(data.session || null); })
      .catch(() => { if (live) setSession(null); });
    // Only note the change here: supabase-js asks that this callback not
    // wait on other supabase calls.
    const { data } = client.auth.onAuthStateChange((_event, s) => setSession(s || null));
    return () => { live = false; data.subscription.unsubscribe(); };
  }, []);

  const reload = async () => {
    if (!client || session === undefined) return;
    const who = uidRef.current;
    setSyncing(true);
    try {
      const raw = await loadRemote(client, who);
      if (uidRef.current !== who) return; // signed in or out meanwhile
      setRemote({ uid: who, raw });
      writeOnlineCache(who, raw);
      setSyncError(false);
    } catch (e) {
      setSyncError(true);
      throw e;
    } finally {
      setSyncing(false);
    }
  };
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => { if (online && session !== undefined) reloadRef.current().catch(() => {}); }, [uid, session === undefined]);

  // The clock: "closes in" labels count down and questions close on time.
  // Online, fresh data every minute and whenever the app comes back.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    const r = online ? setInterval(() => { if (document.visibilityState === "visible") reloadRef.current().catch(() => {}); }, REFRESH_MS) : null;
    const onShow = () => {
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      if (online) reloadRef.current().catch(() => {});
    };
    document.addEventListener("visibilitychange", onShow);
    return () => { clearInterval(t); clearInterval(r); document.removeEventListener("visibilitychange", onShow); };
  }, []);

  /* ---------- the state the screens see ---------- */
  // Online data is shown only for whoever is signed in now (the saved copy
  // may be from before a sign-out).
  const shown = online && remote && (session === undefined || remote.uid === uid) ? remote : null;
  const remoteState = useMemo(() => (shown ? fromRemote(shown.raw, shown.uid) : null), [shown]);
  const state = online
    ? {
        ...(remoteState || {
          questions: [], forecasts: [], log: [], needsProfile: false, isAdmin: false, signedOut: session === null,
          players: [{ id: ME, handle: "you", parish: "", country: "Jamaica" }],
        }),
        theme: local.theme, admin: !!remoteState?.isAdmin, sampleNotice: false,
        online: true, loading: syncing && !remoteState, syncError, email: session?.user?.email || "",
      }
    : { ...local, online: false };
  const scores = useMemo(
    () => (online ? (remoteState ? remoteScores(remoteState, shown.raw, shown.uid) : EMPTY_SCORES) : scoreAll(local)),
    [online ? remoteState : local],
  );

  const api = useMemo(() => (online
    ? remoteApi(client, {
        uid: () => uidRef.current,
        hasProfile: () => !!remoteRef.current?.raw?.profile && remoteRef.current.uid === uidRef.current,
        reload: () => reloadRef.current(),
        redirectTo: () => appUrl(),
      })
    : localApi(() => localRef.current, commitLocal)), []);

  /* run — do something through the api; say how it went. Returns whether
     it worked. Errors become a message a player can act on. */
  const run = async (fn, ok) => {
    try {
      await fn();
      // Catch the clock up: "Close now" closes at this instant, and the
      // half-minute tick would otherwise show the question open a while.
      setNow(Date.now());
      if (ok) showToast(ok, { tone: "ok" });
      return true;
    } catch (e) {
      showToast(friendlyError(e), { tone: "error" });
      return false;
    }
  };

  /* ---------- screens and sheets ---------- */
  const [tab, setTab] = useState("questions");
  const [about, setAbout] = useState(false);
  const [region, setRegion] = useState("JM");
  const [openQ, setOpenQ] = useState(null); // { id, admin }
  const [profileOpen, setProfileOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [newQOpen, setNewQOpen] = useState(false);

  useEffect(() => { window.pkSplashDone?.(); }, []);
  useEffect(() => { saveState(local); }, [local]);

  useEffect(() => {
    const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
    const apply = () => {
      const resolved = state.theme === "auto" ? (mq?.matches ? "light" : "dark") : state.theme;
      document.documentElement.setAttribute("data-theme", resolved);
      document.body.setAttribute("data-theme", resolved);
      const meta = document.getElementById("theme-color-meta");
      if (meta) meta.setAttribute("content", resolved === "light" ? "#f2f2f7" : "#000000");
    };
    apply();
    if (state.theme === "auto" && mq) {
      mq.addEventListener?.("change", apply);
      return () => mq.removeEventListener?.("change", apply);
    }
  }, [state.theme]);

  // Just signed in for the first time: ask for a handle straight away.
  useEffect(() => { if (state.needsProfile) setProfileOpen(true); }, [state.needsProfile]);
  // Admin rights gone (signed out, or switched off): leave the Admin tab.
  useEffect(() => { if (!state.admin && tab === "admin") setTab("questions"); }, [state.admin]);
  React.useLayoutEffect(() => { window.scrollTo?.(0, 0); }, [tab, about]);

  // About holds a Back-button entry, so the phone's Back returns to the tab.
  const aboutLayer = useRef(null);
  const openAbout = () => {
    setAbout(true);
    if (!aboutLayer.current) aboutLayer.current = openBackLayer(() => { aboutLayer.current = null; setAbout(false); });
  };
  const closeAbout = () => {
    if (aboutLayer.current) { closeBackLayer(aboutLayer.current); aboutLayer.current = null; }
    setAbout(false);
  };
  const go = (t) => { closeAbout(); setTab(t); };
  const openQuestion = (id, admin) => setOpenQ({ id, admin: !!admin });
  const q = openQ && state.questions.find((x) => x.id === openQ.id);
  const waiting = state.questions.filter((x) => ["closed", "disputed"].includes(phase(x, now))).length;

  const setPref = (patch) => commitLocal({ ...localRef.current, ...patch });
  const switchMode = (m) => {
    askConfirm({
      title: m === "online" ? "Play online?" : "Use this phone only?",
      body: m === "online"
        ? "Sign in to play in the shared league. What's saved on this phone stays here for later."
        : "Switch to the questions, players and calls saved on this phone. Your online account stays as it is.",
      confirmLabel: "Switch",
    }).then((ok) => { if (ok) { setDataMode(m); location.reload(); } });
  };
  const signOut = () => run(() => api.signOut(), "Signed out");

  const backup = () => {
    const blob = new Blob([JSON.stringify(local, null, 2)], { type: "application/json" });
    downloadBlob(blob, `predikt-backup-${toJmInput(new Date().toISOString()).slice(0, 10)}.json`);
  };
  const restore = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      let next;
      try { next = sanitizeState(JSON.parse(String(reader.result))); } catch { showToast("That file isn't a Predikt backup.", { tone: "error" }); return; }
      askConfirm({
        title: "Restore this backup?",
        body: `${next.questions.length} questions, ${next.players.length} players and ${next.forecasts.length} calls. It replaces everything on this phone.`,
        confirmLabel: "Restore", danger: true,
      }).then((ok) => { if (ok) { commitLocal(next); showToast("Backup restored", { tone: "ok" }); } });
    };
    reader.readAsText(file);
  };
  const removeSamples = () => {
    askConfirm({ title: "Remove the samples?", body: "Sample questions, players and their calls go. Your profile and anything you made stay.", confirmLabel: "Remove" })
      .then((ok) => { if (ok) { commitLocal({ ...removeSample(localRef.current), sampleNotice: false }); showToast("Samples removed", { tone: "ok" }); } });
  };
  const reset = () => {
    askConfirm({ title: "Start fresh?", body: "Deletes every question, player, call and log entry on this phone. Back up first if you might want them.", confirmLabel: "Delete everything", danger: true })
      .then((ok) => {
        if (!ok) return;
        const s = localRef.current;
        commitLocal({ ...blankState(), theme: s.theme, admin: s.admin, sampleNotice: false });
        showToast("Everything cleared", { tone: "ok" });
      });
  };

  return (
    <div style={{ paddingBottom: "calc(130px + var(--safe-bottom))" }}>
      <Header onAbout={openAbout} online={online} syncing={syncing} syncError={syncError} onSync={() => run(() => reload())} />

      {about ? <AboutView onBack={closeAbout} online={online} /> : (
        <>
          {tab === "questions" && (
            <QuestionsView state={state} scores={scores} now={now} region={region} setRegion={setRegion}
              onOpen={openQuestion} onProfile={() => setProfileOpen(true)} onSignIn={() => setSignInOpen(true)} onRetry={() => run(() => reload())}
              onDismissSample={() => setPref({ sampleNotice: false })} onRemoveSample={removeSamples} />
          )}
          {tab === "leaders" && (
            <LeaderboardView state={state} scores={scores} onProfile={() => setProfileOpen(true)} onSignIn={() => setSignInOpen(true)} onAbout={openAbout} />
          )}
          {tab === "me" && (
            <MeView state={state} scores={scores} now={now} configured={!!onlineConfig() && !!window.supabase}
              onOpen={openQuestion} onEditProfile={() => setProfileOpen(true)} onSignIn={() => setSignInOpen(true)} onSignOut={signOut} onSwitchMode={switchMode}
              setTheme={(theme) => setPref({ theme })} setAdmin={(admin) => setPref({ admin })}
              onBackup={backup} onRestore={restore} onRemoveSample={removeSamples} onReset={reset} onAbout={openAbout} />
          )}
          {tab === "admin" && state.admin && (
            <AdminView state={state} scores={scores} now={now} api={api} run={run} onOpen={openQuestion} onNewQuestion={() => setNewQOpen(true)} />
          )}
        </>
      )}

      <AppFooter onAbout={about ? null : openAbout} />

      <Taskbar activeTab={about ? null : tab} onTab={go} admin={state.admin} waiting={waiting} />

      {q && <QuestionSheet key={q.id} q={q} state={state} scores={scores} now={now} api={api} run={run} adminOpen={openQ.admin} onClose={() => setOpenQ(null)} onSignIn={() => setSignInOpen(true)} onProfile={() => setProfileOpen(true)} />}
      {profileOpen && <ProfileSheet state={state} api={api} run={run} onClose={() => setProfileOpen(false)} />}
      {signInOpen && <SignInSheet api={api} run={run} onClose={() => setSignInOpen(false)} />}
      {newQOpen && <NewQuestionSheet api={api} run={run} onClose={() => setNewQOpen(false)} />}
      <ToastHost />
      <ConfirmHost />
    </div>
  );
}

/* ============ Header ============ */
function Header({ onAbout, online, syncing, syncError, onSync }) {
  // The hairline under the header only shows once the page has scrolled.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className={"pk-header" + (scrolled ? " is-scrolled" : "")}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "calc(var(--safe-top) + 12px) 20px 12px", display: "flex", alignItems: "center", gap: 10 }}>
        <img src="icon-192.svg" alt="" width="28" height="28" className="pk-pop" style={{ borderRadius: 8, flexShrink: 0 }} />
        <h1 style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>{APP_NAME}</h1>
        {online && (
          <button onClick={onSync} disabled={syncing} title={syncError ? "Couldn't sync. Tap to try again." : "Refresh"}
            aria-label={syncing ? "Syncing" : syncError ? "Couldn't sync. Try again" : "Refresh"} style={{ ...iconBtn(), color: syncError ? "var(--bad)" : "var(--ink-dim)" }}>
            {syncing ? <Spinner size={18} /> : <Icon name={syncError ? "cloudOff" : "refresh"} size={18} />}
          </button>
        )}
        <button onClick={onAbout} title="About and rules" aria-label="About and rules" style={iconBtn()}>
          <Icon name="info" size={19} />
        </button>
      </div>
    </header>
  );
}

/* ============ About ============ */
/* The business plan's guardrails, said plainly to players: how scoring
   works, the hard rules, and how a result is settled. */
function AboutView({ onBack, online }) {
  const p = { margin: "10px 0 0", fontSize: 14, color: "var(--ink-dim)", lineHeight: 1.6 };
  const strong = { color: "var(--ink)" };
  const li = { margin: "6px 0 0", fontSize: 14, color: "var(--ink-dim)", lineHeight: 1.55 };
  const examples = [
    ["90% Yes, and it's Yes", pointsFor([90, 10], 0)],
    ["70% Yes, and it's Yes", pointsFor([70, 30], 0)],
    ["50% Yes, either way", pointsFor([50, 50], 0)],
    ["70% Yes, and it's No", pointsFor([70, 30], 1)],
    ["90% Yes, and it's No", pointsFor([90, 10], 1)],
    ["100% Yes, and it's No", pointsFor([100, 0], 1)],
  ];
  return (
    <main className="pk-view pk-page" style={{ padding: "16px 20px 0" }}>
      <div style={{ marginBottom: 12 }}>
        <button onClick={onBack} style={ghostBtn()}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><ChevronIcon dir="left" size={12} />Back</span></button>
      </div>
      <Card>
        <SectionHead icon="dial" title={`About ${APP_NAME}`} />
        <p style={{ ...p, marginTop: 0 }}>A free forecasting league for Jamaican events first (Champs, elections, the BOJ rate, the Reggae Boyz) and international ones second. Make your call, and climb the table when it comes true. <strong style={strong}>No money goes in or comes out.</strong></p>
        <ol style={{ margin: "10px 0 0", paddingLeft: 20 }}>
          <li style={li}>Pick an open question, Jamaica or International.</li>
          <li style={li}>Make your call: a chance of Yes, or the option you think is most likely and how sure you are.</li>
          <li style={li}>Change it as often as you like. Your latest call before it closes counts.</li>
          <li style={li}>It resolves from the named public source, and you score points.</li>
          <li style={li}>Share your call and your rank in WhatsApp.</li>
        </ol>
      </Card>

      <Card>
        <SectionHead icon="trophy" title="How points work" />
        <p style={{ ...p, marginTop: 0 }}>Every resolved call scores <strong style={strong}>from 0 to 100</strong>. Sure and right scores 100; sure and wrong scores 0. Points never go below zero.</p>
        <p style={p}>Under the hood it's a <strong style={strong}>Brier score</strong>: for every option, the gap between your chance and what happened, squared and added up (0 is perfect, 2 is sure and wrong). Points are 100 × (1 − Brier ÷ 2).</p>
        <p style={p}>So <strong style={strong}>say what you really think</strong>. If you reckon it's 70%, calling 70% scores best over time. Going 100% when you're only 70% sure wins big now and then, but costs more on the days it's wrong.</p>
        <div style={{ marginTop: 12, borderRadius: 12, background: "var(--bg-2)", padding: "4px 12px" }}>
          {examples.map(([l, v], i, a) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", fontSize: 13.5, borderBottom: i === a.length - 1 ? "none" : "1px dashed var(--line-soft)" }}>
              <span style={{ flex: 1, color: "var(--ink-dim)" }}>{l}</span>
              <span style={{ width: 70, height: 5, borderRadius: 3, background: "var(--fill)", overflow: "hidden" }}>
                <span className="pk-grow-x" style={{ display: "block", animationDelay: `${0.1 + i * 0.05}s`, width: `${v}%`, height: "100%", background: v >= 75 ? "var(--ok)" : "var(--accent)" }} />
              </span>
              <span className="mono" style={{ width: 30, textAlign: "right", fontWeight: 600 }}>{fmtPts(v)}</span>
            </div>
          ))}
        </div>
        <p style={p}>The leaderboard ranks by <strong style={strong}>Points</strong> (the total, so turning up counts) or by <strong style={strong}>Accuracy</strong> (points per call, once you have {MIN_FOR_ACCURACY} scored).</p>
      </Card>

      <Card>
        <SectionHead icon="shield" title="Hard rules" />
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li style={{ ...li, marginTop: 0 }}>Points have no monetary value. They can never be bought, sold, transferred or exchanged for cash or goods.</li>
          <li style={li}>No entry fee for any league with a prize. Any prize is free entry, skill-based, 18+ only, and only after legal advice.</li>
          <li style={li}>No questions on deaths, crimes against named people, or minors' personal outcomes.</li>
        </ul>
      </Card>

      <Card>
        <SectionHead icon="checkCircle" tone="var(--ok)" title="How results are settled" />
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li style={{ ...li, marginTop: 0 }}>Every question names its source before it opens, and closes before the event starts (Jamaica time).</li>
          <li style={li}>Only an admin resolves a question, and every decision is logged with a source link.</li>
          <li style={li}>A disputed result is frozen, with its points on hold, while the source is checked. If the source is unclear, the question is void and nobody scores. Complaints get a reply within 24 hours.</li>
        </ul>
      </Card>

      <Card>
        <SectionHead icon={online ? "cloud" : "phone"} tone="var(--intl)" title="Your data" />
        {online ? (
          <p style={{ ...p, marginTop: 0 }}>You sign in with your email; no password. Your handle, parish, country and calls are kept in {APP_NAME}'s database. Others see your handle, parish and points, and your calls once a question closes; your email stays private.</p>
        ) : (
          <p style={{ ...p, marginTop: 0 }}>This mode keeps everything on this phone: no account, nothing sent anywhere. Back it up from Me → Data.</p>
        )}
        <p style={p}>{APP_NAME} is an independent side project. It isn't connected to the BOJ, ISSA, the JFF or any source it names.</p>
      </Card>
    </main>
  );
}

/* ============ Taskbar ============ */
function Taskbar({ activeTab, onTab, admin, waiting }) {
  const tabs = [
    { id: "questions", label: "Questions", icon: "dial" },
    { id: "leaders", label: "Leaders", icon: "trophy" },
    { id: "me", label: "Me", icon: "user" },
    ...(admin ? [{ id: "admin", label: "Admin", icon: "shield", badge: waiting }] : []),
  ];
  const activeIndex = tabs.findIndex((t) => t.id === activeTab);

  // iOS keeps fixed bars on the layout viewport, so with the on-screen
  // keyboard up the tab bar floats loose over the page. Step it aside while
  // typing; the keyboard shrinks the visual viewport, which is how it's spotted.
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => setKeyboard(vv.scale < 1.05 && window.innerHeight - vv.height > 120);
    onResize();
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  return (
    <nav aria-label="Main" className={"pk-tabbar" + (keyboard ? " is-away" : "")} aria-hidden={keyboard || undefined}>
      <div className="pk-dock" style={{ maxWidth: tabs.length > 3 ? 420 : 360, margin: "0 auto", padding: "0 16px 12px", pointerEvents: "auto" }}>
        <div role="tablist" style={{
          // A floating capsule of frosted glass, like the iOS tab bar.
          background: "var(--surface-translucent)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          border: "1px solid var(--glass-edge)",
          borderRadius: 30, padding: 5,
          display: "grid", gridTemplateColumns: `repeat(${tabs.length}, 1fr)`, gap: 4,
          boxShadow: "0 16px 40px -16px rgba(0,0,0,0.6)",
          position: "relative", isolation: "isolate",
        }}>
          {/* One highlight that glides to the active tab. Each column is
              (100% − padding − gaps) / n wide, so moving by its own width
              plus one gap lands it on the next tab. */}
          {activeIndex >= 0 && (
            <span aria-hidden className="pk-tab-pill" style={{
              position: "absolute", top: 5, bottom: 5, left: 5, zIndex: -1,
              width: `calc((100% - 10px - ${(tabs.length - 1) * 4}px) / ${tabs.length})`,
              transform: `translateX(calc(${activeIndex} * (100% + 4px)))`,
              borderRadius: 25, background: "var(--fill)",
            }} />
          )}
          {tabs.map((t) => {
            const active = activeTab === t.id;
            return (
              <button key={t.id} role="tab" aria-selected={active} onClick={() => onTab(t.id)} style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
                padding: "9px 6px 7px", border: "none", borderRadius: 25, background: "transparent",
                color: active ? "var(--accent)" : "var(--ink-dim)", cursor: "pointer",
                transition: "background 0.18s, color 0.18s, var(--press)", position: "relative", fontFamily: "inherit",
              }}>
                {/* Keyed by state, so the icon squashes and springs back
                    each time its tab is picked. */}
                <span key={active ? "on" : "off"} className={active ? "pk-tab-pop" : undefined} style={{ display: "inline-flex" }}><Icon name={t.icon} size={20} stroke={1.6} /></span>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.005em" }}>{t.label}</span>
                {t.badge > 0 && (
                  <span key={t.badge} className="mono pk-pop" style={{
                    position: "absolute", top: 5, right: "calc(50% - 22px)", fontSize: 9, fontWeight: 700,
                    padding: "1px 5px", borderRadius: 999, background: "var(--accent)", color: "var(--accent-ink)",
                  }}>{t.badge}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

/* mount */
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
