/* leaderboard.jsx — leagues (everyone, Jamaica, diaspora, your parish),
   ranked by total points or by accuracy, and the parish table (Portland vs
   St Andrew), with a copy for WhatsApp. */
const { useState: useStateL } = React;

function LeaderboardView({ state, scores, onProfile, onSignIn, onAbout }) {
  const me = state.players.find((p) => p.id === ME);
  const [mode, setMode] = useStateL("players");
  const [league, setLeague] = useStateL("all");
  const [by, setBy] = useStateL("points");
  const myParish = state.signedOut ? "" : me?.parish || "";
  const leagues = [
    { v: "all", l: "All" },
    { v: "jm", l: "Jamaica" },
    { v: "diaspora", l: "Diaspora" },
    { v: "parish", l: myParish || "My parish" },
  ];
  const rows = leaderboard(state, scores, league, myParish, by);
  const table = parishTable(state, scores);
  const top = table.length ? Math.max(...table.map((t) => t.avg)) : 0;
  const anyRanked = rows.some((r) => r.rank != null);
  const title = league === "parish" ? myParish || "My parish" : leagues.find((l) => l.v === league).l;
  return (
    <main className="pk-view pk-page" style={{ padding: "16px 20px 0" }}>
      <div style={{ marginBottom: 14 }}>
        <SegToggle full value={mode} onChange={setMode} options={[
          { v: "players", l: <IconLabel icon="trophy" size={14} gap={5}>Players</IconLabel> },
          { v: "parishes", l: <IconLabel icon="pin" size={14} gap={5}>Parish table</IconLabel> },
        ]} />
      </div>

      {mode === "players" ? (
        <Card>
          <SectionHead icon="trophy" title={title} subtitle={by === "points" ? "Total points: every call adds up." : `Points per call, from ${MIN_FOR_ACCURACY} scored calls.`}
            right={<SegToggle small value={by} onChange={setBy} options={[{ v: "points", l: "Points" }, { v: "accuracy", l: "Accuracy" }]} />} />
          <div style={{ marginBottom: 12 }}><SegToggle small fit options={leagues} value={league} onChange={setLeague} /></div>
          {league === "parish" && !myParish ? (
            <EmptyNote icon="pin">
              {state.signedOut ? "Sign in and set your home parish to see your parish league." : "Set your home parish to see your parish league."}
              <div style={{ marginTop: 10 }}>
                <button onClick={state.signedOut ? onSignIn : onProfile} style={accentBtn()}>{state.signedOut ? "Sign in" : "Set my parish"}</button>
              </div>
            </EmptyNote>
          ) : (
            <>
              {!anyRanked && (
                <EmptyNote icon="trophy">
                  {by === "accuracy" ? `Nobody has ${MIN_FOR_ACCURACY} scored calls here yet.` : "No results yet. Points come in as questions resolve."}
                </EmptyNote>
              )}
              <div key={`${league}-${by}`} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)" }}>
                {rows.map((r, i) => <BoardRow key={r.player.id} r={r} by={by} index={i} last={i === rows.length - 1} />)}
              </div>
              {anyRanked && (
                <button onClick={() => shareText(leaderboardText(rows, title, appUrl(), by))} style={{ ...ghostBtn(), marginTop: 14, width: "100%" }}>
                  <IconLabel icon="share">Share top 10 to WhatsApp</IconLabel>
                </button>
              )}
            </>
          )}
        </Card>
      ) : (
        <Card>
          <SectionHead icon="pin" tone="var(--jm)" title="Parish table" subtitle="Average points per player with a scored call, by home parish." />
          {table.length ? table.map((t, i) => (
            <div key={t.parish} className="pk-row-in" style={{ animationDelay: `${i * 0.04}s`, padding: "10px 0", borderBottom: i === table.length - 1 ? "none" : "1px solid var(--line-soft)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Medal rank={i + 1} delay={0.1 + i * 0.06} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: t.parish === myParish ? "var(--accent)" : "var(--ink)" }}>{t.parish}</span>
                  <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{t.players} {t.players === 1 ? "player" : "players"}</span>
                </span>
                <span className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{fmtPts(t.avg)}</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: "var(--fill)", marginTop: 8, marginLeft: 40 }}>
                <div className="pk-grow-x" style={{ animationDelay: `${0.15 + i * 0.05}s`, width: `${top ? (t.avg / top) * 100 : 0}%`, height: "100%", borderRadius: 2, background: t.parish === myParish ? "var(--accent)" : "var(--jm)" }} />
              </div>
            </div>
          )) : <EmptyNote icon="pin">No parish has a scored call yet.</EmptyNote>}
        </Card>
      )}

      <Card>
        <div style={{ display: "flex", gap: 10, fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.55 }}>
          <span style={{ color: "var(--accent)", marginTop: 1 }}><Icon name="info" size={17} /></span>
          <div>
            <strong style={{ color: "var(--ink)" }}>How points work:</strong> each resolved call scores from 0 to 100. Sure and right scores 100, sure and wrong scores 0, and 50% on a Yes/No scores 75 either way. Say what you really think: that scores best over time. <button onClick={onAbout} style={linkBtn()}>More</button>
          </div>
        </div>
      </Card>
    </main>
  );
}

function BoardRow({ r, by, index, last }) {
  const isMe = r.player.id === ME;
  const where = [r.player.parish, r.player.country !== "Jamaica" ? r.player.country : null].filter(Boolean).join(" · ");
  const value = by === "accuracy" ? r.avgPoints : r.points;
  return (
    <div className="pk-row-in" style={{
      animationDelay: `${Math.min(index, 12) * 0.035}s`,
      display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", margin: "0 -8px", borderRadius: 12,
      background: isMe ? "color-mix(in oklab, var(--accent) 10%, transparent)" : "transparent",
      borderBottom: last || isMe ? "1px solid transparent" : "1px solid var(--line-soft)",
    }}>
      <Medal rank={r.rank} delay={0.15 + index * 0.05} />
      <Avatar handle={r.player.handle} size={32} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14.5, fontWeight: 600 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.player.handle}</span>
          {isMe && <Tag tone="var(--accent)">You</Tag>}
          {r.player.sample && <Tag>Sample</Tag>}
        </span>
        <span style={{ display: "block", fontSize: 12, color: "var(--ink-faint)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {where || "No parish set"} · {r.scored} scored
        </span>
      </span>
      <span style={{ textAlign: "right" }}>
        <span className="mono" style={{ display: "block", fontSize: 17, fontWeight: 700, color: r.rank == null ? "var(--ink-faint)" : "var(--ink)" }}>
          {r.rank == null ? "–" : fmtPts(value)}
        </span>
        {r.rank != null && <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>{by === "accuracy" ? "a call" : "pts"}</span>}
      </span>
    </div>
  );
}

Object.assign(window, { LeaderboardView });
