/* leaderboard.jsx — leagues (everyone, Jamaica, diaspora, your parish) and
   the parish table (Portland vs St Andrew), with a copy for WhatsApp. */
const { useState: useStateL } = React;

function LeaderboardView({ state, scores, onProfile, onAbout }) {
  const me = state.players.find((p) => p.id === ME);
  const [mode, setMode] = useStateL("players");
  const [league, setLeague] = useStateL("all");
  const leagues = [
    { v: "all", l: "All" },
    { v: "jm", l: "Jamaica" },
    { v: "diaspora", l: "Diaspora" },
    { v: "parish", l: me?.parish || "My parish" },
  ];
  const rows = leaderboard(state, scores, league, me?.parish);
  const table = parishTable(state, scores);
  const anyResolved = state.questions.some((q) => q.status === "resolved");
  const title = league === "parish" ? me?.parish || "My parish" : leagues.find((l) => l.v === league).l;
  return (
    <main className="pk-view pk-page" style={{ padding: "16px 20px 0" }}>
      <div style={{ marginBottom: 14 }}>
        <SegToggle full options={[{ v: "players", l: "Players" }, { v: "parishes", l: "Parish table" }]} value={mode} onChange={setMode} />
      </div>

      {mode === "players" ? (
        <Card>
          <div style={{ marginBottom: 12 }}><SegToggle small fit options={leagues} value={league} onChange={setLeague} /></div>
          {league === "parish" && !me?.parish ? (
            <EmptyNote>
              Set your home parish to see your parish league.
              <div style={{ marginTop: 10 }}><button onClick={onProfile} style={accentBtn()}>Set my parish</button></div>
            </EmptyNote>
          ) : (
            <>
              {!anyResolved && <EmptyNote>No results yet. Points come in as questions resolve.</EmptyNote>}
              <div style={{ display: "grid" }}>
                {rows.map((r, i) => <BoardRow key={r.player.id} r={r} index={i} last={i === rows.length - 1} />)}
              </div>
              {rows.length > 0 && anyResolved && (
                <button onClick={() => shareText(leaderboardText(rows, title, appUrl()))} style={{ ...ghostBtn(), marginTop: 14, width: "100%" }}>Share top 10 to WhatsApp</button>
              )}
            </>
          )}
        </Card>
      ) : (
        <Card>
          <SectionHead title="Parish table" subtitle="Average points per player with a scored call, by home parish." />
          {table.length ? table.map((t, i) => (
            <div key={t.parish} className="pk-row-in" style={{ animationDelay: `${i * 0.03}s`, display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i === table.length - 1 ? "none" : "1px solid var(--line-soft)" }}>
              <span className="mono" style={{ width: 22, textAlign: "right", color: "var(--ink-faint)", fontWeight: 600 }}>{i + 1}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: t.parish === me?.parish ? "var(--accent)" : "var(--ink)" }}>{t.parish}</span>
                <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{t.players} {t.players === 1 ? "player" : "players"}</span>
              </span>
              <span className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{fmtPts(t.avg)}</span>
            </div>
          )) : <EmptyNote>No parish has a scored call yet.</EmptyNote>}
        </Card>
      )}

      <Card>
        <div style={{ fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.55 }}>
          <strong style={{ color: "var(--ink)" }}>How points work:</strong> each resolved question scores 100 × how much better you did than a coin flip. 50% on a Yes/No scores 0, a confident right call up to +100, a confident wrong call goes negative. <button onClick={onAbout} style={linkBtn()}>More</button>
        </div>
      </Card>
    </main>
  );
}

function BoardRow({ r, index, last }) {
  const isMe = r.player.id === ME;
  const where = [r.player.parish, r.player.country !== "Jamaica" ? r.player.country : null].filter(Boolean).join(" · ");
  return (
    <div className="pk-row-in" style={{
      animationDelay: `${Math.min(index, 12) * 0.03}s`,
      display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", margin: "0 -8px", borderRadius: 12,
      background: isMe ? "color-mix(in oklab, var(--accent) 10%, transparent)" : "transparent",
      borderBottom: last || isMe ? "1px solid transparent" : "1px solid var(--line-soft)",
    }}>
      <span className="mono" style={{ width: 22, textAlign: "right", fontWeight: 700, color: r.rank != null && r.rank <= 3 ? "var(--accent)" : "var(--ink-faint)" }}>{r.rank ?? "–"}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14.5, fontWeight: 600 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.player.handle}</span>
          {isMe && <Tag tone="var(--accent)">You</Tag>}
          {r.player.sample && <Tag>Sample</Tag>}
        </span>
        <span style={{ display: "block", fontSize: 12, color: "var(--ink-faint)", marginTop: 1 }}>
          {where || "No parish set"} · {r.scored} scored{r.avgBrier != null ? ` · Brier ${fmtBrier(r.avgBrier)}` : ""}
        </span>
      </span>
      <span className="mono" style={{ fontSize: 17, fontWeight: 700, color: !r.scored ? "var(--ink-faint)" : r.points < 0 ? "var(--bad)" : "var(--ink)" }}>{r.scored ? fmtPts(r.points) : "–"}</span>
    </div>
  );
}

Object.assign(window, { LeaderboardView });
