"use client"


// Define the keyframe styles using standard CSS within the component
const styles = (
  <style>
    {`
      /* Bouncy, playful walk cycle */
      @keyframes walk {
        0% { transform: translate(0, 0) rotate(0deg); }
        25% { transform: translate(1px, -6px) rotate(2deg); } /* Higher bounce */
        50% { transform: translate(0, -2px) rotate(0deg); }
        75% { transform: translate(-1px, -6px) rotate(-2deg); } /* Higher bounce */
        100% { transform: translate(0, 0) rotate(0deg); }
      }

      /* Faster, happier tail wag */
      @keyframes tailWag {
        0% { transform: rotate(0deg); }
        50% { transform: rotate(8deg); } /* Bigger wag */
        100% { transform: rotate(0deg); }
      }

      @keyframes blink {
        0%, 10%, 100% { transform: scaleY(1); }
        5% { transform: scaleY(0.1); }
      }

      /* Faster Arm wiggle */
      @keyframes armWiggle {
        0% { transform: rotate(0deg); }
        50% { transform: rotate(-15deg); }
        100% { transform: rotate(0deg); }
      }

      .animate-walk {
        animation: walk 1.5s ease-in-out infinite; /* Faster walk */
        transform-origin: center bottom;
      }

      .animate-tailWag {
        animation: tailWag 2s ease-in-out infinite; /* Faster wag */
        transform-origin: 50px 140px;
      }

      .animate-blink {
        animation: blink 3s steps(1, end) infinite;
        transform-origin: center;
      }

      .animate-arm {
        animation: armWiggle 0.8s ease-in-out infinite; /* Faster arms */
        transform-origin: 125px 110px;
      }
    `}
  </style>
)

interface RexDinosaurProps {
  size?: string
  className?: string
}

export function RexDinosaur({ size = "w-64 h-64", className = "" }: RexDinosaurProps) {
  // Color Palette: Friendly & Playful bright greens
  const BODY_COLOR = "#4ade80" // Bright Green (Tailwind green-400)
  const BELLY_COLOR = "#86efac" // Light Green (Tailwind green-300)
  const LEG_SHADE = "#22c55e" // Slightly darker green (Tailwind green-500)
  const EYE_COLOR = "#facc15" // Bright sunny yellowish-orange
  const CLAW_COLOR = "#f3f4f6"

  return (
    <div className={`flex justify-center items-center p-4 ${size} ${className}`}>
      {styles}
      <div className={`relative ${size}`}>
        <svg
          viewBox="0 0 200 200"
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* --- 1. TAIL ---
              Starts thick at x=60, tapers to x=10.
          */}
          <path
            d="M 65 130 Q 40 135 25 150 Q 10 165 10 170 Q 20 175 40 170 Q 60 160 65 155 L 65 130 Z"
            fill={BODY_COLOR}
            className="animate-tailWag"
          />

          {/* --- 2. FAR LEG (Background) ---
              Massive thigh foundation.
          */}
          <path
            d="M 90 140 Q 95 160 90 180 L 80 180 L 75 165 Q 75 150 85 140 Z"
            fill={LEG_SHADE}
            className="animate-walk"
          />
          <path
            d="M 80 180 L 85 190 L 95 185 L 90 180 Z"
            fill={CLAW_COLOR}
            className="animate-walk"
          />

          {/* --- 3. MAIN BODY & NECK ---
              Fixed the path string (removed comments inside d attribute).
              Made the body slightly bulkier to ensure connection.
          */}
          <g className="animate-walk">
            <path
              d="M 60 130 C 70 95 100 80 130 80 L 140 85 L 135 110 C 130 145 100 160 60 155 Z"
              fill={BODY_COLOR}
            />

            {/* Belly highlight/texture */}
            <path
              d="M 70 145 Q 95 150 115 130 Q 100 145 70 145 Z"
              fill={BELLY_COLOR}
              opacity="0.8"
            />
          </g>

          {/* --- 4. NEAR LEG (Foreground) ---
              Very thick thigh muscle.
          */}
          <g className="animate-walk">
            {/* Thigh */}
            <path
              d="M 85 135 C 115 130 125 150 115 170 L 110 185 L 95 185 L 90 165 C 80 155 80 140 85 135 Z"
              fill={BODY_COLOR}
            />
             {/* Knee/Muscle Definition */}
            <path
               d="M 95 145 Q 110 145 110 160"
               fill="none"
               stroke={LEG_SHADE}
               strokeWidth="2"
               opacity="0.5"
            />
            {/* Foot */}
            <path
              d="M 110 185 L 115 195 L 125 190 L 120 185 Z"
              fill={CLAW_COLOR}
            />
          </g>

          {/* --- 5. HEAD --- */}
          <g className="animate-walk">
            {/* Upper Skull - Slightly rounder snout tip */}
            <path
              d="M 130 80 L 165 75 Q 185 90 170 100 L 140 98 L 130 80 Z"
              fill={BODY_COLOR}
            />
            {/* Lower Jaw */}
            <path
              d="M 140 98 L 165 95 Q 160 110 145 108 L 135 100 Z"
              fill={BELLY_COLOR}
            />

            {/* Eye & Glint */}
            <circle cx="145" cy="88" r="4" fill={EYE_COLOR} />
            <g className="animate-blink">
                <circle cx="145" cy="88" r="2" fill="#1e293b"/>
                {/* Cute eye glint */}
                <circle cx="146.5" cy="86.5" r="1" fill="white"/>
            </g>

            {/* Smile Line (Replacing angry brow ridge) */}
            <path d="M 138 94 Q 145 100 155 96" stroke={LEG_SHADE} strokeWidth="2" fill="none" strokeLinecap="round" />

            {/* Teeth (smaller, friendlier) */}
            <path d="M 158 100 L 159 102 L 160 100 Z" fill="#fff" />
            <path d="M 162 99 L 163 101 L 164 99 Z" fill="#fff" />
          </g>

          {/* --- 6. ARMS ---
              Tiny but visible on the chest.
          */}
          <g className="animate-walk animate-arm">
            <path
              d="M 125 110 L 135 118 L 130 122 L 122 115 Z"
              fill={BODY_COLOR}
            />
            <path
              d="M 135 118 L 138 120"
              stroke={CLAW_COLOR}
              strokeWidth="2"
            />
          </g>

          {/* Ground Shadow */}
          <ellipse
            cx="100"
            cy="190"
            rx="60"
            ry="6"
            fill={LEG_SHADE}
            opacity="0.3"
            className="animate-pulse"
          />
        </svg>
      </div>
    </div>
  )
}

