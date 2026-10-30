const icons = {
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l1 13H4L5 8Z" />
      <path d="M9 9V6a3 3 0 0 1 6 0v3" />
    </>
  ),
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  close: <path d="m5 5 14 14M19 5 5 19" />,
  arrow: <path d="M4 12h15M13 6l6 6-6 6" />,
};

export function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {icons[name]}
    </svg>
  );
}
