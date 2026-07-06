// 增强版扫雷（魔兽风格 3D + 简单模式提示 + 无障碍 + 排行榜）
// 把 index.html, style.css, app.js 放在同一目录并打开 index.html

(() => {
  // DOM
  const boardEl = document.getElementById('board');
  const remainingEl = document.getElementById('remaining');
  const timerEl = document.getElementById('timer');
  const newGameBtn = document.getElementById('newGame');
  const difficulty = document.getElementById('difficulty');
  const customSettings = document.getElementById('custom-settings');
  const rowsInput = document.getElementById('rows');
  const colsInput = document.getElementById('cols');
  const minesInput = document.getElementById('mines');
  const flagModeBtn = document.getElementById('flagModeBtn');
  const themeBtn = document.getElementById('themeBtn');
  const soundBtn = document.getElementById('soundBtn');
  const leaderboardBtn = document.getElementById('leaderboardBtn');

  const lbModal = document.getElementById('leaderboardModal');
  const lbList = document.getElementById('lbList');
  const lbFilter = document.getElementById('lbFilter');
  const closeLb = document.getElementById('closeLb');
  const clearLbBtn = document.getElementById('clearLbBtn');

  // state
  let rows = 16, cols = 16, mines = 40;
  let grid = []; // {mine, num, state}
  let started = false, finished = false;
  let remaining = 0, timer = 0, timerId = null;
  let flagMode = false;
  let theme = localStorage.getItem('ms_theme') || 'light';
  let soundOn = localStorage.getItem('ms_sound') !== 'false';
  const LB_KEY = 'minesweeper_leaderboard_v1';

  // Audio
  let audioCtx = null;
  function ensureAudio(){ if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
  function playSound(type){
    if (!soundOn) return;
    try {
      ensureAudio();
      const ctx = audioCtx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      if (type === 'open'){ o.frequency.value = 880; g.gain.value = 0.03; }
      else if (type === 'flag'){ o.frequency.value = 520; g.gain.value = 0.02; }
      else if (type === 'win'){ o.frequency.value = 1100; g.gain.value = 0.06; }
      else if (type === 'explode'){ o.frequency.value = 120; g.gain.value = 0.12; }
      else { o.frequency.value = 440; g.gain.value = 0.03; }
      o.type = 'sine';
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      o.stop(ctx.currentTime + 0.26);
    } catch(e) { /* ignore */ }
  }

  // theming
  function applyTheme(t){
    theme = t;
    document.body.classList.remove('theme-dark','theme-color','theme-wow');
    if (t === 'dark') document.body.classList.add('theme-dark');
    if (t === 'color') document.body.classList.add('theme-color');
    if (t === 'wow') document.body.classList.add('theme-wow');
    localStorage.setItem('ms_theme', t);
  }
  applyTheme(localStorage.getItem('ms_theme') || 'light');
  soundOn = localStorage.getItem('ms_sound') !== 'false';
  updateSoundBtn();

  // UI events
  difficulty.addEventListener('change', () => {
    customSettings.classList.toggle('hidden', difficulty.value !== 'custom');
    setDifficultyFromUI();
    if (difficulty.value === 'easy') startHintLoop(); else stopHintLoop();
  });
  newGameBtn.addEventListener('click', startGame);
  flagModeBtn.addEventListener('click', () => { flagMode = !flagMode; updateFlagModeBtn(); });
  themeBtn.addEventListener('click', () => {
    const next = theme === 'light' ? 'wow' : (theme === 'wow' ? 'dark' : (theme === 'dark' ? 'color' : 'light'));
    applyTheme(next);
  });
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    localStorage.setItem('ms_sound', soundOn);
    updateSoundBtn();
  });
  leaderboardBtn.addEventListener('click', () => openLeaderboard());
  closeLb && closeLb.addEventListener('click', () => hideLeaderboard());
  clearLbBtn && clearLbBtn.addEventListener('click', () => {
    if (!confirm('确定要清空排行榜吗？')) return;
    localStorage.removeItem(LB_KEY);
    renderLeaderboard();
  });
  lbFilter && lbFilter.addEventListener('change', renderLeaderboard);

  // keyboard
  document.addEventListener('keydown', (e) => {
    if (finished && e.key === 'r') startGame();
    if (e.target && e.target.tagName === 'INPUT') return;
    if (!boardEl.contains(document.activeElement)) return;
    const focused = document.activeElement;
    if (!focused || !focused.classList.contains('cell')) return;
    const r = +focused.dataset.r, c = +focused.dataset.c;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
      e.preventDefault();
      let nr=r, nc=c;
      if (e.key === 'ArrowUp') nr = Math.max(0, r-1);
      if (e.key === 'ArrowDown') nr = Math.min(rows-1, r+1);
      if (e.key === 'ArrowLeft') nc = Math.max(0, c-1);
      if (e.key === 'ArrowRight') nc = Math.min(cols-1, c+1);
      focusCell(nr,nc);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (e.shiftKey) toggleFlag(r,c);
      else openCell(r,c);
    } else if (e.key.toLowerCase() === 'f'){
      e.preventDefault(); toggleFlag(r,c);
    } else if (e.key.toLowerCase() === 'm'){
      e.preventDefault(); flagMode = !flagMode; updateFlagModeBtn();
    } else if (e.key.toLowerCase() === 't'){
      e.preventDefault(); themeBtn.click();
    } else if (e.key.toLowerCase() === 's'){
      e.preventDefault(); soundBtn.click();
    }
  });

  // helpers
  function setDifficultyFromUI(){
    const d = difficulty.value;
    if (d === 'easy'){ rows=9; cols=9; mines=10; }
    else if (d === 'medium'){ rows=16; cols=16; mines=40; }
    else if (d === 'hard'){ rows=16; cols=30; mines=99; }
    else { rows = parseInt(rowsInput.value)||10; cols = parseInt(colsInput.value)||10; mines = parseInt(minesInput.value)||10; }
  }

  function updateFlagModeBtn(){ flagModeBtn.style.background = flagMode ? '#ffdede' : ''; flagModeBtn.textContent = flagMode ? '插旗模式：开' : '插旗模式'; }
  function updateSoundBtn(){ soundBtn.textContent = soundOn ? '音效：开' : '音效：关'; }

  // timer
  function startTimer(){ if (timerId) clearInterval(timerId); timer = 0; timerEl.textContent = '0'; timerId = setInterval(()=> { timer++; timerEl.textContent = timer; }, 1000); }
  function stopTimer(){ if(timerId) clearInterval(timerId); timerId = null; }

  // start game
  function startGame(){
    setDifficultyFromUI();
    started = false; finished = false;
    timer = 0; stopTimer();
    grid = new Array(rows);
    for(let r=0;r<rows;r++){
      grid[r] = new Array(cols);
      for(let c=0;c<cols;c++){
        grid[r][c] = {mine:false, num:0, state:'hidden'};
      }
    }
    boardEl.innerHTML = '';
    boardEl.style.gridTemplateColumns = `repeat(${cols}, max-content)`;
    // create DOM cells
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const div = document.createElement('div');
        div.className = 'cell';
        div.dataset.r = r; div.dataset.c = c;
        div.setAttribute('role','gridcell');
        div.setAttribute('tabindex', (r===0 && c===0) ? '0' : '-1');
        div.setAttribute('aria-label', `行 ${r+1} 列 ${c+1}，未翻开`);
        attachCellEvents(div);
        boardEl.appendChild(div);
      }
    }
    placeMines();
    computeNumbers();
    remaining = mines; remainingEl.textContent = remaining;
    updateFlagModeBtn();
    renderAll();
    // hint loop control
    if (difficulty.value === 'easy') startHintLoop(); else stopHintLoop();
  }

  function placeMines(){
    let placed = 0;
    const total = rows*cols;
    const used = new Set();
    while(placed < mines && placed < total){
      const idx = Math.floor(Math.random()*total);
      if (used.has(idx)) continue;
      used.add(idx);
      const r = Math.floor(idx/cols), c = idx%cols;
      grid[r][c].mine = true;
      placed++;
    }
  }

  function computeNumbers(){
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        if (grid[r][c].mine){ grid[r][c].num = -1; continue; }
        let count = 0;
        for(let dr=-1;dr<=1;dr++){
          for(let dc=-1;dc<=1;dc++){
            if (dr===0 && dc===0) continue;
            const nr=r+dr, nc=c+dc;
            if (nr>=0 && nr<rows && nc>=0 && nc<cols && grid[nr][nc].mine) count++;
          }
        }
        grid[r][c].num = count;
      }
    }
  }

  // attach events to cell
  function attachCellEvents(cell){
    cell.addEventListener('click', (e) => {
      if (finished) return;
      const r = +cell.dataset.r, c = +cell.dataset.c;
      if (flagMode) toggleFlag(r,c); else openCell(r,c);
    });
    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (finished) return;
      const r = +cell.dataset.r, c = +cell.dataset.c;
      toggleFlag(r,c);
    });
    cell.addEventListener('dblclick', (e) => {
      if (finished) return;
      const r = +cell.dataset.r, c = +cell.dataset.c;
      highlightNeighbors(r,c,300);
      setTimeout(()=> chordOpen(r,c), 320);
    });

    cell.addEventListener('focus', (e) => updateCellAria(+cell.dataset.r, +cell.dataset.c));

    // touch longpress to flag
    let touchTimer = null;
    cell.addEventListener('touchstart', (e) => {
      if (finished) return;
      if (e.touches.length > 1) return;
      touchTimer = setTimeout(() => {
        const r = +cell.dataset.r, c = +cell.dataset.c;
        toggleFlag(r,c);
        touchTimer = null;
      }, 500);
    }, {passive:true});
    cell.addEventListener('touchend', (e) => {
      if (touchTimer){ clearTimeout(touchTimer); touchTimer = null; }
    });
  }

  function focusCell(r,c){
    const idx = r*cols + c;
    const el = boardEl.children[idx];
    if (!el) return;
    for (let i=0;i<boardEl.children.length;i++) boardEl.children[i].setAttribute('tabindex','-1');
    el.setAttribute('tabindex','0');
    el.focus();
  }

  function updateCellAria(r,c){
    const g = grid[r][c];
    const idx = r*cols + c;
    const el = boardEl.children[idx];
    if (!el) return;
    let label = `行 ${r+1} 列 ${c+1}，`;
    if (g.state === 'hidden') label += '未翻开';
    else if (g.state === 'flag') label += '插旗';
    else if (g.state === 'open'){
      if (g.mine) label += '地雷';
      else label += `数字 ${g.num}`;
    }
    el.setAttribute('aria-label', label);
  }

  // flag
  function toggleFlag(r,c){
    const g = grid[r][c];
    if (g.state === 'open') return;
    if (g.state === 'hidden'){ g.state = 'flag'; remaining--; playSound('flag'); }
    else if (g.state === 'flag'){ g.state = 'hidden'; remaining++; }
    remainingEl.textContent = remaining;
    renderCell(r,c);
    checkWin();
  }

  // open
  function openCell(r,c){
    if (!started){
      started = true;
      startTimer();
      if (grid[r][c].mine){
        grid[r][c].mine = false;
        outer:
        for(let i=0;i<rows;i++){
          for(let j=0;j<cols;j++){
            if (!grid[i][j].mine && (i!==r || j!==c)){
              grid[i][j].mine = true; break outer;
            }
          }
        }
        computeNumbers();
      }
    }
    const g = grid[r][c];
    if (g.state === 'open' || g.state === 'flag') return;
    if (g.mine){
      g.state = 'open';
      revealMines(r,c);
      renderAll();
      gameOver(false);
      return;
    }
    floodOpen(r,c);
    renderAll();
    playSound('open');
    checkWin();
  }

  function floodOpen(sr,sc){
    const stack = [[sr,sc]];
    const visited = new Set();
    while(stack.length){
      const [r,c] = stack.pop();
      const key = r+','+c;
      if (visited.has(key)) continue;
      visited.add(key);
      const g = grid[r][c];
      if (g.state === 'open' || g.state === 'flag') continue;
      g.state = 'open';
      if (g.num === 0){
        for(let dr=-1;dr<=1;dr++){
          for(let dc=-1;dc<=1;dc++){
            if (dr===0 && dc===0) continue;
            const nr=r+dr, nc=c+dc;
            if (nr>=0 && nr<rows && nc>=0 && nc<cols){
              const ng = grid[nr][nc];
              if (!ng.mine && ng.state !== 'open') stack.push([nr,nc]);
            }
          }
        }
      }
    }
  }

  function chordOpen(r,c){
    const g = grid[r][c];
    if (g.state !== 'open' || g.num <= 0) return;
    let flags = 0;
    for(let dr=-1;dr<=1;dr++){
      for(let dc=-1;dc<=1;dc++){
        if (dr===0 && dc===0) continue;
        const nr=r+dr, nc=c+dc;
        if (nr>=0 && nr<rows && nc>=0 && nc<cols && grid[nr][nc].state === 'flag') flags++;
      }
    }
    if (flags === g.num){
      for(let dr=-1;dr<=1;dr++){
        for(let dc=-1;dc<=1;dc++){
          if (dr===0 && dc===0) continue;
          const nr=r+dr, nc=c+dc;
          if (nr>=0 && nr<rows && nc>=0 && nc<cols && grid[nr][nc].state === 'hidden'){
            if (grid[nr][nc].mine){
              grid[nr][nc].state = 'open';
              revealMines(nr,nc);
              renderAll();
              gameOver(false);
              return;
            } else {
              floodOpen(nr,nc);
            }
          }
        }
      }
      renderAll();
      playSound('open');
      checkWin();
    }
  }

  function highlightNeighbors(r,c, duration=300){
    const nodes = [];
    for(let dr=-1;dr<=1;dr++){
      for(let dc=-1;dc<=1;dc++){
        const nr=r+dr, nc=c+dc;
        if (nr>=0 && nr<rows && nc>=0 && nc<cols){
          const el = boardEl.children[nr*cols + nc];
          if (el) { el.classList.add('highlight'); nodes.push(el); }
        }
      }
    }
    setTimeout(()=> nodes.forEach(n => n.classList.remove('highlight')), duration);
  }

  function revealMines(triggerR, triggerC){
    finished = true; stopTimer();
    playSound('explode');
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const g = grid[r][c];
        if (g.mine) g.state = 'open';
      }
    }
    const triggerIdx = triggerR*cols + triggerC;
    const trigEl = boardEl.children[triggerIdx];
    if (trigEl) trigEl.classList.add('mine');
  }

  function checkWin(){
    if (finished) return;
    let allOk = true;
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const g = grid[r][c];
        if (!g.mine && g.state !== 'open') { allOk = false; break; }
      }
      if (!allOk) break;
    }
    if (allOk){
      finished = true; stopTimer();
      remaining = 0; remainingEl.textContent = remaining;
      renderAll();
      playSound('win');
      setTimeout(()=> {
        const name = prompt('你赢了！请输入你的名字以记录排行榜：', '玩家') || '匿名';
        saveLeaderboardEntry(name, {time: timer, rows, cols, mines, difficulty: difficulty.value, date: (new Date()).toISOString()});
        openLeaderboard(difficulty.value);
      }, 80);
    }
  }

  function gameOver(win){
    finished = true; stopTimer();
    setTimeout(()=> {
      if (win) alert(`你赢了！用时 ${timer}s`);
      else alert(`游戏结束，踩到雷了！用时 ${timer}s`);
    }, 50);
  }

  // render
  function renderAll(){
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++) renderCell(r,c);
    }
  }
  function renderCell(r,c){
    const idx = r*cols + c;
    const cellEl = boardEl.children[idx];
    if (!cellEl) return;
    const g = grid[r][c];
    cellEl.className = 'cell';
    cellEl.textContent = '';
    if (g.state === 'hidden'){ }
    else if (g.state === 'flag'){
      cellEl.classList.add('flag'); cellEl.textContent = '⚑';
    } else if (g.state === 'open'){
      cellEl.classList.add('open');
      if (g.mine){ cellEl.classList.add('mine'); cellEl.textContent = '💣'; }
      else if (g.num > 0){ cellEl.textContent = g.num; cellEl.classList.add(`number-${g.num}`); }
    }
    updateCellAria(r,c);
    if (g.state === 'open') {
      cellEl.classList.add('reveal');
      setTimeout(()=> cellEl.classList.remove('reveal'), 160);
    }
  }

  // Leaderboard (localStorage)
  function loadLeaderboard(){ try{ const raw = localStorage.getItem(LB_KEY); return raw ? JSON.parse(raw) : []; } catch(e){ return []; } }
  function saveLeaderboardList(list){ localStorage.setItem(LB_KEY, JSON.stringify(list)); }
  function saveLeaderboardEntry(name, meta){ const list = loadLeaderboard(); list.push(Object.assign({name}, meta)); saveLeaderboardList(list); }
  function openLeaderboard(filter){ lbModal.classList.remove('hidden'); lbFilter.value = filter || 'medium'; renderLeaderboard(); }
  function hideLeaderboard(){ lbModal.classList.add('hidden'); }
  function renderLeaderboard(){
    const all = loadLeaderboard();
    const filter = lbFilter.value;
    let filtered = all;
    if (filter !== 'all') {
      if (filter === 'custom') filtered = all.filter(x => x.difficulty === 'custom');
      else filtered = all.filter(x => x.difficulty === filter);
    }
    filtered.sort((a,b) => a.time - b.time);
    lbList.innerHTML = '';
    if (filtered.length === 0) { lbList.innerHTML = '<li>暂无记录</li>'; return; }
    const top = filtered.slice(0, 50);
    top.forEach((it) => {
      const li = document.createElement('li');
      const t = new Date(it.date).toLocaleString();
      li.textContent = `${it.name} — ${it.time}s — ${it.rows}×${it.cols} ${it.mines}雷 — ${t}`;
      lbList.appendChild(li);
    });
  }

  // Hint loop for easy mode
  let hintIntervalId = null;
  function startHintLoop(){
    stopHintLoop();
    try {
      if (difficulty && difficulty.value === 'easy') {
        hintIntervalId = setInterval(() => {
          try {
            const candidates = [];
            for (let r=0;r<rows;r++){
              for (let c=0;c<cols;c++){
                const g = grid[r][c];
                if (g && g.state === 'hidden' && !g.mine) candidates.push([r,c]);
              }
            }
            if (candidates.length === 0) return;
            const idx = Math.floor(Math.random() * candidates.length);
            const [hr,hc] = candidates[idx];
            const el = boardEl.children[hr*cols + hc];
            if (!el) return;
            el.classList.add('hint');
            setTimeout(()=> el.classList.remove('hint'), 1300);
          } catch(e){ console.warn('hint loop inner error', e); }
        }, 4500 + Math.floor(Math.random()*2500)); // 4.5s ~ 7s
      }
    } catch(e){ console.warn('startHintLoop error', e); }
  }
  function stopHintLoop(){ if (hintIntervalId){ clearInterval(hintIntervalId); hintIntervalId = null; } }

  // Safe binding for close button (in case script loaded before DOM)
  (function safeCloseBind(){
    function safeHide(){ try{ hideLeaderboard(); } catch(err){ console.error('hideLeaderboard() failed:', err); const modal = document.getElementById('leaderboardModal'); if (modal) modal.classList.add('hidden'); } }
    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', () => { if (closeLb) closeLb.addEventListener('click', safeHide); });
    } else { if (closeLb) closeLb.addEventListener('click', safeHide); }
  })();

  // initial game
  startGame();

  // expose for debug
  window.Minesweeper = { startGame, openLeaderboard };

})();