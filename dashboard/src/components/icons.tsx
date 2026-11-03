import type { ReactNode } from "react";
import type { IconName } from "../tiles.ts";

const PATHS: Record<IconName | "close", ReactNode> = {
  thermometer: <path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0Z" />,
  flame: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.6 2.3-4.6.3 1.6 1.2 2.6 2.2 2.6 0-3 .5-5.5.5-8Z" />,
  bulb: <path d="M9 18h6m-5 3h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3Z" />,
  tv: (
    <>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
    </>
  ),
  dishwasher: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M4 8h16M8 5.5h.01M11 5.5h.01" />
      <circle cx="12" cy="14.5" r="3.5" />
    </>
  ),
  download: <path d="M12 4v11m-5-5 5 5 5-5M5 20h14" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3Z" />
    </>
  ),
  router: (
    <>
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 16.5h.01M11 16.5h.01M8.5 9.5a5 5 0 0 1 7 0M6 7a8.5 8.5 0 0 1 12 0" />
    </>
  ),
  arrows: <path d="M8 20V4M4 8l4-4 4 4m4-4v16m-4-4 4 4 4-4" />,
  cpu: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      <path d="M9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3" />
    </>
  ),
  alert: <path d="M12 3.5 2.8 19.5h18.4L12 3.5ZM12 10v4m0 3h.01" />,
  battery: (
    <>
      <rect x="2.5" y="7" width="17" height="10" rx="2.5" />
      <path d="M22 10.5v3" />
      <rect x="5" y="9.5" width="7" height="5" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  signal: <path d="M5 20v-3m5 3v-6m5 6v-9m5 9V7" />,
  close: <path d="m7 7 10 10M17 7 7 17" />,
};

export function Icon({ name, size = 20 }: { name: IconName | "close"; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
