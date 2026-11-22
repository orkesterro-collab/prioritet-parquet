(() => {
  'use strict';

  const stage = document.getElementById('deck');
  const slides = Array.from(stage.querySelectorAll('.slide'));
  const groups = slides.map(slide => Array.from(slide.querySelectorAll('[data-step]')));
  const limits = groups.map(group => Math.max(0, ...group.map(el => Number(el.dataset.step))));
  const previous = document.getElementById('previous');
  const next = document.getElementById('next');
  const fullscreen = document.getElementById('fullscreen');
  const counter = document.getElementById('counter');
  const announcement = document.getElementById('announcement');
  const builds = document.querySelector('.builds');
  let slideIndex = -1;
  let step = 0;
  let touch = null;
  let ignoreClickUntil = 0;

  function render(index, build, updateAddress = true) {
    const target = Math.max(0, Math.min(index, slides.length - 1));
    const targetStep = Math.max(0, Math.min(build, limits[target]));
    if (target === slideIndex && targetStep === step) return;
    const changedSlide = target !== slideIndex;
    const oldIndex = slideIndex;
    slideIndex = target;
    step = targetStep;

    // Set the correct build before revealing a slide, including when stepping backwards.
    groups[target].forEach(el => {
      const waiting = Number(el.dataset.step) > step;
      el.classList.toggle('waiting', waiting);
      if (waiting) el.setAttribute('aria-hidden', 'true');
      else el.removeAttribute('aria-hidden');
    });
    if (changedSlide) {
      if (oldIndex >= 0) {
        slides[oldIndex].hidden = true;
        slides[oldIndex].classList.remove('is-entering');
      }
      slides[target].hidden = false;
      slides[target].classList.add('is-entering');
    }
    counter.textContent = (target + 1) + ' / ' + slides.length;
    previous.disabled = target === 0 && step === 0;
    next.disabled = target === slides.length - 1 && step === limits[target];
    builds.replaceChildren();
    for (let i = 1; i <= limits[target]; i++) {
      const mark = document.createElement('i');
      if (i <= step) mark.className = 'done';
      builds.append(mark);
    }

    const title = slides[target].querySelector('h1, h2').innerText.replace(/\s+/g, ' ');
    const details = groups[target]
      .filter(el => Number(el.dataset.step) === step && !el.closest('[role="img"]'))
      .map(el => el.innerText.trim()).filter(Boolean).join(' ');
    announcement.textContent = (changedSlide ? 'Слайд ' + (target + 1) + '. ' + title + '. ' : '') +
      (details || (step > 0 ? 'Шаг ' + step + '.' : ''));
    if (updateAddress) {
      const hash = '#' + (target + 1) + (step ? '-' + step : '');
      // Local control should not add one browser Back entry per build.
      try { history.replaceState(null, '', hash); } catch { /* file preview */ }
    }
  }

  function fromAddress() {
    const match = /^#(\d+)(?:-(\d+))?$/.exec(location.hash);
    const index = match ? Number(match[1]) - 1 : 0;
    const build = match && match[2] ? Number(match[2]) : 0;
    render(index, build, false);
  }

  function forward() {
    if (step < limits[slideIndex]) render(slideIndex, step + 1);
    else if (slideIndex < slides.length - 1) render(slideIndex + 1, 0);
  }
  function backward() {
    if (step > 0) render(slideIndex, step - 1);
    else if (slideIndex > 0) render(slideIndex - 1, limits[slideIndex - 1]);
  }

  function inFullscreen() {
    return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  }
  function refreshFullscreen() {
    const active = inFullscreen();
    fullscreen.setAttribute('aria-pressed', String(active));
    fullscreen.setAttribute('aria-label', active ? 'Выйти из полного экрана' : 'Во весь экран');
    fullscreen.title = fullscreen.getAttribute('aria-label') + ' (F)';
    fullscreen.hidden = !(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  }
  async function toggleFullscreen() {
    try {
      if (inFullscreen()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) await exit.call(document);
      } else {
        const enter = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
        if (enter) await enter.call(document.documentElement);
      }
    } catch {
      announcement.textContent = 'Браузер не разрешил полноэкранный режим.';
    }
    refreshFullscreen();
  }

  previous.addEventListener('click', backward);
  next.addEventListener('click', forward);
  fullscreen.addEventListener('click', toggleFullscreen);
  stage.addEventListener('click', () => {
    if (performance.now() >= ignoreClickUntil && !window.getSelection()?.toString()) forward();
  });
  stage.addEventListener('touchstart', event => {
    const first = event.touches[0];
    touch = event.touches.length === 1 ? {x: first.clientX, y: first.clientY} : null;
  }, {passive: true});
  stage.addEventListener('touchend', event => {
    const first = event.changedTouches[0];
    if (touch && first) {
      const dx = first.clientX - touch.x;
      const dy = first.clientY - touch.y;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        ignoreClickUntil = performance.now() + 500;
        if (dx < 0) forward(); else backward();
      }
    }
    touch = null;
  }, {passive: true});
  stage.addEventListener('touchcancel', () => { touch = null; });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === ' ' && event.target.closest('button,a')) return;
    const keys = {
      ArrowRight: forward, ArrowDown: forward, PageDown: forward, ' ': event.shiftKey ? backward : forward,
      ArrowLeft: backward, ArrowUp: backward, PageUp: backward,
      Home: () => render(0, 0), End: () => render(slides.length - 1, limits[slides.length - 1]),
      f: toggleFullscreen, F: toggleFullscreen, а: toggleFullscreen, А: toggleFullscreen
    };
    if (!Object.hasOwn(keys, event.key)) return;
    event.preventDefault();
    if (!event.repeat) keys[event.key]();
  });
  window.addEventListener('hashchange', fromAddress);
  document.addEventListener('fullscreenchange', refreshFullscreen);
  document.addEventListener('webkitfullscreenchange', refreshFullscreen);
  fromAddress();
  refreshFullscreen();
})();
