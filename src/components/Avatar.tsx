// Procedural agent characters. Every directory agent gets a robot generated
// from its path, so the same folder always has the same face.

export type AgentState = "idle" | "thinking" | "speaking";

interface Props {
  seed: number;
  accent: string;
  /** Diameter in the parent's coordinate units. */
  size: number;
  cx: number;
  cy: number;
  state?: AgentState;
  orchestrator?: boolean;
}

const bits = (seed: number, shift: number, n: number) => (seed >>> shift) % n;

/** The character as an SVG <g>, for embedding in the orbit. */
export function AvatarG({ seed, accent, size, cx, cy, state = "idle", orchestrator = false }: Props) {
  const s = size / 100; // drawn on a 100×100 grid
  const head = orchestrator ? 1 : bits(seed, 0, 4);
  const eyes = orchestrator ? 1 : bits(seed, 3, 4);
  const antenna = orchestrator ? 3 : bits(seed, 6, 4);
  const mouth = bits(seed, 9, 3);
  const blinkDelay = `${(bits(seed, 12, 40) / 10).toFixed(1)}s`;
  const id = `av-${seed}-${orchestrator ? "o" : "d"}`;
  const eye = "#f2f1ee";

  const headShape = [
    <circle key="h" cx={50} cy={56} r={30} />,
    <rect key="h" x={21} y={28} width={58} height={56} rx={16} />,
    <path key="h" d="M50 24 L77 40 L77 72 L50 88 L23 72 L23 40 Z" />,
    <rect key="h" x={24} y={30} width={52} height={52} rx={26} />,
  ][head];

  return (
    <g transform={`translate(${cx - 50 * s} ${cy - 50 * s}) scale(${s})`}>
      <defs>
        <radialGradient id={`${id}-fill`} cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor={accent} stopOpacity={0.95} />
          <stop offset="100%" stopColor={accent} stopOpacity={0.35} />
        </radialGradient>
      </defs>

      {/* aura */}
      <circle cx={50} cy={56} r={44} fill={accent} opacity={state === "idle" ? 0.08 : 0.16}>
        {state !== "idle" && <animate attributeName="r" values="40;46;40" dur="1.6s" repeatCount="indefinite" />}
      </circle>
      {state === "thinking" && (
        <circle cx={50} cy={56} r={40} fill="none" stroke={accent} strokeWidth={1.6} strokeDasharray="4 7" opacity={0.9}>
          <animateTransform attributeName="transform" type="rotate" from="0 50 56" to="360 50 56" dur="3s" repeatCount="indefinite" />
        </circle>
      )}
      {orchestrator && (
        <ellipse cx={50} cy={56} rx={47} ry={13} fill="none" stroke={accent} strokeOpacity={0.55} strokeWidth={1.4} transform="rotate(-18 50 56)" />
      )}

      {/* antenna */}
      {antenna === 1 && <g stroke={accent} strokeWidth={2.4}><line x1={50} y1={28} x2={50} y2={14} /><circle cx={50} cy={11} r={4} fill={accent} /></g>}
      {antenna === 2 && <g stroke={accent} strokeWidth={2.2}><line x1={40} y1={30} x2={34} y2={15} /><line x1={60} y1={30} x2={66} y2={15} /><circle cx={34} cy={13} r={3} fill={accent} /><circle cx={66} cy={13} r={3} fill={accent} /></g>}
      {antenna === 3 && <ellipse cx={50} cy={16} rx={15} ry={4.5} fill="none" stroke={accent} strokeWidth={2.4} />}

      {/* head */}
      <g fill={`url(#${id}-fill)`} stroke={accent} strokeWidth={1.5}>{headShape}</g>
      {/* face plate */}
      <rect x={31} y={44} width={38} height={24} rx={11} fill="#0b0b0d" opacity={0.85} />

      {/* eyes, with a blink */}
      <g fill={eye} style={{ filter: `drop-shadow(0 0 3px ${accent})` }}>
        {eyes === 0 && <><ellipse cx={42} cy={55} rx={3.6} ry={4.2}><animate attributeName="ry" values="4.2;4.2;0.4;4.2" keyTimes="0;0.94;0.97;1" dur="4.2s" begin={blinkDelay} repeatCount="indefinite" /></ellipse>
          <ellipse cx={58} cy={55} rx={3.6} ry={4.2}><animate attributeName="ry" values="4.2;4.2;0.4;4.2" keyTimes="0;0.94;0.97;1" dur="4.2s" begin={blinkDelay} repeatCount="indefinite" /></ellipse></>}
        {eyes === 1 && <rect x={36} y={52} width={28} height={6} rx={3}><animate attributeName="height" values="6;6;1;6" keyTimes="0;0.94;0.97;1" dur="4.6s" begin={blinkDelay} repeatCount="indefinite" /></rect>}
        {eyes === 2 && <circle cx={50} cy={55} r={5.5}><animate attributeName="r" values="5.5;5.5;1;5.5" keyTimes="0;0.94;0.97;1" dur="5s" begin={blinkDelay} repeatCount="indefinite" /></circle>}
        {eyes === 3 && <><rect x={39} y={50} width={5} height={10} rx={2.5} /><rect x={56} y={50} width={5} height={10} rx={2.5} /></>}
      </g>

      {/* mouth */}
      <g stroke={eye} strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={0.85}>
        {mouth === 0 && <line x1={45} y1={64} x2={55} y2={64}>{state === "speaking" && <animate attributeName="x2" values="55;52;57;55" dur="0.5s" repeatCount="indefinite" />}</line>}
        {mouth === 1 && <path d="M44 63 Q50 67 56 63">{state === "speaking" && <animate attributeName="d" values="M44 63 Q50 67 56 63;M44 63 Q50 70 56 63;M44 63 Q50 67 56 63" dur="0.45s" repeatCount="indefinite" />}</path>}
        {mouth === 2 && <g><line x1={45} y1={64} x2={45} y2={66} /><line x1={50} y1={64} x2={50} y2={66} /><line x1={55} y1={64} x2={55} y2={66} /></g>}
      </g>
    </g>
  );
}

/** Standalone character, for headers and lists. */
export function Avatar(props: Omit<Props, "cx" | "cy">) {
  return (
    <svg viewBox={`0 0 ${props.size} ${props.size}`} width={props.size} height={props.size} className="shrink-0 overflow-visible">
      <AvatarG {...props} cx={props.size / 2} cy={props.size / 2} />
    </svg>
  );
}
