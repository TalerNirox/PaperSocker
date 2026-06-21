// ============================================================
//  Paper Soccer — game logic
// ============================================================

const COLS       = 9;   // intersections wide  (0..8)
const ROWS       = 11;  // intersections tall  (0..10)
const GOAL_LEFT  = 3;   // goal mouth: columns 3-5
const GOAL_RIGHT = 5;
const SIDEBAR_W  = 210; // must match CSS #sidebar width

function edgeKey(ax, ay, bx, by) {
  if (ax > bx || (ax === bx && ay > by)) { [ax,ay,bx,by] = [bx,by,ax,ay]; }
  return `${ax},${ay}-${bx},${by}`;
}

const DIRS = [
  [-1,-1],[ 0,-1],[1,-1],
  [-1, 0],        [1, 0],
  [-1, 1],[ 0, 1],[1, 1]
];

class PaperSoccer {
  constructor() {
    this.canvas   = document.getElementById('field');
    this.ctx      = this.canvas.getContext('2d');
    this.scores   = [0, 0];
    this.timerSec = 0;
    this.timerInt = null;
    this.mode     = '2p';
    this.hoverNode = null;
    this._bindUI();
    this._resize();
    this.newGame();
    window.addEventListener('resize', () => { this._resize(); this._draw(); });
    document.addEventListener('fullscreenchange', () => { this._resize(); this._draw(); });
  }

  // ── Layout ────────────────────────────────────────────────
  _resize() {
    const pad  = 24;
    const availW = window.innerWidth  - SIDEBAR_W - pad * 2;
    const availH = window.innerHeight - pad * 2;
    const stepByW = Math.floor(availW / (COLS + 1));
    const stepByH = Math.floor(availH / (ROWS + 1));
    this.step = Math.max(28, Math.min(stepByW, stepByH));
    this.offX = this.step;
    this.offY = this.step;
    this.canvas.width  = this.step * (COLS - 1) + this.step * 2;
    this.canvas.height = this.step * (ROWS - 1) + this.step * 2;
  }

  cx(col) { return this.offX + col * this.step; }
  cy(row) { return this.offY + row * this.step; }

  // ── Wall edges (field border = already used edges) ────────
  _initWallEdges() {
    const add = (ax, ay, bx, by) =>
      this.usedEdges.set(edgeKey(ax, ay, bx, by), -1); // -1 = wall

    // Left and right walls
    for (let y = 0; y < ROWS - 1; y++) {
      add(0, y, 0, y + 1);
      add(COLS - 1, y, COLS - 1, y + 1);
    }
    // Top and bottom walls — skip goal gap (GOAL_LEFT..GOAL_RIGHT)
    for (let x = 0; x < COLS - 1; x++) {
      if (x >= GOAL_LEFT && x < GOAL_RIGHT) continue;
      add(x, 0, x + 1, 0);
      add(x, ROWS - 1, x + 1, ROWS - 1);
    }
  }

  // ── Game state ────────────────────────────────────────────
  newGame() {
    PokiSDK.gameLoadingStart();
    this.usedEdges    = new Map(); // edge key → player index (-1=wall, 0=J1, 1=J2)
    this._initWallEdges();
    this.visitedNodes = new Set();
    this.ball         = { x: 4, y: 5 };
    this.currentPlayer = 0;
    this.bounce       = false;
    this.history      = [];
    this.gameOver     = false;

    this.visitedNodes.add(`${this.ball.x},${this.ball.y}`);

    this._stopTimer();
    this.timerSec = 0;
    this._updateTimerDisplay();
    this._startTimer();
    this._updateUI();
    this._draw();
    this._hideMsgOverlay();
    PokiSDK.gameLoadingFinished();

    if (this.mode === 'ai' && this.currentPlayer === 1) {
      setTimeout(() => this._aiMove(), 400);
    }
  }

  // ── Move helpers ──────────────────────────────────────────
  _isInsideField(x, y) {
    return x >= 0 && x <= COLS - 1 && y >= 0 && y <= ROWS - 1;
  }

  _isBorderNode(x, y) {
    return x === 0 || x === COLS - 1 || y === 0 || y === ROWS - 1;
  }

  _validMoves(bx, by) {
    const moves = [];
    for (const [dx, dy] of DIRS) {
      const nx = bx + dx;
      const ny = by + dy;
      const inGoal = (ny === -1 || ny === ROWS) && nx >= GOAL_LEFT && nx <= GOAL_RIGHT;
      if (!this._isInsideField(nx, ny) && !inGoal) continue;
      // Empêche de couper le coin d'un poteau en diagonale
      if (inGoal && dx !== 0 && (nx === GOAL_LEFT || nx === GOAL_RIGHT)) continue;
      if (this.usedEdges.has(edgeKey(bx, by, nx, ny))) continue;
      moves.push({ x: nx, y: ny });
    }
    return moves;
  }

  // ── Move execution ────────────────────────────────────────
  _move(nx, ny) {
    if (this.gameOver) return;

    const bx  = this.ball.x;
    const by  = this.ball.y;
    const key = edgeKey(bx, by, nx, ny);

    this.history.push({
      ball: { ...this.ball },
      usedEdges: new Map(this.usedEdges),
      visitedNodes: new Set(this.visitedNodes),
      player: this.currentPlayer,
      bounce: this.bounce
    });

    this.usedEdges.set(key, this.currentPlayer);
    this.ball = { x: nx, y: ny };

    // Scoring
    if ((ny < 0 || ny >= ROWS) && nx >= GOAL_LEFT && nx <= GOAL_RIGHT) {
      const winner = ny <= 0 ? 0 : 1;
      this.scores[winner]++;
      this.gameOver = true;
      this._stopTimer();
      this._updateUI();
      this._draw();
      const name = winner === 0 ? 'Joueur 1' : (this.mode === 'ai' ? "L'IA" : 'Joueur 2');
      setTimeout(() => this._showMsgOverlay(`${name} marque !`), 300);
      return;
    }

    // Bounce rule: visited node OR border wall
    const nodeKey  = `${nx},${ny}`;
    const wasBounce = this.visitedNodes.has(nodeKey) || this._isBorderNode(nx, ny);
    this.visitedNodes.add(nodeKey);

    if (wasBounce) {
      this.bounce = true;
    } else {
      this.bounce = false;
      this.currentPlayer = 1 - this.currentPlayer;
    }

    // No moves available → current player loses
    if (this._validMoves(this.ball.x, this.ball.y).length === 0) {
      this.gameOver = true;
      this._stopTimer();
      const winner = 1 - this.currentPlayer;
      this.scores[winner]++;
      this._updateUI();
      this._draw();
      const name = winner === 0 ? 'Joueur 1' : (this.mode === 'ai' ? "L'IA" : 'Joueur 2');
      setTimeout(() => this._showMsgOverlay(`${name} gagne (adversaire bloqué) !`), 300);
      return;
    }

    this._updateUI();
    this._draw();

    if (this.mode === 'ai' && this.currentPlayer === 1 && !this.gameOver) {
      setTimeout(() => this._aiMove(), 450);
    }
  }

  // ── AI — Minimax avec alpha-bêta (profondeur 7) ──────────

  // Point d'entrée : choisit le meilleur coup et le joue
  _aiMove() {
    if (this.gameOver || this.currentPlayer !== 1) return;
    const moves = this._validMoves(this.ball.x, this.ball.y);
    if (moves.length === 0) return;

    // Coup gagnant immédiat → jouer sans chercher
    for (const m of moves) {
      if (m.y >= ROWS && m.x >= GOAL_LEFT && m.x <= GOAL_RIGHT) {
        this._move(m.x, m.y); return;
      }
    }

    // Un seul coup possible → jouer directement
    if (moves.length === 1) { this._move(moves[0].x, moves[0].y); return; }

    const DEPTH = 5;
    let bestScore = -Infinity;
    let bestMove  = moves[0];

    for (const m of this._aiOrderMoves(moves)) {
      const undo  = this._aiApply(m.x, m.y);
      const score = this._minimax(DEPTH - 1, -Infinity, Infinity);
      this._aiUndo(undo);
      if (score > bestScore) { bestScore = score; bestMove = m; }
    }

    this._move(bestMove.x, bestMove.y);
  }

  // Applique un coup sans copier la Map — retourne les infos pour annuler
  _aiApply(nx, ny) {
    const bx      = this.ball.x;
    const by      = this.ball.y;
    const key     = edgeKey(bx, by, nx, ny);
    const nodeKey = `${nx},${ny}`;
    const wasBounce  = this.visitedNodes.has(nodeKey) || this._isBorderNode(nx, ny);
    const nodeIsNew  = !this.visitedNodes.has(nodeKey);
    const prevPlayer = this.currentPlayer;

    this.usedEdges.set(key, this.currentPlayer);
    this.ball = { x: nx, y: ny };
    if (nodeIsNew) this.visitedNodes.add(nodeKey);
    if (!wasBounce) this.currentPlayer = 1 - this.currentPlayer;

    return { key, prevBall: { x: bx, y: by }, prevPlayer, nodeIsNew, nodeKey };
  }

  // Annule un coup appliqué par _aiApply
  _aiUndo({ key, prevBall, prevPlayer, nodeIsNew, nodeKey }) {
    this.ball = prevBall;
    this.usedEdges.delete(key);
    if (nodeIsNew) this.visitedNodes.delete(nodeKey);
    this.currentPlayer = prevPlayer;
  }

  // Minimax alpha-bêta
  _minimax(depth, alpha, beta) {
    const moves = this._validMoves(this.ball.x, this.ball.y);

    if (moves.length === 0) {
      // Joueur courant bloqué → il perd
      return this.currentPlayer === 1 ? -8000 : 8000;
    }

    if (depth === 0) return this._aiEval();

    const isMax = this.currentPlayer === 1;
    let best    = isMax ? -Infinity : Infinity;

    for (const m of this._aiOrderMoves(moves)) {
      // Détection coup gagnant direct
      if ((m.y < 0 || m.y >= ROWS) && m.x >= GOAL_LEFT && m.x <= GOAL_RIGHT) {
        const winner = m.y <= 0 ? 0 : 1;
        const val    = winner === 1 ? 8000 + depth : -8000 - depth;
        best  = isMax ? Math.max(best, val) : Math.min(best, val);
        alpha = isMax ? Math.max(alpha, best) : alpha;
        beta  = isMax ? beta : Math.min(beta, best);
        if (alpha >= beta) return best;
        continue;
      }

      const undo  = this._aiApply(m.x, m.y);
      const score = this._minimax(depth - 1, alpha, beta);
      this._aiUndo(undo);

      best  = isMax ? Math.max(best, score) : Math.min(best, score);
      alpha = isMax ? Math.max(alpha, best) : alpha;
      beta  = isMax ? beta : Math.min(beta, best);
      if (alpha >= beta) break;
    }

    return best;
  }

  // Tri des coups pour améliorer l'élagage alpha-bêta
  _aiOrderMoves(moves) {
    const isMax = this.currentPlayer === 1;
    return [...moves].sort((a, b) => {
      const rank = m => {
        let v = 0;
        // Coup gagnant en tête
        if ((m.y < 0 || m.y >= ROWS) && m.x >= GOAL_LEFT && m.x <= GOAL_RIGHT) return 10000;
        // Rebond (coup gratuit) = très précieux
        if (this.visitedNodes.has(`${m.x},${m.y}`) || this._isBorderNode(m.x, m.y)) v += 60;
        // Direction vers son but : AI veut y élevé, J1 veut y faible
        v += isMax ? m.y * 5 : (ROWS - 1 - m.y) * 5;
        // Préférer la colonne centrale
        v -= Math.abs(m.x - 4) * 2;
        // Proximité de la cage adverse
        if (isMax && m.y >= ROWS - 3 && m.x >= GOAL_LEFT && m.x <= GOAL_RIGHT) v += 40;
        if (!isMax && m.y <= 2 && m.x >= GOAL_LEFT && m.x <= GOAL_RIGHT) v += 40;
        return v;
      };
      return rank(b) - rank(a);
    });
  }

  // Fonction d'évaluation statique
  _aiEval() {
    const bx    = this.ball.x;
    const by    = this.ball.y;
    let   score = 0;

    // Position : AI (player 1) veut by élevé (vers ROWS), J1 veut by faible
    score += by * 6;

    // Colonne centrale
    score -= Math.abs(bx - 4) * 1.5;

    // Proximité cage adverse / propre cage
    if (by >= ROWS - 2 && bx >= GOAL_LEFT && bx <= GOAL_RIGHT) score += 60;
    if (by <= 1         && bx >= GOAL_LEFT && bx <= GOAL_RIGHT) score -= 60;

    // Mobilité du joueur courant (plus de coups = plus de contrôle)
    const mobility = this._validMoves(bx, by).length;
    score += this.currentPlayer === 1 ? mobility * 4 : -mobility * 4;

    // Bonus si balle sur nœud visité (rebond disponible = extra tour)
    if (this.visitedNodes.has(`${bx},${by}`) || this._isBorderNode(bx, by)) {
      score += this.currentPlayer === 1 ? 15 : -15;
    }

    return score;
  }

  // ── Input ─────────────────────────────────────────────────
  _onCanvasClick(e) {
    if (this.gameOver) return;
    if (this.mode === 'ai' && this.currentPlayer === 1) return;

    const rect = this.canvas.getBoundingClientRect();
    const col  = Math.round((e.clientX - rect.left  - this.offX) / this.step);
    const row  = Math.round((e.clientY - rect.top   - this.offY) / this.step);

    const hit = this._validMoves(this.ball.x, this.ball.y).find(m => m.x === col && m.y === row);
    if (hit) this._move(hit.x, hit.y);
  }

  _onCanvasHover(e) {
    const rect  = this.canvas.getBoundingClientRect();
    const col   = Math.round((e.clientX - rect.left  - this.offX) / this.step);
    const row   = Math.round((e.clientY - rect.top   - this.offY) / this.step);
    const valid = this._validMoves(this.ball.x, this.ball.y);
    this.hoverNode = valid.some(m => m.x === col && m.y === row) ? { x: col, y: row } : null;
    this._draw();
  }

  // ── Drawing ───────────────────────────────────────────────
  _draw() {
    const ctx  = this.ctx;
    const W    = this.canvas.width;
    const H    = this.canvas.height;
    const step = this.step;

    ctx.clearRect(0, 0, W, H);

    // Grass
    ctx.fillStyle = '#2d6a4f';
    ctx.fillRect(0, 0, W, H);
    for (let r = 0; r < ROWS - 1; r++) {
      ctx.fillStyle = r % 2 === 0 ? '#2d6a4fcc' : '#2a5f47cc';
      ctx.fillRect(this.cx(0), this.cy(r), this.cx(COLS-1) - this.cx(0), this.cy(r+1) - this.cy(r));
    }

    // Player edges (skip walls)
    ctx.lineWidth = 3;
    for (const [key, owner] of this.usedEdges) {
      if (owner === -1) continue;
      const parts = key.split('-');
      const [ax, ay] = parts[0].split(',').map(Number);
      const [bx, by] = parts[1].split(',').map(Number);
      ctx.strokeStyle  = owner === 0 ? '#4fc3f7dd' : '#ff5252dd';
      ctx.shadowColor  = owner === 0 ? '#4fc3f7'   : '#ff5252';
      ctx.shadowBlur   = 5;
      ctx.beginPath();
      ctx.moveTo(this.cx(ax), this.cy(ay));
      ctx.lineTo(this.cx(bx), this.cy(by));
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Field border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(this.cx(0),      this.cy(0));       ctx.lineTo(this.cx(GOAL_LEFT),  this.cy(0));
    ctx.moveTo(this.cx(GOAL_RIGHT), this.cy(0));   ctx.lineTo(this.cx(COLS-1),     this.cy(0));
    ctx.moveTo(this.cx(0),      this.cy(ROWS-1));  ctx.lineTo(this.cx(GOAL_LEFT),  this.cy(ROWS-1));
    ctx.moveTo(this.cx(GOAL_RIGHT), this.cy(ROWS-1)); ctx.lineTo(this.cx(COLS-1),  this.cy(ROWS-1));
    ctx.moveTo(this.cx(0),      this.cy(0));       ctx.lineTo(this.cx(0),          this.cy(ROWS-1));
    ctx.moveTo(this.cx(COLS-1), this.cy(0));       ctx.lineTo(this.cx(COLS-1),     this.cy(ROWS-1));
    ctx.stroke();

    // Goal boxes
    this._drawGoal(ctx, 'top');
    this._drawGoal(ctx, 'bottom');

    // Centre line + circle
    ctx.strokeStyle = '#ffffffaa';
    ctx.lineWidth   = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(this.cx(0), this.cy(5));
    ctx.lineTo(this.cx(COLS-1), this.cy(5));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(this.cx(4), this.cy(5), step * 1.5, 0, Math.PI * 2);
    ctx.stroke();

    // Grid dots
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const visited = this.visitedNodes.has(`${c},${r}`);
        ctx.beginPath();
        ctx.arc(this.cx(c), this.cy(r), visited ? 3.5 : 2, 0, Math.PI * 2);
        ctx.fillStyle = visited ? '#ffd54f88' : '#ffffff44';
        ctx.fill();
      }
    }

    // Valid move hints
    if (!this.gameOver) {
      const color  = this.currentPlayer === 0 ? '#4fc3f7' : '#ff5252';
      for (const m of this._validMoves(this.ball.x, this.ball.y)) {
        const isHover = this.hoverNode && this.hoverNode.x === m.x && this.hoverNode.y === m.y;
        ctx.beginPath();
        ctx.arc(this.cx(m.x), this.cy(m.y), isHover ? 9 : 6, 0, Math.PI * 2);
        ctx.fillStyle = isHover ? color + 'cc' : color + '44';
        ctx.fill();
        if (isHover) { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke(); }
      }
    }

    // Ball glow + body
    const bx = this.cx(this.ball.x);
    const by = this.cy(this.ball.y);
    const grd = ctx.createRadialGradient(bx, by, 0, bx, by, step * 0.7);
    grd.addColorStop(0, '#ffffff44');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(bx, by, step * 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bx, by, step * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(bx-3, by-4); ctx.lineTo(bx+3, by+4);
    ctx.moveTo(bx+3, by-4); ctx.lineTo(bx-3, by+4);
    ctx.stroke();
  }

  _drawGoal(ctx, side) {
    const row   = side === 'top' ? 0 : ROWS - 1;
    const dy    = side === 'top' ? -1 : 1;
    const gx1   = this.cx(GOAL_LEFT);
    const gx2   = this.cx(GOAL_RIGHT);
    const gy    = this.cy(row);
    const depth = this.step;

    // Goal box
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(gx1, gy);
    ctx.lineTo(gx1, gy + dy * depth);
    ctx.lineTo(gx2, gy + dy * depth);
    ctx.lineTo(gx2, gy);
    ctx.stroke();

    // Fill
    ctx.fillStyle = side === 'top' ? '#ff525222' : '#4fc3f722';
    ctx.fillRect(gx1, Math.min(gy, gy + dy * depth), gx2 - gx1, depth);

    // Label
    ctx.font      = `bold ${Math.floor(this.step * 0.35)}px Segoe UI`;
    ctx.fillStyle = side === 'top' ? '#ff5252cc' : '#4fc3f7cc';
    ctx.textAlign = 'center';
    const label   = side === 'top' ? (this.mode === 'ai' ? 'But IA' : 'But J2') : 'But J1';
    ctx.fillText(label, (gx1 + gx2) / 2, gy + dy * depth * 0.6);
  }

  // ── UI helpers ────────────────────────────────────────────
  _updateUI() {
    const p      = this.currentPlayer;
    const j2name = this.mode === 'ai' ? 'IA' : 'Joueur 2';

    document.getElementById('player-dot').className  = p === 0 ? '' : 'j2';
    document.getElementById('player-name').textContent = p === 0 ? 'Tour du Joueur 1' : `Tour du ${j2name}`;
    document.getElementById('bounce-info').textContent  = this.bounce ? '↩ rebond — rejouez !' : '';
    document.getElementById('score-j1').textContent    = this.scores[0];
    document.getElementById('score-j2').textContent    = this.scores[1];
    document.getElementById('j2-label').textContent    = j2name;
  }

  _showMsgOverlay(msg) {
    PokiSDK.commercialBreak().then(() => {
      document.getElementById('message-text').textContent = msg;
      document.getElementById('message-overlay').classList.remove('hidden');
    });
  }
  _hideMsgOverlay() {
    document.getElementById('message-overlay').classList.add('hidden');
  }

  // ── Timer ─────────────────────────────────────────────────
  _startTimer() {
    this.timerInt = setInterval(() => {
      this.timerSec++;
      this._updateTimerDisplay();
    }, 1000);
  }
  _stopTimer() { clearInterval(this.timerInt); }
  _updateTimerDisplay() {
    const m = String(Math.floor(this.timerSec / 60)).padStart(2, '0');
    const s = String(this.timerSec % 60).padStart(2, '0');
    document.getElementById('timer').textContent = `${m}:${s}`;
  }

  // ── Undo ──────────────────────────────────────────────────
  _undo() {
    if (this.gameOver || this.history.length === 0) return;
    let snap;
    do {
      snap = this.history.pop();
      if (!snap) return;
    } while (this.mode === 'ai' && snap.player === 1 && this.history.length > 0);

    this.ball          = { ...snap.ball };
    this.usedEdges     = new Map(snap.usedEdges);
    this.visitedNodes  = new Set(snap.visitedNodes);
    this.currentPlayer = snap.player;
    this.bounce        = snap.bounce;
    this._updateUI();
    this._draw();
  }

  // ── Fullscreen ────────────────────────────────────────────
  _toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  }

  // ── Event binding ─────────────────────────────────────────
  _bindUI() {
    this.canvas.addEventListener('click',      e => this._onCanvasClick(e));
    this.canvas.addEventListener('mousemove',  e => this._onCanvasHover(e));
    this.canvas.addEventListener('mouseleave', () => { this.hoverNode = null; this._draw(); });

    document.getElementById('btn-restart').addEventListener('click',    () => this.newGame());
    document.getElementById('btn-undo').addEventListener('click',       () => this._undo());
    document.getElementById('btn-fullscreen').addEventListener('click', () => this._toggleFullscreen());
    document.getElementById('btn-message-ok').addEventListener('click', () => {
      this._hideMsgOverlay(); this.newGame();
    });

    document.querySelectorAll('input[name="mode"]').forEach(r => {
      r.addEventListener('change', e => { this.mode = e.target.value; this.newGame(); });
    });
  }
}

window.addEventListener('DOMContentLoaded', () => { window.game = new PaperSoccer(); });
