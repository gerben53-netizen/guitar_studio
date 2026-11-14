export function Artwork({ variant = 0 }: { variant?: number }) {
  return (
    <svg
      viewBox="0 0 600 240"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <circle
        cx="460"
        cy="65"
        r="28"
        fill="var(--color-accent-primary)"
        opacity=".55"
      />
      <path
        d="M0 160Q120 60 250 155T600 135V240H0Z"
        fill={
          variant % 2 ? 'var(--color-art-highlight)' : 'var(--color-art-start)'
        }
      />
      <path
        d="M0 210Q160 90 330 185T600 165V240H0Z"
        fill="var(--color-art-end)"
      />
      {Array.from({ length: 6 }, (_, i) => (
        <path
          key={i}
          d={
            'M0 ' +
            (170 + i * 9) +
            ' Q160 ' +
            (115 + i * 9) +
            ' 320 ' +
            (180 + i * 9) +
            ' T600 ' +
            (190 + i * 9)
          }
          fill="none"
          stroke="var(--color-art-highlight)"
          opacity=".3"
        />
      ))}
    </svg>
  );
}
