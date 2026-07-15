/* 键鼠输入管理 */
(function (DF) {
  'use strict';

  function Input(canvas) {
    this.canvas = canvas;
    this.keys = {};          // 当前按下
    this.pressed = {};       // 本帧刚按下（消费型）
    this.mouse = { x: 0, y: 0, worldX: 0, worldY: 0 };
    this.mouseDown = false;
    this.mouseClicked = false;
    this._bind();
  }

  Input.prototype._bind = function () {
    var self = this;
    window.addEventListener('keydown', function (e) {
      var k = e.key.toLowerCase();
      if (!self.keys[k]) self.pressed[k] = true;
      self.keys[k] = true;
      // 阻止空格/方向键滚动页面
      if ([' ', 'tab'].indexOf(k) >= 0) e.preventDefault();
    });
    window.addEventListener('keyup', function (e) {
      self.keys[e.key.toLowerCase()] = false;
    });
    function updateCoords(e) {
      var r = self.canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      self.mouse.x = (e.clientX - r.left) * (self.canvas.width / r.width);
      self.mouse.y = (e.clientY - r.top) * (self.canvas.height / r.height);
    }
    // 绑定到 window（而非仅 canvas），避免任何布局/命中测试问题导致点击丢失
    window.addEventListener('mousemove', updateCoords);
    window.addEventListener('mousedown', function (e) {
      if (e.button === 0) { updateCoords(e); self.mouseDown = true; self.mouseClicked = true; }
    });
    window.addEventListener('mouseup', function (e) {
      if (e.button === 0) self.mouseDown = false;
    });
    this.canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };

  Input.prototype.down = function (k) { return !!this.keys[k]; };
  Input.prototype.justPressed = function (k) { return !!this.pressed[k]; };
  Input.prototype.justClicked = function () { return this.mouseClicked; };

  // 每帧末尾调用，清空消费型状态
  Input.prototype.endFrame = function () {
    this.pressed = {};
    this.mouseClicked = false;
  };

  DF.Input = Input;
})(window.DF = window.DF || {});
