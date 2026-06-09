interface FridaLogoProps {
  className?: string;
  size?: number;
}

export function FridaLogo({ className, size = 24 }: FridaLogoProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="#EF6456"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="translate(19, 26)">
        <path d="M11,48H0V0h21.4c12.6,0,19.8,5.9,19.8,16.5c0,7.5-3.2,12.6-9.1,15.4L43.6,48H31.3l-9.1-13.5H10.6h-0.2V48z M19.6,24.6c6,0,9.4-2.5,9.4-8c0-5.4-3.4-8-9.4-8H11v16H19.6z" />
        <g transform="translate(52, 12)">
          <rect x="0" y="0" width="9" height="9" rx="1" />
          <rect x="0" y="17" width="9" height="9" rx="1" />
        </g>
      </g>
    </svg>
  );
}
