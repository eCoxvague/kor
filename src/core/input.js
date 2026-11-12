// KOR — girdi
const keys = new Set(), pressed = new Set();
// act: fare her kıpırdadığında/basıldığında artar (oyun "son girdi fare mi klavye mi" kararını bundan verir)
const mouse = { x: 240, y: 135, down: false, justDown: false, act: 0, world: { x: 0, y: 0 } };
let canvasEl = null;

export function bindInput(canvas) {
  canvasEl = canvas;
  addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
    if (!keys.has(e.code)) pressed.add(e.code);
    keys.add(e.code);
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  const pos = e => {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) / r.width * canvas.width;
    mouse.y = (e.clientY - r.top) / r.height * canvas.height;
    mouse.act++;
  };
  canvas.addEventListener('mousemove', pos);
  canvas.addEventListener('mousedown', e => { pos(e); if (e.button === 0) { mouse.down = true; mouse.justDown = true; } });
  addEventListener('mouseup', () => { mouse.down = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
}

export const key = c => keys.has(c);
export const keyDown = c => pressed.has(c);
export const anyDir = () => key('KeyW') || key('KeyA') || key('KeyS') || key('KeyD') ||
  key('ArrowUp') || key('ArrowLeft') || key('ArrowDown') || key('ArrowRight');

export function axis() {
  let x = 0, y = 0;
  if (key('KeyA') || key('ArrowLeft')) x--;
  if (key('KeyD') || key('ArrowRight')) x++;
  if (key('KeyW') || key('ArrowUp')) y--;
  if (key('KeyS') || key('ArrowDown')) y++;
  if (x && y) { const inv = 0.7071; x *= inv; y *= inv; }
  return { x, y };
}
export const mouseState = () => mouse;
export function endFrameInput() { pressed.clear(); mouse.justDown = false; }
