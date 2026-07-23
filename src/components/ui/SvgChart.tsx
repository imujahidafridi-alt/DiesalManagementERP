import React from 'react'

interface ChartDataItem {
  label: string
  value: number
  secondaryValue?: number
}

interface SvgChartProps {
  type: 'line' | 'area' | 'bar' | 'donut'
  data: ChartDataItem[]
  height?: number
  color?: string // Tailwind gradient colors class or hex
  secondaryColor?: string
  valueFormatter?: (val: number) => string
}

export const SvgChart: React.FC<SvgChartProps> = ({
  type,
  data,
  height = 200,
  color = '#22c55e', // default emerald-500
  secondaryColor = '#3b82f6', // default blue-500
  valueFormatter = (val) => {
    if (val === undefined || val === null || isNaN(Number(val))) return '0'
    return Number(val).toLocaleString()
  },
}) => {
  if (!data || data.length === 0) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-xs text-gray-400 italic bg-gray-50 border border-dashed rounded select-none"
      >
        No chart data available for display.
      </div>
    )
  }

  const paddingLeft = 45
  const paddingRight = 15
  const paddingTop = 15
  const paddingBottom = 30

  // ----------------------------------------------------
  // Donut Chart Drawing Logic
  // ----------------------------------------------------
  if (type === 'donut') {
    const validDonutData = data.map((d) => ({
      ...d,
      value: Number.isFinite(Number(d.value)) ? Math.max(0, Number(d.value)) : 0,
    }))
    const total = validDonutData.reduce((sum, item) => sum + item.value, 0)
    let accumulatedAngle = 0
    const size = height
    const center = size / 2
    const radius = size * 0.35
    const strokeWidth = size * 0.15

    // Predefined colors for categories
    const categoryColors = [
      '#10b981', // Emerald
      '#3b82f6', // Blue
      '#f59e0b', // Amber
      '#ef4444', // Red
      '#8b5cf6', // Violet
      '#ec4899', // Pink
      '#6b7280', // Gray
    ]

    return (
      <div className="flex flex-col md:flex-row items-center justify-center gap-6 select-none p-2">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {total === 0 ? (
            <circle cx={center} cy={center} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
          ) : (
            validDonutData.map((item, idx) => {
              const percentage = item.value / total
              const angle = percentage * 360
              const colorCode = categoryColors[idx % categoryColors.length]
              
              // Standard SVG Arc definitions
              const startRad = (accumulatedAngle - 90) * (Math.PI / 180)
              const endRad = (accumulatedAngle + angle - 90) * (Math.PI / 180)
              accumulatedAngle += angle

              const x1 = center + radius * Math.cos(startRad)
              const y1 = center + radius * Math.sin(startRad)
              const x2 = center + radius * Math.cos(endRad)
              const y2 = center + radius * Math.sin(endRad)

              const largeArcFlag = angle > 180 ? 1 : 0

              const pathData = `
                M ${x1} ${y1}
                A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}
              `

              return (
                <path
                  key={idx}
                  d={pathData}
                  fill="none"
                  stroke={colorCode}
                  strokeWidth={strokeWidth}
                  className="hover:opacity-85 transition-opacity cursor-pointer"
                >
                  <title>{`${item.label}: ${valueFormatter(item.value)} (${Math.round(percentage * 100)}%)`}</title>
                </path>
              )
            })
          )}
          {/* Inner Label */}
          <text
            x={center}
            y={center}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-xs font-black fill-gray-800"
          >
            {total > 0 ? valueFormatter(total) : '0'}
          </text>
        </svg>

        {/* Legend */}
        <div className="flex flex-col gap-1.5 text-[10px] text-gray-500 max-h-40 overflow-y-auto pr-2">
          {validDonutData.map((item, idx) => {
            const pct = total > 0 ? Math.round((item.value / total) * 100) : 0
            const colorCode = categoryColors[idx % categoryColors.length]
            return (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorCode }} />
                <span className="font-semibold text-gray-700 truncate max-w-24">{item.label}</span>
                <span className="font-mono text-gray-400">({pct}%)</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ----------------------------------------------------
  // Line / Area / Bar Chart Layout Math
  // ----------------------------------------------------
  const safeData = data.map((d) => ({
    ...d,
    value: Number.isFinite(Number(d.value)) ? Number(d.value) : 0,
    secondaryValue: d.secondaryValue !== undefined && Number.isFinite(Number(d.secondaryValue))
      ? Number(d.secondaryValue)
      : undefined,
  }))

  const width = 450 // base SVG coordinate width
  const plotWidth = width - paddingLeft - paddingRight
  const plotHeight = height - paddingTop - paddingBottom

  const valuesList = safeData.flatMap((d) => [
    d.value,
    d.secondaryValue !== undefined ? d.secondaryValue : 0,
  ])
  const maxVal = Math.max(...valuesList, 1) // avoid division by zero or NaN

  // Nice grid increments
  const gridTicks = 4
  const gridLines = Array.from({ length: gridTicks + 1 }, (_, i) => {
    const val = (maxVal / gridTicks) * i
    const y = height - paddingBottom - (plotHeight / gridTicks) * i
    return { val, y }
  })

  // Horizontal coordinates mapping
  const getX = (index: number) => {
    if (safeData.length <= 1) return paddingLeft + plotWidth / 2
    return paddingLeft + (plotWidth / (safeData.length - 1)) * index
  }

  const getY = (val: number) => {
    const safeVal = Number.isFinite(val) ? val : 0
    const safeMax = Number.isFinite(maxVal) && maxVal > 0 ? maxVal : 1
    return height - paddingBottom - (safeVal / safeMax) * plotHeight
  }

  return (
    <div className="w-full select-none p-1 bg-white rounded border border-gray-100">
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        {/* Draw Y Grid Lines & Labels */}
        {gridLines.map((tick, idx) => (
          <g key={idx}>
            <line
              x1={paddingLeft}
              y1={tick.y}
              x2={width - paddingRight}
              y2={tick.y}
              stroke="#f3f4f6"
              strokeWidth={1}
            />
            <text
              x={paddingLeft - 8}
              y={tick.y}
              textAnchor="end"
              dominantBaseline="middle"
              className="text-[9px] font-mono fill-gray-400 font-bold"
            >
              {valueFormatter(tick.val)}
            </text>
          </g>
        ))}

        {/* Draw X axis labels (Max 7 to prevent text collisions) */}
        {safeData.map((item, idx) => {
          const step = Math.max(1, Math.ceil(safeData.length / 8))
          if (idx % step !== 0 && idx !== safeData.length - 1) return null

          const x = type === 'bar' 
            ? paddingLeft + (plotWidth / safeData.length) * (idx + 0.5) 
            : getX(idx)

          return (
            <text
              key={idx}
              x={x}
              y={height - paddingBottom + 12}
              textAnchor="middle"
              className="text-[9px] font-mono fill-gray-400 font-bold truncate"
            >
              {item.label}
            </text>
          )
        })}

        {/* ----------------------------------------------------
            Line or Area Chart Drawing
            ---------------------------------------------------- */}
        {(type === 'line' || type === 'area') && (
          <>
            {/* Draw Area Fill (if type is area) */}
            {type === 'area' && (
              <path
                d={`
                  M ${getX(0)} ${height - paddingBottom}
                  ${safeData.map((item, idx) => `L ${getX(idx)} ${getY(item.value)}`).join(' ')}
                  L ${getX(safeData.length - 1)} ${height - paddingBottom}
                  Z
                `}
                fill={`${color}15`} // add opacity
                stroke="none"
              />
            )}

            {/* Main Value Line */}
            <path
              d={safeData.map((item, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx)} ${getY(item.value)}`).join(' ')}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Secondary Value Line (if present) */}
            {safeData.some((d) => d.secondaryValue !== undefined) && (
              <path
                d={safeData.map((item, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx)} ${getY(item.secondaryValue || 0)}`).join(' ')}
                fill="none"
                stroke={secondaryColor}
                strokeWidth={1.5}
                strokeDasharray="3 3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Interaction Dots */}
            {safeData.map((item, idx) => {
              if (safeData.length > 25 && idx % 3 !== 0) return null // thin out dots
              const x = getX(idx)
              const y = getY(item.value)
              return (
                <circle
                  key={idx}
                  cx={x}
                  cy={y}
                  r={3.5}
                  fill="white"
                  stroke={color}
                  strokeWidth={2}
                  className="hover:r-5 cursor-pointer transition-all"
                >
                  <title>{`${item.label}: ${valueFormatter(item.value)}`}</title>
                </circle>
              )
            })}
          </>
        )}

        {/* ----------------------------------------------------
            Bar Chart Drawing
            ---------------------------------------------------- */}
        {type === 'bar' && (
          <>
            {safeData.map((item, idx) => {
              const barWidth = Math.max(2, (plotWidth / safeData.length) * 0.6)
              const x = paddingLeft + (plotWidth / safeData.length) * idx + (plotWidth / safeData.length - barWidth) / 2
              const y = getY(item.value)
              const barHeight = Math.max(0, height - paddingBottom - y)

              return (
                <rect
                  key={idx}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill={color}
                  rx={Math.min(2, barWidth / 2)}
                  className="hover:opacity-85 cursor-pointer transition-opacity"
                >
                  <title>{`${item.label}: ${valueFormatter(item.value)}`}</title>
                </rect>
              )
            })}
          </>
        )}
      </svg>
    </div>
  )
}

