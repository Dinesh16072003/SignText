import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../context/auth-context'
import { ToastContext } from '../context/toast-context'
import TextPane from './TextPane'
import '../index.css'

const SIZES = [
  { label: 'Small', className: 'text-size-sm' },
  { label: 'Medium', className: 'text-size-md' },
  { label: 'Large', className: 'text-size-lg' },
  { label: 'Extra large', className: 'text-size-xl' },
]

// TextPane reads the signed-in user and the toast queue from context, and
// renders a router link, so wrap it in the smallest providers that satisfy it.
function renderPane() {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={{ user: null }}>
        <ToastContext.Provider value={{ push: () => {} }}>
          <TextPane
            source={null}
            text=""
            onTextChange={() => {}}
            onClear={() => {}}
            modelStatus={{ tone: 'ready', text: 'Model ready' }}
            onRetryModel={() => {}}
          />
        </ToastContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>
  )
}

function getTextElement() {
  return screen.getByRole('textbox', { name: 'Translation text' })
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
})

describe('the text size control', () => {
  it.each(SIZES)('applies $label to the visible text element', ({ label, className }) => {
    renderPane()
    fireEvent.click(screen.getByRole('button', { name: label }))

    expect(getTextElement().className).toContain(className)
    expect(screen.getByRole('button', { name: label }).getAttribute('aria-pressed')).toBe('true')
  })

  it('gives every choice a different applied font size', () => {
    renderPane()

    const applied = SIZES.map(({ label }) => {
      fireEvent.click(screen.getByRole('button', { name: label }))
      return window.getComputedStyle(getTextElement()).fontSize
    })

    expect(applied.every(Boolean)).toBe(true)
    expect(new Set(applied).size).toBe(SIZES.length)
  })

  it('announces the change politely', () => {
    renderPane()
    fireEvent.click(screen.getByRole('button', { name: 'Large' }))

    expect(screen.getByText('Text size: Large')).toBeTruthy()
  })
})

describe('remembering the chosen size', () => {
  it('keeps the choice after a reload', () => {
    const first = renderPane()
    fireEvent.click(screen.getByRole('button', { name: 'Extra large' }))
    expect(getTextElement().className).toContain('text-size-xl')
    first.unmount()

    renderPane()
    expect(getTextElement().className).toContain('text-size-xl')
    expect(screen.getByRole('button', { name: 'Extra large' }).getAttribute('aria-pressed')).toBe(
      'true'
    )
  })

  it('falls back to medium when storage holds an unknown value', () => {
    window.localStorage.setItem('signtext:text-size', 'giant')

    renderPane()

    expect(getTextElement().className).toContain('text-size-md')
  })
})
