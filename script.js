'use strict';

(function () {
  function Game() {
    this.N = 4;
    this.START_MIN = 1;
    this.START_MAX = 3;
    this.ADD_MIN = 1;
    this.ADD_MAX = 2;
    this.MAX_H = 100;

    this.gridNode = document.getElementById('boardGrid');
    this.scoreNode = document.getElementById('scoreVal');
    this.bestNode = document.getElementById('bestVal');
    this.undoBtn = document.getElementById('undoBtn');
    this.newBtn = document.getElementById('newBtn');
    this.leadersBtn = document.getElementById('leadersBtn');
    this.overlayGO = document.getElementById('overlayGameOver');
    this.goMsg = document.getElementById('gameOverMsg');
    this.nameInput = document.getElementById('nameInput');
    this.restartBtn = document.getElementById('restartBtn');
    this.savedNote = document.getElementById('savedNote');
    this.wrap = document.getElementById('wrapBoard');
    this.mobileNav = document.getElementById('mobileNav');
    this.leadersModal = document.getElementById('leadersModal');
    this.leadersBody = document.getElementById('leadersBody');
    this.closeLeadersBtn = document.getElementById('closeLeadersBtn');
    this.clearLeadersBtn = document.getElementById('clearLeadersBtn');

    this.field = [];
    this.pts = 0;
    this.best = 0;
    this.hist = [];
    this.over = false;
    this.leaderSaved = false;
    this.lastDir = null;
    this.lastWasMove = false;

    this.tStartX = 0;
    this.tStartY = 0;
    this.pStartX = null;
    this.pStartY = null;

    this._bindMethods();
  }

  Game.prototype._bindMethods = function () {
    this.onKey = this.onKey.bind(this);
    this.doMove = this.doMove.bind(this);
    this.undoAction = this.undoAction.bind(this);
    this.startNew = this.startNew.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
  };

  Game.prototype.exists = function (el) {
    return !!el;
  };

  Game.prototype.cloneField = function (f) {
    var res = [];
    for (var i = 0; i < f.length; i++) {
      res.push(f[i].slice());
    }
    return res;
  };

  Game.prototype.validField = function (obj) {
    if (!Array.isArray(obj) || obj.length !== this.N) {
      return false;
    }
    for (var r = 0; r < this.N; r++) {
      if (!Array.isArray(obj[r]) || obj[r].length !== this.N) {
        return false;
      }
      for (var c = 0; c < this.N; c++) {
        if (typeof obj[r][c] !== 'number' || !Number.isFinite(obj[r][c])) {
          return false;
        }
      }
    }
    return true;
  };

  Game.prototype.persist = function () {
    try {
      var payload = {
        field: this.field,
        pts: this.pts,
        hist: this.hist,
        best: this.best
      };
      localStorage.setItem('gameState', JSON.stringify(payload));
    } catch (e) {
    }
  };

  Game.prototype.load = function () {
    try {
      var s = localStorage.getItem('gameState');
      if (!s) {
        return false;
      }
      var obj = JSON.parse(s);
      if (!obj || !this.validField(obj.field)) {
        return false;
      }
      this.field = obj.field;
      this.pts = typeof obj.pts === 'number' ? obj.pts : 0;
      this.hist = Array.isArray(obj.hist) ? obj.hist : [];
      var bs = Number(localStorage.getItem('bestScore') || '0');
      this.best = typeof obj.best === 'number' ? obj.best : (isNaN(bs) ? 0 : bs);
      return true;
    } catch (e) {
      return false;
    }
  };

  Game.prototype.loadBest = function () {
    var b = Number(localStorage.getItem('bestScore') || '0');
    if (isNaN(b)) {
      this.best = 0;
    } else {
      this.best = b;
    }
    if (this.exists(this.bestNode)) {
      this.bestNode.textContent = this.best;
    }
  };

  Game.prototype.buildGrid = function () {
    if (!this.exists(this.gridNode)) {
      return;
    }
    while (this.gridNode.firstChild) {
      this.gridNode.removeChild(this.gridNode.firstChild);
    }
    for (var r = 0; r < this.N; r++) {
      for (var c = 0; c < this.N; c++) {
        var cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);
        this.gridNode.appendChild(cell);
      }
    }
    var wrap = this.gridNode.querySelector('.tile-container');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'tile-container';
      this.gridNode.appendChild(wrap);
    } else {
      while (wrap.firstChild) {
        wrap.removeChild(wrap.firstChild);
      }
    }
  };

  Game.prototype.getEmpty = function () {
    var res = [];
    for (var r = 0; r < this.N; r++) {
      for (var c = 0; c < this.N; c++) {
        if (this.field[r][c] === 0) {
          res.push({ r: r, c: c });
        }
      }
    }
    return res;
  };

  Game.prototype.addRandom = function (count) {
    var empty = this.getEmpty();
    if (!empty.length) {
      return [];
    }
    var toAdd = count;
    if (toAdd > empty.length) {
      toAdd = empty.length;
    }
    var added = [];
    for (var i = 0; i < toAdd; i++) {
      var idx = Math.floor(Math.random() * empty.length);
      var pos = empty.splice(idx, 1)[0];
      var rr = Math.random();
      if (rr < 0.9) {
        this.field[pos.r][pos.c] = 2;
      } else {
        this.field[pos.r][pos.c] = 4;
      }
      added.push({ r: pos.r, c: pos.c });
    }
    return added;
  };

  Game.prototype.compressLine = function (arr) {
    var a = [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] !== 0) {
        a.push(arr[i]);
      }
    }
    while (a.length < this.N) {
      a.push(0);
    }
    return a;
  };

  Game.prototype.mergeLine = function (line) {
    var gained = 0;
    var arr = this.compressLine(line);
    var cont = true;
    while (cont) {
      cont = false;
      for (var i = 0; i < this.N - 1; i++) {
        if (arr[i] !== 0 && arr[i] === arr[i + 1]) {
          arr[i] = arr[i] * 2;
          arr[i + 1] = 0;
          gained += arr[i];
          cont = true;
        }
      }
      if (cont) {
        arr = this.compressLine(arr);
      }
    }
    return { arr: arr, gained: gained };
  };

  Game.prototype.eqArr = function (a, b) {
    if (a.length !== b.length) {
      return false;
    }
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  };

  Game.prototype.moveLeft = function () {
    var moved = false;
    var gained = 0;
    for (var r = 0; r < this.N; r++) {
      var old = this.field[r].slice();
      var res = this.mergeLine(old.slice());
      this.field[r] = res.arr;
      if (!this.eqArr(old, this.field[r])) {
        moved = true;
      }
      gained += res.gained;
    }
    return { moved: moved, gained: gained };
  };

  Game.prototype.moveRight = function () {
    var moved = false;
    var gained = 0;
    for (var r = 0; r < this.N; r++) {
      var old = this.field[r].slice();
      var rev = old.slice().reverse();
      var res = this.mergeLine(rev);
      this.field[r] = res.arr.reverse();
      if (!this.eqArr(old, this.field[r])) {
        moved = true;
      }
      gained += res.gained;
    }
    return { moved: moved, gained: gained };
  };

  Game.prototype.moveUp = function () {
    var moved = false;
    var gained = 0;
    for (var c = 0; c < this.N; c++) {
      var col = [];
      for (var rr = 0; rr < this.N; rr++) {
        col.push(this.field[rr][c]);
      }
      var res = this.mergeLine(col);
      for (var r2 = 0; r2 < this.N; r2++) {
        this.field[r2][c] = res.arr[r2];
      }
      if (!this.eqArr(col, res.arr)) {
        moved = true;
      }
      gained += res.gained;
    }
    return { moved: moved, gained: gained };
  };

  Game.prototype.moveDown = function () {
    var moved = false;
    var gained = 0;
    for (var c = 0; c < this.N; c++) {
      var col = [];
      for (var rr2 = 0; rr2 < this.N; rr2++) {
        col.push(this.field[rr2][c]);
      }
      var rev = col.slice().reverse();
      var res = this.mergeLine(rev);
      var fin = res.arr.reverse();
      for (var r3 = 0; r3 < this.N; r3++) {
        this.field[r3][c] = fin[r3];
      }
      if (!this.eqArr(col, fin)) {
        moved = true;
      }
      gained += res.gained;
    }
    return { moved: moved, gained: gained };
  };

  Game.prototype.render = function (passed, added) {
    if (typeof added === 'undefined' || added === null) {
      added = [];
    }
    var wrap = this.gridNode.querySelector('.tile-container');
    if (!wrap) {
      return;
    }
    var tiles;
    if (Array.isArray(passed)) {
      tiles = passed;
    } else {
      tiles = [];
      for (var r = 0; r < this.N; r++) {
        for (var c = 0; c < this.N; c++) {
          var v = this.field[r][c];
          if (v !== 0) {
            var isNew = false;
            for (var k = 0; k < added.length; k++) {
              if (added[k].r === r && added[k].c === c) {
                isNew = true;
                break;
              }
            }
            tiles.push({ v: v, r: r, c: c, isNew: isNew, merged: false });
          }
        }
      }
    }

    while (wrap.firstChild) {
      wrap.removeChild(wrap.firstChild);
    }

    var cell = this.gridNode.querySelector('.cell');
    var gStyle = getComputedStyle(this.gridNode);
    var gap = parseFloat(gStyle.getPropertyValue('gap'));
    if (isNaN(gap)) {
      gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 0;
    }
    var padLeft = parseFloat(gStyle.paddingLeft) || 0;
    var padTop = parseFloat(gStyle.paddingTop) || 0;
    var w = cell ? cell.getBoundingClientRect().width : (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tile-size')) || 88);
    var h = cell ? cell.getBoundingClientRect().height : w;
    var stepX = w + gap;
    var stepY = h + gap;

    for (var tI = 0; tI < tiles.length; tI++) {
      (function () {
        var t = tiles[tI];
        var el = document.createElement('div');
        el.className = 'tile tile-' + t.v;
        var inner = document.createElement('div');
        inner.className = 'tile-inner';
        inner.textContent = t.v;
        el.appendChild(inner);
        el.style.position = 'absolute';
        el.style.left = padLeft + t.c * stepX + 'px';
        el.style.top = padTop + t.r * stepY + 'px';
        el.style.width = w + 'px';
        el.style.height = h + 'px';
        el.style.transform = 'translate(0,0)';
        if (t.isNew) {
          el.classList.add('tile-new');
        }
        if (t.merged) {
          el.classList.add('tile-merged');
        }
        if (this.lastWasMove && this.lastDir && !t.isNew && !t.merged) {
          if (this.lastDir === 'left') {
            el.style.transform = 'translateX(' + stepX + 'px)';
          } else if (this.lastDir === 'right') {
            el.style.transform = 'translateX(' + (-stepX) + 'px)';
          } else if (this.lastDir === 'up') {
            el.style.transform = 'translateY(' + stepY + 'px)';
          } else if (this.lastDir === 'down') {
            el.style.transform = 'translateY(' + (-stepY) + 'px)';
          }
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              el.style.transform = 'translate(0,0)';
            });
          });
        }
        el.addEventListener('animationend', function () {
          el.classList.remove('tile-new');
          el.classList.remove('tile-merged');
        });
        wrap.appendChild(el);
      }).call(this);
    }

    if (this.exists(this.scoreNode)) {
      this.scoreNode.textContent = String(this.pts || 0);
    }
    if (this.exists(this.bestNode)) {
      this.bestNode.textContent = String(this.best || 0);
    }
  };

  Game.prototype.doMove = function (dir) {
    if (this.over) {
      return;
    }
    try {
      this.hist.push({ field: this.cloneField(this.field), pts: this.pts });
    } catch (e) { }
    if (this.hist.length > this.MAX_H) {
      this.hist.shift();
    }

    var res;
    if (dir === 'left') {
      res = this.moveLeft();
    } else if (dir === 'right') {
      res = this.moveRight();
    } else if (dir === 'up') {
      res = this.moveUp();
    } else if (dir === 'down') {
      res = this.moveDown();
    } else {
      return;
    }

    this.lastDir = dir;
    this.lastWasMove = !!res.moved;

    if (!res.moved) {
      this.hist.pop();
      this.checkOver();
      this.lastDir = null;
      this.lastWasMove = false;
      return;
    }

    this.pts += res.gained;

    var toAdd = Math.floor(Math.random() * (this.ADD_MAX - this.ADD_MIN + 1)) + this.ADD_MIN;
    var added = this.addRandom(toAdd);

    if (this.pts > this.best) {
      this.best = this.pts;
      try {
        localStorage.setItem('bestScore', String(this.best));
      } catch (e) { }
    }

    this.persist();
    this.render(null, added);
    this.checkOver();

    var self = this;
    setTimeout(function () {
      self.lastDir = null;
      self.lastWasMove = false;
    }, 300);
  };

  Game.prototype.onKey = function (e) {
    if (this.over) {
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.doMove('left');
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.doMove('right');
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.doMove('up');
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.doMove('down');
      return;
    }
  };

  Game.prototype.undoAction = function () {
    if (this.over) {
      return;
    }
    var prev = this.hist.pop();
    if (!prev) {
      return;
    }
    this.field = this.cloneField(prev.field);
    this.pts = prev.pts;

    var allPts = [];
    var i;
    for (i = 0; i < this.hist.length; i++) {
      if (typeof this.hist[i].pts === 'number') {
        allPts.push(this.hist[i].pts);
      }
    }
    if (typeof this.pts === 'number') {
      allPts.push(this.pts);
    }

    var recalc;
    if (allPts.length > 0) {
      recalc = allPts[0];
      for (i = 1; i < allPts.length; i++) {
        if (allPts[i] > recalc) {
          recalc = allPts[i];
        }
      }
    } else {
      recalc = this.pts;
    }

    if (this.best !== recalc) {
      this.best = recalc;
      try {
        localStorage.setItem('bestScore', String(this.best));
      } catch (e) { }
    }

    this.render();
    if (this.exists(this.bestNode)) {
      this.bestNode.textContent = String(this.best);
    }
    this.persist();
  };

  Game.prototype.hasMoves = function () {
    for (var r = 0; r < this.N; r++) {
      for (var c = 0; c < this.N; c++) {
        var v = this.field[r][c];
        if (v === 0) {
          return true;
        }
        if (c + 1 < this.N && this.field[r][c + 1] === v) {
          return true;
        }
        if (r + 1 < this.N && this.field[r + 1][c] === v) {
          return true;
        }
      }
    }
    return false;
  };

  Game.prototype.saveLeader = function (name) {
    try {
      var raw = localStorage.getItem('leaders') || '[]';
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) {
        arr = [];
      }
      arr.push({ name: name || 'Аноним', score: this.pts, date: new Date().toLocaleString() });
      arr.sort(function (a, b) {
        if (a.score < b.score) return 1;
        if (a.score > b.score) return -1;
        return 0;
      });
      if (arr.length > 10) {
        arr = arr.slice(0, 10);
      }
      localStorage.setItem('leaders', JSON.stringify(arr));
      this.refreshLeaders();
      if (this.exists(this.savedNote)) {
        this.savedNote.classList.remove('hidden');
      }
    } catch (e) { }
  };

  Game.prototype.autoSaveLeader = function () {
    if (this.leaderSaved) {
      return;
    }
    var nm = '';
    if (this.nameInput && this.nameInput.value) {
      nm = this.nameInput.value.trim();
    } else {
      nm = '';
    }
    this.saveLeader(nm || 'Аноним');
    this.leaderSaved = true;
  };

  Game.prototype.refreshLeaders = function () {
    if (!this.exists(this.leadersBody)) {
      return;
    }
    while (this.leadersBody.firstChild) {
      this.leadersBody.removeChild(this.leadersBody.firstChild);
    }
    try {
      var arr2 = JSON.parse(localStorage.getItem('leaders') || '[]') || [];
      for (var i2 = 0; i2 < arr2.length; i2++) {
        var it = arr2[i2];
        var tr = document.createElement('tr');
        var td1 = document.createElement('td');
        td1.textContent = String(i2 + 1);
        tr.appendChild(td1);
        var td2 = document.createElement('td');
        td2.textContent = it.name;
        tr.appendChild(td2);
        var td3 = document.createElement('td');
        td3.textContent = String(it.score);
        tr.appendChild(td3);
        var td4 = document.createElement('td');
        td4.textContent = it.date;
        tr.appendChild(td4);
        this.leadersBody.appendChild(tr);
      }
    } catch (e) { }
  };

  Game.prototype.clearLeaders = function () {
    try {
      localStorage.removeItem('leaders');
    } catch (e) { }
    this.refreshLeaders();
  };

  Game.prototype.showMobileIfNeeded = function () {
    if (!this.exists(this.mobileNav)) {
      return;
    }
    var mq = window.matchMedia('(max-width:520px)').matches;
    if (mq && !this.over) {
      this.mobileNav.classList.remove('hidden');
      this.mobileNav.setAttribute('aria-hidden', 'false');
    } else {
      this.mobileNav.classList.add('hidden');
      this.mobileNav.setAttribute('aria-hidden', 'true');
    }
  };

  Game.prototype.initMobileBtns = function () {
    if (!this.exists(this.mobileNav)) {
      return;
    }
    var self = this;
    this.mobileNav.addEventListener('click', function (ev) {
      var target = ev.target;
      while (target && target !== self.mobileNav && (!target.hasAttribute || !target.hasAttribute('data-dir'))) {
        target = target.parentNode;
      }
      if (!target || target === self.mobileNav) {
        return;
      }
      var dir = target.getAttribute('data-dir');
      self.doMove(dir);
    });
  };

  Game.prototype.onTouchStart = function (e) {
    var t = e.touches ? e.touches[0] : e;
    this.tStartX = t.clientX;
    this.tStartY = t.clientY;
  };

  Game.prototype.onTouchEnd = function (e) {
    var t = (e.changedTouches && e.changedTouches[0]) || e;
    var dx = t.clientX - this.tStartX;
    var dy = t.clientY - this.tStartY;
    var ax = Math.abs(dx);
    var ay = Math.abs(dy);
    if (Math.max(ax, ay) < 20) {
      return;
    }
    if (ax > ay) {
      if (dx > 0) {
        this.doMove('right');
      } else {
        this.doMove('left');
      }
    } else {
      if (dy > 0) {
        this.doMove('down');
      } else {
        this.doMove('up');
      }
    }
  };

  Game.prototype.onPointerDown = function (e) {
    this.pStartX = e.clientX;
    this.pStartY = e.clientY;
    try {
      if (this.wrap && this.wrap.setPointerCapture) {
        this.wrap.setPointerCapture(e.pointerId);
      }
    } catch (err) { }
  };

  Game.prototype.onPointerUp = function (e) {
    if (this.pStartX === null) {
      return;
    }
    var dx = e.clientX - this.pStartX;
    var dy = e.clientY - this.pStartY;
    this.pStartX = null;
    this.pStartY = null;
    var ax = Math.abs(dx);
    var ay = Math.abs(dy);
    if (Math.max(ax, ay) < 10) {
      return;
    }
    if (ax > ay) {
      if (dx > 0) {
        this.doMove('right');
      } else {
        this.doMove('left');
      }
    } else {
      if (dy > 0) {
        this.doMove('down');
      } else {
        this.doMove('up');
      }
    }
  };

  Game.prototype.showGameOver = function () {
    if (!this.exists(this.overlayGO)) {
      return;
    }
    this.overlayGO.classList.remove('hidden');
    this.overlayGO.style.display = '';
    this.overlayGO.setAttribute('aria-hidden', 'false');
    if (this.exists(this.mobileNav)) {
      this.mobileNav.classList.add('hidden');
      this.mobileNav.setAttribute('aria-hidden', 'true');
    }
    if (this.exists(this.goMsg)) {
      this.goMsg.textContent = 'Игра окончена. Ваш счёт: ' + this.pts;
    }
  };

  Game.prototype.checkOver = function () {
    if (this.over) {
      return;
    }
    if (this.hasMoves()) {
      return;
    }
    this.over = true;
    this.showGameOver();
  };

  Game.prototype.startNew = function (resetHistory) {
    if (typeof resetHistory === 'undefined') {
      resetHistory = true;
    }
    if (this.over) {
      this.autoSaveLeader();
    }
    if (this.overlayGO) {
      this.overlayGO.classList.add('hidden');
    }
    if (this.leadersModal) {
      this.leadersModal.classList.add('hidden');
    }
    this.field = [];
    for (var r = 0; r < this.N; r++) {
      var row = [];
      for (var c = 0; c < this.N; c++) {
        row.push(0);
      }
      this.field.push(row);
    }
    var diff = this.START_MAX - this.START_MIN + 1;
    var rand = Math.floor(Math.random() * diff);
    var startCount = this.START_MIN + rand;
    var initial = this.addRandom(startCount);
    this.pts = 0;
    this.hist = [];
    this.over = false;
    this.leaderSaved = false;
    if (this.exists(this.nameInput)) {
      this.nameInput.value = '';
    }
    if (this.savedNote) {
      this.savedNote.classList.add('hidden');
    }
    this.render(null, initial);
    if (resetHistory) {
      this.persist();
    }
    this.showMobileIfNeeded();
  };

  Game.prototype.attach = function () {
    if (this.exists(document)) {
      document.addEventListener('keydown', this.onKey);
    }
    if (this.exists(this.undoBtn)) {
      this.undoBtn.addEventListener('click', this.undoAction);
    }
    var top = document.querySelector('.hdr-bar');
    if (top) {
      top.style.position = 'relative';
      top.style.zIndex = '1000';
    }
    var self = this;
    if (this.exists(this.newBtn)) {
      this.newBtn.addEventListener('click', function () {
        if (self.over) {
          self.autoSaveLeader();
        }
        if (self.overlayGO) {
          self.overlayGO.classList.add('hidden');
        }
        if (self.leadersModal) {
          self.leadersModal.classList.add('hidden');
        }
        self.startNew(true);
      }, true);
      this.newBtn.addEventListener('pointerdown', function () {
        if (self.over) {
          self.autoSaveLeader();
        }
        if (self.overlayGO) {
          self.overlayGO.classList.add('hidden');
        }
        if (self.leadersModal) {
          self.leadersModal.classList.add('hidden');
        }
        self.startNew(true);
      });
    }
    if (this.exists(this.leadersBtn)) {
      this.leadersBtn.addEventListener('click', function () {
        self.refreshLeaders();
        if (self.leadersModal) {
          self.leadersModal.classList.remove('hidden');
        }
        if (self.mobileNav) {
          self.mobileNav.classList.add('hidden');
        }
      });
    }
    if (this.exists(this.restartBtn)) {
      this.restartBtn.addEventListener('click', function () {
        if (self.over) {
          self.autoSaveLeader();
        }
        if (self.overlayGO) {
          self.overlayGO.classList.add('hidden');
        }
        self.startNew(true);
      });
      this.restartBtn.addEventListener('pointerdown', function () {
        if (self.over) {
          self.autoSaveLeader();
        }
        if (self.overlayGO) {
          self.overlayGO.classList.add('hidden');
        }
        self.startNew(true);
      });
    }
    if (this.exists(this.closeLeadersBtn)) {
      this.closeLeadersBtn.addEventListener('click', function () {
        if (self.leadersModal) {
          self.leadersModal.classList.add('hidden');
        }
      });
    }
    if (this.exists(this.clearLeadersBtn)) {
      this.clearLeadersBtn.addEventListener('click', function () {
        self.clearLeaders();
      });
    }
    this.initMobileBtns();
    window.addEventListener('resize', function () {
      self.showMobileIfNeeded();
    });
    if (this.exists(this.wrap)) {
      this.wrap.addEventListener('touchstart', this.onTouchStart, { passive: true });
      this.wrap.addEventListener('touchend', this.onTouchEnd, { passive: true });
      this.wrap.addEventListener('pointerdown', this.onPointerDown);
      this.wrap.addEventListener('pointerup', this.onPointerUp);
    }
    if (this.exists(this.overlayGO)) {
      this.overlayGO.addEventListener('click', function (ev) {
        if (ev.target === self.overlayGO) {
          self.overlayGO.classList.add('hidden');
        }
      });
    }
    if (this.exists(this.leadersModal)) {
      this.leadersModal.addEventListener('click', function (ev) {
        if (ev.target === self.leadersModal) {
          self.leadersModal.classList.add('hidden');
        }
      });
    }
    if (this.exists(this.nameInput)) {
      this.nameInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          self.autoSaveLeader();
          if (self.savedNote) {
            self.savedNote.classList.remove('hidden');
          }
        }
      });
    }
  };

  Game.prototype.boot = function () {
    this.buildGrid();
    this.attach();
    this.loadBest();
    this.showMobileIfNeeded();
    var loaded = this.load();
    if (!loaded || !this.validField(this.field)) {
      this.startNew(true);
    } else {
      this.render();
      this.over = !this.hasMoves();
      if (this.over) {
        this.showGameOver();
      }
    }
  };

  var game = new Game();
  game.boot();
})();
