import React, { useState, useEffect, useRef, useMemo } from 'react'
import { AutocompleteOption } from '../types'

interface AutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSelect: (value: string) => void
  options: AutocompleteOption[]
  placeholder?: string
  className?: string
  disabled?: boolean
  loading?: boolean
  autoFocus?: boolean
}

export default function Autocomplete({
  value,
  onChange,
  onSelect,
  options,
  placeholder = '',
  className = '',
  disabled = false,
  loading = false,
  autoFocus = false,
}: AutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<(HTMLDivElement | null)[]>([])

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    const query = value.toLowerCase().trim()

    if (!query) {
      // Show recent repos when input is empty
      return options.filter(opt => opt.isRecent)
    }

    // Case-insensitive substring matching in name and description
    return options.filter(opt => {
      const matchesLabel = opt.label.toLowerCase().includes(query)
      const matchesDescription = opt.description?.toLowerCase().includes(query)
      return matchesLabel || matchesDescription
    })
  }, [value, options])

  // Reset highlighted index when filtered options change
  useEffect(() => {
    setHighlightedIndex(-1)
  }, [filteredOptions])

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && optionRefs.current[highlightedIndex]) {
      optionRefs.current[highlightedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      })
    }
  }, [highlightedIndex])

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value)
    setIsOpen(true)
  }

  function handleInputFocus() {
    setIsOpen(true)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsOpen(true)
      return
    }

    if (!isOpen) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        )
        break

      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : -1))
        break

      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
          handleSelectOption(filteredOptions[highlightedIndex].value)
        } else if (value.trim()) {
          handleSelectOption(value.trim())
        }
        break

      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        inputRef.current?.blur()
        break

      case 'Tab':
        setIsOpen(false)
        break
    }
  }

  function handleSelectOption(optionValue: string) {
    onSelect(optionValue)
    setIsOpen(false)
    setHighlightedIndex(-1)
  }

  function handleOptionClick(optionValue: string) {
    handleSelectOption(optionValue)
  }

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <style>{`
        .autocomplete-input {
          width: 100%;
        }
        .autocomplete-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          max-height: 300px;
          overflow-y: auto;
          background: var(--app-panel-bg);
          border: 1px solid var(--app-panel-border);
          border-radius: 8px;
          box-shadow: 0 4px 12px -2px var(--app-shadow);
          z-index: 1000;
        }
        .autocomplete-option {
          padding: 12px 16px;
          cursor: pointer;
          border-bottom: 1px solid var(--app-panel-border);
          transition: background 0.15s;
        }
        .autocomplete-option:last-child {
          border-bottom: none;
        }
        .autocomplete-option:hover {
          background: var(--app-bg);
        }
        .autocomplete-option.highlighted {
          background: rgba(99, 102, 241, 0.1);
        }
        .autocomplete-option.recent {
          background: rgba(99, 102, 241, 0.05);
        }
        .autocomplete-option-header {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .autocomplete-option-label {
          font-weight: 500;
          color: var(--app-text-strong);
        }
        .autocomplete-option-badge {
          font-size: 0.7rem;
          padding: 2px 6px;
          border-radius: 4px;
          background: var(--app-accent);
          color: white;
          font-weight: 600;
        }
        .autocomplete-option-description {
          font-size: 0.85rem;
          color: var(--app-text-muted);
          margin-top: 2px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .autocomplete-loading {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--app-text-muted);
          font-size: 0.85rem;
        }
        .autocomplete-empty {
          padding: 20px;
          text-align: center;
          color: var(--app-text-muted);
          font-size: 0.9rem;
        }
      `}</style>

      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          className={`${className} autocomplete-input`}
          value={value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls="autocomplete-listbox"
          aria-activedescendant={
            highlightedIndex >= 0
              ? `autocomplete-option-${highlightedIndex}`
              : undefined
          }
        />
        {loading && <span className="autocomplete-loading">Loading...</span>}
      </div>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="autocomplete-dropdown"
          role="listbox"
          id="autocomplete-listbox"
        >
          {filteredOptions.length === 0 ? (
            <div className="autocomplete-empty">
              {value.trim() ? 'No matching repositories' : 'Start typing to search repositories'}
            </div>
          ) : (
            filteredOptions.map((option, index) => (
              <div
                key={option.value}
                ref={el => (optionRefs.current[index] = el)}
                className={`autocomplete-option ${
                  index === highlightedIndex ? 'highlighted' : ''
                } ${option.isRecent ? 'recent' : ''}`}
                onClick={() => handleOptionClick(option.value)}
                role="option"
                aria-selected={index === highlightedIndex}
                id={`autocomplete-option-${index}`}
              >
                <div className="autocomplete-option-header">
                  <span className="autocomplete-option-label">{option.label}</span>
                  {option.isRecent && (
                    <span className="autocomplete-option-badge">RECENT</span>
                  )}
                </div>
                {option.description && (
                  <div className="autocomplete-option-description">
                    {option.description}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
