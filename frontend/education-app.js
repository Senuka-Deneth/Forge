document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('edu-sidebar');
  const mainContent = document.getElementById('edu-content');

  // Title section
  mainContent.innerHTML = `
    <h1 class="edu-page-title">Education Center</h1>
    <p class="edu-page-desc">
      Master the tools, indicators, and AI analysis featured in Vision Chart Bot. Everything you need to understand the dashboard and improve your trading logic is explained below.
    </p>
  `;

  // Render Sidebar and Content
  educationData.forEach(section => {
    // ── Sidebar Section ──
    const navSection = document.createElement('div');
    navSection.className = 'edu-nav-section';
    navSection.innerHTML = `<div class="edu-nav-label">${section.category}</div>`;
    
    section.items.forEach(item => {
      const link = document.createElement('a');
      link.href = `#${item.id}`;
      link.className = 'edu-nav-link';
      link.textContent = item.title;
      navSection.appendChild(link);
    });
    sidebar.appendChild(navSection);

    // ── Main Content Section ──
    section.items.forEach(item => {
      const sectionEl = document.createElement('section');
      sectionEl.className = 'edu-section glass-card';
      sectionEl.id = item.id;
      
      sectionEl.innerHTML = `
        <div class="edu-section-header">
          <div class="edu-section-tag">${item.tag}</div>
          <h2 class="edu-section-title">${item.title}</h2>
          <p class="edu-section-subtitle">${item.subtitle}</p>
        </div>
        <div class="edu-section-body">
          <div class="edu-block">
            <h3 class="edu-block-title">What is it?</h3>
            <p class="edu-block-text">${item.whatIsIt}</p>
          </div>
          <div class="edu-block">
            <h3 class="edu-block-title">How to read it</h3>
            <p class="edu-block-text" style="margin-bottom:12px;">${item.howToRead}</p>
            ${item.visualHtml || ''}
          </div>
          <div class="edu-block" style="margin-bottom:0;">
            <h3 class="edu-block-title">How to use it</h3>
            <p class="edu-block-text">${item.howToUse}</p>
          </div>
        </div>
      `;
      mainContent.appendChild(sectionEl);
    });
  });

  // Scroll Spy for Sidebar Active Links
  const navLinks = document.querySelectorAll('.edu-nav-link');
  const sections = document.querySelectorAll('.edu-section');

  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navLinks.forEach(link => {
          link.classList.toggle('active', link.getAttribute('href') === '#' + id);
        });
        entry.target.classList.add('visible'); // also handle entrance animation
      }
    });
  }, { rootMargin: '-20% 0px -70% 0px' });

  // Initial animation observer (for items initially visible)
  const introObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { rootMargin: '0px 0px -100px 0px' });

  sections.forEach(s => {
    sectionObserver.observe(s);
    introObserver.observe(s);
  });

  // Smooth scroll logic for sidebar links
  navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const targetId = this.getAttribute('href').substring(1);
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        // scroll offset for top nav
        const offsetTop = targetEl.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top: offsetTop, behavior: 'smooth' });
      }
    });
  });

  // Auth check for nav top right button
  const token = localStorage.getItem('vcb_auth_token') || sessionStorage.getItem('vcb_auth_token');
  if (token) {
    const signInBtn = document.querySelector('.edu-topnav-links .btn-nav-sm');
    if (signInBtn) {
      signInBtn.textContent = 'Dashboard';
      signInBtn.href = 'index.html';
    }
  }
});
