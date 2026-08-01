/** Top chrome: file actions, zoom presets, and the consolidated settings menu. */

import { useEffect, useRef, useState } from 'react'
import { applyPreset } from '../state/camera'
import { applyPrefs, type Density, type Prefs } from '../state/prefs'
import { DEFAULT_THEME_KEY, THEMES } from '../styles/themes'
import { nearestPreset, PRESETS, type Camera } from '../time/scale'

type Props = {
  title: string
  onTitleChange: (title: string) => void
  fileName: string | null
  dirty: boolean
  cam: Camera
  width: number
  prefs: Prefs
  onPrefs: (prefs: Prefs) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onNewEvent: () => void
  onExport: () => void
  onToggleSearch: () => void
  searchOpen: boolean
  onZoom: (notches: number) => void
  onAbout: () => void
  onLoadSample: (which: 'simple' | 'dense') => void
}

export function Toolbar(props: Props) {
  const active = nearestPreset(props.cam, props.width)

  return (
    <header className="toolbar">
      <div className="toolbar__row">
        <input
          className="toolbar__title"
          value={props.title}
          onChange={(e) => props.onTitleChange(e.target.value)}
          aria-label="Timeline title"
        />
        <span className="toolbar__file">
          {props.fileName ?? 'not saved to a file yet'}
          {props.dirty && <span className="toolbar__dot" title="Unsaved changes" />}
        </span>

        <div className="toolbar__group">
          <button className="btn" onClick={props.onNew}>
            New
          </button>
          <button className="btn" onClick={props.onOpen}>
            Open
          </button>
          <button className="btn" onClick={props.onSave}>
            Save
          </button>
          <button className="btn" onClick={props.onSaveAs}>
            Save as
          </button>
          <button className="btn" onClick={props.onExport}>
            Export
          </button>
        </div>

        <div className="toolbar__group">
          <button className="btn" disabled={!props.canUndo} onClick={props.onUndo} title="Ctrl+Z">
            Undo
          </button>
          <button
            className="btn"
            disabled={!props.canRedo}
            onClick={props.onRedo}
            title="Ctrl+Shift+Z"
          >
            Redo
          </button>
        </div>

        <button
          className={`btn${props.searchOpen ? ' btn--on' : ''}`}
          onClick={props.onToggleSearch}
          aria-pressed={props.searchOpen}
        >
          Search
        </button>
        <button className="btn-primary" onClick={props.onNewEvent} title="N">
          + Event
        </button>

        <SettingsMenu
          prefs={props.prefs}
          onPrefs={props.onPrefs}
          onAbout={props.onAbout}
          onLoadSample={props.onLoadSample}
        />
      </div>

      <div className="toolbar__row toolbar__row--zoom">
        <span className="label">Zoom</span>
        <div className="preset-bar">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={`preset${active === p.id ? ' preset--active' : ''}`}
              onClick={() => applyPreset(p.id)}
              aria-pressed={active === p.id}
            >
              {p.label}
            </button>
          ))}
        </div>
        {/* On-screen equivalents — zoom must never be keyboard/gesture-only. */}
        <div className="toolbar__group">
          <button className="icon-btn" onClick={() => props.onZoom(3)} aria-label="Zoom in">
            +
          </button>
          <button className="icon-btn" onClick={() => props.onZoom(-3)} aria-label="Zoom out">
            −
          </button>
        </div>
      </div>
    </header>
  )
}

function SettingsMenu({
  prefs,
  onPrefs,
  onAbout,
  onLoadSample,
}: {
  prefs: Prefs
  onPrefs: (p: Prefs) => void
  onAbout: () => void
  onLoadSample: (which: 'simple' | 'dense') => void
}) {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    // touchstart as well as mousedown, or it won't dismiss on mobile.
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
    }
  }, [open])

  // Hover previews the theme live; only a click commits it.
  useEffect(() => {
    applyPrefs(prefs, hovered)
  }, [prefs, hovered])

  const toggle = (id: string) => setSection((s) => (s === id ? null : id))

  return (
    <div className="settings-wrap" ref={wrapRef}>
      <button
        className="icon-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Settings"
      >
        ⚙
      </button>
      {open && (
        <div className="settings-dropdown" data-no-pan>
          <Section id="account" label="Account" open={section === 'account'} onToggle={toggle}>
            <p className="settings-note">
              Local file only — no account, nothing leaves this device.
            </p>
          </Section>

          <Section id="themes" label="Themes" open={section === 'themes'} onToggle={toggle}>
            <div className="mode-toggle">
              {(['dark', 'light'] as const).map((m) => (
                <button
                  key={m}
                  className={`mode-toggle__btn${prefs.mode === m ? ' mode-toggle__btn--on' : ''}`}
                  onClick={() => onPrefs({ ...prefs, mode: m })}
                  aria-pressed={prefs.mode === m}
                >
                  {m === 'dark' ? 'Dark' : 'Light'}
                </button>
              ))}
            </div>
            <div className="theme-list" onMouseLeave={() => setHovered(null)}>
              {Object.entries(THEMES).map(([key, t]) => (
                <button
                  key={key}
                  className={`theme-row${prefs.theme === key ? ' theme-row--on' : ''}`}
                  onMouseEnter={() => setHovered(key)}
                  onClick={() => {
                    setHovered(null)
                    onPrefs({ ...prefs, theme: key })
                  }}
                >
                  <span className="theme-swatches">
                    <span className="theme-dot" style={{ background: t.a.bg }} />
                    <span className="theme-dot" style={{ background: t.b.bg }} />
                  </span>
                  {t.label}
                  {key === DEFAULT_THEME_KEY && <span className="theme-row__tag">default</span>}
                </button>
              ))}
            </div>
          </Section>

          <button className="settings-section-toggle" onClick={onAbout}>
            About &amp; help <span className="settings-section-chevron">→</span>
          </button>

          <Section id="advanced" label="Advanced" open={section === 'advanced'} onToggle={toggle}>
            <button className="btn" onClick={() => onLoadSample('simple')}>
              Load sample timeline
            </button>
            <p className="settings-note">
              A small invented life — born 1986, three schools, three jobs, two friends.
            </p>
            <button className="btn" onClick={() => onLoadSample('dense')}>
              Load stress-test timeline
            </button>
            <p className="settings-note">
              110 events with heavy overlaps, one-day events and long labels — for
              checking how crowding is handled. Either replaces what is open; undo
              brings it back.
            </p>
            <span className="label">Density</span>
            <div className="mode-toggle">
              {(['compact', 'comfortable', 'spacious'] as Density[]).map((d) => (
                <button
                  key={d}
                  className={`mode-toggle__btn${prefs.density === d ? ' mode-toggle__btn--on' : ''}`}
                  onClick={() => onPrefs({ ...prefs, density: d })}
                  aria-pressed={prefs.density === d}
                >
                  {d[0].toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({
  id,
  label,
  open,
  onToggle,
  children,
}: {
  id: string
  label: string
  open: boolean
  onToggle: (id: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="settings-section">
      <button className="settings-section-toggle" onClick={() => onToggle(id)} aria-expanded={open}>
        {label} <span className="settings-section-chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="settings-section__body">{children}</div>}
    </div>
  )
}
