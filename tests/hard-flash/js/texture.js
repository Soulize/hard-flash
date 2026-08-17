/* =====================================================================
 * 中国象棋 · 素材/纹理加载 (texture.js)
 * 在线素材：loremflickr（Flickr 真实木纹照片，CORS 开放，1 周缓存）
 * 离线降级：程序化木纹（renderer 内置绘制），保证无网络也美观可用
 * ===================================================================== */
(function (global) {
  'use strict';
  const XQ = (global.XQ = global.XQ || {});

  const URLS = {
    board: 'https://loremflickr.com/640/700/wood,texture,wallpaper',
    panel: 'https://loremflickr.com/900/600/wood,planks,dark'
  };

  function loadImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  XQ.texture = {
    boardImg: null,
    panelImg: null,
    ready: false,
    online: false,
    /** 初始化纹理：并行加载两张在线图片，失败静默降级 */
    init() {
      return Promise.all([
        loadImage(URLS.board).then((img) => { this.boardImg = img; return !!img; }),
        loadImage(URLS.panel).then((img) => { this.panelImg = img; return !!img; })
      ]).then((ok) => {
        this.online = ok.some(Boolean);
        this.ready = true;
        return this;
      });
    },
    /** 将在线木纹图片应用为页面背景（调用方传入 body 背景设置函数） */
    applyPanelBackground(el) {
      if (this.panelImg) {
        el.style.backgroundImage = `url(${this.panelImg.src})`;
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);