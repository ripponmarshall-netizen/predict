/* me.jsx — your profile and record, your calls, account, settings and data;
   the profile sheet and the sign-in sheet. */
const { useState: useStateM, useRef: useRefM, useEffect: useEffectM } = React;

const THEMES = [
  { v: "auto", l: <IconLabel icon="auto" size={14} gap={5}>Auto</IconLabel> },
  { v: "dark", l: <IconLabel icon="moon" size={14} gap={5}>Dark</IconLabel> },
  { v: "light", l: <IconLabel icon="sun" size={14} gap={5}>Light</IconLabel> },
];

function MeView({ state, scores, now, configured, onOpen, onEditProfile, onSignIn, onSignOut, onSwitchMode, setTheme, setAdmin, onBackup, onRestore, onRemoveSample, onReset, onAbout }) {
  const me = state.players.find((p) => p.id === ME);
  const s = scores.byPlayer.get(ME) || { points: 0, scored: 0, brierSum: 0 };
  const all = leaderboard(state, scores, "all");
  const myRow = all.find((r) => r.player.id === ME);
  const called = [...new Set(state.forecasts.filter((f) => f.playerId === ME).map((f) => f.questionId))]
    .map((id) => state.questions.find((q) => q.id === id)).filter(Boolean)
    .sort((a, b) => Date.parse(b.closeAt) - Date.parse(a.closeAt));
  const fileRef = useRefM(null);
  const where = [me.parish, me.country].filter(Boolean).join(" · ");
  const unnamed = state.needsProfile || (!state.online && me.handle === "you");
  return (
    <main className="pk-view pk-page" style={{ padding: "16px 20px 0" }}>
      {state.signedOut ? (
        <Card style={{ textAlign: "center" }}>
          <span className="pk-float" style={{ display: "inline-flex", width: 60, height: 60, borderRadius: 18, alignItems: "center", justifyContent: "center", background: "color-mix(in oklab, var(--accent) 16%, transparent)", color: "var(--accent)" }}>
            <Icon name="user" size={28} />
          </span>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 10 }}>Sign in to play</div>
          <div style={{ fontSize: 13.5, color: "var(--ink-dim)", lineHeight: 1.5, margin: "6px auto 0", maxWidth: 320 }}>
            Make your calls, keep your record and climb the leaderboard. Just your email: we send a code, no password.
          </div>
          <button onClick={onSignIn} style={{ ...accentBtn(), marginTop: 14, padding: "12px 20px", fontSize: 15 }}><IconLabel icon="logIn">Sign in</IconLabel></button>
        </Card>
      ) : (
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar handle={unnamed ? "?" : me.handle} size={48} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis" }}>{unnamed ? "Pick a handle" : me.handle}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--ink-faint)", marginTop: 2 }}>
                <Icon name="pin" size={13} />{where || "No parish set"}
              </div>
            </div>
            <button onClick={onEditProfile} style={ghostBtn()}><IconLabel icon="edit" size={15}>Edit</IconLabel></button>
          </div>
          <div className="pk-hero" style={{ marginTop: 14 }}>
            <span key={Math.round(s.points)} className="pk-sheen" aria-hidden />
            <div className="label" style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name="trophy" size={14} />Points</div>
            <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 2 }}>
              <AnimatedNumber value={s.points} from={0} format={fmtPts} durationMs={700} />
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-dim)", marginTop: 2 }}>
              {s.scored ? `Brier ${fmtBrier(s.brierSum / s.scored)} on average` : "Points come in as your calls resolve."}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 10 }}>
            <StatTile icon="trophy" label="Rank">{myRow?.rank != null ? `${myRow.rank}` : "–"}<span style={{ fontSize: 12, color: "var(--ink-faint)", fontWeight: 500 }}>{myRow?.rank != null ? ` of ${all.filter((r) => r.rank != null).length}` : ""}</span></StatTile>
            <StatTile icon="dial" label="Calls">{called.length}</StatTile>
            <StatTile icon="target" label="Per call">{s.scored ? fmtPts(s.points / s.scored) : "–"}</StatTile>
          </div>
        </Card>
      )}

      {!state.signedOut && (
        <Card>
          <SectionHead icon="dial" title="Your calls" subtitle={called.length ? `${called.length} ${called.length === 1 ? "question" : "questions"}` : null} />
          {called.length
            ? <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 8 }}>{called.map((q, i) => <QuestionRow key={q.id} q={q} scores={scores} now={now} index={i} onOpen={() => onOpen(q.id)} />)}</div>
            : <EmptyNote icon="dial">You haven't made a call yet. Pick a question on the Questions tab.</EmptyNote>}
        </Card>
      )}

      {(state.online || configured) && (
        <Card>
          {state.online ? (
            <>
              <SectionHead icon="cloud" tone="var(--intl)" title="Online" subtitle={state.signedOut ? "Not signed in. Anyone can look; sign in to play." : `Signed in as ${state.email || "you"}.`}
                right={!state.signedOut && <button onClick={onSignOut} style={ghostBtn()}><IconLabel icon="logOut" size={15}>Sign out</IconLabel></button>} />
              <button onClick={() => onSwitchMode("local")} style={{ ...linkBtn(13) }}>Use this phone only instead</button>
            </>
          ) : (
            <>
              <SectionHead icon="phone" title="On this phone only" subtitle="Your questions, players and calls are saved here, not shared." />
              <button onClick={() => onSwitchMode("online")} style={accentBtn()}><IconLabel icon="cloud">Play online</IconLabel></button>
            </>
          )}
        </Card>
      )}

      <Card>
        <SectionHead icon="sun" title="Settings" />
        <div className="label" style={{ marginBottom: 8 }}>Theme</div>
        <SegToggle full options={THEMES} value={state.theme} onChange={setTheme} />
        {!state.online && (
          <div style={{ marginTop: 8 }}>
            <SwitchRow label="Admin tools" detail="Write, close and resolve questions on this phone." checked={state.admin} onChange={setAdmin} />
          </div>
        )}
      </Card>

      {!state.online && (
        <Card>
          <SectionHead icon="download" title="Data" subtitle="Everything is saved on this phone only." />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={onBackup} style={ghostBtn()}><IconLabel icon="download" size={15}>Back up</IconLabel></button>
            <button onClick={() => fileRef.current?.click()} style={ghostBtn()}><IconLabel icon="upload" size={15}>Restore</IconLabel></button>
            <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onRestore(f); }} />
            {hasSample(state) && <button onClick={onRemoveSample} style={ghostBtn()}><IconLabel icon="sparkle" size={15}>Remove samples</IconLabel></button>}
            <button onClick={onReset} style={{ ...ghostBtn(), color: "var(--bad)" }}><IconLabel icon="trash" size={15}>Start fresh</IconLabel></button>
          </div>
        </Card>
      )}

      <Card>
        <button onClick={onAbout} className="pk-wide-btn" style={{ display: "flex", alignItems: "center", width: "100%", gap: 10, background: "transparent", border: "none", padding: 0, color: "var(--ink)", fontFamily: "inherit", fontSize: 15, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
          <span style={{ color: "var(--accent)" }}><Icon name="help" size={20} /></span>
          <span style={{ flex: 1 }}>About, scoring and rules</span>
          <span style={{ color: "var(--ink-faint)", display: "inline-flex" }}><ChevronIcon /></span>
        </button>
      </Card>
    </main>
  );
}

/* Handle, home parish and country. Diaspora players keep a home parish, so
   they still count for it in the parish table. */
function ProfileSheet({ state, api, run, onClose }) {
  const { ref, closing, close } = useModalDismiss(onClose);
  const me = state.players.find((p) => p.id === ME);
  const fresh = state.needsProfile || (!state.online && me.handle === "you");
  const [handle, setHandle] = useStateM(fresh ? "" : me.handle);
  const [parish, setParish] = useStateM(me.parish || "");
  const [country, setCountry] = useStateM(me.country || "Jamaica");
  const [busy, setBusy] = useStateM(false);
  const problem = handle ? handleProblem(state, handle, ME) : null;
  const save = async () => {
    setBusy(true);
    const ok = await run(() => api.saveProfile({ handle, parish, country }), fresh ? "Welcome to the league" : "Profile saved");
    setBusy(false);
    if (ok) close();
  };
  return (
    <ModalFrame dismiss={{ ref, closing, close }} top maxWidth={440} label="Your profile">
      <ModalHead eyebrow={fresh ? "One last step" : null} title={fresh ? "Set up your profile" : "Your profile"} onClose={close} />
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "center" }}><Avatar key={handle.charAt(0)} handle={handle || "?"} size={60} /></div>
        <div>
          <FieldLabel htmlFor="pf-handle" hint="3–20 letters, numbers or _. Shown on the leaderboard.">Handle</FieldLabel>
          <input id="pf-handle" className="pk-field" value={handle} onChange={(e) => setHandle(e.target.value.replace(/\s/g, ""))}
            autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="e.g. portie_ras" maxLength={20} />
          {problem && <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--bad)", marginTop: 6 }}><Icon name="alert" size={14} />{problem}</div>}
        </div>
        <div>
          <FieldLabel htmlFor="pf-parish" hint="Living abroad? Pick the parish you rep.">Home parish</FieldLabel>
          <select id="pf-parish" className="pk-field" value={parish} onChange={(e) => setParish(e.target.value)}>
            <option value="">Not set</option>
            {PARISHES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="pf-country">Where you live</FieldLabel>
          <select id="pf-country" className="pk-field" value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={save} disabled={!handle || !!problem || busy} style={{ ...primaryBtn(), padding: "12px 16px", fontSize: 15, opacity: !handle || problem ? 0.45 : 1 }}>
          {busy ? <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><Spinner />Saving…</span> : "Save"}
        </button>
      </div>
    </ModalFrame>
  );
}

/* Sign in with a code sent by email: no password to remember, and it works
   from the Home Screen app (a link would open Safari, which keeps its own
   sign-in). The same email has a link too, for a laptop. */
const RESEND_SECONDS = 30;
function SignInSheet({ api, run, onClose }) {
  const { ref, closing, close } = useModalDismiss(onClose);
  const [step, setStep] = useStateM("email");
  const [email, setEmail] = useStateM("");
  const [code, setCode] = useStateM("");
  const [busy, setBusy] = useStateM(false);
  // The field shakes on a bad email or code (class on, off when it ends:
  // remounting the field instead would drop the keyboard).
  const [shake, setShake] = useStateM(false);
  const [wait, setWait] = useStateM(0);
  useEffectM(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const send = async () => {
    if (!validEmail) { setShake(true); return; }
    setBusy(true);
    const ok = await run(() => api.signIn(email));
    setBusy(false);
    if (ok) { setStep("code"); setCode(""); setWait(RESEND_SECONDS); }
  };
  const verify = async () => {
    setBusy(true);
    const ok = await run(() => api.verify(email, code), "Signed in");
    setBusy(false);
    if (ok) close();
    else setShake(true);
  };
  const spin = <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><Spinner />Just a moment…</span>;
  return (
    <ModalFrame dismiss={{ ref, closing, close }} top maxWidth={420} label="Sign in">
      <ModalHead eyebrow={APP_NAME} title={step === "email" ? "Sign in or join" : "Check your email"} onClose={close} />
      {step === "email" ? (
        <div key="email" className="pk-slide-in" style={{ display: "grid", gap: 14 }}>
          <div style={{ fontSize: 13.5, color: "var(--ink-dim)", lineHeight: 1.5 }}>We'll email you a code. New here? The same code makes your account.</div>
          <div className={shake ? "pk-shake" : undefined} onAnimationEnd={() => setShake(false)}>
            <FieldLabel htmlFor="si-email">Email</FieldLabel>
            <input id="si-email" className="pk-field" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} placeholder="you@example.com" />
          </div>
          <button onClick={send} disabled={busy} style={{ ...accentBtn(), padding: "12px 16px", fontSize: 15 }}>{busy ? spin : <IconLabel icon="mail">Email me a code</IconLabel>}</button>
          <div style={{ fontSize: 12, color: "var(--ink-faint)", lineHeight: 1.5 }}>Free to play. Points have no cash value. Your email is only used to sign you in.</div>
        </div>
      ) : (
        <div key="code" className="pk-slide-in" style={{ display: "grid", gap: 14 }}>
          <div style={{ fontSize: 13.5, color: "var(--ink-dim)", lineHeight: 1.5 }}>
            We sent an email to <strong style={{ color: "var(--ink)" }}>{email.trim()}</strong>. Type its code here, or tap the link in it. (Not there? Check spam.)
          </div>
          <div className={shake ? "pk-shake" : undefined} onAnimationEnd={() => setShake(false)}>
            <FieldLabel htmlFor="si-code">Code</FieldLabel>
            <input id="si-code" className="pk-field mono" inputMode="numeric" autoComplete="one-time-code" maxLength={10}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter" && code.length >= 6) verify(); }}
              placeholder="123456" style={{ fontSize: 24, letterSpacing: "0.3em", textAlign: "center" }} />
          </div>
          <button onClick={verify} disabled={busy || code.length < 6} style={{ ...accentBtn(), padding: "12px 16px", fontSize: 15, opacity: code.length < 6 ? 0.5 : 1 }}>{busy ? spin : <IconLabel icon="logIn">Sign in</IconLabel>}</button>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
            <button onClick={() => setStep("email")} style={linkBtn(13)}>Use a different email</button>
            <button onClick={send} disabled={wait > 0 || busy} style={{ ...linkBtn(13), opacity: wait > 0 ? 0.5 : 1 }}>{wait > 0 ? `Send again in ${wait}s` : "Send a new code"}</button>
          </div>
        </div>
      )}
    </ModalFrame>
  );
}

Object.assign(window, { MeView, ProfileSheet, SignInSheet });
