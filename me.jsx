/* me.jsx — your profile and record, your calls, settings and data. */
const { useState: useStateM, useRef: useRefM } = React;

function MeView({ state, scores, now, onOpen, onEditProfile, setTheme, setAdmin, onBackup, onRestore, onRemoveSample, onReset, onAbout }) {
  const me = state.players.find((p) => p.id === ME);
  const s = scores.byPlayer.get(ME) || { points: 0, scored: 0, brierSum: 0 };
  const all = leaderboard(state, scores, "all");
  const myRow = all.find((r) => r.player.id === ME);
  const called = [...new Set(state.forecasts.filter((f) => f.playerId === ME).map((f) => f.questionId))]
    .map((id) => state.questions.find((q) => q.id === id)).filter(Boolean)
    .sort((a, b) => Date.parse(b.closeAt) - Date.parse(a.closeAt));
  const fileRef = useRefM(null);
  const where = [me.parish, me.country].filter(Boolean).join(" · ");
  return (
    <main className="pk-view pk-page" style={{ padding: "16px 20px 0" }}>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis" }}>{me.handle}</div>
            <div style={{ fontSize: 13, color: "var(--ink-faint)", marginTop: 2 }}>{where || "No parish set"}</div>
          </div>
          <button onClick={onEditProfile} style={ghostBtn()}>Edit</button>
        </div>
        <div className="pk-hero" style={{ marginTop: 14 }}>
          <div className="label">Points</div>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 2 }}>
            <AnimatedNumber value={s.points} from={0} format={fmtPts} durationMs={600} />
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-dim)", marginTop: 2 }}>
            {s.scored ? `Rank ${myRow?.rank} of ${all.filter((r) => r.rank != null).length} · ${s.scored} scored · Brier ${fmtBrier(s.brierSum / s.scored)}` : "Points come in as your calls resolve."}
          </div>
        </div>
      </Card>

      <Card>
        <SectionHead title="Your calls" subtitle={called.length ? `${called.length} ${called.length === 1 ? "question" : "questions"}` : null} />
        {called.length
          ? <div style={{ display: "grid", gap: 8 }}>{called.map((q) => <QuestionRow key={q.id} q={q} state={state} scores={scores} now={now} onOpen={() => onOpen(q.id)} />)}</div>
          : <EmptyNote>You haven't made a call yet. Pick a question on the Questions tab.</EmptyNote>}
      </Card>

      <Card>
        <SectionHead title="Settings" />
        <div className="label" style={{ marginBottom: 8 }}>Theme</div>
        <SegToggle full options={[{ v: "auto", l: "Auto" }, { v: "dark", l: "Dark" }, { v: "light", l: "Light" }]} value={state.theme} onChange={setTheme} />
        <div style={{ marginTop: 8 }}>
          <SwitchRow label="Admin tools" detail="Write, close and resolve questions on this phone." checked={state.admin} onChange={setAdmin} />
        </div>
      </Card>

      <Card>
        <SectionHead title="Data" subtitle="Everything is saved on this phone only." />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={onBackup} style={ghostBtn()}>Back up</button>
          <button onClick={() => fileRef.current?.click()} style={ghostBtn()}>Restore</button>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onRestore(f); }} />
          {hasSample(state) && <button onClick={onRemoveSample} style={ghostBtn()}>Remove samples</button>}
          <button onClick={onReset} style={{ ...ghostBtn(), color: "var(--bad)" }}>Start fresh</button>
        </div>
      </Card>

      <Card>
        <button onClick={onAbout} className="pk-wide-btn" style={{ display: "flex", alignItems: "center", width: "100%", gap: 8, background: "transparent", border: "none", padding: 0, color: "var(--ink)", fontFamily: "inherit", fontSize: 15, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
          <span style={{ flex: 1 }}>About, scoring and rules</span>
          <span style={{ color: "var(--ink-faint)", display: "inline-flex" }}><ChevronIcon /></span>
        </button>
      </Card>
    </main>
  );
}

/* Handle, home parish and country. Diaspora players keep a home parish, so
   they still count for it in the parish table. */
function ProfileSheet({ state, onClose, act }) {
  const { ref, closing, close } = useModalDismiss(onClose);
  const me = state.players.find((p) => p.id === ME);
  const [handle, setHandle] = useStateM(me.handle === "you" ? "" : me.handle);
  const [parish, setParish] = useStateM(me.parish || "");
  const [country, setCountry] = useStateM(me.country || "Jamaica");
  const problem = handle ? handleProblem(state, handle, ME) : null;
  const save = () => {
    if (act((s) => updateProfile(s, ME, { handle, parish, country }), "Profile saved")) close();
  };
  return (
    <ModalFrame dismiss={{ ref, closing, close }} top maxWidth={440} label="Your profile">
      <ModalHead title="Your profile" onClose={close} />
      <div style={{ display: "grid", gap: 14 }}>
        <div>
          <FieldLabel htmlFor="pf-handle" hint="3–20 letters, numbers or _. Shown on the leaderboard.">Handle</FieldLabel>
          <input id="pf-handle" className="pk-field" value={handle} onChange={(e) => setHandle(e.target.value.replace(/\s/g, ""))}
            autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="e.g. portie_ras" maxLength={20} />
          {problem && <div style={{ fontSize: 12.5, color: "var(--bad)", marginTop: 6 }}>{problem}</div>}
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
        <button onClick={save} disabled={!handle || !!problem} style={{ ...primaryBtn(), padding: "12px 16px", fontSize: 15, opacity: !handle || problem ? 0.45 : 1 }}>Save</button>
      </div>
    </ModalFrame>
  );
}

Object.assign(window, { MeView, ProfileSheet });
