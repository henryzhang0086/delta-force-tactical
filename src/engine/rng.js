/* 可复现伪随机数（mulberry32） */
(function (DF) {
  'use strict';

  function RNG(seed) {
    this.s = (seed >>> 0) || 0x9e3779b9;
  }
  RNG.prototype.next = function () {
    var t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  RNG.prototype.range  = function (lo, hi) { return lo + (hi - lo) * this.next(); };
  RNG.prototype.int    = function (lo, hi) { return Math.floor(this.range(lo, hi + 1)); };
  RNG.prototype.pick   = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  RNG.prototype.chance = function (p) { return this.next() < p; };
  RNG.prototype.sign   = function () { return this.next() < 0.5 ? -1 : 1; };

  DF.RNG = RNG;
})(typeof window !== 'undefined' ? (window.DF = window.DF || {}) : (module.exports = {}));
