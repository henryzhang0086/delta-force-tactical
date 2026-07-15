/* 程序化音效（WebAudio，无需素材文件） */
(function (DF) {
  'use strict';

  function Audio() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
  }

  Audio.prototype.ensure = function () {
    if (this.ctx) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.enabled = false; }
  };

  Audio.prototype.resume = function () {
    this.ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  };

  // 基础音块
  Audio.prototype._blip = function (freq, dur, type, gain, sweep) {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    var t = this.ctx.currentTime;
    var o = this.ctx.createOscillator();
    var g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (sweep) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * sweep), t + dur);
    g.gain.setValueAtTime(gain || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur);
  };

  // 噪声（枪响质感）
  Audio.prototype._noise = function (dur, gain, cutoff) {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    var t = this.ctx.currentTime;
    var n = Math.floor(this.ctx.sampleRate * dur);
    var buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = this.ctx.createBufferSource(); src.buffer = buf;
    var f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff || 1800;
    var g = this.ctx.createGain(); g.gain.value = gain || 0.3;
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur);
  };

  Audio.prototype.shot = function (category) {
    var tone = (DF.WEAPON_TONE && DF.WEAPON_TONE[category]) || 220;
    this._noise(0.10, 0.28, 1400 + tone);
    this._blip(tone, 0.06, 'sawtooth', 0.14, 0.4);
  };
  Audio.prototype.reload   = function () { this._blip(180, 0.05, 'square', 0.15); setTimeout(function(){}, 0); };
  Audio.prototype.hit      = function () { this._blip(600, 0.05, 'square', 0.18, 1.4); };
  Audio.prototype.headshot = function () { this._blip(900, 0.08, 'square', 0.22, 1.6); };
  Audio.prototype.hurt     = function () { this._blip(140, 0.14, 'sawtooth', 0.22, 0.6); };
  Audio.prototype.death    = function () { this._noise(0.25, 0.3, 700); this._blip(120, 0.3, 'sawtooth', 0.2, 0.4); };
  Audio.prototype.knife    = function () { this._noise(0.06, 0.25, 5000); };
  Audio.prototype.click    = function () { this._blip(500, 0.03, 'square', 0.12); };
  Audio.prototype.buy      = function () { this._blip(440, 0.05, 'triangle', 0.2); this._blip(660, 0.06, 'triangle', 0.18); };
  Audio.prototype.win      = function () { var s=this; [523,659,784,1046].forEach(function(f,i){ setTimeout(function(){ s._blip(f,0.18,'triangle',0.25);}, i*120);}); };
  Audio.prototype.lose     = function () { var s=this; [392,330,262].forEach(function(f,i){ setTimeout(function(){ s._blip(f,0.22,'sawtooth',0.2);}, i*150);}); };
  Audio.prototype.decrypt  = function () { this._blip(880, 0.04, 'square', 0.1); };

  DF.Audio = Audio;
})(window.DF = window.DF || {});
