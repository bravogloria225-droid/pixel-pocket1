/* STAR DODGE - steer your ship, dodge rocks, grab stars, A = boost */
(window.ARCADE = window.ARCADE || []).push({
  id: 'dodge', name: 'STAR DODGE', tag: 'SPACE', color: '#41a6f6',
  desc: 'HOLD LEFT/RIGHT, A=DASH',
  create(ctx, api) {
    let ship, rocks, stars, bg, t, score, state, spawn, dash, shake;
    function reset() {
      ship = { x: 76, y: 124, vx: 0 };
      rocks = []; stars = []; t = 0; score = 0; spawn = 0; dash = 0; shake = 0;
      bg = Array.from({ length: 30 }, () => ({ x: Math.random() * 160, y: Math.random() * 144, s: Math.random() * 40 + 10 }));
      state = 'ready'; api.score(0);
    }
    function press(k) {
      if (state !== 'play') { if (k === 'a') { if (state === 'over') reset(); state = 'play'; } return; }
      if (k === 'a' && dash <= 0) dash = 0.25;
    }
    const hit = (a, b, r) => Math.abs(a.x - b.x) < r && Math.abs(a.y - b.y) < r;
    function text(s, y, size = 8) {
      ctx.fillStyle = '#f4f4f4'; ctx.font = size + 'px "Press Start 2P", monospace'; ctx.textAlign = 'center'; ctx.fillText(s, 80, y);
    }
    function tick(dt) {
      const speed = 40 + t * 2.2;
      bg.forEach((s) => { s.y += s.s * dt * (state === 'play' ? 1.5 : 0.5); if (s.y > 144) { s.y = 0; s.x = Math.random() * 160; } });
      if (state === 'play') {
        t += dt;
        const dir = (api.held.right ? 1 : 0) - (api.held.left ? 1 : 0);
        const max = dash > 0 ? 180 : 90;
        ship.vx += (dir * max - ship.vx) * Math.min(1, dt * 12);
        ship.x = Math.max(4, Math.min(148, ship.x + ship.vx * dt));
        dash = Math.max(-0.4, dash - dt);
        spawn -= dt;
        if (spawn <= 0) {
          spawn = Math.max(0.18, 0.7 - t * 0.012);
          rocks.push({ x: Math.random() * 150 + 5, y: -8, vy: speed * (0.8 + Math.random() * 0.6), r: Math.random() < 0.3 ? 10 : 6 });
          if (Math.random() < 0.25) stars.push({ x: Math.random() * 150 + 5, y: -8 });
        }
        rocks.forEach((r) => r.y += r.vy * dt);
        stars.forEach((s) => s.y += speed * 0.8 * dt);
        rocks = rocks.filter((r) => r.y < 160);
        stars = stars.filter((s) => {
          if (hit(s, { x: ship.x + 4, y: ship.y + 4 }, 9)) { score += 50; return false; }
          return s.y < 160;
        });
        score += Math.round(dt * 100) / 10;
        api.score(Math.floor(score));
        if (rocks.some((r) => hit(r, { x: ship.x + 4, y: ship.y + 4 }, r.r / 2 + 3))) {
          state = 'over'; shake = 0.4; api.hi(Math.floor(score));
        }
      }
      shake = Math.max(0, shake - dt);
      ctx.save();
      if (shake) ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
      ctx.fillStyle = '#1a1c2c'; ctx.fillRect(-4, -4, 168, 152);
      bg.forEach((s) => { ctx.fillStyle = s.s > 35 ? '#94b0c2' : '#333c57'; ctx.fillRect(s.x | 0, s.y | 0, 1, s.s > 35 ? 2 : 1); });
      stars.forEach((s) => {
        ctx.fillStyle = '#ffcd75';
        ctx.fillRect(s.x - 1, s.y - 4, 2, 8); ctx.fillRect(s.x - 4, s.y - 1, 8, 2);
      });
      rocks.forEach((r) => {
        ctx.fillStyle = '#5d275d'; ctx.fillRect(r.x - r.r / 2, r.y - r.r / 2, r.r, r.r);
        ctx.fillStyle = '#b13e53'; ctx.fillRect(r.x - r.r / 2, r.y - r.r / 2, r.r - 2, r.r - 2);
        ctx.fillStyle = '#ef7d57'; ctx.fillRect(r.x - r.r / 2 + 1, r.y - r.r / 2 + 1, 2, 2);
      });
      if (state !== 'over' || Math.floor(shake * 20) % 2 === 0) {
        const x = ship.x | 0, y = ship.y;
        ctx.fillStyle = '#41a6f6'; ctx.fillRect(x + 3, y, 2, 3); ctx.fillRect(x + 1, y + 3, 6, 3); ctx.fillRect(x, y + 6, 8, 2);
        ctx.fillStyle = '#f4f4f4'; ctx.fillRect(x + 3, y + 3, 2, 2);
        ctx.fillStyle = dash > 0 ? '#ffcd75' : '#ef7d57'; ctx.fillRect(x + 2, y + 8, 4, dash > 0 ? 5 : 2 + ((t * 20) % 2));
      }
      ctx.restore();
      if (state === 'ready') { text('STAR DODGE', 60, 10); text('PRESS A', 84); }
      if (state === 'over') { text('CRASH!', 56, 10); text('SCORE ' + Math.floor(score), 76); text('HI ' + api.hi(), 90); text('PRESS A', 110); }
    }
    reset();
    return { press, tick };
  },
});
