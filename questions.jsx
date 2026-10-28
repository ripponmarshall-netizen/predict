/* questions.jsx — the question list (Jamaica / International) and a
   question's sheet: make a forecast, see the crowd, the result and your
   points, share your call. Admins also record, close and resolve here. */
const { useState: useStateQ, useMemo: useMemoQ } = React;

const REGION_FILTERS = [...REGIONS.map((r) => ({ v: r.v, l: r.l })), { v: "all", l: "All" }];

function QuestionsView({ state, scores, now, region, setRegion, onOpen, onProfile, onDismissSample, onRemoveSample }) {
  const me = state.players.find((p) => p.id === ME);
  const shown = state.questions.filter((q) => region === "all" || q.region === region);
  const byClose = (a, b) => Date.parse(a.closeAt) - Date.parse(b.closeAt);
  const open = shown.filter((q) => phase(q, now) === "open").sort(byClose);
  const waiting = shown.filter((q) => ["closed", "disputed"].includes(phase(q, now))).sort(byClose);
  const done = shown.filter((q) => ["resolved", "void"].includes(q.status))
    .sort((a, b) => Date.parse(b.resolvedAt || b.closeAt) - Date.parse(a.resolvedAt || a.closeAt));
  const row = (q) => <QuestionRow key={q.id} q={q} state={state} scores={scores} now={now} onOpen={() => onOpen(q.id)} />;
  return (
    <main className="pk-view pk-page" style={{ padding: "16px 20px 0" }}>
      <div style={{ marginBottom: 14 }}>
        <SegToggle full options={REGION_FILTERS} value={region} onChange={setRegion} />
      </div>

      {state.sampleNotice && hasSample(state) && (
        <Card style={{ background: "color-mix(in oklab, var(--accent) 10%, var(--bg-1))" }}>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>Sample questions loaded</div>
          <div style={{ fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.5, marginTop: 4 }}>
            The questions and players marked <Tag>Sample</Tag> are here so you can try {APP_NAME}. Their dates are placeholders. One question is closed and waiting for a result: resolve it in Admin to see the scoring.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={onDismissSample} style={ghostBtn()}>Got it</button>
            <button onClick={onRemoveSample} style={ghostBtn()}>Remove samples</button>
          </div>
        </Card>
      )}

      {me && me.handle === "you" && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>Join the leaderboard</div>
              <div style={{ fontSize: 13, color: "var(--ink-dim)", marginTop: 2 }}>Pick a handle and your parish.</div>
            </div>
            <button onClick={onProfile} style={accentBtn()}>Set up</button>
          </div>
        </Card>
      )}

      <Card>
        <SectionHead title="Open" subtitle={open.length ? "Make your call before it closes. Your latest call counts." : null} />
        {open.length ? <div style={{ display: "grid", gap: 8 }}>{open.map(row)}</div> : <EmptyNote>No open questions here yet.</EmptyNote>}
      </Card>

      {waiting.length > 0 && (
        <Card>
          <SectionHead title="Awaiting result" subtitle="Closed. Each resolves from its named source." />
          <div style={{ display: "grid", gap: 8 }}>{waiting.map(row)}</div>
        </Card>
      )}

      {done.length > 0 && (
        <Card>
          <SectionHead title="Results" />
          <div style={{ display: "grid", gap: 8 }}>{done.map(row)}</div>
        </Card>
      )}
    </main>
  );
}

/* One question in a list: tags, the question, your call or your points. */
function QuestionRow({ q, state, scores, now, onOpen }) {
  const ph = phase(q, now);
  const mine = scores.latest.get(q.id)?.get(ME);
  const count = scores.latest.get(q.id)?.size || 0;
  const pts = scores.byQuestion.get(q.id)?.get(ME);
  return (
    <button onClick={onOpen} className="pk-wide-btn" style={{
      display: "block", width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "var(--ink)",
      background: "var(--bg-2)", border: "1px solid transparent", borderRadius: 14, padding: "12px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <RegionTag region={q.region} />
        <Tag>{q.category}</Tag>
        {q.sample && <Tag>Sample</Tag>}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35, marginTop: 8 }}>{q.title}</div>
      <div style={{ fontSize: 12.5, marginTop: 4, color: ph === "disputed" ? "var(--warn)" : "var(--ink-faint)" }}>
        {phaseLabel(q, now)} · {count} {count === 1 ? "call" : "calls"}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line-soft)", fontSize: 13, color: "var(--ink-dim)" }}>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {mine
            ? <>Your call: <strong style={{ color: "var(--ink)" }}>{fmtForecast(q, mine.probs)}</strong></>
            : ph === "open" ? <span style={{ color: "var(--accent)", fontWeight: 600 }}>Make your call</span> : "No call from you"}
        </span>
        {pts && <span className="mono" style={{ fontWeight: 700, color: pts.points >= 0 ? "var(--ok)" : "var(--bad)" }}>{fmtPts(pts.points)}</span>}
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
            <span className="mono" style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.02em" }}>{yes}%</span>
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
              <span style={{ flex: 1, minWidth: 0 }}>{o}</span>
              {probs && <span className="mono" style={{ fontSize: 13, color: active ? "var(--accent)" : "var(--ink-faint)" }}>{probs[i]}%</span>}
            </button>
          );
        })}
      </div>
      {cur && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span className="label">How sure?</span>
            <span className="mono" style={{ fontSize: 22, fontWeight: 700 }}>{probs[pick]}%</span>
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

function QuestionSheet({ q, state, scores, now, adminOpen, onClose, act }) {
  const { ref, closing, close } = useModalDismiss(onClose);
  const ph = phase(q, now);
  const latest = scores.latest.get(q.id);
  const mine = latest?.get(ME);
  const myCount = state.forecasts.filter((f) => f.playerId === ME && f.questionId === q.id).length;
  const [draft, setDraft] = useStateQ(mine ? mine.probs : q.kind === "binary" ? [50, 50] : null);
  const crowd = crowdOf(latest, q.options.length);
  const pts = scores.byQuestion.get(q.id)?.get(ME);
  const changed = draft && (!mine || draft.join() !== mine.probs.join());
  const save = () => {
    if (act((s) => addForecast(s, { playerId: ME, questionId: q.id, probs: draft }, Date.now()))) {
      showToast(mine ? "Forecast updated" : "Forecast saved", { action: { label: "Share", onClick: () => shareText(shareCallText(q, draft, appUrl())) } });
    }
  };
  const showCrowd = crowd.count > 0 && (mine || ph !== "open");
  const lastLog = state.log.find((l) => l.questionId === q.id && ["resolve", "void", "dispute"].includes(l.action));
  return (
    <ModalFrame sheet dismiss={{ ref, closing, close }} label={q.title}>
      <ModalHead title={q.title} onClose={close}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          <RegionTag region={q.region} />
          <Tag>{q.category}</Tag>
          {q.sample && <Tag>Sample</Tag>}
        </div>
      </ModalHead>

      <div style={{ fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.6 }}>
        <div>{ph === "open" ? "Closes" : "Closed"} <strong style={{ color: "var(--ink)" }}>{fmtWhen(q.closeAt)}</strong> Jamaica time</div>
        <div>
          Resolves from {q.sourceUrl
            ? <a href={q.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--ink)" }}>{q.sourceName}</a>
            : <span style={{ color: "var(--ink)" }}>{q.sourceName}</span>}
        </div>
      </div>

      {ph === "resolved" && (
        <ResultBox tone="var(--ok)" title={`Result: ${q.options[q.outcome]}`}>
          {pts ? <>You scored <strong className="mono" style={{ color: pts.points >= 0 ? "var(--ok)" : "var(--bad)" }}>{fmtPts(pts.points)}</strong> (Brier {fmtBrier(pts.brier)}).</> : "You didn't make a call on this one."}
          {lastLog?.sourceUrl && <> <a href={lastLog.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>Source</a></>}
        </ResultBox>
      )}
      {ph === "void" && <ResultBox tone="var(--ink-dim)" title="Void: no points for anyone">{lastLog?.note}</ResultBox>}
      {ph === "disputed" && <ResultBox tone="var(--warn)" title="Disputed: points on hold">{lastLog?.note ? `${lastLog.note}. ` : ""}The source is being checked before a result is settled.</ResultBox>}
      {ph === "closed" && <ResultBox tone="var(--ink-dim)" title="Closed: awaiting the result">Calls are locked in. Points come when it resolves.</ResultBox>}

      {ph === "open" && (
        <div style={{ marginTop: 16, padding: 14, borderRadius: 16, background: "var(--bg-2)" }}>
          <ForecastInput q={q} probs={draft} onChange={setDraft} />
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={save} disabled={!changed} style={{ ...primaryBtn(), flex: 1, padding: "12px 16px", fontSize: 15, opacity: changed ? 1 : 0.45 }}>
              {mine ? "Update forecast" : "Save forecast"}
            </button>
          </div>
        </div>
      )}

      {mine && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.5 }}>
            Your call: <strong style={{ color: "var(--ink)" }}>{fmtForecast(q, mine.probs)}</strong>, {fmtWhen(mine.createdAt)}
            {myCount > 1 && <span style={{ color: "var(--ink-faint)" }}> · updated {myCount - 1}×, the latest before close counts</span>}
          </div>
          <button onClick={() => shareText(shareCallText(q, mine.probs, appUrl()))} style={ghostBtn()}>Share</button>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <div className="label">Crowd · {crowd.count} {crowd.count === 1 ? "call" : "calls"}</div>
        {showCrowd
          ? q.options.map((o, i) => (
              <ProbBar key={i} label={o} value={crowd.probs[i]} mark={mine ? mine.probs[i] : null} win={ph === "resolved" && q.outcome === i} delay={i * 0.05} />
            ))
          : <div style={{ fontSize: 13, color: "var(--ink-faint)", marginTop: 6 }}>{crowd.count ? "Make your call to see what the crowd thinks." : "No calls yet. Be the first."}</div>}
        {showCrowd && mine && <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 8 }}>The thin line on each bar is your call.</div>}
      </div>

      {state.admin && <AdminTools q={q} state={state} now={now} startOpen={adminOpen} act={act} onDeleted={close} />}
    </ModalFrame>
  );
}

function ResultBox({ tone, title, children }) {
  return (
    <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 14, background: `color-mix(in oklab, ${tone} 12%, var(--bg-2))`, border: `1px solid color-mix(in oklab, ${tone} 30%, transparent)` }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: tone }}>{title}</div>
      {children && <div style={{ fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.5, marginTop: 4 }}>{children}</div>}
    </div>
  );
}

/* ---------- admin tools on a question ---------- */

/* Record a player's call (running a WhatsApp league by hand), close early,
   resolve with a source link, dispute or void (SOP: resolution incident). */
function AdminTools({ q, state, now, startOpen, act, onDeleted }) {
  const [open, setOpen] = useStateQ(!!startOpen);
  const ph = phase(q, now);
  const others = state.players.filter((p) => p.id !== ME);
  const [playerId, setPlayerId] = useStateQ(others[0]?.id || "");
  const [proxy, setProxy] = useStateQ(q.kind === "binary" ? [50, 50] : null);
  const [outcome, setOutcome] = useStateQ(null);
  const [link, setLink] = useStateQ(q.sourceUrl || "");
  const [note, setNote] = useStateQ("");
  const t = () => Date.now();
  const scoredCount = useMemoQ(() => latestForecasts(state.forecasts, [q]).get(q.id)?.size || 0, [state.forecasts, q]);

  const record = () => {
    const p = state.players.find((x) => x.id === playerId);
    if (act((s) => addForecast(s, { playerId, questionId: q.id, probs: proxy, by: "admin" }, t()), `Recorded ${p?.handle}'s call`)) {
      setProxy(q.kind === "binary" ? [50, 50] : null);
    }
  };
  const resolve = () => {
    if (outcome == null) { showToast("Pick the outcome."); return; }
    askConfirm({
      title: `Resolve as "${q.options[outcome]}"?`,
      body: `${scoredCount} ${scoredCount === 1 ? "call is" : "calls are"} scored now. You can dispute it later if the source turns out wrong.`,
      confirmLabel: "Resolve",
    }).then((ok) => { if (ok) act((s) => resolveQuestion(s, q.id, outcome, { sourceUrl: link, note }, t()), "Resolved and scored"); });
  };
  const dispute = () => act((s) => disputeQuestion(s, q.id, note, t()), "Marked disputed. Points on hold.");
  const voidIt = () => {
    askConfirm({ title: "Void this question?", body: "No one gets points for it. This can't be undone.", confirmLabel: "Void", danger: true })
      .then((ok) => { if (ok) act((s) => voidQuestion(s, q.id, { sourceUrl: link, note }, t()), "Question void"); });
  };
  const remove = () => {
    askConfirm({ title: "Delete this question?", body: "Its calls and log go with it. This can't be undone.", confirmLabel: "Delete", danger: true })
      .then((ok) => { if (ok && act((s) => deleteQuestion(s, q.id), "Question deleted")) onDeleted(); });
  };
  const field = { className: "pk-field" };
  return (
    <div style={{ marginTop: 20, borderTop: "1px solid var(--line-soft)", paddingTop: 6 }}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="pk-wide-btn" style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 0", background: "transparent", border: "none",
        color: "var(--ink)", fontFamily: "inherit", fontSize: 15, fontWeight: 600, cursor: "pointer", textAlign: "left",
      }}>
        <span style={{ flex: 1 }}>Admin</span>
        <FoldChevron open={open} />
      </button>
      <Collapse open={open}>
        <div style={{ display: "grid", gap: 16, paddingBottom: 4 }}>
          {ph === "open" && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Record a player's call</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-faint)", margin: "2px 0 10px" }}>For calls made in WhatsApp. Add players in Admin → Players.</div>
              {others.length ? (
                <>
                  <select {...field} value={playerId} onChange={(e) => setPlayerId(e.target.value)} aria-label="Player">
                    {others.map((p) => <option key={p.id} value={p.id}>{p.handle}{p.sample ? " (sample)" : ""}</option>)}
                  </select>
                  <div style={{ marginTop: 12 }}><ForecastInput key={playerId} q={q} probs={proxy} onChange={setProxy} /></div>
                  <button onClick={record} disabled={!proxy} style={{ ...ghostBtn(), marginTop: 12, opacity: proxy ? 1 : 0.45 }}>Record call</button>
                </>
              ) : <div style={{ fontSize: 13, color: "var(--ink-dim)" }}>No other players yet.</div>}
            </div>
          )}

          {ph === "open" && (
            <div>
              <button onClick={() => act((s) => closeQuestion(s, q.id, t()), "Closed. Calls are locked in.")} style={ghostBtn()}>Close now</button>
              <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 6 }}>Locks calls before {fmtWhen(q.closeAt)}, e.g. if the event starts early.</div>
            </div>
          )}

          {(ph === "closed" || ph === "disputed") && (
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
                {(ph === "closed" || ph === "disputed") && <button onClick={resolve} style={primaryBtn()}>Resolve</button>}
                {ph !== "disputed" && <button onClick={dispute} style={ghostBtn()}>Mark disputed</button>}
                <button onClick={voidIt} style={{ ...ghostBtn(), color: "var(--bad)" }}>Void</button>
              </div>
            </div>
          )}

          <div>
            <button onClick={remove} style={{ ...linkBtn(13), color: "var(--bad)" }}>Delete question</button>
          </div>
        </div>
      </Collapse>
    </div>
  );
}

Object.assign(window, { QuestionsView, QuestionRow, QuestionSheet, ForecastInput });
