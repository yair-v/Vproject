export default function ProjectClock({
    total = 0,
    completed = 0,
    pending = 0,
    size = 132,
    stroke = 12,
    title = 'התקדמות'
}) {
    const safeTotal = Number(total) || 0;
    const safeCompleted = Number(completed) || 0;
    const safePending = Number(pending) || 0;
    const progress = safeTotal ? Math.round((safeCompleted / safeTotal) * 100) : 0;

    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference - (progress / 100) * circumference;

    return (
        <div
            style={{
                display: 'grid',
                justifyItems: 'center',
                gap: 10,
                padding: 18,
                borderRadius: 24,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'linear-gradient(180deg, rgba(19,31,49,0.90), rgba(9,17,29,0.92))',
                boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
                minWidth: size + 42
            }}
        >
            <div style={{ fontSize: 13, color: '#9eb0c9' }}>{title}</div>

            <div style={{ position: 'relative', width: size, height: size }}>
                <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke="rgba(255,255,255,0.08)"
                        strokeWidth={stroke}
                    />
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke="#4da3ff"
                        strokeWidth={stroke}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={dashOffset}
                        style={{ transition: 'stroke-dashoffset 0.35s ease' }}
                    />
                </svg>

                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'grid',
                        placeItems: 'center',
                        textAlign: 'center'
                    }}
                >
                    <div>
                        <div style={{ fontSize: 26, fontWeight: 800, color: '#eef4ff', lineHeight: 1 }}>
                            {progress}%
                        </div>
                        <div style={{ fontSize: 12, color: '#9eb0c9', marginTop: 6 }}>
                            {safeCompleted}/{safeTotal}
                        </div>
                    </div>
                </div>
            </div>

            <div
                style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    justifyContent: 'center'
                }}
            >
                <span
                    style={{
                        padding: '6px 10px',
                        borderRadius: 999,
                        background: 'rgba(36,195,125,0.14)',
                        color: '#b7efd2',
                        fontSize: 12,
                        fontWeight: 700
                    }}
                >
                    בוצע {safeCompleted}
                </span>

                <span
                    style={{
                        padding: '6px 10px',
                        borderRadius: 999,
                        background: 'rgba(255,182,72,0.14)',
                        color: '#ffd390',
                        fontSize: 12,
                        fontWeight: 700
                    }}
                >
                    ממתין {safePending}
                </span>
            </div>
        </div>
    );
}