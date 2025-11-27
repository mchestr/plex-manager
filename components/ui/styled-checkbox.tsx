"use client"

import { InputHTMLAttributes, forwardRef } from "react"

interface StyledCheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string
  description?: string
}

export const StyledCheckbox = forwardRef<HTMLInputElement, StyledCheckboxProps>(
  ({ label, description, className = "", disabled = false, id, ...props }, ref) => {
    const checkboxId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`

    return (
      <div className={`flex items-start gap-3 ${className}`}>
        <div className="relative flex items-center h-5 mt-0.5">
          <input
            ref={ref}
            id={checkboxId}
            type="checkbox"
            disabled={disabled}
            className="peer sr-only"
            {...props}
          />
          <label
            htmlFor={checkboxId}
            className={`
              relative h-5 w-5 rounded border-2 transition-all duration-200 block
              ${
                disabled
                  ? "bg-slate-800/30 border-slate-700 cursor-not-allowed"
                  : "bg-slate-800/50 border-slate-600 cursor-pointer hover:border-slate-500 peer-focus:border-cyan-400 peer-focus:ring-2 peer-focus:ring-cyan-400/20"
              }
              ${
                props.checked
                  ? disabled
                    ? "bg-slate-700 border-slate-600"
                    : "bg-gradient-to-br from-cyan-500 to-purple-600 border-cyan-400"
                  : ""
              }
            `}
          >
            {props.checked && (
              <svg
                className="absolute inset-0 h-full w-full text-white p-0.5 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </label>
        </div>
        {(label || description) && (
          <div className="flex-1">
            {label && (
              <label
                htmlFor={checkboxId}
                className={`
                  block text-sm font-medium cursor-pointer select-none
                  ${disabled ? "text-slate-500" : "text-white"}
                `}
              >
                {label}
              </label>
            )}
            {description && (
              <p
                className={`
                  mt-0.5 text-xs
                  ${disabled ? "text-slate-600" : "text-slate-400"}
                `}
              >
                {description}
              </p>
            )}
          </div>
        )}
      </div>
    )
  }
)

StyledCheckbox.displayName = "StyledCheckbox"

