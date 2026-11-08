/* PIXEL SNEK - grow by eating berries, don't bite yourself */
(window.ARCADE = window.ARCADE || []).push({
  id: 'snek', name: 'PIXEL SNEK', tag: 'SNEK', color: '#a7f070',
  desc: 'SWIPE OR D-PAD',
  create(ctx, api) {
    const C = 8, GW = 20, GH = 18;
    const COL = { bg: '#0f380f', grid: '#13421a', body: '#9bbc0f', head: '#e0f8d0', food: '#ef7d57', text: '#e0f8d0' };
    let snake, dir, next, food, score, step, acc, state, flash;

    function reset() {
      snake = [{ x: 8, y: 9 }, { x: 7, y: 9 }, { x: 6, y: 9 }];
      dir = { x: 1, y: 0 }; next = dir;
      score = 0; step = 0.16; acc = 0; state = 'ready'; flash = 0;
      placeFood(); api.score(0);
    }
    function placeFood() {
      do { food = { x: (Math.random() * GW) | 0, y: (Math.random() * GH) | 0 }; }
      while (snake.some((s) => s.x === food.x && s.y === food.y));
    }
    const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

    function press(k) {
      if (state !== 'play') { if (state === 'over' || k === 'a' || DIRS[k]) { if (state === 'over') reset(); state = 'play'; } if (!DIRS[k]) return; }
      const d = DIRS[k];
      if (d && !(d.x === -dir.x && d.y === -dir.y)) next = d;
    }
    function text(s, y, size = 8) {
      ctx.fillStyle = COL.text; ctx.font = size + 'px "Press Start 2P", monospace'; ctx.textAlign = 'center';
      ctx.fillText(s, 80, y);
    }
    function tick(dt) {
      if (state === 'play') {
        acc += dt;
        while (acc >= step) {
          acc -= step; dir = next;
          const h = { x: (snake[0].x + dir.x + GW) % GW, y: (snake[0].y + dir.y + GH) % GH };
          if (snake.some((s, i) => i < snake.length - 1 && s.x === h.x && s.y === h.y)) {
            state = 'over'; api.hi(score); break;
          }
          snake.unshift(h);
          if (h.x === food.x && h.y === food.y) {
            score += 10; api.score(score); flash = 0.15; placeFood();
            step = Math.max(0.06, step - 0.004);
          } else snake.pop();
        }
      }
      flash = Math.max(0, flash - dt);
      // draw
      ctx.fillStyle = flash > 0 ? '#306230' : COL.bg; ctx.fillRect(0, 0, 160, 144);
      ctx.fillStyle = COL.grid;
      for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) if ((x + y) % 2) ctx.fillRect(x * C, y * C, C, C);
      ctx.fillStyle = COL.food; ctx.fillRect(food.x * C + 1, food.y * C + 1, 6, 6);
      ctx.fillStyle = '#a7f070'; ctx.fillRect(food.x * C + 3, food.y * C, 2, 2);
      snake.forEach((s, i) => {
        ctx.fillStyle = i ? COL.body : COL.head;
        ctx.fillRect(s.x * C, s.y * C, C - 1, C - 1);
      });
      if (state === 'ready') { text('PIXEL SNEK', 60, 10); text('PRESS A', 84); }
      if (state === 'over') { text('GAME OVER', 56, 10); text('SCORE ' + score, 76); text('HI ' + api.hi(), 90); text('PRESS A', 110); }
    }
    reset();
    return { press, tick };
  },
});
