export function Artwork({ variant = 0 }: { variant?: number }) {
  return (
    <svg
      viewBox="0 0 600 240"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <circle cx="460" cy="65" r="28" fill="#d8c9a3" opacity=".55" />
      <path
        d="M0 160Q120 60 250 155T600 135V240H0Z"
        fill={['#516b56', '#8c7356', '#52677a'][variant % 3]}
      />
      <path d="M0 210Q160 90 330 185T600 165V240H0Z" fill="#172a23" />
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
          stroke="#e8b487"
          opacity=".3"
        />
      ))}
    </svg>
  );
}
