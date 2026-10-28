/* questions.jsx — the question list (Jamaica / International) and a
   question's sheet: make a call, see the crowd, the result and your points,
   share your call. Admins also close and resolve here. */
const { useState: useStateQ, useMemo: useMemoQ } = React;

const REGION_FILTERS = [
  ...REGIONS.map((r) => ({ v: r.v, l: <IconLabel icon={r.icon} size={14} gap={5}>{r.l}</IconLabel> })),
  { v: "all", l: <IconLabel icon="list" size={14} gap={5}>All</IconLabel> },
];
const DAY_MS = 86400000;
const PHASE_ICONS = { open: "clock", closed: "lock", resolved: "checkCircle", void: "ban", disputed: "flag" };

function QuestionsView({ state, scores, now, region, setRegion, onOpen, onProfile, onSignIn, onRetry, onDismissSample, onRemoveSample }) {
  const me = state.players.find((p) => p.id === ME);
  const shown = state.questions.filter((q) => region === "all" || q.region === region);
  const byClose = (a, b) => Date.parse(a.closeAt) - Date.parse(b.closeAt);
  const open = shown.filter((q) => phase(q, now) === "open").sort(byClose);
  const waiting = shown.filter((q) => ["closed", "disputed"].includes(phase(q, now))).sort(byClose);
  const done = shown.filter((q) => ["resolved", "void"].includes(q.status))
    .sort((a, b) => Date.parse(b.resolvedAt || b.closeAt) - Date.parse(a.resolvedAt || a.closeAt));
  const rows = (list) => (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 8 }}>
      {list.map((q, i) => <QuestionRow key={q.id} q={q} scores={scores} now={now} index={i} onOpen={() => onOpen(q.id)} />)}
    </div>
  );
  const firstLoad = state.online && state.loading && !state.questions.length;
  const offline = state.online && state.syncError && !state.questions.length;
  return (
    <main className="pk-view pk-page" style={{ padding: "16px 20px 0" }}>
      <div style={{ marginBottom: 14 }}>
        <SegToggle full options={REGION_FILTERS} value={region} onChange={setRegion} />
      </div>

      {state.sampleNotice && hasSample(state) && (
        <Card style={{ background: "color-mix(in oklab, var(--accent) 10%, var(--bg-1))" }}>
          <SectionHead icon="sparkle" title="Sample questions loaded" />
          <div style={{ fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.5, marginTop: -4 }}>
            The questions and players marked <Tag>Sample</Tag> are here so you can try {APP_NAME}. Their dates are placeholders. One question is closed and waiting for a result: resolve it in Admin to see the scoring.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={onDismissSample} style={ghostBtn()}><IconLabel icon="check">Got it</IconLabel></button>
            <button onClick={onRemoveSample} style={ghostBtn()}><IconLabel icon="trash">Remove samples</IconLabel></button>
          </div>
        </Card>
      )}

      {state.signedOut ? (
        <JoinCard icon="logIn" title="Sign in to play" detail="Make your calls, score points, climb the table." action="Sign in" onClick={onSignIn} />
      ) : (state.needsProfile || (!state.online && me && me.handle === "you")) ? (
        <JoinCard icon="user" title="Join the leaderboard" detail="Pick a handle and your parish." action="Set up" onClick={onProfile} />
      ) : null}

      <Card>
        <SectionHead icon="dial" title="Open" subtitle={open.length ? "Make your call before it closes. Your latest call counts." : null} />
        {firstLoad ? <SkeletonRows /> : offline ? (
          <EmptyNote icon="cloudOff">
            Couldn't reach {APP_NAME}. Check your connection.
            <div style={{ marginTop: 10 }}><button onClick={onRetry} style={ghostBtn()}><IconLabel icon="refresh">Try again</IconLabel></button></div>
          </EmptyNote>
        ) : open.length ? rows(open) : <EmptyNote icon="inbox">No open questions here yet. New ones land every week.</EmptyNote>}
      </Card>

      {waiting.length > 0 && (
        <Card>
          <SectionHead icon="hourglass" tone="var(--intl)" title="Awaiting result" subtitle="Closed. Each resolves from its named source." />
          {rows(waiting)}
        </Card>
      )}

      {done.length > 0 && (
        <Card>
          <SectionHead icon="checkCircle" tone="var(--ok)" title="Results" />
          {rows(done)}
        </Card>
      )}
    </main>
  );
}

function JoinCard({ icon, title, detail, action, onClick }) {
  return (
    <Card style={{ background: "linear-gradient(135deg, color-mix(in oklab, var(--accent) 14%, var(--bg-1)), var(--bg-1) 70%)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="pk-float" style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--accent)", color: "var(--accent-ink)" }}>
          <Icon name={icon} size={20} stroke={2} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: 13, color: "var(--ink-dim)", marginTop: 2 }}>{detail}</div>
        </div>
        <button onClick={onClick} style={accentBtn()}>{action}</button>
      </div>
    </Card>
  );
}

/* One question in a list: tags, the question, when it closes, your call or
   your points. */
function QuestionRow({ q, scores, now, onOpen, index = 0 }) {
  const ph = phase(q, now);
  const mine = scores.latest.get(q.id)?.get(ME);
  const count = scores.crowds.get(q.id)?.count || 0;
  const pts = scores.byQuestion.get(q.id)?.get(ME);
  const soon = ph === "open" && Date.parse(q.closeAt) - now < DAY_MS;
  return (
    <button onClick={onOpen} className="pk-wide-btn pk-row-in" style={{
      animationDelay: `${Math.min(index, 8) * 0.04}s`,
      display: "block", width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "var(--ink)",
      background: "var(--bg-2)", border: "1px solid transparent", borderRadius: 14, padding: "12px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <RegionTag region={q.region} />
        <CategoryTag category={q.category} />
        {q.sample && <Tag>Sample</Tag>}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35, marginTop: 8 }}>{q.title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, marginTop: 5, color: ph === "disputed" ? "var(--warn)" : soon ? "var(--accent)" : "var(--ink-faint)" }}>
        {soon ? <span className="pk-pulse-dot" aria-hidden /> : <Icon name={PHASE_ICONS[ph]} size={13} stroke={2} />}
        <span>{phaseLabel(q, now)} · {count} {count === 1 ? "call" : "calls"}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line-soft)", fontSize: 13, color: "var(--ink-dim)" }}>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {mine
            ? <>Your call: <strong style={{ color: "var(--ink)" }}>{fmtForecast(q, mine.probs)}</strong></>
            : ph === "open" ? <span style={{ color: "var(--accent)", fontWeight: 600 }}>Make your call</span> : "No call from you"}
        </span>
        {pts && (
          <span className="mono pk-pop" style={{
            display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 700, fontSize: 12.5, padding: "2px 8px", borderRadius: 999,
            color: pts.points >= coinFlipPoints(q.options.length) ? "var(--ok)" : "var(--ink-dim)",
            background: pts.points >= coinFlipPoints(q.options.length) ? "color-mix(in oklab, var(--ok) 14%, transparent)" : "var(--fill)",
          }}><Icon name="trophy" size={12} stroke={2.2} />{fmtPts(pts.points)}</span>
        )}
        <span style={{ color: "var(--ink-faint)", display: "inline-flex" }}><ChevronIcon size={12} /></span>
      </div>
    </button>
  );
}

/* ---------- forecast input ---------- */

const startConfidence = (n) => Math.min(100, minConfidence(n) + 20);

/* Yes/No: one slider for the chance of Yes. Options and ranges: tap the
   most likely one, then say how sure (the rest share what's left). */
function ForecastInput({ q, probs, onChange }) {
  const n = q.options.length;
  const [pickHint, setPickHint] = useStateQ(probs ? pickOf(probs).pick : null);
  if (q.kind === "binary") {
    const yes = probs ? probs[0] : 50;
    return (
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <div>
            <span key={yes} className="mono pk-tick-in" style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.02em" }}>{yes}%</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-dim)", marginLeft: 6 }}>Yes</span>
          </div>
          <span className="mono" style={{ fontSize: 13, color: "var(--ink-faint)" }}>{100 - yes}% No</span>
        </div>
        <input type="range" className="pk-slider" min="0" max="100" step="1" value={yes} aria-label="Chance of Yes"
          onChange={(e) => onChange(binaryProbs(Number(e.target.value)))} style={{ "--fill-pct": `${yes}%`, marginTop: 4 }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--ink-faint)" }}>
          <span>Surely not</span><span>Coin flip</span><span>Surely yes</span>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          {[10, 25, 50, 75, 90].map((v) => (
            <button key={v} className="pk-pick" onClick={() => onChange(binaryProbs(v))} aria-pressed={yes === v} style={{
              ...ghostBtn(), padding: "7px 12px", minWidth: 52,
              background: yes === v ? "color-mix(in oklab, var(--accent) 18%, var(--bg-2))" : "var(--fill)",
              color: yes === v ? "var(--accent)" : "var(--ink)", fontWeight: 600,
            }}>{v}%</button>
          ))}
        </div>
      </div>
    );
  }
  const cur = probs ? pickOf(probs) : null;
  const pick = cur ? (pickHint != null && probs[pickHint] === cur.confidence ? pickHint : cur.pick) : null;
  const min = minConfidence(n);
  const choose = (i) => { setPickHint(i); onChange(pickProbs(n, i, cur ? cur.confidence : startConfidence(n))); };
  return (
    <div>
      <div className="label">{q.kind === "range" ? "Which range is most likely?" : "Which is most likely?"}</div>
      <div role="radiogroup" style={{ display: "grid", gap: 6, marginTop: 8 }}>
        {q.options.map((o, i) => {
          const active = pick === i;
          return (
            <button key={i} role="radio" aria-checked={active} onClick={() => choose(i)} className="pk-wide-btn" style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
              padding: "11px 14px", borderRadius: 12, color: "var(--ink)", fontSize: 14.5, fontWeight: active ? 600 : 500,
              // A gray fill, so the options stand out from the panel they sit on.
              background: active ? "color-mix(in oklab, var(--accent) 16%, var(--bg-2))" : "var(--fill)",
              border: `1.5px solid ${active ? "var(--accent)" : "transparent"}`,
              transition: "background 0.15s, border-color 0.15s, var(--press)",
            }}>
              <span aria-hidden className={active ? "pk-check is-on" : "pk-check"} style={{
                width: 20, height: 20, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
                border: `1.5px solid ${active ? "var(--accent)" : "var(--ink-faint)"}`, background: active ? "var(--accent)" : "transparent",
              }}>
                {active && <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="var(--accent-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path className="pk-tick" d="M2.5 6.2l2.4 2.4 4.6-5" /></svg>}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>{o}</span>
              {probs && <span className="mono" style={{ fontSize: 13, color: active ? "var(--accent)" : "var(--ink-faint)" }}>{probs[i]}%</span>}
            </button>
          );
        })}
      </div>
      {cur && (
        <div className="pk-slide-in" style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span className="label">How sure?</span>
            <span key={probs[pick]} className="mono pk-tick-in" style={{ fontSize: 22, fontWeight: 700 }}>{probs[pick]}%</span>
          </div>
          <input type="range" className="pk-slider" min={min} max="100" step="1" value={probs[pick]} aria-label="How sure"
            onChange={(e) => onChange(pickProbs(n, pick, Number(e.target.value)))}
            style={{ "--fill-pct": `${((probs[pick] - min) / (100 - min)) * 100}%` }} />
          <div style={{ fontSize: 12, color: "var(--ink-faint)", lineHeight: 1.5 }}>{min}% is an even spread. The other options share what's left.</div>
        </div>
      )}
    </div>
  );
}

/* ---------- question sheet ---------- */

function QuestionSheet({ q, state, scores, now, api, run, adminOpen, onClose, onSignIn, onProfile }) {
  const { ref, closing, close } = useModalDismiss(onClose);
  const ph = phase(q, now);
  const mine = scores.latest.get(q.id)?.get(ME);
  const myCount = state.forecasts.filter((f) => f.playerId === ME && f.questionId === q.id).length;
  const [draft, setDraft] = useStateQ(mine ? mine.probs : q.kind === "binary" ? [50, 50] : null);
  const [saving, setSaving] = useStateQ(false);
  const [saved, setSaved] = useStateQ(false);
  const crowd = scores.crowds.get(q.id) || { count: 0, probs: null };
  const pts = scores.byQuestion.get(q.id)?.get(ME);
  const changed = draft && (!mine || draft.join() !== mine.probs.join());
  const save = async () => {
    if (state.signedOut) { onSignIn(); return; }
    // Online, points show under your handle: pick one before the first call.
    if (state.needsProfile) { onProfile(); return; }
    const probs = draft;
    setSaving(true);
    const ok = await run(() => api.forecast(q.id, probs));
    setSaving(false);
    if (!ok) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
    showToast(mine ? "Call updated" : "Call saved", { tone: "ok", action: { label: "Share", onClick: () => shareText(shareCallText(q, probs, appUrl())) } });
  };
  const showCrowd = crowd.count > 0 && crowd.probs && (mine || ph !== "open");
  const lastLog = state.log.find((l) => l.questionId === q.id && ["resolve", "void", "dispute"].includes(l.action));
  const great = pts && pts.points >= 90;
  return (
    <ModalFrame sheet dismiss={{ ref, closing, close }} label={q.title}>
      <ModalHead title={q.title} onClose={close}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          <RegionTag region={q.region} />
          <CategoryTag category={q.category} />
          {q.sample && <Tag>Sample</Tag>}
        </div>
      </ModalHead>

      <div style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name={ph === "open" ? "clock" : "lock"} size={15} />
          <span>{ph === "open" ? "Closes" : "Closed"} <strong style={{ color: "var(--ink)" }}>{fmtWhen(q.closeAt)}</strong> Jamaica time</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="link" size={15} />
          <span>Resolves from {q.sourceUrl
            ? <a href={q.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--ink)" }}>{q.sourceName}</a>
            : <span style={{ color: "var(--ink)" }}>{q.sourceName}</span>}</span>
        </div>
      </div>

      {ph === "resolved" && (
        <ResultBox tone="var(--ok)" icon="checkCircle" title={`Result: ${q.options[q.outcome]}`}>
          {pts ? (
            <div style={{ position: "relative", display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
              {great && <Burst />}
              <span style={{ fontSize: 32, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.02em" }}>
                <AnimatedNumber value={pts.points} from={0} format={fmtPts} durationMs={700} />
              </span>
              <span>points{great ? ". Sharp call!" : ""} <span style={{ color: "var(--ink-faint)" }}>Brier {fmtBrier(pts.brier)}</span></span>
            </div>
          ) : "You didn't make a call on this one."}
          {lastLog?.sourceUrl && (
            <a href={lastLog.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ display: "flex", width: "fit-content", alignItems: "center", gap: 5, marginTop: 6, color: "inherit" }}>
              <Icon name="link" size={13} /> Source
            </a>
          )}
        </ResultBox>
      )}
      {ph === "void" && <ResultBox tone="var(--ink-dim)" icon="ban" title="Void: no points for anyone">{lastLog?.note}</ResultBox>}
      {ph === "disputed" && <ResultBox tone="var(--warn)" icon="flag" title="Disputed: points on hold">{lastLog?.note ? `${lastLog.note}. ` : ""}The source is being checked before a result is settled.</ResultBox>}
      {ph === "closed" && <ResultBox tone="var(--intl)" icon="hourglass" title="Closed: awaiting the result">Calls are locked in. Points come when it resolves.</ResultBox>}

      {ph === "open" && (
        <div style={{ marginTop: 16, padding: 14, borderRadius: 16, background: "var(--bg-2)" }}>
          <ForecastInput q={q} probs={draft} onChange={setDraft} />
          <button onClick={save} disabled={(!changed && !state.signedOut) || saving} style={{
            ...(saved ? { ...primaryBtn(), background: "var(--ok)", color: "#fff" } : primaryBtn()),
            width: "100%", marginTop: 14, padding: "12px 16px", fontSize: 15,
            opacity: changed || saved || saving || state.signedOut ? 1 : 0.45, transition: "background 0.25s, color 0.25s, var(--press)",
          }}>
            {saving ? <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><Spinner size={16} />Saving…</span>
              : saved ? <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><Icon name="check" size={17} stroke={2.6} className="pk-done-tick" />Saved</span>
              : state.signedOut ? <IconLabel icon="logIn">Sign in to make your call</IconLabel>
              : mine ? "Update your call" : "Save your call"}
          </button>
        </div>
      )}

      {mine && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.5 }}>
            Your call: <strong style={{ color: "var(--ink)" }}>{fmtForecast(q, mine.probs)}</strong>, {fmtWhen(mine.createdAt)}
            {myCount > 1 && <span style={{ color: "var(--ink-faint)" }}> · updated {myCount - 1}×, the latest before close counts</span>}
          </div>
          <button onClick={() => shareText(shareCallText(q, mine.probs, appUrl()))} style={ghostBtn()}><IconLabel icon="share">Share</IconLabel></button>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <div className="label" style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name="users" size={14} />Crowd · {crowd.count} {crowd.count === 1 ? "call" : "calls"}</div>
        {showCrowd
          ? q.options.map((o, i) => (
              <ProbBar key={i} label={o} value={crowd.probs[i]} mark={mine ? mine.probs[i] : null} win={ph === "resolved" && q.outcome === i} delay={i * 0.05} />
            ))
          : <div style={{ fontSize: 13, color: "var(--ink-faint)", marginTop: 6 }}>{crowd.count ? "Make your call to see what the crowd thinks." : "No calls yet. Be the first."}</div>}
        {showCrowd && mine && <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 8 }}>The thin line on each bar is your call.</div>}
      </div>

      {state.admin && <AdminTools q={q} state={state} now={now} api={api} run={run} startOpen={adminOpen} onDeleted={close} />}
    </ModalFrame>
  );
}

function ResultBox({ tone, icon, title, children }) {
  return (
    <div className="pk-pop" style={{ display: "block", marginTop: 14, padding: "12px 14px", borderRadius: 14, background: `color-mix(in oklab, ${tone} 12%, var(--bg-2))`, border: `1px solid color-mix(in oklab, ${tone} 30%, transparent)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 15, fontWeight: 700, color: tone }}>
        {icon && <Icon name={icon} size={17} stroke={2.1} />}{title}
      </div>
      {children && <div style={{ fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.5, marginTop: 4 }}>{children}</div>}
    </div>
  );
}

/* ---------- admin tools on a question ---------- */

/* Close early, resolve with a source link, dispute or void (SOP:
   resolution incident). On the phone only: record a player's call (for a
   league run in WhatsApp) and delete a question. */
function AdminTools({ q, state, now, api, run, startOpen, onDeleted }) {
  const [open, setOpen] = useStateQ(!!startOpen);
  const [busy, setBusy] = useStateQ(false);
  const ph = phase(q, now);
  const closed = isClosed(q, now);
  const live = q.status === "open" || q.status === "disputed";
  const others = state.players.filter((p) => p.id !== ME);
  const [playerId, setPlayerId] = useStateQ(others[0]?.id || "");
  const [proxy, setProxy] = useStateQ(q.kind === "binary" ? [50, 50] : null);
  const [outcome, setOutcome] = useStateQ(null);
  const [link, setLink] = useStateQ(q.sourceUrl || "");
  const [note, setNote] = useStateQ("");
  const callCount = useMemoQ(() => latestForecasts(state.forecasts, [q]).get(q.id)?.size || 0, [state.forecasts, q]);
  const go = async (fn, ok) => {
    setBusy(true);
    const done = await run(fn, ok);
    setBusy(false);
    return done;
  };

  const record = () => {
    const p = state.players.find((x) => x.id === playerId);
    go(() => api.recordFor(playerId, q.id, proxy), `Recorded ${p?.handle}'s call`).then((ok) => {
      if (ok) setProxy(q.kind === "binary" ? [50, 50] : null);
    });
  };
  const resolve = () => {
    if (outcome == null) { showToast("Pick the outcome.", { tone: "error" }); return; }
    askConfirm({
      title: `Resolve as "${q.options[outcome]}"?`,
      body: state.online
        ? "Every call is scored now. You can dispute it later if the source turns out wrong."
        : `${callCount} ${callCount === 1 ? "call is" : "calls are"} scored now. You can dispute it later if the source turns out wrong.`,
      confirmLabel: "Resolve",
    }).then((ok) => { if (ok) go(() => api.resolve(q.id, outcome, { sourceUrl: link, note }), "Resolved and scored"); });
  };
  const voidIt = () => {
    askConfirm({ title: "Void this question?", body: "No one gets points for it. This can't be undone.", confirmLabel: "Void", danger: true })
      .then((ok) => { if (ok) go(() => api.void(q.id, { sourceUrl: link, note }), "Question void"); });
  };
  const remove = () => {
    askConfirm({ title: "Delete this question?", body: "Its calls and log go with it. This can't be undone.", confirmLabel: "Delete", danger: true })
      .then((ok) => { if (ok) go(() => api.remove(q.id), "Question deleted").then((done) => { if (done) onDeleted(); }); });
  };
  const field = { className: "pk-field" };
  return (
    <div style={{ marginTop: 20, borderTop: "1px solid var(--line-soft)", paddingTop: 6 }}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="pk-wide-btn" style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 0", background: "transparent", border: "none",
        color: "var(--ink)", fontFamily: "inherit", fontSize: 15, fontWeight: 600, cursor: "pointer", textAlign: "left",
      }}>
        <span style={{ color: "var(--accent)", display: "inline-flex" }}><Icon name="shield" size={18} /></span>
        <span style={{ flex: 1 }}>Admin</span>
        <FoldChevron open={open} />
      </button>
      <Collapse open={open}>
        <div style={{ display: "grid", gap: 16, paddingBottom: 4 }}>
          {ph === "open" && api.recordFor && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600 }}><Icon name="users" size={16} />Record a player's call</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-faint)", margin: "2px 0 10px" }}>For calls made in WhatsApp. Add players in Admin → Players.</div>
              {others.length ? (
                <>
                  <select {...field} value={playerId} onChange={(e) => setPlayerId(e.target.value)} aria-label="Player">
                    {others.map((p) => <option key={p.id} value={p.id}>{p.handle}{p.sample ? " (sample)" : ""}</option>)}
                  </select>
                  <div style={{ marginTop: 12 }}><ForecastInput key={playerId} q={q} probs={proxy} onChange={setProxy} /></div>
                  <button onClick={record} disabled={!proxy || busy} style={{ ...ghostBtn(), marginTop: 12, opacity: proxy ? 1 : 0.45 }}><IconLabel icon="plus">Record call</IconLabel></button>
                </>
              ) : <div style={{ fontSize: 13, color: "var(--ink-dim)" }}>No other players yet.</div>}
            </div>
          )}

          {live && !closed && (
            <div>
              <button onClick={() => go(() => api.close(q.id), "Closed. Calls are locked in.")} disabled={busy} style={ghostBtn()}><IconLabel icon="lock">Close now</IconLabel></button>
              <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 6 }}>Locks calls before {fmtWhen(q.closeAt)}, e.g. if the event starts early.</div>
            </div>
          )}

          {live && closed && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Result</div>
              <div role="radiogroup" style={{ display: "grid", gap: 6 }}>
                {q.options.map((o, i) => (
                  <ChoiceCard key={i} active={outcome === i} onClick={() => setOutcome(i)} title={o} detail={outcome === i ? "This happened" : ""} />
                ))}
              </div>
            </div>
          )}

          {ph !== "void" && (
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <FieldLabel htmlFor={`link-${q.id}`} hint="Required to resolve. Every decision is logged with it.">Source link</FieldLabel>
                <input id={`link-${q.id}`} {...field} type="url" inputMode="url" placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} />
              </div>
              <div>
                <FieldLabel htmlFor={`note-${q.id}`} hint="Required to dispute or void.">Note</FieldLabel>
                <textarea id={`note-${q.id}`} {...field} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. BOJ held at 6.00%" />
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {live && closed && <button onClick={resolve} disabled={busy} style={primaryBtn()}><IconLabel icon="checkCircle">Resolve</IconLabel></button>}
                {ph !== "disputed" && <button onClick={() => go(() => api.dispute(q.id, note), "Marked disputed. Points on hold.")} disabled={busy} style={ghostBtn()}><IconLabel icon="flag">Mark disputed</IconLabel></button>}
                <button onClick={voidIt} disabled={busy} style={{ ...ghostBtn(), color: "var(--bad)" }}><IconLabel icon="ban">Void</IconLabel></button>
                {busy && <Spinner size={18} style={{ alignSelf: "center", color: "var(--ink-faint)" }} />}
              </div>
            </div>
          )}

          {api.remove && (
            <div>
              <button onClick={remove} disabled={busy} style={{ ...linkBtn(13), color: "var(--bad)", display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="trash" size={14} />Delete question</button>
            </div>
          )}
        </div>
      </Collapse>
    </div>
  );
}

Object.assign(window, { QuestionsView, QuestionRow, QuestionSheet, ForecastInput });
