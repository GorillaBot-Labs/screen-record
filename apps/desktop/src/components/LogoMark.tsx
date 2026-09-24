import logoUrl from '@/assets/logo.svg'

type LogoMarkProps = {
  className?: string
  size?: number
}

export function LogoMark({ className = '', size = 44 }: LogoMarkProps) {
  return (
    <img
      src={logoUrl}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={className}
    />
  )
}
