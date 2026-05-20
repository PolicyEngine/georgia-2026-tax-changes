'use client';

/**
 * Footer matching policyengine-app-v2 exactly.
 * Uses inline SVGs instead of @tabler/icons-react.
 */

const COLORS = {
  primary600: 'var(--primary-600)',
  primary800: 'var(--primary-800)',
};

const FONT = 'var(--font-sans)';

const NAV_LINKS = [
  { href: 'https://policyengine.org/us/team', text: 'About us' },
  { href: 'https://policyengine.org/us/donate', text: 'Donate' },
  { href: 'https://policyengine.org/us/privacy', text: 'Privacy policy' },
  { href: 'https://policyengine.org/us/terms', text: 'Terms and conditions' },
];

const SOCIAL_LINKS: { label: string; href: string; icon: React.ReactNode }[] = [
  {
    label: 'Email',
    href: 'mailto:hello@policyengine.org',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M22 7l-10 7L2 7" />
      </svg>
    ),
  },
  {
    label: 'Twitter',
    href: 'https://twitter.com/ThePolicyEngine',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
      </svg>
    ),
  },
  {
    label: 'Facebook',
    href: 'https://www.facebook.com/PolicyEngine',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
      </svg>
    ),
  },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/company/thepolicyengine',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6z" />
        <rect x="2" y="9" width="4" height="12" />
        <circle cx="4" cy="4" r="2" />
      </svg>
    ),
  },
  {
    label: 'YouTube',
    href: 'https://www.youtube.com/@policyengine',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22.54 6.42a2.78 2.78 0 00-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 00-1.94 2A29 29 0 001 11.75a29 29 0 00.46 5.33A2.78 2.78 0 003.4 19.1c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 001.94-2 29 29 0 00.46-5.25 29 29 0 00-.46-5.43z" />
        <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
      </svg>
    ),
  },
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/PolicyEngine/',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
    ),
  },
  {
    label: 'GitHub',
    href: 'https://github.com/PolicyEngine',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" />
      </svg>
    ),
  },
];

export default function Footer() {
  return (
    <footer
      style={{
        width: '100%',
        padding: '48px 64px',
        background: `linear-gradient(to right, ${COLORS.primary800}, ${COLORS.primary600})`,
        fontFamily: FONT,
      }}
    >
      <div style={{ maxWidth: '976px', margin: '0 auto' }}>
        {/* Logo */}
        <img
          src="https://policyengine.org/assets/logos/policyengine/white.svg"
          alt="PolicyEngine"
          style={{ height: '52px', width: 'auto' }}
        />

        {/* Two-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 mt-8 gap-12">
          {/* Left column: links + socials + copyright */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', alignItems: 'flex-start' }}>
            {/* Nav links */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {NAV_LINKS.map(({ href, text }) => (
                <a
                  key={href}
                  href={href}
                  rel="noopener noreferrer"
                  style={{
                    color: 'var(--text-inverse)',
                    fontSize: '16px',
                    textDecoration: 'none',
                    fontFamily: FONT,
                  }}
                >
                  {text}
                </a>
              ))}
            </div>

            {/* Social icons + copyright */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
                {SOCIAL_LINKS.map(({ label, href, icon }) => (
                  <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    style={{ color: 'var(--text-inverse)' }}
                  >
                    {icon}
                  </a>
                ))}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-inverse)', margin: 0, fontFamily: FONT }}>
                &copy; {new Date().getFullYear()} PolicyEngine. All rights reserved.
              </p>
            </div>
          </div>

          {/* Right column: Subscribe */}
          <div style={{ paddingLeft: '24px' }}>
            <p style={{ fontWeight: 600, color: 'var(--text-inverse)', fontFamily: FONT, fontSize: '24px', margin: '0 0 0 0' }}>
              Subscribe to PolicyEngine
            </p>
            <p style={{ fontSize: '18px', color: 'var(--text-inverse)', fontFamily: FONT, margin: '0 0 20px 0' }}>
              Get the latest posts delivered right to your inbox.
            </p>
            <div style={{ width: '80%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                type="email"
                placeholder="Enter your email address"
                style={{
                  width: '100%',
                  height: '40px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light)',
                  fontSize: '14px',
                  fontFamily: FONT,
                  boxSizing: 'border-box',
                }}
              />
              <a
                href="https://policyengine.org/us/subscribe"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  height: '40px',
                  backgroundColor: 'var(--primary-500)',
                  color: 'var(--text-inverse)',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 600,
                  fontFamily: FONT,
                  letterSpacing: '0.05em',
                  cursor: 'pointer',
                  textDecoration: 'none',
                }}
              >
                SUBSCRIBE
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
