import React, { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { educationData } from '../data/educationData';
import EducationIcon from './EducationIcon';
import '../education.css';

export default function EducationPanel() {
  const [activeSection, setActiveSection] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const mainRef = useRef(null);
  const sectionRefs = useRef({});

  useEffect(() => {
    const scrollToHash = () => {
      const hash = window.location.hash.replace('#', '')
      if (!hash) return

      const element = sectionRefs.current[hash]
      if (element && mainRef.current) {
        mainRef.current.scrollTo({ top: element.offsetTop - 80, behavior: 'smooth' })
      }
    }

    const raf = window.requestAnimationFrame(scrollToHash)
    window.addEventListener('hashchange', scrollToHash)

    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('hashchange', scrollToHash)
    }
  }, [searchQuery])

  // Setup intersection observer for active section tracking
  useEffect(() => {
    const observerOptions = {
      root: mainRef.current,
      rootMargin: '-15% 0px -75% 0px',
      threshold: 0
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id);
        }
      });
    }, observerOptions);

    const visibilityObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, { root: mainRef.current, rootMargin: '0px 0px -60px 0px' });

    Object.values(sectionRefs.current).forEach(ref => {
      if (ref) {
        observer.observe(ref);
        visibilityObserver.observe(ref);
      }
    });

    return () => {
      observer.disconnect();
      visibilityObserver.disconnect();
    };
  }, [searchQuery]); // Re-observe if search query changes the visible DOM

  const scrollToSection = (e, id) => {
    e.preventDefault();
    const element = sectionRefs.current[id];
    if (element && mainRef.current) {
      // Offset slightly to account for fixed headers or spacing
      const offset = element.offsetTop - 80;
      mainRef.current.scrollTo({ top: offset, behavior: 'smooth' });
    }
  };

  const handleSearch = (e) => {
    setSearchQuery(e.target.value.toLowerCase());
  };

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--bg-base)' }}>
      {/* ─── EDUCATION TOPIC SIDEBAR ─── */}
      <aside className="edu-sidebar">
        <a href="#" className="edu-brand" onClick={(e) => { e.preventDefault(); mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <div className="edu-brand-icon">
            <svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
          </div>
          <div className="edu-brand-text">
            <span className="edu-brand-name">Education</span>
            <span className="edu-brand-sub">Knowledge Base</span>
          </div>
        </a>

        <div className="edu-nav-wrap">
          <nav id="edu-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {educationData.map(group => {
              // Filter items based on search
              const filteredItems = group.items.filter(item => 
                !searchQuery || 
                item.title.toLowerCase().includes(searchQuery) || 
                item.subtitle.toLowerCase().includes(searchQuery) ||
                item.whatIsIt.toLowerCase().includes(searchQuery)
              );

              if (filteredItems.length === 0) return null;

              return (
                <div key={group.category} className="edu-nav-group">
                  <span className="edu-group-label">{group.category.toUpperCase()}</span>
                  {filteredItems.map(item => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className={`edu-nav-link ${activeSection === item.id ? 'active' : ''}`}
                      onClick={(e) => scrollToSection(e, item.id)}
                    >
                      <EducationIcon id={item.id} />
                      <span className="edu-nav-link-text">{item.title}</span>
                    </a>
                  ))}
                </div>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* ─── MAIN CONTENT ─── */}
      <div className="edu-main" ref={mainRef} style={{ animation: 'pageAppear 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
        
        {/* ─── TOPBAR ─── */}
        <header className="edu-topbar">
          <div className="edu-top-left">
            <input 
              type="text" 
              className="edu-search"
              placeholder="Search Topics, Indicators, Logic..." 
              value={searchQuery}
              onChange={handleSearch}
            />
          </div>
        </header>

        <div className="edu-content-wrap">
          <div id="edu-content">
            {!searchQuery && (
              <>
                <div className="edu-hero-eyebrow">Knowledge Base</div>
                <h1 className="edu-hero-title">Education <i>Center</i></h1>
                <p className="edu-hero-desc">
                  Master the tools, indicators, and AI analysis powering Forge.
                  Everything you need to understand the dashboard — explained clearly.
                </p>
              </>
            )}
          </div>

          <div id="edu-sections">
            {educationData.map(group => {
              return group.items.map(item => {
                // Determine visibility based on search query
                const isVisible = !searchQuery || 
                  item.title.toLowerCase().includes(searchQuery) || 
                  item.subtitle.toLowerCase().includes(searchQuery) ||
                  item.whatIsIt.toLowerCase().includes(searchQuery) ||
                  item.howToRead.toLowerCase().includes(searchQuery) ||
                  item.howToUse.toLowerCase().includes(searchQuery);

                if (!isVisible) return null;

                return (
                  <section 
                    key={item.id} 
                    id={item.id} 
                    className="edu-section"
                    ref={el => sectionRefs.current[item.id] = el}
                  >
                    <div className="edu-section-meta">
                      <div className="edu-section-tag">{item.tag}</div>
                      <h2 className="edu-section-title">{item.title}</h2>
                      <p className="edu-section-subtitle">{item.subtitle}</p>
                    </div>
                    <div className="edu-section-body">
                      <div className="edu-block">
                        <div className="edu-block-label">What is it?</div>
                        <p className="edu-block-text">{item.whatIsIt}</p>
                      </div>
                      <div className="edu-block">
                        <div className="edu-block-label">How to read it</div>
                        <p className="edu-block-text">{item.howToRead}</p>
                        {item.visualHtml && (
                          <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.visualHtml) }} />
                        )}
                      </div>
                      <div className="edu-block">
                        <div className="edu-block-label">How to use it</div>
                        <p className="edu-block-text">{item.howToUse}</p>
                      </div>
                    </div>
                  </section>
                );
              });
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
