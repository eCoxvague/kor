// KOR — giriş noktası ve ana döngü
import { Game } from './game.js';

const canvas = document.getElementById('game');

// tuval ölçekleme (--cw/--ch/--cx/--cy) art/fit.js içinde: Game kurulurken installFit() çağrılır
const game = new Game(canvas);
window.game = game;

let last = performance.now();
let acc = 0;
const STEP = 1 / 60;

function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;

  let guard = 0;
  while (acc >= STEP && guard++ < 5) {
    if (game.state === 'play' && game.fx.hitStop > 0) {
      // hit-stop: dünya donar, sadece efektler ağır çeker
      game.fx.hitStop -= STEP;
      game.fx.update(STEP * 0.35);
    } else if (game.state === 'play') {
      game.update(STEP);
    } else {
      game.fx.update(STEP);
    }
    acc -= STEP;
  }
  game.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// pencere odak kaybında sesi sustur
addEventListener('visibilitychange', () => {
  if (document.hidden) last = performance.now();
});
