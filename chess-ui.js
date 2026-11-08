/* Chess Dojo UI: bots, coach, board */
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const MATE = Chess.MATE, NAME = Chess.PIECE_NAMES, sqName = Chess.sqName;
  const GLYPH = ['', '♟', '♞', '♝', '♜', '♛', '♚'].map((g) => g && g + '︎');
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function toast(msg, ms = 2000) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
  }

  // ---------- bots ----------
  const BOTS = [
    { id: 'pip', name: 'PIP', elo: 400, face: '\u{1F423}', color: '#a7f070',
      opts: { depth: 1, noise: 320, blunder: 0.25, time: 400 },
      hi: ['HI! I JUST LEARNED HOW THE HORSEY MOVES!', 'LET\'S PLAY! I LOVE PAWNS.'],
      cap: ['YUMMY!', 'I TOOK SOMETHING!'], check: ['CHECK? IS THAT HOW YOU SAY IT?'],
      win: ['I WON?! WOW!'], lose: ['GOOD GAME! YOU\'RE SO GOOD!'] },
    { id: 'ray', name: 'ROOKIE RAY', elo: 800, face: '\u{1F9D1}', color: '#38b764',
      opts: { depth: 2, noise: 150, blunder: 0.1, time: 700 },
      hi: ['I PLAY AT LUNCH EVERY DAY. READY?'], cap: ['GOTCHA!', 'THAT ONE\'S MINE.'],
      check: ['CHECK!'], win: ['LUNCH CHAMP STRIKES AGAIN!'], lose: ['NICE. YOU GOT ME.'] },
    { id: 'kai', name: 'KNIGHT KAI', elo: 1100, face: '\u{1F434}', color: '#41a6f6',
      opts: { depth: 2, noise: 60, blunder: 0.04, time: 900 },
      hi: ['WATCH OUT FOR MY FORKS.'], cap: ['FORKED YA!', 'HOP HOP, TAKE.'],
      check: ['CHECK FROM AN L-SHAPE!'], win: ['THE KNIGHT RIDES ON.'], lose: ['WELL PLAYED, WARRIOR.'] },
    { id: 'bea', name: 'BISHOP BEA', elo: 1400, face: '\u{1F9D9}', color: '#b05ef0',
      opts: { depth: 3, noise: 25, blunder: 0.01, time: 1500 },
      hi: ['DIAGONALS NEVER LIE.'], cap: ['A CLEAN DIAGONAL STRIKE.'], check: ['CHECK. MIND YOUR KING.'],
      win: ['PATIENCE WINS.'], lose: ['IMPRESSIVE. TRULY.'] },
    { id: 'quinn', name: 'QUEEN QUINN', elo: 1700, face: '\u{1F451}', color: '#ef7d57',
      opts: { depth: 4, time: 1400 },
      hi: ['BOW BEFORE THE QUEEN.'], cap: ['MINE NOW.'], check: ['CHECK. YOUR KING TREMBLES.'],
      win: ['AS EXPECTED.'], lose: ['...YOU HAVE EARNED MY RESPECT.'] },
    { id: 'max', name: 'KING MAX', elo: 2000, face: '\u{1F916}', color: '#e04848',
      opts: { depth: 7, time: 2600 },
      hi: ['CALCULATING... READY.'], cap: ['MATERIAL +1.'], check: ['CHECK. PROBABILITY OF YOUR SURVIVAL DROPPING.'],
      win: ['GAME OVER. AS PREDICTED.'], lose: ['ERROR: DID NOT PREDICT THAT. GG.'] },
  ];
  const COACH_OPTS = { depth: 5, time: 900 };

  // ---------- engine worker ----------
  const worker = new Worker('chess-worker.js');
  let reqId = 0;
  const pending = new Map();
  worker.onmessage = (e) => { const r = pending.get(e.data.id); pending.delete(e.data.id); r && r(e.data); };
  const think = (moves, opts) => new Promise((res) => { const id = ++reqId; pending.set(id, res); worker.postMessage({ id, moves, opts }); });

  // ---------- state ----------
  let S = null;         // saved game state
  let game = null;      // Chess instance
  let bot = null;
  let pre = null;       // coach analysis promise for current position
  let selected = null, targets = [], hint = null, hintStage = 0;
  let busy = false, token = 0;

  const save = () => S && !S.over && store.set('chess_game', S);
  const view = (id) => { $$('.view').forEach((v) => v.classList.toggle('active', v.id === id)); window.scrollTo(0, 0); };

  function rebuild() {
    game = new Chess();
    for (const u of S.line) game.make(game.fromUci(u));
  }

  // ---------- lobby ----------
  let colorChoice = 'w', coachChoice = 'on';
  $$('#seg-color button').forEach((b) => b.onclick = () => { colorChoice = b.dataset.v; $$('#seg-color button').forEach((x) => x.classList.toggle('on', x === b)); });
  $$('#seg-coach button').forEach((b) => b.onclick = () => { coachChoice = b.dataset.v; $$('#seg-coach button').forEach((x) => x.classList.toggle('on', x === b)); });

  function renderLobby() {
    const stats = store.get('chess_stats', {});
    const list = $('#bot-list');
    list.innerHTML = '';
    for (const b of BOTS) {
      const st = stats[b.id] || { w: 0, l: 0, d: 0 };
      const el = document.createElement('div');
      el.className = 'game bot';
      el.style.setProperty('--c', b.color);
      el.innerHTML = `<div class="face">${b.face}</div>
        <div class="meta"><div class="name">${b.name} ${st.w ? '<span class="crown">♛︎</span>' : ''}</div>
        <div class="sub">~${b.elo} ELO &nbsp; W${st.w} L${st.l} D${st.d}</div></div>
        <button class="btn green">PLAY</button>`;
      el.onclick = () => newGame(b.id);
      list.appendChild(el);
    }
    const saved = store.get('chess_game', null);
    const box = $('#resume-box');
    if (saved && !saved.over && BOTS.find((b) => b.id === saved.botId)) {
      const b = BOTS.find((x) => x.id === saved.botId);
      $('#resume-text').textContent = `VS ${b.name} - MOVE ${Math.floor(saved.line.length / 2) + 1}`;
      box.hidden = false;
      $('#resume-btn').onclick = () => { S = saved; enterGame(); };
      $('#resume-drop').onclick = () => { store.del('chess_game'); box.hidden = true; };
    } else box.hidden = true;
  }

  function newGame(botId) {
    const color = colorChoice === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : colorChoice;
    S = { botId, color: color === 'w' ? 0 : 8, coach: coachChoice === 'on', line: [], sans: [], grades: [], losses: [],
          flip: false, over: false, hints: 0, undos: 0 };
    enterGame(true);
  }

  function enterGame(fresh) {
    token++;
    bot = BOTS.find((b) => b.id === S.botId);
    rebuild();
    selected = null; targets = []; hint = null; hintStage = 0; busy = false;
    $('#opp-face').textContent = bot.face;
    $('#opp-face').style.setProperty('--c', bot.color);
    $('#opp-name').textContent = bot.name;
    $('#opp-elo').textContent = '~' + bot.elo + ' ELO';
    $('#coach').classList.toggle('hide', !S.coach);
    $('#evalbar').classList.toggle('hide', !S.coach);
    $('#btn-hint').disabled = $('#btn-undo').disabled = !S.coach;
    $('#end').hidden = true;
    say(fresh ? pick(bot.hi) : 'BACK FOR MORE?');
    coach(S.color === 0 ? 'You play WHITE, so you go first. Tap a piece, then tap where it should go.' : 'You play BLACK. Wait for the first move, then reply.', '');
    view('game');
    render();
    save();
    if (S.over) return;
    if (game.turn !== S.color) botMove(token); else playerTurn();
  }

  // ---------- rendering ----------
  function flipped() { return (S.color === 8) !== S.flip; }
  function render() {
    const board = $('#board');
    board.innerHTML = '';
    const last = game.hist.length ? game.hist[game.hist.length - 1].m : null;
    const inCheck = game.inCheck();
    const kingSq = game.kings[game.turn ? 1 : 0];
    const fl = flipped();
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const sq = fl ? (7 - r) * 16 + (7 - f) : r * 16 + f;
      const el = document.createElement('div');
      const light = ((sq >> 4) + (sq & 7)) % 2 === 0;
      el.className = 'sq ' + (light ? 'l' : 'd');
      if (last && (sq === last.from || sq === last.to)) el.classList.add('last');
      if (sq === selected) el.classList.add('sel');
      if (inCheck && sq === kingSq) el.classList.add('check');
      if (hint && (sq === hint.from || (hintStage > 1 && sq === hint.to))) el.classList.add('hint');
      const t = targets.find((m) => m.to === sq);
      if (t) el.classList.add(t.captured ? 'cap' : 'dot');
      const p = game.board[sq];
      if (p) {
        const s = document.createElement('span');
        s.className = 'pc ' + (p & 8 ? 'b' : 'w');
        s.textContent = GLYPH[p & 7];
        el.appendChild(s);
      }
      if (r === 7) el.insertAdjacentHTML('beforeend', `<span class="coord f">${sqName(sq)[0]}</span>`);
      if (f === 0) el.insertAdjacentHTML('beforeend', `<span class="coord r">${sqName(sq)[1]}</span>`);
      el.onclick = () => tap(sq);
      board.appendChild(el);
    }
    $('#evalbar').classList.toggle('flip', fl);
    renderMoves();
  }

  const TAG = { best: ['★', '#a7f070'], good: ['✓', '#38b764'], inacc: ['?!', '#ffcd75'], mistake: ['?', '#ef7d57'], blunder: ['??', '#e04848'] };
  function renderMoves() {
    const ml = $('#movelist');
    let html = '';
    for (let i = 0; i < S.sans.length; i += 2) {
      html += `<span class="n">${i / 2 + 1}.</span>`;
      for (const j of [i, i + 1]) {
        if (j >= S.sans.length) { html += '<span></span>'; continue; }
        const g = S.grades[j];
        const tag = g && TAG[g] ? `<span class="tag" style="color:${TAG[g][1]}">${TAG[g][0]}</span>` : '';
        html += `<span class="mv${j === S.sans.length - 1 ? ' cur' : ''}">${S.sans[j]}${tag}</span>`;
      }
    }
    ml.innerHTML = html || '<span class="tiny" style="grid-column:1/-1">NO MOVES YET</span>';
  }

  function say(text) { $('#opp-say').textContent = text || ''; }
  const GRADE_TXT = { best: 'BEST', good: 'GOOD', inacc: 'INACCURACY', mistake: 'MISTAKE', blunder: 'BLUNDER' };
  function coach(text, grade) {
    $('#coach-text').textContent = text;
    const g = $('#grade');
    g.className = 'grade' + (grade ? ' g-' + grade : '');
    g.textContent = grade ? GRADE_TXT[grade] : '';
  }

  function setEval(cpWhite) {
    let pct, label;
    if (Math.abs(cpWhite) > MATE - 1000) {
      const n = Math.ceil((MATE - Math.abs(cpWhite)) / 2);
      pct = cpWhite > 0 ? 100 : 0; label = 'M' + n;
    } else {
      pct = 50 + 50 * Math.tanh(cpWhite / 500);
      label = (cpWhite > 0 ? '+' : '') + (cpWhite / 100).toFixed(1);
    }
    $('#eval-fill').style.height = pct + '%';
    $('#eval-num').textContent = label;
  }

  // ---------- input ----------
  function tap(sq) {
    if (busy || S.over || game.turn !== S.color) return;
    const mv = targets.filter((m) => m.to === sq);
    if (selected !== null && mv.length) {
      if (mv.length > 1) return choosePromo(mv);
      return playerMove(mv[0]);
    }
    const p = game.board[sq];
    if (p && (p & 8) === S.color && sq !== selected) {
      selected = sq;
      targets = game.moves().filter((m) => m.from === sq);
    } else { selected = null; targets = []; }
    render();
  }

  function choosePromo(moves) {
    const row = $('#promo-row');
    row.innerHTML = '';
    for (const pr of [5, 4, 3, 2]) {
      const b = document.createElement('button');
      b.innerHTML = `<span class="pc ${S.color ? 'b' : 'w'}">${GLYPH[pr]}</span>`;
      b.onclick = () => { $('#promo').hidden = true; playerMove(moves.find((m) => m.promo === pr)); };
      row.appendChild(b);
    }
    $('#promo').hidden = false;
  }

  // ---------- turn flow ----------
  function playerTurn() {
    busy = false;
    hint = null; hintStage = 0;
    if (S.coach) {
      const tok = token;
      pre = think(S.line.slice(), COACH_OPTS);
      pre.then((r) => { if (tok === token) setEval(S.color === 0 ? r.score : -r.score); });
    } else pre = null;
    render();
  }

  async function playerMove(m) {
    const tok = token;
    const uci = game.uci(m), san = game.san(m);
    const beforeA = pre;
    const prevBoard = game.board.slice();
    const myMoveNo = Math.floor(S.line.length / 2) + 1;
    game.make(m);
    S.line.push(uci); S.sans.push(san); S.grades.push(null);
    selected = null; targets = []; hint = null; hintStage = 0;
    busy = true;
    render(); save();
    if (checkEnd()) return;

    if (S.coach) {
      coach('Coach is looking at your move...', '');
      const before = await beforeA;
      const after = await think(S.line.slice(), COACH_OPTS);
      if (tok !== token) return;
      gradeMove(before, after, m, uci, prevBoard, myMoveNo);
      render(); save();
    }
    botMove(tok);
  }

  async function botMove(tok) {
    busy = true;
    say(pick(['HMM...', 'THINKING...', '...']));
    const t0 = Date.now();
    const r = await think(S.line.slice(), bot.opts);
    const wait = 450 - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
    if (tok !== token || S.over) return;
    const m = game.fromUci(r.move);
    const san = game.san(m);
    game.make(m);
    S.line.push(r.move); S.sans.push(san); S.grades.push(null);
    if (san.includes('+')) say(pick(bot.check));
    else if (m.captured) say(pick(bot.cap));
    else say('');
    render(); save();
    if (checkEnd()) return;
    playerTurn();
  }

  // ---------- coach brain ----------
  const clampCp = (s) => s > MATE - 1000 ? 3000 : s < -(MATE - 1000) ? -3000 : Math.max(-1500, Math.min(1500, s));

  function gradeMove(before, after, m, uci, prevBoard, myMoveNo) {
    const bestScore = before.score;
    const playedScore = -after.score;
    const isBest = before.best === uci;
    let loss = isBest ? 0 : Math.max(0, clampCp(bestScore) - clampCp(playedScore));
    // already completely winning: small slips don't matter much
    if (clampCp(playedScore) > 700 && clampCp(bestScore) > 700) loss = Math.min(loss, 60);
    const grade = loss <= 15 ? 'best' : loss <= 50 ? 'good' : loss <= 110 ? 'inacc' : loss <= 250 ? 'mistake' : 'blunder';
    S.grades[S.grades.length - 1] = grade;
    S.losses.push(loss);
    setEval(S.color === 0 ? playedScore : -playedScore);

    const parts = [];
    const threat = game.fromUci(after.best || '');
    if (grade === 'best' || grade === 'good') {
      if (bestScore > MATE - 1000 && isBest) parts.push('CHECKMATE IS COMING! KEEP GOING.');
      else parts.push(pick(grade === 'best'
        ? ['Excellent! That\'s the move I would play.', 'Perfect move!', 'Spot on. Great vision.', 'Top move! You\'re getting it.']
        : ['Good move. Solid choice.', 'Nice, that works well.', 'Good! ' + (isBest ? '' : 'The engine slightly preferred ' + before.bestSan + '.')]));
    } else {
      if (after.score > MATE - 1000) parts.push(`Uh oh! This allows checkmate. Watch out for ${after.bestSan}.`);
      else if (threat && threat.captured) {
        parts.push(`Now they can take your ${NAME[threat.captured & 7]} on ${sqName(threat.to)} with ${after.bestSan}.`);
      } else if (threat) parts.push(`This lets them play ${after.bestSan}, which is strong for them.`);
      if (bestScore > MATE - 1000) parts.push(`You had checkmate: ${before.bestSan}!`);
      else if (/x/.test(before.bestSan)) {
        const target = prevBoard[sqIndex(before.best.slice(2, 4))];
        parts.push(target ? `You could have taken their ${NAME[target & 7]} with ${before.bestSan}.` : `Better was ${before.bestSan}.`);
      } else parts.push(`Better was ${before.bestSan}.`);
      if (grade !== 'inacc') parts.push('Tip: before each move, ask "what can my opponent capture or attack next?"');
    }
    const tip = openingTip(m, myMoveNo);
    if (tip && grade !== 'mistake' && grade !== 'blunder') parts.push(tip);
    coach(parts.join(' '), grade);
  }
  const sqIndex = (n) => (8 - +n[1]) * 16 + (n.charCodeAt(0) - 97);

  function openingTip(m, n) {
    const t = m.piece & 7;
    if (m.flags === 'k' || m.flags === 'q') return 'Nice castle! Your king is safer and your rook joins the game.';
    if (n > 12) return '';
    if (t === 5 && n <= 4 && !m.captured) return 'Tip: moving the queen this early lets them chase her. Develop knights and bishops first.';
    if (t === 6 && n <= 12) return 'Tip: try to castle instead of walking your king around.';
    if (t === 1 && n <= 3 && [0, 7].includes(m.from & 7)) return 'Tip: center pawns (e and d) control more space than edge pawns.';
    if (n === 7) {
      const home = S.color === 0 ? [0x71, 0x72, 0x75, 0x76] : [0x01, 0x02, 0x05, 0x06];
      const stuck = home.filter((sq) => { const p = game.board[sq]; return p && (p & 8) === S.color && [2, 3].includes(p & 7); }).length;
      if (stuck >= 2) return `Tip: ${stuck} of your knights/bishops are still at home. Get them into the game!`;
    }
    return '';
  }

  // ---------- buttons ----------
  $('#btn-hint').onclick = async () => {
    if (!S.coach || busy || S.over || game.turn !== S.color || !pre) return;
    const r = await pre;
    if (!r.best) return;
    const m = game.fromUci(r.best);
    hint = m; hintStage = Math.min(2, hintStage + 1);
    S.hints++;
    if (hintStage === 1) coach(`Hint: look at your ${NAME[m.piece & 7]} on ${sqName(m.from)}. Can it do something useful?`, '');
    else coach(`Best move: ${r.bestSan}.` + (m.captured ? ` It wins their ${NAME[m.captured & 7]}.` : ''), '');
    render();
  };

  $('#btn-undo').onclick = () => {
    if (!S.coach || !S.line.length) return;
    // need at least one of the player's moves to take back
    const firstPlayerPly = S.color === 0 ? 0 : 1;
    if (S.line.length <= firstPlayerPly) return;
    token++;
    do {
      S.line.pop(); S.sans.pop();
      const g = S.grades.pop();
      if (g) S.losses.pop();
      rebuild();
    } while (S.line.length && game.turn !== S.color);
    S.undos++; S.over = false;
    $('#end').hidden = true;
    selected = null; targets = [];
    coach('Move taken back. Try something else!', '');
    say('');
    save();
    playerTurn();
  };

  $('#btn-flip').onclick = () => { S.flip = !S.flip; render(); save(); };
  $('#btn-resign').onclick = () => {
    if (S.over) return;
    if (confirm('Resign this game?')) finish('loss', 'YOU RESIGNED');
  };

  // ---------- game end ----------
  function repetition() {
    const g = new Chess(), counts = {};
    counts[g.key()] = 1;
    for (const u of S.line) { g.make(g.fromUci(u)); const k = g.key(); counts[k] = (counts[k] || 0) + 1; if (counts[k] >= 3) return true; }
    return false;
  }
  function checkEnd() {
    const st = game.status();
    if (st === 'checkmate') { finish(game.turn === S.color ? 'loss' : 'win', 'CHECKMATE'); return true; }
    if (st !== 'play') { finish('draw', { stalemate: 'STALEMATE', fifty: '50-MOVE RULE', insufficient: 'NOT ENOUGH PIECES' }[st]); return true; }
    if (repetition()) { finish('draw', 'REPETITION'); return true; }
    return false;
  }

  function finish(result, reason) {
    token++;
    S.over = true; busy = false;
    store.del('chess_game');
    const stats = store.get('chess_stats', {});
    const st = stats[S.botId] || { w: 0, l: 0, d: 0 };
    st[result[0]]++;
    stats[S.botId] = st;
    store.set('chess_stats', stats);
    say(result === 'win' ? pick(bot.lose) : result === 'loss' ? pick(bot.win) : 'A DRAW. INTERESTING.');
    $('#end-title').textContent = result === 'win' ? 'YOU WIN!' : result === 'loss' ? 'YOU LOST' : 'DRAW';
    $('#end-sub').textContent = reason + (result === 'win' && st.w === 1 ? ` - CROWN EARNED VS ${bot.name}!` : '');
    let rep = '';
    if (S.coach && S.losses.length) {
      const acc = Math.round(S.losses.reduce((a, l) => a + 100 * Math.exp(-l / 180), 0) / S.losses.length);
      const c = { best: 0, good: 0, inacc: 0, mistake: 0, blunder: 0 };
      S.grades.forEach((g) => g && c[g]++);
      rep = `<div class="acc">ACCURACY ${acc}%</div>` +
        Object.keys(c).map((k) => `<div class="rep"><span style="color:${TAG[k][1]}">${TAG[k][0]} ${GRADE_TXT[k]}</span><span>${c[k]}</span></div>`).join('') +
        `<p class="tiny">HINTS: ${S.hints} &nbsp; TAKE-BACKS: ${S.undos}</p>` +
        `<p class="small">${c.blunder ? 'Coach: work on blunder-checking. Before you tap, look for every capture and check your opponent has.' :
          acc >= 85 ? 'Coach: great game! Try the next bot up.' : 'Coach: solid effort. Look for checks, captures and threats every move.'}</p>`;
    }
    $('#end-report').innerHTML = rep;
    $('#end').hidden = false;
    render();
  }
  $('#end-again').onclick = () => { $('#end').hidden = true; newGame(S.botId); };
  $('#end-review').onclick = () => { $('#end').hidden = true; };
  $('#end-lobby').onclick = () => { $('#end').hidden = true; token++; renderLobby(); view('lobby'); };

  // ---------- lessons ----------
  const LESSONS = [
    ['1. THE OPENING', `<ul><li>Control the center with your e and d pawns.</li><li>Develop knights before bishops when you can.</li><li>Castle early to keep your king safe.</li><li>Don't move the same piece twice without a reason.</li><li>Keep your queen home for the first few moves.</li></ul>`],
    ['2. PIECE VALUES', `<ul><li>Pawn = 1</li><li>Knight = 3, Bishop = 3</li><li>Rook = 5</li><li>Queen = 9</li></ul><p>Only trade if you get equal or more value back.</p>`],
    ['3. BLUNDER CHECK', `<p>Before EVERY move, ask:</p><ul><li>Is my piece safe on its new square?</li><li>Did I leave something else unprotected?</li><li>What checks, captures and threats does my opponent have?</li></ul>`],
    ['4. FORKS', `<p>A fork is one piece attacking two things at once. Knights are the best at forking because they jump. Look for squares that hit their king AND queen.</p>`],
    ['5. PINS & SKEWERS', `<p>A <b>pin</b>: a piece can't move because something more valuable is behind it. A <b>skewer</b>: the valuable piece is in front and must move, and you take what's behind it. Bishops, rooks and queens do these.</p>`],
    ['6. CHECKMATE PATTERNS', `<ul><li><b>Back-rank mate</b>: a rook or queen mates a king stuck behind its own pawns. Give your king an escape square ("luft").</li><li><b>Two-rook ladder</b>: push the king to the edge one row at a time.</li><li><b>Queen + king</b>: use your king to support the queen.</li></ul>`],
    ['7. ENDGAMES', `<ul><li>Activate your king. In the endgame it is a strong piece!</li><li>Passed pawns must be pushed.</li><li>Rooks belong behind passed pawns.</li></ul>`],
  ];
  $('#lessons').innerHTML = LESSONS.map(([t, h]) => `<details class="lesson"><summary>${t}</summary>${h}</details>`).join('');

  renderLobby();
})();
