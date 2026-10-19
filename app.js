import { Game } from './modules/Game.js';

new Game();

let installPrompt;
const installButton = document.getElementById('install-btn');
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); installPrompt = event; installButton.hidden = false;
});
installButton.addEventListener('click', async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  await installPrompt.userChoice;
  installButton.hidden = true;
  installPrompt = null;
});
window.addEventListener('appinstalled', () => { installButton.hidden = true; installPrompt = null; });
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(() => {
    // Offline installation is optional; gameplay remains available online.
  });
}
