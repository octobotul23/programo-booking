// One stroke icon set (1.5px, 24 grid) — same construction as the ONE design system
const base = (p) => ({
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  ...p,
});

export const ChevronLeft = (p) => (<svg {...base(p)}><path d="m15 18-6-6 6-6" /></svg>);
export const ChevronRight = (p) => (<svg {...base(p)}><path d="m9 18 6-6-6-6" /></svg>);
export const ChevronDown = (p) => (<svg {...base(p)}><path d="m6 9 6 6 6-6" /></svg>);
export const Close = (p) => (<svg {...base(p)}><path d="M18 6 6 18M6 6l12 12" /></svg>);
export const Plus = (p) => (<svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>);
export const Minus = (p) => (<svg {...base(p)}><path d="M5 12h14" /></svg>);
export const Check = (p) => (<svg {...base(p)}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>);
export const ArrowUpRight = (p) => (<svg {...base(p)}><path d="M7 17 17 7M8 7h9v9" /></svg>);
export const ArrowRight = (p) => (<svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
export const Calendar = (p) => (<svg {...base(p)}><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>);
export const List = (p) => (<svg {...base(p)}><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></svg>);
export const Users = (p) => (<svg {...base(p)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c1.9.7 3.2 2.5 3.5 5.2" /></svg>);
export const User = (p) => (<svg {...base(p)}><circle cx="12" cy="8" r="4" /><path d="M4 20.5c.8-4 4-6.2 8-6.2s7.2 2.2 8 6.2" /></svg>);
export const Settings = (p) => (<svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" /></svg>);
export const Globe = (p) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z" /></svg>);
export const Clock = (p) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
export const Phone = (p) => (<svg {...base(p)}><path d="M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5L16 14l4 1.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" /></svg>);
export const Mail = (p) => (<svg {...base(p)}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></svg>);
export const Pin = (p) => (<svg {...base(p)}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg>);
export const Search = (p) => (<svg {...base(p)}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>);
export const Trash = (p) => (<svg {...base(p)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" /></svg>);
export const Link = (p) => (<svg {...base(p)}><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></svg>);
export const Copy = (p) => (<svg {...base(p)}><rect x="8.5" y="8.5" width="12" height="12" rx="2.5" /><path d="M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" /></svg>);
export const Logout = (p) => (<svg {...base(p)}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" /></svg>);
export const Menu = (p) => (<svg {...base(p)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>);
export const Grid = (p) => (<svg {...base(p)}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>);
export const Columns = (p) => (<svg {...base(p)}><rect x="3.5" y="4" width="17" height="16" rx="2.5" /><path d="M9.2 4v16M14.8 4v16" /></svg>);
export const Sparkle = (p) => (<svg {...base(p)}><path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7Z" /></svg>);
export const Up = (p) => (<svg {...base(p)}><path d="m6 15 6-6 6 6" /></svg>);

/* business type glyphs */
export const Stethoscope = (p) => (<svg {...base(p)}><path d="M6 3v5a4 4 0 0 0 8 0V3" /><path d="M10 12v2.5a5 5 0 0 0 10 0V13" /><circle cx="20" cy="11" r="2" /></svg>);
export const Tooth = (p) => (<svg {...base(p)}><path d="M12 5.5C10 4 7.5 3.5 6 4.5 3.7 6 4.3 10 5.3 12.5c.8 2 1 4 1.3 6.3.2 1.3 1.6 1.5 2 .2l1.2-4c.4-1.2 1.9-1.2 2.3 0l1.2 4c.4 1.3 1.8 1.1 2-.2.3-2.3.5-4.3 1.3-6.3 1-2.5 1.6-6.5-.7-8-1.5-1-4-.5-6 1Z" /></svg>);
export const Dumbbell = (p) => (<svg {...base(p)}><path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11" /></svg>);
export const Scissors = (p) => (<svg {...base(p)}><circle cx="6" cy="6.5" r="2.5" /><circle cx="6" cy="17.5" r="2.5" /><path d="M8 8l12 10M8 16 20 6" /></svg>);
export const Leaf = (p) => (<svg {...base(p)}><path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15" /><path d="M5 19 14 10" /></svg>);
export const Activity = (p) => (<svg {...base(p)}><path d="M3 12h4l2.5-6 5 12 2.5-6h4" /></svg>);
export const Paw = (p) => (<svg {...base(p)}><circle cx="6" cy="10" r="1.8" /><circle cx="9.5" cy="5.8" r="1.8" /><circle cx="14.5" cy="5.8" r="1.8" /><circle cx="18" cy="10" r="1.8" /><path d="M12 11.5c-2.5 0-5 3.5-5 6 0 1.5 1 2.2 2.3 2.2 1 0 1.7-.6 2.7-.6s1.7.6 2.7.6c1.3 0 2.3-.7 2.3-2.2 0-2.5-2.5-6-5-6Z" /></svg>);
export const Book = (p) => (<svg {...base(p)}><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5Z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z" /></svg>);

export const TYPE_ICONS = {
  clinic: Stethoscope,
  dental: Tooth,
  gym: Dumbbell,
  salon: Scissors,
  spa: Leaf,
  physio: Activity,
  vet: Paw,
  tutoring: Book,
  other: Calendar,
};

// clinic screens
export const Home = (p) => (<svg {...base(p)}><path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19Z" /></svg>);
export const Bell = (p) => (<svg {...base(p)}><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15Z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></svg>);
export const Wallet = (p) => (<svg {...base(p)}><rect x="3.5" y="6" width="17" height="13.5" rx="2.5" /><path d="M3.5 9.5h17M16 14.5h1.5" /><path d="M6 6V5a1.5 1.5 0 0 1 1.9-1.4L16 6" /></svg>);
export const Folder = (p) => (<svg {...base(p)}><path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4.2l2 2.2H19A1.5 1.5 0 0 1 20.5 9v9A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18Z" /></svg>);
export const Chart = (p) => (<svg {...base(p)}><path d="M4 20h16" /><rect x="5.5" y="11" width="3" height="6.5" rx="1" /><rect x="10.5" y="6.5" width="3" height="11" rx="1" /><rect x="15.5" y="13.5" width="3" height="4" rx="1" /></svg>);
export const Building = (p) => (<svg {...base(p)}><path d="M5 20.5V5a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 15 5v15.5M15 9.5h3.5A1.5 1.5 0 0 1 20 11v9.5M3.5 20.5h17" /><path d="M8.5 7.5h3M8.5 11h3M8.5 14.5h3" /></svg>);
export const Message = (p) => (<svg {...base(p)}><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5Z" /><path d="M8 9h8M8 12.5h5" /></svg>);
export const Help = (p) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.8" /><circle cx="12" cy="17" r=".6" fill="currentColor" /></svg>);
export const Sun = (p) => (<svg {...base(p)}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></svg>);
export const Moon = (p) => (<svg {...base(p)}><path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z" /></svg>);
export const Info = (p) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5" /><circle cx="12" cy="7.8" r=".6" fill="currentColor" /></svg>);
export const Table = (p) => (<svg {...base(p)}><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10" /></svg>);
export const Download = (p) => (<svg {...base(p)}><path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14" /></svg>);
export const Edit = (p) => (<svg {...base(p)}><path d="M14.5 5.5 18.5 9.5M4 20l1-4.5L15.8 4.7a1.8 1.8 0 0 1 2.5 0l1 1a1.8 1.8 0 0 1 0 2.5L8.5 19Z" /></svg>);
export const Send = (p) => (<svg {...base(p)}><path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4Z" /></svg>);
export const Card = (p) => (<svg {...base(p)}><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M6.5 15h3" /></svg>);
export const Cash = (p) => (<svg {...base(p)}><rect x="2.5" y="6.5" width="19" height="11" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9.5v5M18 9.5v5" /></svg>);
export const Whatsapp = (p) => (<svg {...base(p)}><path d="M4.5 19.5 5.6 16A8 8 0 1 1 8.4 18.6Z" /><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .8a4 4 0 0 1-2.2-2.2l.8-1-1-2Z" /></svg>);
export const Shield = (p) => (<svg {...base(p)}><path d="M12 3.5 19 6v5.5c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6Z" /><path d="m9 12 2 2 4-4" /></svg>);
