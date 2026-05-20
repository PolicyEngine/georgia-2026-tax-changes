'use client';

import { useCallback, useState, useRef, useEffect } from 'react';

/**
 * Header matching policyengine-app-v2 exactly.
 * Resolved design tokens from @policyengine/design-system/tokens.
 */

const COLORS = {
  primary500: 'var(--primary-500)',
  primary600: 'var(--primary-600)',
  primary700: 'var(--primary-700)',
  primary800: 'var(--primary-800)',
  textInverse: 'var(--text-inverse)',
  shadowLight: 'var(--shadow-light)',
  shadowMedium: 'var(--shadow-medium)',
};

const FONT = 'var(--font-sans)';

const NAV_ITEMS = [
  { label: 'Research', href: 'https://policyengine.org/us/research' },
  { label: 'Model', href: 'https://policyengine.org/us/model' },
  { label: 'API', href: 'https://policyengine.org/us/api' },
  { label: 'Python', href: 'https://policyengine.org/us/python' },
  {
    label: 'About',
    hasDropdown: true,
    items: [
      { label: 'Team', href: 'https://policyengine.org/us/team' },
      { label: 'Supporters', href: 'https://policyengine.org/us/supporters' },
    ],
  },
  { label: 'Donate', href: 'https://policyengine.org/us/donate' },
];

const COUNTRIES = [
  { id: 'us', label: 'United States' },
  { id: 'uk', label: 'United Kingdom' },
];

const navItemStyle: React.CSSProperties = {
  color: COLORS.textInverse,
  fontWeight: 500,
  fontSize: '15px',
  fontFamily: FONT,
  textDecoration: 'none',
  padding: '6px 14px',
  borderRadius: '6px',
  transition: 'background-color 0.15s ease',
  letterSpacing: '0.01em',
};

const hoverHandlers = {
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
  },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.backgroundColor = 'transparent';
  },
};

// ── Apple-style animated dropdown ──────────────────────────────────────

interface DropdownItem {
  label: string;
  href: string;
}

function AppleDropdown({
  items,
  open,
  onClose,
  align = 'center',
}: {
  items: DropdownItem[];
  open: boolean;
  onClose: () => void;
  align?: 'center' | 'right';
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open && contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      const timer = setTimeout(() => setContentHeight(0), 250);
      return () => clearTimeout(timer);
    }
  }, [open]);

  if (!open && contentHeight === 0) return null;

  const positionStyle: React.CSSProperties =
    align === 'right'
      ? { right: 0, transform: visible ? 'translateY(0)' : 'translateY(-8px)' }
      : {
          left: '50%',
          transform: visible
            ? 'translateX(-50%) translateY(0)'
            : 'translateX(-50%) translateY(-8px)',
        };

  return (
    <>
      {/* Click-away layer */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 999, cursor: 'default' }}
      />
      <div
        style={{
          position: 'absolute',
          top: '100%',
          ...positionStyle,
          marginTop: '10px',
          minWidth: '220px',
          overflow: 'hidden',
          maxHeight: visible ? `${contentHeight}px` : '0px',
          opacity: visible ? 1 : 0,
          transition:
            'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          borderRadius: '14px',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.97), rgba(240,249,255,0.95))',
          backdropFilter: 'blur(24px) saturate(200%)',
          WebkitBackdropFilter: 'blur(24px) saturate(200%)',
          boxShadow:
            '0 20px 60px rgba(0, 0, 0, 0.15), 0 4px 16px rgba(0, 0, 0, 0.06), inset 0 0 0 1px rgba(255, 255, 255, 0.6)',
          zIndex: 1001,
        }}
      >
        <div ref={contentRef} style={{ padding: '8px' }}>
          {items.map((item, i) => (
            <a
              key={item.label}
              href={item.href}
              rel="noopener noreferrer"
              onClick={() => onClose()}
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                textAlign: 'left',
                padding: '11px 16px',
                borderRadius: '10px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: '14px',
                fontFamily: FONT,
                fontWeight: 600,
                color: COLORS.primary800,
                textDecoration: 'none',
                transition: 'background-color 0.12s ease, color 0.12s ease, opacity 0.3s ease',
                transitionDelay: visible ? `${i * 50}ms` : '0ms',
                opacity: visible ? 1 : 0,
                lineHeight: '1.3',
                letterSpacing: '-0.01em',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = COLORS.primary500;
                e.currentTarget.style.color = COLORS.textInverse;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = COLORS.primary800;
              }}
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Country selector with Apple-style dropdown ─────────────────────────

function CountrySelector() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open && contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      const timer = setTimeout(() => setContentHeight(0), 250);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Country selector"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '6px',
          borderRadius: '6px',
          transition: 'background-color 0.15s ease',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        {/* Globe — matches @tabler/icons-react IconWorld size={18} */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      </button>

      {(open || contentHeight > 0) && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 999, cursor: 'default' }}
          />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              transform: visible ? 'translateY(0)' : 'translateY(-8px)',
              marginTop: '10px',
              minWidth: '220px',
              overflow: 'hidden',
              maxHeight: visible ? `${contentHeight}px` : '0px',
              opacity: visible ? 1 : 0,
              transition:
                'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.97), rgba(240,249,255,0.95))',
              backdropFilter: 'blur(24px) saturate(200%)',
              WebkitBackdropFilter: 'blur(24px) saturate(200%)',
              boxShadow:
                '0 20px 60px rgba(0, 0, 0, 0.15), 0 4px 16px rgba(0, 0, 0, 0.06), inset 0 0 0 1px rgba(255, 255, 255, 0.6)',
              zIndex: 1001,
            }}
          >
            <div ref={contentRef} style={{ padding: '8px' }}>
              {COUNTRIES.map((country, i) => (
                <a
                  key={country.id}
                  href={`https://policyengine.org/${country.id}`}
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    textAlign: 'left',
                    padding: '11px 16px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontFamily: FONT,
                    fontWeight: country.id === 'us' ? 700 : 600,
                    color: COLORS.primary800,
                    textDecoration: 'none',
                    transition: 'background-color 0.12s ease, color 0.12s ease, opacity 0.3s ease',
                    transitionDelay: visible ? `${i * 50}ms` : '0ms',
                    opacity: visible ? 1 : 0,
                    lineHeight: '1.3',
                    letterSpacing: '-0.01em',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = COLORS.primary500;
                    e.currentTarget.style.color = COLORS.textInverse;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = COLORS.primary800;
                  }}
                >
                  {country.label}
                  {country.id === 'us' && (
                    <span style={{ marginLeft: 'auto', fontSize: '12px', opacity: 0.6 }}>&#10003;</span>
                  )}
                </a>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Header ────────────────────────────────────────────────────────

export default function Header() {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const aboutRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!aboutOpen) return;
    function handleClick(e: MouseEvent) {
      if (aboutRef.current && !aboutRef.current.contains(e.target as Node)) setAboutOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setAboutOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [aboutOpen]);

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        padding: '8px 24px',
        height: '58px',
        background: `linear-gradient(to right, ${COLORS.primary800}, ${COLORS.primary600})`,
        borderBottom: `0.5px solid ${COLORS.primary700}`,
        boxShadow: `0px 2px 4px -1px ${COLORS.shadowLight}, 0px 4px 6px -1px ${COLORS.shadowMedium}`,
        zIndex: 1000,
        fontFamily: FONT,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '100%' }}>
        {/* Left: Logo + Desktop Nav */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <a href="https://policyengine.org/us" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', marginRight: '12px' }}>
            <img
              src="https://policyengine.org/assets/logos/policyengine/white.svg"
              alt="PolicyEngine"
              style={{ height: '24px', width: 'auto' }}
            />
          </a>

          {/* Desktop nav */}
          <nav className="hidden lg:flex" style={{ alignItems: 'center', gap: '24px' }}>
            {NAV_ITEMS.map((item) =>
              item.hasDropdown ? (
                <div key={item.label} ref={aboutRef} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setAboutOpen((prev) => !prev)}
                    style={{
                      ...navItemStyle,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    {...hoverHandlers}
                  >
                    <span>{item.label}</span>
                    {/* ChevronDown — matches IconChevronDown size={15} */}
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      style={{
                        opacity: 0.7,
                        transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                        transform: aboutOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  <AppleDropdown
                    items={item.items!}
                    open={aboutOpen}
                    onClose={() => setAboutOpen(false)}
                  />
                </div>
              ) : (
                <a
                  key={item.label}
                  href={item.href}
                  rel="noopener noreferrer"
                  style={navItemStyle}
                  {...hoverHandlers}
                >
                  {item.label}
                </a>
              ),
            )}
          </nav>
        </div>

        {/* Right: Country selector (desktop) */}
        <div className="hidden lg:flex" style={{ alignItems: 'center' }}>
          <CountrySelector />
        </div>

        {/* Mobile: Country selector + hamburger */}
        <div className="flex lg:hidden" style={{ alignItems: 'center', gap: '12px' }}>
          <CountrySelector />
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-1 rounded bg-transparent border-none cursor-pointer"
            aria-label="Toggle navigation"
            style={{ padding: '4px' }}
          >
            {/* Menu — matches IconMenu2 size={24} */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile slide-in menu */}
      {mobileOpen && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 1001 }}
            onClick={() => setMobileOpen(false)}
          />
          <div style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: '300px',
            height: '100vh',
            backgroundColor: COLORS.primary600,
            zIndex: 1002,
            padding: '16px 24px',
            fontFamily: FONT,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <span style={{ color: COLORS.textInverse, fontWeight: 700, fontSize: '16px' }}>Menu</span>
              <button
                onClick={() => setMobileOpen(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                aria-label="Close menu"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {NAV_ITEMS.map((item) =>
                item.hasDropdown ? (
                  <div key={item.label}>
                    <span style={{ color: COLORS.textInverse, fontWeight: 500, fontSize: '14px', display: 'block', marginBottom: '4px', fontFamily: FONT }}>
                      {item.label}
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '12px' }}>
                      {item.items!.map((sub) => (
                        <a key={sub.label} href={sub.href} rel="noopener noreferrer" style={{ color: COLORS.textInverse, textDecoration: 'none', fontWeight: 400, fontSize: '14px', fontFamily: FONT }}>
                          {sub.label}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : (
                  <a key={item.label} href={item.href} rel="noopener noreferrer" style={{ color: COLORS.textInverse, textDecoration: 'none', fontWeight: 500, fontSize: '14px', display: 'block', fontFamily: FONT }}>
                    {item.label}
                  </a>
                ),
              )}
            </div>
          </div>
        </>
      )}
    </header>
  );
}
