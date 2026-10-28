/* admin.jsx — questions waiting for a result, writing a new question (with
   the SOP checklist), players for a WhatsApp league (on the phone only),
   and the decision log. */
const { useState: useStateA } = React;

function AdminView({ state, scores, now, api, run, onOpen, onNewQuestion }) {
  const waiting = state.questions.filter((q) => ["closed", "disputed"].includes(phase(q, now)))
    .sort((a, b) => Date.parse(a.closeAt) - Date.parse(b.closeAt));
  const thisWeek = state.questions.filter((q) => Date.parse(q.createdAt) > now - 7 * 86400000).length;
  return (
    <main className="pk-view pk-page" style={{ padding: "16px 20px 0" }}>
      <Card>
        <SectionHead icon="hourglass" tone="var(--intl)" title="Needs a result" subtitle={waiting.length ? "Check the named source, then resolve. Disputed ones too." : null} />
        {waiting.length
          ? <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 8 }}>{waiting.map((q, i) => <QuestionRow key={q.id} q={q} scores={scores} now={now} index={i} onOpen={() => onOpen(q.id, true)} />)}</div>
          : <EmptyNote icon="checkCircle">Nothing waiting. Closed questions show up here.</EmptyNote>}
      </Card>

      <Card>
        <SectionHead icon="plus" title="New question" subtitle={`${thisWeek} written in the last 7 days. Keep it to 10 a week: batch them on an off day.`} />
        <button onClick={onNewQuestion} style={{ ...accentBtn(), width: "100%", padding: "12px 16px", fontSize: 15 }}><IconLabel icon="edit">Write a question</IconLabel></button>
      </Card>

      {api.addPlayer && <PlayersCard state={state} api={api} run={run} />}
      <LogCard state={state} onOpen={onOpen} />
    </main>
  );
}

/* Players other than you: for a league run in WhatsApp, add each player,
   then record their calls from the question's Admin section. */
function PlayersCard({ state, api, run }) {
  const [handle, setHandle] = useStateA("");
  const [parish, setParish] = useStateA("");
  const [country, setCountry] = useStateA("Jamaica");
  const others = state.players.filter((p) => p.id !== ME);
  const add = () => {
    const h = handle;
    run(() => api.addPlayer({ handle: h, parish, country }), `Added ${h}`).then((ok) => { if (ok) { setHandle(""); setParish(""); } });
  };
  const remove = (p) => {
    askConfirm({ title: `Remove ${p.handle}?`, body: "Their calls go too, so their points leave the leaderboard.", confirmLabel: "Remove", danger: true })
      .then((ok) => { if (ok) run(() => api.removePlayer(p.id), `Removed ${p.handle}`); });
  };
  return (
    <Card>
      <SectionHead icon="users" tone="var(--jm)" title="Players" subtitle="Running the league in WhatsApp? Add players here, then record their calls on each question." />
      {others.map((p, i) => (
        <div key={p.id} className="pk-row-in" style={{ animationDelay: `${Math.min(i, 10) * 0.03}s`, display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i === others.length - 1 ? "none" : "1px solid var(--line-soft)" }}>
          <Avatar handle={p.handle} size={32} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>{p.handle}</span> {p.sample && <Tag>Sample</Tag>}
            <span style={{ display: "block", fontSize: 12, color: "var(--ink-faint)" }}>{[p.parish, p.country].filter(Boolean).join(" · ")}</span>
          </span>
          <button onClick={() => remove(p)} style={{ ...iconBtn(), width: 36, height: 36, color: "var(--ink-dim)" }} aria-label={`Remove ${p.handle}`}><Icon name="trash" size={15} /></button>
        </div>
      ))}
      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        <input className="pk-field" value={handle} onChange={(e) => setHandle(e.target.value.replace(/\s/g, ""))} placeholder="Handle" aria-label="New player's handle"
          autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={20} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <select className="pk-field" value={parish} onChange={(e) => setParish(e.target.value)} aria-label="Home parish">
            <option value="">Parish</option>
            {PARISHES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="pk-field" value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country">
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={add} disabled={!handle} style={{ ...ghostBtn(), opacity: handle ? 1 : 0.45 }}><IconLabel icon="plus">Add player</IconLabel></button>
      </div>
    </Card>
  );
}

const LOG_LABEL = { create: "Created", close: "Closed early", resolve: "Resolved", dispute: "Disputed", void: "Voided" };
const LOG_ICON = { create: "plus", close: "lock", resolve: "checkCircle", dispute: "flag", void: "ban" };
const LOG_TONE = { resolve: "var(--ok)", dispute: "var(--warn)", void: "var(--bad)" };

/* Every decision, newest first, with its link: the public record for a
   disputed result. */
function LogCard({ state, onOpen }) {
  const [all, setAll] = useStateA(false);
  const entries = all ? state.log : state.log.slice(0, 8);
  const title = (id) => state.questions.find((q) => q.id === id)?.title;
  return (
    <Card>
      <SectionHead icon="list" tone="var(--violet)" title="Decision log" subtitle="Every close, result, dispute and void, with its source." />
      {entries.length ? entries.map((l, i) => (
        <div key={l.id} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: i === entries.length - 1 ? "none" : "1px solid var(--line-soft)", fontSize: 13, lineHeight: 1.5 }}>
          <span style={{ color: LOG_TONE[l.action] || "var(--ink-dim)", marginTop: 2 }}><Icon name={LOG_ICON[l.action] || "info"} size={16} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <strong style={{ flex: 1 }}>{LOG_LABEL[l.action] || l.action}{l.outcome ? `: ${l.outcome}` : ""}</strong>
              <span style={{ fontSize: 12, color: "var(--ink-faint)", whiteSpace: "nowrap" }}>{fmtWhen(l.at)}</span>
            </div>
            {title(l.questionId) && (
              <button onClick={() => onOpen(l.questionId, true)} style={{ ...linkBtn(13), textAlign: "left" }}>{title(l.questionId)}</button>
            )}
            {l.note && l.action !== "create" && <div style={{ color: "var(--ink-dim)" }}>{l.note}</div>}
            {l.sourceUrl && <a href={l.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--ink-dim)", wordBreak: "break-all" }}>{l.sourceUrl}</a>}
          </div>
        </div>
      )) : <EmptyNote icon="list">No decisions yet.</EmptyNote>}
      {state.log.length > 8 && <button onClick={() => setAll((a) => !a)} style={{ ...linkBtn(13), marginTop: 8 }}>{all ? "Show fewer" : `Show all ${state.log.length}`}</button>}
    </Card>
  );
}

/* ---------- new question ---------- */

const blankDraft = (now) => ({
  title: "", kind: "binary", options: ["", ""], category: "Sport", region: "JM",
  // Default: a week out, 7 pm Jamaica time.
  closeLocal: toJmInput(new Date(now + 7 * 86400000).toISOString()).slice(0, 10) + "T19:00",
  sourceName: "", sourceUrl: "", checks: {},
});

function NewQuestionSheet({ api, run, onClose }) {
  const { ref, closing, close } = useModalDismiss(onClose);
  const [d, setD] = useStateA(() => blankDraft(Date.now()));
  const [tried, setTried] = useStateA(false);
  const [busy, setBusy] = useStateA(false);
  const set = (patch) => setD((x) => ({ ...x, ...patch }));
  const problems = questionProblems(d, Date.now());
  const flags = ruleFlags(d.title + " " + (d.kind === "binary" ? "" : d.options.join(" ")));
  const setOption = (i, v) => set({ options: d.options.map((o, j) => (j === i ? v : o)) });
  const save = async () => {
    setTried(true);
    if (problems.length) return;
    setBusy(true);
    const ok = await run(() => api.createQuestion(d), "Question published");
    setBusy(false);
    if (ok) close();
  };
  return (
    <ModalFrame dismiss={{ ref, closing, close }} top label="New question">
      <ModalHead eyebrow="Admin" title="New question" onClose={close} />
      <div style={{ display: "grid", gap: 14 }}>
        <div>
          <FieldLabel htmlFor="nq-title" hint="One reading only. End with a question mark.">Question</FieldLabel>
          <textarea id="nq-title" className="pk-field" rows={2} value={d.title} onChange={(e) => set({ title: e.target.value })}
            placeholder="Will the BOJ hold the policy rate at its next decision?" maxLength={160} />
          {flags.length > 0 && (
            <div className="pk-pop" style={{ display: "flex", gap: 6, fontSize: 12.5, color: "var(--warn)", marginTop: 6, lineHeight: 1.5 }}>
              <Icon name="alert" size={15} style={{ marginTop: 1 }} />
              <span>Mentions “{flags.join("”, “")}”. Check the hard rules: no deaths, no crimes against named people, no minors' personal outcomes.</span>
            </div>
          )}
        </div>

        <div>
          <FieldLabel>Type</FieldLabel>
          <SegToggle full options={KINDS} value={d.kind} onChange={(kind) => set({ kind })} />
        </div>

        {d.kind !== "binary" && (
          <div key={d.kind} className="pk-slide-in">
            <FieldLabel hint={d.kind === "range" ? "Ranges that don't overlap and cover every value, e.g. “Below 157.00”, “157.00 to 158.99”, “159.00 or above”." : "Add “Another …” if the list isn't complete."}>
              {d.kind === "range" ? "Ranges" : "Options"}
            </FieldLabel>
            <div style={{ display: "grid", gap: 6 }}>
              {d.options.map((o, i) => (
                <div key={i} className="pk-row-in" style={{ display: "flex", gap: 6 }}>
                  <input className="pk-field" value={o} onChange={(e) => setOption(i, e.target.value)} placeholder={`${d.kind === "range" ? "Range" : "Option"} ${i + 1}`} aria-label={`Option ${i + 1}`} maxLength={60} />
                  {d.options.length > 2 && (
                    <button onClick={() => set({ options: d.options.filter((_, j) => j !== i) })} style={{ ...iconBtn(), flexShrink: 0, color: "var(--ink-dim)" }} aria-label={`Remove option ${i + 1}`}><Icon name="x" size={14} /></button>
                  )}
                </div>
              ))}
            </div>
            {d.options.length < MAX_OPTIONS && <button onClick={() => set({ options: [...d.options, ""] })} style={{ ...ghostBtn(), marginTop: 8 }}><IconLabel icon="plus" size={15}>Add {d.kind === "range" ? "range" : "option"}</IconLabel></button>}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <FieldLabel htmlFor="nq-cat">Category</FieldLabel>
            <select id="nq-cat" className="pk-field" value={d.category} onChange={(e) => set({ category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="nq-region">Region</FieldLabel>
            <select id="nq-region" className="pk-field" value={d.region} onChange={(e) => set({ region: e.target.value })}>
              {REGIONS.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
            </select>
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="nq-close" hint="Jamaica time. Before the event starts.">Closes</FieldLabel>
          <input id="nq-close" className="pk-field" type="datetime-local" value={d.closeLocal} onChange={(e) => set({ closeLocal: e.target.value })} />
          {fromJmInput(d.closeLocal) && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--ink-faint)", marginTop: 4 }}><Icon name="clock" size={13} />{fmtWhen(fromJmInput(d.closeLocal))} Jamaica time</div>
          )}
        </div>

        <div>
          <FieldLabel htmlFor="nq-src" hint="Where the answer comes from, and when.">Resolution source</FieldLabel>
          <input id="nq-src" className="pk-field" value={d.sourceName} onChange={(e) => set({ sourceName: e.target.value })} placeholder="BOJ policy rate press release" maxLength={120} />
          <input className="pk-field" type="url" inputMode="url" value={d.sourceUrl} onChange={(e) => set({ sourceUrl: e.target.value })} placeholder="https://boj.org.jm (optional)" aria-label="Source link" style={{ marginTop: 6 }} />
        </div>

        <div>
          <FieldLabel>Checklist</FieldLabel>
          <div style={{ display: "grid", gap: 6 }}>
            {NEW_QUESTION_CHECKS.map((c) => (
              <CheckRow key={c.k} on={!!d.checks[c.k]} title={c.l} detail={c.d} onToggle={() => set({ checks: { ...d.checks, [c.k]: !d.checks[c.k] } })} />
            ))}
          </div>
        </div>

        {tried && problems.length > 0 && (
          <div role="alert" className="pk-shake" style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--bad)", lineHeight: 1.5 }}>
            {problems.map((p) => <div key={p} style={{ display: "flex", gap: 6 }}><Icon name="alert" size={15} style={{ marginTop: 1 }} />{p}</div>)}
          </div>
        )}
        <button onClick={save} disabled={busy} style={{ ...primaryBtn(), padding: "12px 16px", fontSize: 15 }}>
          {busy ? <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><Spinner />Publishing…</span> : <IconLabel icon="upload">Publish question</IconLabel>}
        </button>
      </div>
    </ModalFrame>
  );
}

/* A tick box with a title and a line under it. */
function CheckRow({ on, title, detail, onToggle }) {
  return (
    <button role="checkbox" aria-checked={on} onClick={onToggle} className="pk-wide-btn" style={{
      display: "flex", alignItems: "flex-start", gap: 12, width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
      padding: "10px 12px", borderRadius: 12, border: "1px solid transparent", background: "var(--bg-2)", color: "var(--ink)",
    }}>
      <span className={"pk-check" + (on ? " is-on" : "")} style={{
        width: 22, height: 22, borderRadius: 7, flexShrink: 0, marginTop: 1, display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: on ? "var(--accent)" : "transparent", border: `1.5px solid ${on ? "var(--accent)" : "var(--ink-faint)"}`,
      }}>
        {on && <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--accent-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path className="pk-tick" d="M2.5 6.2l2.4 2.4 4.6-5" /></svg>}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 600 }}>{title}</span>
        <span style={{ display: "block", fontSize: 12.5, color: "var(--ink-dim)", marginTop: 2, lineHeight: 1.45 }}>{detail}</span>
      </span>
    </button>
  );
}

Object.assign(window, { AdminView, NewQuestionSheet });
