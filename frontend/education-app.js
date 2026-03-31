// ── Icon Library (unique per topic ID / category) ──
const ICONS = {
  // Price & Market
  'last-price': `<svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`,
  'price-change': `<svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`,
  'volume': `<svg viewBox="0 0 24 24"><rect x="18" y="3" width="4" height="18"></rect><rect x="10" y="8" width="4" height="13"></rect><rect x="2" y="13" width="4" height="8"></rect></svg>`,

  // Indicators
  'ema': `<svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>`,
  'rsi': `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>`,
  'macd': `<svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>`,

  // Pivot Points
  'pivots-intro': `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
  'pivot-levels': `<svg viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`,
  'price-zone': `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line></svg>`,
  'fibonacci': `<svg viewBox="0 0 24 24"><path d="M12 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10"></path><path d="M12 22c2.5-3 4-6.5 4-10S14.5 5 12 2"></path><path d="M12 12h10"></path></svg>`,

  // AI Analysis
  'ai-overview': `<svg viewBox="0 0 24 24"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>`,
  'confidence': `<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
  'market-phase': `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path><line x1="2" y1="12" x2="22" y2="12"></line></svg>`,
  'market-regime': `<svg viewBox="0 0 24 24"><path d="M3 3v18h18M9 9l3 3 4-4 5 5"></path></svg>`,

  // Trade Logic
  'trade-logic': `<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>`,
  'swing-points': `<svg viewBox="0 0 24 24"><polyline points="3 17 9 11 13 15 21 7"></polyline><polyline points="14 7 21 7 21 14"></polyline></svg>`,
  'anomalies': `<svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,

  // Category icons (fallback)
  'PRICE & MARKET': `<svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`,
  'INDICATORS': `<svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>`,
  'PIVOT POINTS': `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
  'AI ANALYSIS': `<svg viewBox="0 0 24 24"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>`,
  'TRADE LOGIC': `<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>`,
};

function getIcon(id) {
  if (ICONS[id]) return ICONS[id];
  // Smart fallback: try to match by keyword in id
  if (id.includes('price')) return ICONS['last-price'];
  if (id.includes('volume')) return ICONS['volume'];
  if (id.includes('ema') || id.includes('ma')) return ICONS['ema'];
  if (id.includes('rsi')) return ICONS['rsi'];
  if (id.includes('macd')) return ICONS['macd'];
  if (id.includes('pivot') || id.includes('pp')) return ICONS['pivot-levels'];
  if (id.includes('fib')) return ICONS['fibonacci'];
  if (id.includes('ai') || id.includes('confidence')) return ICONS['ai-overview'];
  if (id.includes('phase') || id.includes('regime')) return ICONS['market-phase'];
  if (id.includes('swing')) return ICONS['swing-points'];
  if (id.includes('anomal') || id.includes('alert')) return ICONS['anomalies'];
  if (id.includes('logic') || id.includes('trade')) return ICONS['trade-logic'];
  if (id.includes('zone')) return ICONS['price-zone'];
  // Generic doc icon
  return `<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
}

document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('edu-sidebar');
  const introCard = document.getElementById('edu-content');
  const sectionsContainer = document.getElementById('edu-sections');

  // ── Hero Intro ──
  introCard.innerHTML = `
    <div class="edu-hero-eyebrow">Knowledge Base</div>
    <h1 class="edu-hero-title">Education <i>Center</i></h1>
    <p class="edu-hero-desc">
      Master the tools, indicators, and AI analysis powering Vision Chart Bot.
      Everything you need to understand the dashboard — explained clearly.
    </p>
  `;

  // ── Render Sidebar + Content ──
  educationData.forEach(section => {
    // Sidebar group
    const group = document.createElement('div');
    group.className = 'edu-nav-group';

    const label = document.createElement('span');
    label.className = 'edu-group-label';
    label.textContent = section.category.toUpperCase();
    group.appendChild(label);

    section.items.forEach(item => {
      const link = document.createElement('a');
      link.href = `#${item.id}`;
      link.className = 'edu-nav-link';
      link.innerHTML = `${getIcon(item.id)}<span class="edu-nav-link-text">${item.title}</span>`;
      group.appendChild(link);
    });

    sidebar.appendChild(group);

    // Content articles
    section.items.forEach(item => {
      const el = document.createElement('section');
      el.className = 'edu-section';
      el.id = item.id;

      el.innerHTML = `
        <div class="edu-section-meta">
          <div class="edu-section-tag">${item.tag}</div>
          <h2 class="edu-section-title">${item.title}</h2>
          <p class="edu-section-subtitle">${item.subtitle}</p>
        </div>
        <div class="edu-section-body">
          <div class="edu-block">
            <div class="edu-block-label">What is it?</div>
            <p class="edu-block-text">${item.whatIsIt}</p>
          </div>
          <div class="edu-block">
            <div class="edu-block-label">How to read it</div>
            <p class="edu-block-text">${item.howToRead}</p>
            ${item.visualHtml || ''}
          </div>
          <div class="edu-block">
            <div class="edu-block-label">How to use it</div>
            <p class="edu-block-text">${item.howToUse}</p>
          </div>
        </div>
      `;

      sectionsContainer.appendChild(el);
    });
  });

  // ── Scroll Spy ──
  const navLinks = document.querySelectorAll('.edu-nav-link');
  const sections = document.querySelectorAll('.edu-section');
  const breadcrumb = document.getElementById('edu-breadcrumb-current');

  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navLinks.forEach(link => {
          const active = link.getAttribute('href') === '#' + id;
          link.classList.toggle('active', active);
          if (active && breadcrumb) {
            breadcrumb.textContent = link.querySelector('.edu-nav-link-text')?.textContent || id;
          }
        });
      }
    });
  }, { rootMargin: '-15% 0px -75% 0px' });

  const visibilityObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { rootMargin: '0px 0px -60px 0px' });

  sections.forEach(s => {
    sectionObserver.observe(s);
    visibilityObserver.observe(s);
  });

  // ── Smooth Scroll ──
  navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const targetId = this.getAttribute('href').substring(1);
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        const main = document.querySelector('.edu-main');
        const offset = targetEl.offsetTop - 80;
        main.scrollTo({ top: offset, behavior: 'smooth' });
      }
    });
  });

  // ── Search ──
  const searchInput = document.getElementById('edu-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      const q = this.value.toLowerCase().trim();
      sections.forEach(s => {
        const text = s.textContent.toLowerCase();
        s.style.display = (!q || text.includes(q)) ? '' : 'none';
      });

      navLinks.forEach(link => {
        const id = link.getAttribute('href').substring(1);
        const section = document.getElementById(id);
        if (section) {
          link.style.display = (!q || section.textContent.toLowerCase().includes(q)) ? '' : 'none';
        }
      });
    });
  }
});
