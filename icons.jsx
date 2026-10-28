/* icons.jsx — the app's icon set. One style throughout (24-unit grid, round
   ends, drawn as strokes in the text colour), inline so they stay crisp and
   follow the theme. <Icon name="share" />; add an icon by adding a line. */

const ICONS = {
  // Tabs
  dial: <><circle cx="12" cy="12" r="8.5" strokeOpacity="0.35" /><path d="M12 3.5a8.5 8.5 0 1 1-8.1 11" /><path d="M8.5 12.3l2.4 2.4 4.6-5" /></>,
  trophy: <><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 3.6" /><path d="M17 6h2.5a2.5 2.5 0 0 1-2.6 3.6" /></>,
  user: <><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20c0-3.9 3.4-6.4 7.5-6.4s7.5 2.5 7.5 6.4" /></>,
  shield: <><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z" /><path d="M9 12l2.2 2.2L15.5 10" /></>,
  // Categories
  sport: <><circle cx="12" cy="12" r="9" /><path d="M12 7.6l3.8 2.8-1.5 4.5H9.7l-1.5-4.5z" /><path d="M12 3v4.6M15.8 10.4l4.4-1.4M14.3 14.9l2.8 3.8M9.7 14.9l-2.8 3.8M8.2 10.4L3.8 9" /></>,
  politics: <><path d="M3 21h18" /><path d="M5 21v-9M9.5 21v-9M14.5 21v-9M19 21v-9" /><path d="M3 9.5h18L12 3z" /></>,
  economy: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6.5 9.5v.01M17.5 14.5v.01" /></>,
  culture: <><path d="M9 18V5.5l11-2.2V16" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></>,
  markets: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  other: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />,
  // Regions
  pin: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z" /></>,
  // Time and state
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 2" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="M8 12.3l2.7 2.7L16 9.7" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5" /><path d="M12 16.5v.01" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>,
  ban: <><circle cx="12" cy="12" r="9" /><path d="M5.7 5.7l12.6 12.6" /></>,
  hourglass: <><path d="M6 3h12M6 21h12" /><path d="M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" /></>,
  // Actions
  share: <><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
  trash: <><path d="M4 7h16" /><path d="M9.5 7V4h5v3" /><path d="M6 7l1 13h10l1-13" /></>,
  download: <><path d="M12 4v11" /><path d="M7.5 10.5L12 15l4.5-4.5" /><path d="M5 20h14" /></>,
  upload: <><path d="M12 15V4" /><path d="M7.5 8.5L12 4l4.5 4.5" /><path d="M5 20h14" /></>,
  link: <><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.6-4.5L4 8.5" /><path d="M4 4v4.5h4.5" /><path d="M4 13a8 8 0 0 0 14.6 4.5l1.4-2" /><path d="M20 20v-4.5h-4.5" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 6.5l8.5 6.5 8.5-6.5" /></>,
  logIn: <><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5" /></>,
  logOut: <><path d="M9 7l-5 5 5 5" /><path d="M4 12h12" /><path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 19.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M15.5 4.9a3.2 3.2 0 0 1 0 6.2" /><path d="M17.5 14.3c2.1.6 3.5 2.6 3.5 5.2" /></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></>,
  chart: <><path d="M4 20V11M10 20V4M16 20v-6" /><path d="M2 20h20" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5" /><path d="M12 7.6v.01" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.3" /><path d="M12 16.5v.01" /></>,
  inbox: <><path d="M3 13l3-8h12l3 8" /><path d="M3 13v6h18v-6h-5l-1.5 2.5h-5L8 13z" /></>,
  sparkle: <><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
  // Where the data lives
  cloud: <path d="M7 18h10.5a4 4 0 0 0 .6-8A6 6 0 0 0 6.5 11.5 3.3 3.3 0 0 0 7 18z" />,
  cloudOff: <><path d="M7 18h10.5a4 4 0 0 0 .6-8A6 6 0 0 0 6.5 11.5 3.3 3.3 0 0 0 7 18z" /><path d="M4 4l16 16" /></>,
  phone: <><rect x="7" y="3" width="10" height="18" rx="2.5" /><path d="M11 18h2" /></>,
  // Theme
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  auto: <><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" /></>,
};

const CATEGORY_ICONS = { Sport: "sport", Politics: "politics", Economy: "economy", Culture: "culture", Markets: "markets", Other: "other" };

function Icon({ name, size = 18, stroke = 1.8, style, className }) {
  return (
    <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, display: "block", ...style }}>
      {ICONS[name] || ICONS.other}
    </svg>
  );
}

/* A label with an icon in front, for buttons:
   <button style={ghostBtn()}><IconLabel icon="share">Share</IconLabel></button> */
function IconLabel({ icon, children, size = 16, gap = 7 }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap }}>
      <Icon name={icon} size={size} />
      {children}
    </span>
  );
}

Object.assign(window, { ICONS, CATEGORY_ICONS, Icon, IconLabel });
