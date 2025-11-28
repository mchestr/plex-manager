"use client"

/**
 * StyledDropdown - Standard dropdown component for the project
 *
 * This is the primary dropdown component used throughout the application for consistent styling.
 * It provides a custom-styled dropdown with support for:
 * - Flat option lists
 * - Option groups (optgroups)
 * - Multiple sizes (sm, md, lg)
 * - Disabled states
 * - Custom styling via className
 *
 * @example
 * ```tsx
 * <StyledDropdown
 *   value={selectedValue}
 *   onChange={(value) => setSelectedValue(value)}
 *   options={[
 *     { value: "option1", label: "Option 1" },
 *     { value: "option2", label: "Option 2" },
 *   ]}
 *   placeholder="Select an option"
 *   size="md"
 * />
 * ```
 */

import { useState, useRef, useEffect, ReactNode } from "react"

export interface DropdownOption {
  value: string
  label: string | ReactNode
  disabled?: boolean
}

export interface DropdownOptGroup {
  label: string
  options: DropdownOption[]
}

interface StyledDropdownProps {
  value: string
  onChange: (value: string) => void
  options?: DropdownOption[]
  optgroups?: DropdownOptGroup[]
  placeholder?: string
  className?: string
  disabled?: boolean
  size?: "sm" | "md" | "lg"
  id?: string
  name?: string
  "data-testid"?: string
}

const sizeClasses = {
  sm: "px-2 py-0.5 text-[10px]",
  md: "px-4 py-2 text-sm",
  lg: "px-4 py-2.5 text-base",
}

const iconSizeClasses = {
  sm: "w-3 h-3",
  md: "w-4 h-4",
  lg: "w-5 h-5",
}

export function StyledDropdown({
  value,
  onChange,
  options = [],
  optgroups = [],
  placeholder,
  className = "",
  disabled = false,
  size = "md",
  id,
  name,
  "data-testid": providedTestId,
}: StyledDropdownProps) {
  // Generate data-testid from name if not explicitly provided
  const testId = providedTestId || (name ? `setup-input-${name}` : undefined)
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Flatten all options from both options array and optgroups
  const allOptions = [
    ...options,
    ...optgroups.flatMap((group) => group.options),
  ]

  const selectedOption = allOptions.find((opt) => opt.value === value)
  const displayText = selectedOption
    ? typeof selectedOption.label === "string"
      ? selectedOption.label
      : String(selectedOption.label)
    : value === "" && placeholder
    ? placeholder
    : placeholder || "Select an option"

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  const handleSelect = (optionValue: string) => {
    if (allOptions.find((opt) => opt.value === optionValue)?.disabled) {
      return
    }
    onChange(optionValue)
    setIsOpen(false)
  }

  const baseButtonClasses =
    "w-full bg-slate-800/50 border border-slate-600 rounded-lg text-white shadow-sm focus:outline-none focus:border-cyan-400 focus:ring-cyan-400 focus:ring-1 transition-colors cursor-pointer hover:border-slate-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between"
  const sizeClass = sizeClasses[size]
  const iconSizeClass = iconSizeClasses[size]

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Hidden input for form submission */}
      {name && (
        <input
          type="hidden"
          name={name}
          value={value}
          data-testid={testId ? `${testId}-hidden` : undefined}
        />
      )}
      <button
        type="button"
        id={id}
        data-testid={testId}
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`${baseButtonClasses} ${sizeClass}`}
      >
        <span className="truncate text-left">{displayText}</span>
        <svg
          className={`${iconSizeClass} text-slate-400 flex-shrink-0 ml-2 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          {/* Dropdown menu */}
          <div className="absolute top-full left-0 right-0 mt-2 z-[200] bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-64 overflow-y-auto">
            <div className="p-1">
              {/* Render flat options if provided */}
              {options.length > 0 &&
                options.map((option) => {
                  const isSelected = option.value === value
                  const isDisabled = option.disabled

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleSelect(option.value)}
                      disabled={isDisabled}
                      data-testid={testId ? `${testId}-option-${option.value}` : undefined}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        isSelected
                          ? "bg-cyan-500/20 border border-cyan-500/50 text-cyan-300"
                          : isDisabled
                          ? "text-slate-500 cursor-not-allowed"
                          : "hover:bg-slate-700/50 text-slate-300 hover:text-white"
                      }`}
                    >
                      {typeof option.label === "string"
                        ? option.label
                        : option.label}
                    </button>
                  )
                })}

              {/* Render optgroups if provided */}
              {optgroups.length > 0 &&
                optgroups.map((group) => (
                  <div key={group.label}>
                    <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      {group.label}
                    </div>
                    {group.options.map((option) => {
                      const isSelected = option.value === value
                      const isDisabled = option.disabled

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleSelect(option.value)}
                          disabled={isDisabled}
                          data-testid={testId ? `${testId}-option-${option.value}` : undefined}
                          className={`w-full text-left px-6 py-2 rounded-md text-sm transition-colors ${
                            isSelected
                              ? "bg-cyan-500/20 border border-cyan-500/50 text-cyan-300"
                              : isDisabled
                              ? "text-slate-500 cursor-not-allowed"
                              : "hover:bg-slate-700/50 text-slate-300 hover:text-white"
                          }`}
                        >
                          {typeof option.label === "string"
                            ? option.label
                            : option.label}
                        </button>
                      )
                    })}
                  </div>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

