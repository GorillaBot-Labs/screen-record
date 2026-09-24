type LogoMarkProps = {
  className?: string;
  size?: number;
};

export function LogoMark({ className = "", size = 32 }: LogoMarkProps) {
  return (
    <img
      src="/logo.svg"
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={className}
    />
  );
}
