/* app.jsx — root component: state, saving, tabs, header, About. */
const { useState, useEffect, useMemo, useRef } = React;

function App() {
  const [state, setState] = useState(() => loadState(Date.now()));
  const stateRef = useRef(state);
  stateRef.current = state;
  const [tab, setTab] = useState("questions");
  const [about, setAbout] = useState(false);
  const [region, setRegion] = useState("JM");
  const [openQ, setOpenQ] = useState(null); // { id, admin }
  const [profileOpen, setProfileOpen] = useState(false);
  const [newQOpen, setNewQOpen] = useState(false);

  // The clock: "closes in" labels count down and questions close on time.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    const onShow = () => { if (document.visibilityState === "visible") setNow(Date.now()); };
    document.addEventListener("visibilitychange", onShow);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onShow); };
  }, []);

  useEffect(() => { window.pkSplashDone?.(); }, []);
  useEffect(() => { saveState(state); }, [state]);

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

  /* act — run a state change from helpers.jsx. Its error message (closed
     question, missing link…) is shown as a toast. Returns whether it worked. */
  const act = (fn, ok) => {
    try {
      const next = fn(stateRef.current);
      stateRef.current = next;
      setState(next);
      if (ok) showToast(ok);
      return true;
    } catch (e) {
      showToast(e.message || "Something went wrong.");
      return false;
    }
  };
  const setField = (patch) => act((s) => ({ ...s, ...patch }));

  // Scores depend only on the data (each counting call is fixed by its
  // question's close time), so a clock tick doesn't recount them.
  const scores = useMemo(() => scoreAll(state), [state]);
  const waiting = state.questions.filter((q) => ["closed", "disputed"].includes(phase(q, now))).length;

  // Admin off while on the Admin tab: go back to Questions.
  useEffect(() => { if (!state.admin && tab === "admin") setTab("questions"); }, [state.admin]);
  React.useLayoutEffect(() => { window.scrollTo?.(0, 0); }, [tab, about]);

  const go = (t) => { setAbout(false); setTab(t); };
  const openQuestion = (id, admin) => setOpenQ({ id, admin: !!admin });
  const q = openQ && state.questions.find((x) => x.id === openQ.id);

  const backup = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    downloadBlob(blob, `predikt-backup-${toJmInput(new Date().toISOString()).slice(0, 10)}.json`);
  };
  const restore = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      let next;
      try { next = sanitizeState(JSON.parse(String(reader.result))); } catch { showToast("That file isn't a Predikt backup."); return; }
      askConfirm({
        title: "Restore this backup?",
        body: `${next.questions.length} questions, ${next.players.length} players and ${next.forecasts.length} calls. It replaces everything on this phone.`,
        confirmLabel: "Restore", danger: true,
      }).then((ok) => { if (ok) act(() => next, "Backup restored"); });
    };
    reader.readAsText(file);
  };
  const removeSamples = () => {
    askConfirm({ title: "Remove the samples?", body: "Sample questions, players and their calls go. Your profile and anything you made stay.", confirmLabel: "Remove" })
      .then((ok) => { if (ok) act((s) => ({ ...removeSample(s), sampleNotice: false }), "Samples removed"); });
  };
  const reset = () => {
    askConfirm({ title: "Start fresh?", body: "Deletes every question, player, call and log entry on this phone. Back up first if you might want them.", confirmLabel: "Delete everything", danger: true })
      .then((ok) => { if (ok) act((s) => ({ ...blankState(), theme: s.theme, admin: s.admin, sampleNotice: false }), "Everything cleared"); });
  };

  return (
    <div style={{ paddingBottom: "calc(130px + var(--safe-bottom))" }}>
      <Header onAbout={() => setAbout(true)} />

      {about ? <AboutView onBack={() => setAbout(false)} /> : (
        <>
          {tab === "questions" && (
            <QuestionsView state={state} scores={scores} now={now} region={region} setRegion={setRegion}
              onOpen={openQuestion} onProfile={() => setProfileOpen(true)}
              onDismissSample={() => setField({ sampleNotice: false })} onRemoveSample={removeSamples} />
          )}
          {tab === "leaders" && (
            <LeaderboardView state={state} scores={scores} onProfile={() => setProfileOpen(true)} onAbout={() => setAbout(true)} />
          )}
          {tab === "me" && (
            <MeView state={state} scores={scores} now={now} onOpen={openQuestion} onEditProfile={() => setProfileOpen(true)}
              setTheme={(theme) => setField({ theme })} setAdmin={(admin) => setField({ admin })}
              onBackup={backup} onRestore={restore} onRemoveSample={removeSamples} onReset={reset} onAbout={() => setAbout(true)} />
          )}
          {tab === "admin" && state.admin && (
            <AdminView state={state} scores={scores} now={now} onOpen={openQuestion} onNewQuestion={() => setNewQOpen(true)} act={act} />
          )}
        </>
      )}

      <AppFooter onAbout={about ? null : () => setAbout(true)} />

      <Taskbar activeTab={about ? null : tab} onTab={go} admin={state.admin} waiting={waiting} />

      {q && <QuestionSheet key={q.id} q={q} state={state} scores={scores} now={now} adminOpen={openQ.admin} onClose={() => setOpenQ(null)} act={act} />}
      {profileOpen && <ProfileSheet state={state} onClose={() => setProfileOpen(false)} act={act} />}
      {newQOpen && <NewQuestionSheet onClose={() => setNewQOpen(false)} act={act} />}
      <ToastHost />
      <ConfirmHost />
    </div>
  );
}

/* ============ Header ============ */
function Header({ onAbout }) {
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
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "calc(var(--safe-top) + 12px) 20px 12px", display: "flex", alignItems: "center", gap: 12 }}>
        <img src="icon-192.svg" alt="" width="28" height="28" style={{ borderRadius: 8, flexShrink: 0 }} />
        <h1 style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>{APP_NAME}</h1>
        <button onClick={onAbout} title="About and rules" aria-label="About and rules" style={iconBtn()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5" /><path d="M12 7.6v.01" /></svg>
        </button>
      </div>
    </header>
  );
}

/* ============ About ============ */
/* The business plan's guardrails, said plainly to players: how scoring
   works, the hard rules, and how a result is settled. */
function AboutView({ onBack }) {
  const p = { margin: "10px 0 0", fontSize: 14, color: "var(--ink-dim)", lineHeight: 1.6 };
  const strong = { color: "var(--ink)" };
  const li = { margin: "6px 0 0", fontSize: 14, color: "var(--ink-dim)", lineHeight: 1.55 };
  return (
    <main className="pk-view pk-page" style={{ padding: "16px 20px 0" }}>
      <div style={{ marginBottom: 12 }}>
        <button onClick={onBack} style={{ ...ghostBtn(), display: "inline-flex", alignItems: "center", gap: 6 }}><ChevronIcon dir="left" size={12} /> Back</button>
      </div>
      <Card>
        <SectionHead title={`About ${APP_NAME}`} />
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
        <SectionHead title="How points work" />
        <p style={{ ...p, marginTop: 0 }}>Each call gets a <strong style={strong}>Brier score</strong>: for every option, the gap between your chance and what happened (100% if it did, 0% if not), squared and added up. 0 is perfect; 2 is certain and wrong.</p>
        <p style={p}>Points are <strong style={strong}>100 × how much better than a coin flip</strong> you did. An even spread (50% on a Yes/No) scores 0 whatever happens. So guessing 50% on everything gets you nowhere, and being sure and wrong costs more than being sure and right earns.</p>
        <div style={{ marginTop: 12, borderRadius: 12, background: "var(--bg-2)", padding: "4px 12px" }}>
          {[["90% Yes, and it's Yes", 96], ["70% Yes, and it's Yes", 64], ["50% Yes, either way", 0], ["70% Yes, and it's No", -96], ["90% Yes, and it's No", -224]].map(([l, v], i, a) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 13.5, borderBottom: i === a.length - 1 ? "none" : "1px dashed var(--line-soft)" }}>
              <span style={{ color: "var(--ink-dim)" }}>{l}</span><span className="mono" style={{ fontWeight: 600, color: v < 0 ? "var(--bad)" : "var(--ink)" }}>{fmtPts(v)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionHead title="Hard rules" />
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li style={{ ...li, marginTop: 0 }}>Points have no monetary value. They can never be bought, sold, transferred or exchanged for cash or goods.</li>
          <li style={li}>No entry fee for any league with a prize. Any prize is free entry, skill-based, 18+ only, and only after legal advice.</li>
          <li style={li}>No questions on deaths, crimes against named people, or minors' personal outcomes.</li>
        </ul>
      </Card>

      <Card>
        <SectionHead title="How results are settled" />
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li style={{ ...li, marginTop: 0 }}>Every question names its source before it opens, and closes before the event starts (Jamaica time).</li>
          <li style={li}>Only an admin resolves a question, and every decision is logged with a source link.</li>
          <li style={li}>A disputed result is frozen, with its points on hold, while the source is checked. If the source is unclear, the question is void and nobody scores. Complaints get a reply within 24 hours.</li>
        </ul>
      </Card>

      <Card>
        <SectionHead title="Your data" />
        <p style={{ ...p, marginTop: 0 }}>This version keeps everything on this phone: no account, nothing sent anywhere. Back it up from Me → Data. An online version with sign-in and a shared leaderboard comes next.</p>
        <p style={p}>{APP_NAME} is an independent side project. It isn't connected to the BOJ, ISSA, the JFF or any source it names.</p>
      </Card>
    </main>
  );
}

/* ============ Taskbar ============ */
function Taskbar({ activeTab, onTab, admin, waiting }) {
  const tabs = [
    { id: "questions", label: "Questions", icon: QuestionsIcon },
    { id: "leaders", label: "Leaders", icon: LeadersIcon },
    { id: "me", label: "Me", icon: MeIcon },
    ...(admin ? [{ id: "admin", label: "Admin", icon: AdminIcon, badge: waiting }] : []),
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
            const Icon = t.icon;
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
                <span key={active ? "on" : "off"} className={active ? "pk-tab-pop" : undefined} style={{ display: "inline-flex" }}><Icon /></span>
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

const tabIcon = (children) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
/* A dial reading most of the way round: a call with a chance on it. */
function QuestionsIcon() {
  return tabIcon(<><circle cx="12" cy="12" r="8.5" strokeOpacity="0.35" /><path d="M12 3.5a8.5 8.5 0 1 1-8.1 11" /><path d="M8.5 12.3l2.4 2.4 4.6-5" /></>);
}
function LeadersIcon() {
  return tabIcon(<><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 3.6" /><path d="M17 6h2.5a2.5 2.5 0 0 1-2.6 3.6" /></>);
}
function MeIcon() {
  return tabIcon(<><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20c0-3.9 3.4-6.4 7.5-6.4s7.5 2.5 7.5 6.4" /></>);
}
function AdminIcon() {
  return tabIcon(<><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z" /><path d="M9 12l2.2 2.2L15.5 10" /></>);
}

/* mount */
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
