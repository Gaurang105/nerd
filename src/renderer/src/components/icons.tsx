// Inline line-icons (16px grid, stroke = currentColor) matching the Figma toolbar/settings glyphs.

interface IconProps {
  size?: number
  className?: string
}

function svg(
  size: number,
  className: string | undefined,
  children: React.ReactNode
): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const ModesIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(
    size,
    className,
    <>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </>
  )

export const EyeIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(
    size,
    className,
    <>
      <path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z" />
      <circle cx="8" cy="8" r="2" />
    </>
  )

export const EyeOffIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(
    size,
    className,
    <>
      <path d="M6.2 3.3A6.6 6.6 0 0 1 8 3c3.5 0 6 3 6.5 5a9 9 0 0 1-1.6 2.3M3.3 4.4C1.9 5.5 1 6.9.5 8c.5 2 3 5 7.5 5a7 7 0 0 0 2.5-.5" />
      <path d="M6.6 6.6a2 2 0 0 0 2.8 2.8" />
      <path d="M2 2l12 12" />
    </>
  )

export const WaveformIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(
    size,
    className,
    <>
      <path d="M2 7v2M5 4.5v7M8 2.5v11M11 5v6M14 7v2" />
    </>
  )

export const HistoryIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(
    size,
    className,
    <>
      <path d="M2.5 8a5.5 5.5 0 1 0 1.7-4M2.5 3.2V6h2.8" />
      <path d="M8 5v3l2 1.2" />
    </>
  )

export const ExpandIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(
    size,
    className,
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
    </>
  )

export const PersonIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(
    size,
    className,
    <>
      <circle cx="8" cy="5" r="2.5" />
      <path d="M3.5 13.5a4.5 4.5 0 0 1 9 0" />
    </>
  )

export const SendIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(
    size,
    className,
    <>
      <path d="M3 8h8M8 4l4 4-4 4" />
    </>
  )

export const ChevronDownIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(size, className, <path d="M4 6l4 4 4-4" />)

export const ArrowUpIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(size, className, <path d="M8 13V3M4 7l4-4 4 4" />)

export const TranscriptIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(
    size,
    className,
    <>
      <rect x="2.5" y="2" width="11" height="12" rx="1.5" />
      <path d="M5 5.5h6M5 8h6M5 10.5h4" />
    </>
  )

export const BackIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(size, className, <path d="M10 4l-4 4 4 4M6 8h7" />)

export const PauseIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(
    size,
    className,
    <>
      <rect x="4" y="3" width="3" height="10" rx="1" />
      <rect x="9" y="3" width="3" height="10" rx="1" />
    </>
  )

export const RecordIcon = ({ size = 16, className }: IconProps): React.JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 16 16" className={className} aria-hidden="true">
    <circle cx="8" cy="8" r="5" fill="currentColor" />
  </svg>
)

export const GearIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(
    size,
    className,
    <>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.5v1.8M8 12.7v1.8M14.5 8h-1.8M3.3 8H1.5M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3M12.6 12.6l-1.3-1.3M4.7 4.7L3.4 3.4" />
    </>
  )

export const CommandIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(
    size,
    className,
    <path d="M11 5v8a2 2 0 1 0 2-2H5a2 2 0 1 0 2 2V5a2 2 0 1 0-2 2h8a2 2 0 1 0-2-2" />
  )

export const ResetIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(
    size,
    className,
    <>
      <path d="M3 8a5 5 0 1 1 1.5 3.5M3 12V8.5h3.5" />
    </>
  )

export const LogoutIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(
    size,
    className,
    <>
      <path d="M6 2.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H6" />
      <path d="M9 4l3.5 4L9 12M12.5 8H6" />
    </>
  )

export const PowerIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(
    size,
    className,
    <>
      <path d="M8 2v5" />
      <path d="M4.5 4.5a5 5 0 1 0 7 0" />
    </>
  )

export const CheckIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(size, className, <path d="M3 8.5l3.2 3L13 4.5" />)

export const PlusIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(size, className, <path d="M8 3v10M3 8h10" />)

export const TrashIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(
    size,
    className,
    <>
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.6 9a1 1 0 0 0 1 1h4.8a1 1 0 0 0 1-1L12 4" />
    </>
  )

export const UploadIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(
    size,
    className,
    <>
      <path d="M8 10V3M5 6l3-3 3 3" />
      <path d="M2.5 11v1.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V11" />
    </>
  )

export const EditIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(
    size,
    className,
    <>
      <path d="M11 2.5l2.5 2.5L6 12.5l-3 .5.5-3L11 2.5z" />
    </>
  )

export const LinkIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(
    size,
    className,
    <>
      <path d="M6.5 9.5a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-1 1" />
      <path d="M9.5 6.5a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l1-1" />
    </>
  )

export const DatabaseIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(
    size,
    className,
    <>
      <ellipse cx="8" cy="3.5" rx="5" ry="2" />
      <path d="M3 3.5v5c0 1.1 2.2 2 5 2s5-.9 5-2v-5" />
      <path d="M3 8.5v4c0 1.1 2.2 2 5 2s5-.9 5-2v-4" />
    </>
  )

export const SlackIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(
    size,
    className,
    <>
      <path d="M6 2.5v7M10 6.5v7M3 6h7M6.5 10h7" />
    </>
  )

export const ArrowUpRightIcon = ({ size = 16, className }: IconProps): React.JSX.Element =>
  svg(size, className, <path d="M5 11l6-6M6 5h5v5" />)
