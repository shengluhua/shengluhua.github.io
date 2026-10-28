/* A shared entrance for four dated microcourses and the independent EDA curriculum.
 * Does not change microcourse IDs, calendars, quizzes, or localStorage keys.
 */
(function () {
  'use strict';
  const app = document.getElementById('app-content');
  const nav = document.getElementById('course-nav');
  const search = document.getElementById('global-search');
  if (!app || !nav) return;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const course = window.EDACourse;
  const title = '智能设计自动化与系统优化';
  function addNavigation() {
    if (nav.querySelector('[data-eda-navigation]')) return;
    const a = document.createElement('a');
    a.className = 'nav-link';
    a.href = './eda/';
    a.dataset.edaNavigation = 'true';
    a.innerHTML = '<span class="nav-symbol" style="color:#45b9bc">⌘</span><span class="nav-main"><b>' + title + '</b><small>理论 · GPU · 实验 · 真题</small></span><span class="nav-count">85</span>';
    nav.appendChild(a);
  }
  function enhance() {
    addNavigation();
    const grid = app.querySelector('.course-grid');
    if (grid && !grid.querySelector('[data-eda-course]')) {
      const card = document.createElement('a');
      card.className = 'course-box';
      card.href = './eda/';
      card.dataset.edaCourse = 'true';
      card.style.cssText = '--tone:#15888d;display:block;text-align:left;text-decoration:none;color:inherit';
      card.innerHTML = '<span class="course-icon">⌘</span><h3>' + title + '</h3><p>依据课程仓库组织：设计自动化、GPU 编程、16 周实验与考试专题。</p><div class="course-foot"><span>85 个独立教学单元</span><span>进入学习 ↗</span></div>';
      grid.appendChild(card);
      const heading = grid.previousElementSibling;
      if (heading?.querySelector('h2')) heading.querySelector('h2').textContent = '五门课程，一个学习入口';
      const hero = app.querySelector('.hero');
      if (hero) {
        const p = hero.querySelector('p');
        if (p) p.textContent = '四门每日微课与一门材料驱动的系统课程，统一从这里进入。每日课号保持原日历；智能设计课程按理论、实验和真题路径学习。';
        const stats = hero.querySelectorAll('.stat');
        if (stats[0]) stats[0].innerHTML = '<strong>5</strong>门学习课程';
        if (stats[1]) stats[1].lastChild.textContent = '篇每日微课';
        const extra = document.createElement('span');
        extra.className = 'stat';
        extra.innerHTML = '<strong>85</strong>个系统课程单元';
        hero.querySelector('.stats')?.appendChild(extra);
      }
    }
    // A common search box also finds the independently numbered EDA units.
    const q = search?.value.trim().toLowerCase();
    if (q && course && !app.querySelector('#eda-search-results') && !app.querySelector('.reader')) {
      const items = course.units.filter(u => [u.id,u.title,u.module,u.derivation,...(u.tasks || []),'智能设计自动化 系统优化 智能计算'].join(' ').toLowerCase().includes(q));
      const section = document.createElement('section');
      section.id = 'eda-search-results';
      section.setAttribute('aria-label', '智能设计课程搜索结果');
      section.innerHTML = '<div class="section-title"><h2>' + title + '</h2><span>' + items.length + ' 个匹配单元</span></div>' + (items.length ? '<div class="lesson-list">' + items.map(u => '<a class="lesson-row" style="text-decoration:none;color:inherit" href="./eda/#lesson=' + esc(u.id) + '"><span class="lesson-no">' + esc(u.id) + '</span><span class="lesson-center"><span class="lesson-meta">' + esc(u.module) + '</span><span class="lesson-name">' + esc(u.title) + '</span><span class="lesson-desc">' + esc(u.derivation || u.title) + '</span></span><span class="tag">系统课程</span></a>').join('') + '</div>' : '<p>这门课程没有匹配的单元；上方保留四门微课的搜索结果。</p>');
      app.appendChild(section);
    }
  }
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; enhance(); });
  };
  // Observe only root replacement, so edits inside a card do not form a loop.
  new MutationObserver(schedule).observe(app, { childList: true });
  new MutationObserver(schedule).observe(nav, { childList: true });
  enhance();
})();
