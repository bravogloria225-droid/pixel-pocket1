/* Pixel Pocket chess engine: 0x88 board, legal move gen, alpha-beta + quiescence.
   Works in the page (rules) and in a Web Worker (search). */
(function (root) {
  const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6, WHITE = 0, BLACK = 8;
  const VAL = [0, 100, 320, 330, 500, 900, 0];
  const MATE = 100000;
  const KN = [-33, -31, -18, -14, 14, 18, 31, 33];
  const KG = [-17, -16, -15, -1, 1, 15, 16, 17];
  const BD = [-17, -15, 15, 17];
  const RD = [-16, -1, 1, 16];
  const NAMES = ' pnbrqk';

  // piece-square tables, a8..h1, white's point of view
  const PST = [
    null,
    [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5,
     0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30,
     -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10,
     -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
     -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5,
     0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
     -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
  ];
  const KING_END = [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30,
    -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50];

  // castling-rights masks: 1=WK 2=WQ 4=BK 8=BQ
  const CM = new Array(128).fill(15);
  CM[0x70] = 13; CM[0x77] = 14; CM[0x74] = 12; CM[0x00] = 7; CM[0x07] = 11; CM[0x04] = 3;

  const sqName = (s) => 'abcdefgh'[s & 7] + (8 - (s >> 4));
  const sqFrom = (n) => (8 - +n[1]) * 16 + (n.charCodeAt(0) - 97);
  const idx64 = (s, white) => (white ? (s >> 4) : 7 - (s >> 4)) * 8 + (s & 7);

  function Chess(fen) { this.load(fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'); }

  Chess.prototype.load = function (fen) {
    const [pos, turn, cas, ep, half, full] = fen.split(/\s+/);
    this.board = new Array(128).fill(0);
    this.kings = [0, 0];
    let r = 0, f = 0;
    for (const ch of pos) {
      if (ch === '/') { r++; f = 0; continue; }
      if (/\d/.test(ch)) { f += +ch; continue; }
      const t = NAMES.indexOf(ch.toLowerCase());
      const color = ch === ch.toUpperCase() ? WHITE : BLACK;
      const sq = r * 16 + f;
      this.board[sq] = color | t;
      if (t === K) this.kings[color ? 1 : 0] = sq;
      f++;
    }
    this.turn = turn === 'b' ? BLACK : WHITE;
    this.castle = (cas.includes('K') ? 1 : 0) | (cas.includes('Q') ? 2 : 0) | (cas.includes('k') ? 4 : 0) | (cas.includes('q') ? 8 : 0);
    this.ep = ep && ep !== '-' ? sqFrom(ep) : -1;
    this.half = +half || 0;
    this.full = +full || 1;
    this.hist = [];
  };

  Chess.prototype.fen = function () {
    let s = '';
    for (let r = 0; r < 8; r++) {
      let e = 0;
      for (let f = 0; f < 8; f++) {
        const p = this.board[r * 16 + f];
        if (!p) { e++; continue; }
        if (e) { s += e; e = 0; }
        const c = NAMES[p & 7];
        s += p & 8 ? c : c.toUpperCase();
      }
      if (e) s += e;
      if (r < 7) s += '/';
    }
    const c = this.castle;
    const cas = (c & 1 ? 'K' : '') + (c & 2 ? 'Q' : '') + (c & 4 ? 'k' : '') + (c & 8 ? 'q' : '') || '-';
    return `${s} ${this.turn ? 'b' : 'w'} ${cas} ${this.ep >= 0 ? sqName(this.ep) : '-'} ${this.half} ${this.full}`;
  };
  // position key for repetition (no move counters)
  Chess.prototype.key = function () { return this.fen().split(' ').slice(0, 4).join(' '); };

  Chess.prototype.attacked = function (sq, by) {
    const b = this.board;
    // pawns
    if (by === WHITE) {
      if (!((sq + 15) & 0x88) && b[sq + 15] === (WHITE | P)) return true;
      if (!((sq + 17) & 0x88) && b[sq + 17] === (WHITE | P)) return true;
    } else {
      if (!((sq - 15) & 0x88) && b[sq - 15] === (BLACK | P)) return true;
      if (!((sq - 17) & 0x88) && b[sq - 17] === (BLACK | P)) return true;
    }
    for (const d of KN) { const t = sq + d; if (!(t & 0x88) && b[t] === (by | N)) return true; }
    for (const d of KG) { const t = sq + d; if (!(t & 0x88) && b[t] === (by | K)) return true; }
    for (const d of BD) {
      let t = sq + d;
      while (!(t & 0x88)) { const p = b[t]; if (p) { if ((p & 8) === by && ((p & 7) === B || (p & 7) === Q)) return true; break; } t += d; }
    }
    for (const d of RD) {
      let t = sq + d;
      while (!(t & 0x88)) { const p = b[t]; if (p) { if ((p & 8) === by && ((p & 7) === R || (p & 7) === Q)) return true; break; } t += d; }
    }
    return false;
  };

  Chess.prototype.inCheck = function (color) {
    const c = color === undefined ? this.turn : color;
    return this.attacked(this.kings[c ? 1 : 0], c ^ 8);
  };

  Chess.prototype.gen = function (capsOnly) {
    const out = [], b = this.board, us = this.turn, them = us ^ 8;
    const add = (from, to, piece, captured, promo, flags) => out.push({ from, to, piece, captured, promo, flags });
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = b[sq];
      if (!p || (p & 8) !== us) continue;
      const t = p & 7;
      if (t === P) {
        const dir = us === WHITE ? -16 : 16, start = us === WHITE ? 6 : 1, last = us === WHITE ? 0 : 7;
        const to = sq + dir;
        if (!(to & 0x88) && !b[to]) {
          if ((to >> 4) === last) { for (const pr of [Q, R, B, N]) add(sq, to, p, 0, pr, 'p'); }
          else if (!capsOnly) {
            add(sq, to, p, 0, 0, 'n');
            const to2 = to + dir;
            if ((sq >> 4) === start && !b[to2]) add(sq, to2, p, 0, 0, 'b');
          }
        }
        for (const d of [dir - 1, dir + 1]) {
          const c = sq + d;
          if (c & 0x88) continue;
          if (b[c] && (b[c] & 8) === them) {
            if ((c >> 4) === last) { for (const pr of [Q, R, B, N]) add(sq, c, p, b[c], pr, 'p'); }
            else add(sq, c, p, b[c], 0, 'c');
          } else if (c === this.ep) add(sq, c, p, them | P, 0, 'e');
        }
      } else if (t === N || t === K) {
        for (const d of t === N ? KN : KG) {
          const to = sq + d;
          if (to & 0x88) continue;
          const q = b[to];
          if (!q) { if (!capsOnly) add(sq, to, p, 0, 0, 'n'); }
          else if ((q & 8) === them) add(sq, to, p, q, 0, 'c');
        }
        if (t === K && !capsOnly) {
          const home = us === WHITE ? 0x74 : 0x04;
          if (sq === home && !this.attacked(home, them)) {
            const kBit = us === WHITE ? 1 : 4, qBit = us === WHITE ? 2 : 8;
            if ((this.castle & kBit) && !b[home + 1] && !b[home + 2] && b[home + 3] === (us | R) &&
                !this.attacked(home + 1, them) && !this.attacked(home + 2, them)) add(sq, home + 2, p, 0, 0, 'k');
            if ((this.castle & qBit) && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === (us | R) &&
                !this.attacked(home - 1, them) && !this.attacked(home - 2, them)) add(sq, home - 2, p, 0, 0, 'q');
          }
        }
      } else {
        for (const d of t === B ? BD : t === R ? RD : KG) {
          let to = sq + d;
          while (!(to & 0x88)) {
            const q = b[to];
            if (!q) { if (!capsOnly) add(sq, to, p, 0, 0, 'n'); }
            else { if ((q & 8) === them) add(sq, to, p, q, 0, 'c'); break; }
            to += d;
          }
        }
      }
    }
    return out;
  };

  Chess.prototype.moves = function (capsOnly) {
    const us = this.turn, legal = [];
    for (const m of this.gen(capsOnly)) {
      this.make(m);
      if (!this.attacked(this.kings[us ? 1 : 0], us ^ 8)) legal.push(m);
      this.undo();
    }
    return legal;
  };

  Chess.prototype.make = function (m) {
    const b = this.board, us = this.turn;
    this.hist.push({ m, castle: this.castle, ep: this.ep, half: this.half });
    b[m.to] = m.promo ? (us | m.promo) : m.piece;
    b[m.from] = 0;
    if (m.flags === 'e') b[m.to + (us === WHITE ? 16 : -16)] = 0;
    else if (m.flags === 'k') { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = 0; }
    else if (m.flags === 'q') { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = 0; }
    if ((m.piece & 7) === K) this.kings[us ? 1 : 0] = m.to;
    this.castle &= CM[m.from] & CM[m.to];
    this.ep = m.flags === 'b' ? (m.from + m.to) >> 1 : -1;
    this.half = ((m.piece & 7) === P || m.captured) ? 0 : this.half + 1;
    if (us === BLACK) this.full++;
    this.turn ^= 8;
  };

  Chess.prototype.undo = function () {
    const h = this.hist.pop();
    if (!h) return null;
    const m = h.m, b = this.board;
    this.turn ^= 8;
    const us = this.turn;
    b[m.from] = m.piece;
    b[m.to] = m.flags === 'e' ? 0 : m.captured;
    if (m.flags === 'e') b[m.to + (us === WHITE ? 16 : -16)] = m.captured;
    else if (m.flags === 'k') { b[m.to + 1] = b[m.to - 1]; b[m.to - 1] = 0; }
    else if (m.flags === 'q') { b[m.to - 2] = b[m.to + 1]; b[m.to + 1] = 0; }
    if ((m.piece & 7) === K) this.kings[us ? 1 : 0] = m.from;
    this.castle = h.castle; this.ep = h.ep; this.half = h.half;
    if (us === BLACK) this.full--;
    return m;
  };

  Chess.prototype.uci = (m) => sqName(m.from) + sqName(m.to) + (m.promo ? NAMES[m.promo] : '');
  Chess.prototype.fromUci = function (u) {
    const from = sqFrom(u.slice(0, 2)), to = sqFrom(u.slice(2, 4)), pr = u[4] ? NAMES.indexOf(u[4]) : 0;
    return this.moves().find((m) => m.from === from && m.to === to && (m.promo || 0) === pr) || null;
  };

  Chess.prototype.san = function (m) {
    let s;
    if (m.flags === 'k') s = 'O-O';
    else if (m.flags === 'q') s = 'O-O-O';
    else {
      const t = m.piece & 7;
      s = '';
      if (t !== P) {
        s += 'NBRQK'[t - 2];
        const others = this.moves().filter((o) => o.to === m.to && o.from !== m.from && o.piece === m.piece);
        if (others.length) {
          const sameFile = others.some((o) => (o.from & 7) === (m.from & 7));
          const sameRank = others.some((o) => (o.from >> 4) === (m.from >> 4));
          if (!sameFile) s += sqName(m.from)[0];
          else if (!sameRank) s += sqName(m.from)[1];
          else s += sqName(m.from);
        }
      }
      if (m.captured) { if (t === P) s += sqName(m.from)[0]; s += 'x'; }
      s += sqName(m.to);
      if (m.promo) s += '=' + 'NBRQ'[m.promo - 2];
    }
    this.make(m);
    if (this.inCheck()) s += this.moves().length ? '+' : '#';
    this.undo();
    return s;
  };

  Chess.prototype.insufficient = function () {
    let minors = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const t = this.board[sq] & 7;
      if (t === P || t === R || t === Q) return false;
      if (t === N || t === B) minors++;
    }
    return minors <= 1;
  };

  // 'play' | 'checkmate' | 'stalemate' | 'fifty' | 'insufficient'
  Chess.prototype.status = function () {
    if (!this.moves().length) return this.inCheck() ? 'checkmate' : 'stalemate';
    if (this.half >= 100) return 'fifty';
    if (this.insufficient()) return 'insufficient';
    return 'play';
  };

  Chess.prototype.material = function (color) {
    let s = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = this.board[sq];
      if (p && (p & 8) === color) s += VAL[p & 7];
    }
    return s;
  };

  // score from side-to-move's view
  Chess.prototype.evaluate = function () {
    const b = this.board;
    let score = 0, phase = 0, wb = 0, bb = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = b[sq];
      if (!p) continue;
      const t = p & 7;
      if (t !== P && t !== K) phase += VAL[t];
    }
    const endgame = phase < 2600;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = b[sq];
      if (!p) continue;
      const t = p & 7, white = !(p & 8);
      const table = t === K && endgame ? KING_END : PST[t];
      const v = VAL[t] + table[idx64(sq, white)];
      if (white) { score += v; if (t === B) wb++; } else { score -= v; if (t === B) bb++; }
    }
    if (wb >= 2) score += 30;
    if (bb >= 2) score -= 30;
    return this.turn === WHITE ? score : -score;
  };

  const mkey = (m) => m.from * 128 + m.to + (m.promo << 14);

  /* search options:
     depth: max depth, time: ms budget, noise: random cp added to root scores,
     blunder: chance to play a random move, q: quiescence on/off */
  Chess.prototype.search = function (o = {}) {
    const self = this;
    const maxDepth = o.depth || 4, timeMs = o.time || 1000, noise = o.noise || 0, useQ = o.q !== false;
    const t0 = Date.now();
    let deadline = Infinity, nodes = 0, stop = false;
    const killers = [];

    function order(ms, ply, pv) {
      const k = killers[ply];
      for (const m of ms) {
        let s = 0;
        if (pv !== undefined && mkey(m) === pv) s = 1e6;
        else if (m.captured) s = 1e5 + 10 * VAL[m.captured & 7] - VAL[m.piece & 7];
        else if (m.promo) s = 9e4;
        else if (k && mkey(m) === k) s = 8e4;
        m._s = s;
      }
      ms.sort((a, b) => b._s - a._s);
    }
    function qs(alpha, beta, ply) {
      nodes++;
      if ((nodes & 1023) === 0 && Date.now() > deadline) stop = true;
      if (stop) return 0;
      const stand = self.evaluate();
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;
      if (ply > 24) return alpha;
      const ms = self.moves(true);
      order(ms, ply);
      for (const m of ms) {
        self.make(m);
        const s = -qs(-beta, -alpha, ply + 1);
        self.undo();
        if (stop) return 0;
        if (s >= beta) return beta;
        if (s > alpha) alpha = s;
      }
      return alpha;
    }
    function neg(depth, alpha, beta, ply) {
      if (depth <= 0) return useQ ? qs(alpha, beta, ply) : self.evaluate();
      nodes++;
      if ((nodes & 1023) === 0 && Date.now() > deadline) stop = true;
      if (stop) return 0;
      const ms = self.moves();
      if (!ms.length) return self.inCheck() ? -MATE + ply : 0;
      if (self.half >= 100) return 0;
      order(ms, ply);
      for (const m of ms) {
        self.make(m);
        const ext = self.inCheck() && ply < 8 ? 1 : 0; // check extension
        const s = -neg(depth - 1 + ext, -beta, -alpha, ply + 1);
        self.undo();
        if (stop) return 0;
        if (s >= beta) { if (!m.captured) killers[ply] = mkey(m); return beta; }
        if (s > alpha) alpha = s;
      }
      return alpha;
    }

    const root = this.moves();
    if (!root.length) return { move: null, score: this.inCheck() ? -MATE : 0, depth: 0, nodes: 0 };

    let best = root[0], bestScore = -Infinity, doneDepth = 0, pv;
    let scored = root.map((m) => ({ m, s: 0 }));
    for (let d = 1; d <= maxDepth; d++) {
      if (d > 1) deadline = t0 + timeMs;
      order(root, 0, pv);
      let alpha = -Infinity, iterBest = null, iterScore = -Infinity;
      const iterScored = [];
      for (const m of root) {
        this.make(m);
        // full window when adding noise so every root move gets a real score
        const s = noise ? -neg(d - 1, -Infinity, Infinity, 1) : -neg(d - 1, -Infinity, -alpha, 1);
        this.undo();
        if (stop) break;
        iterScored.push({ m, s });
        if (s > iterScore) { iterScore = s; iterBest = m; }
        if (s > alpha) alpha = s;
      }
      if (stop) break;
      best = iterBest; bestScore = iterScore; doneDepth = d; pv = mkey(best); scored = iterScored;
      if (Math.abs(bestScore) > MATE - 100) break; // found a mate
      if (Date.now() - t0 > timeMs * 0.55) break;  // next depth would not finish
    }

    let pick = best;
    if (o.blunder && Math.random() < o.blunder) {
      pick = root[(Math.random() * root.length) | 0];
    } else if (noise) {
      let top = -Infinity;
      for (const { m, s } of scored) {
        const v = s + (Math.random() * 2 - 1) * noise;
        if (v > top) { top = v; pick = m; }
      }
    }
    return { move: pick, best, score: bestScore, depth: doneDepth, nodes, ms: Date.now() - t0 };
  };

  Chess.MATE = MATE;
  Chess.VAL = VAL;
  Chess.sqName = sqName;
  Chess.PIECE_NAMES = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
  root.Chess = Chess;
})(typeof self !== 'undefined' ? self : this);
