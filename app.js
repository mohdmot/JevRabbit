const API_URL = window.JEV_RABBIT_API || '/api/rabbit';
const habitat = document.querySelector('#habitat');
const rabbit = document.querySelector('#rabbit');
const terminalBody = document.querySelector('#terminalBody');
const itemCount = document.querySelector('#itemCount');
const coordinates = document.querySelector('#coordinates');
const connectionStatus = document.querySelector('#connectionStatus');
const items = new Map();
let rabbitPosition = { x: 50, y: 50 };
let itemSerial = 0;
let reactionLoopRunning = false;
let audioContext;

const itemMeta = {
  grass: { label: 'عشب', image: 'images/grass.png', kind: 'food' }, carrot: { label: 'جزر', image: 'images/carrot.png', kind: 'food' },
  fox: { label: 'ثعلب', image: 'images/fox.png', kind: 'danger' }, knife: { label: 'سكين', image: 'images/knife.png', kind: 'danger' }, sound: { label: 'سماعة', image: 'images/load_sound_source.png', kind: 'sound' }
};

function now() { return new Date().toLocaleTimeString('en-GB', { hour12: false }); }
function log(type, scope, message) {
  const line = document.createElement('div'); line.className = `log-line ${type}`;
  line.innerHTML = `<span>${now()}</span><b>${scope}</b><em>${message}</em>`;
  terminalBody.append(line); while (terminalBody.children.length > 160) terminalBody.firstElementChild.remove(); terminalBody.scrollTop = terminalBody.scrollHeight;
}
function updateCount() { itemCount.textContent = items.size; habitat.classList.toggle('has-items', items.size > 0); }
function playSoftTone() {
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain();
  oscillator.frequency.value = 440; oscillator.type = 'sine'; gain.gain.setValueAtTime(.035, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .18);
  oscillator.connect(gain).connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime + .18);
}
function position(element, x, y) { element.style.left = `${x}%`; element.style.top = `${y}%`; }
function setRabbit(x, y, running = true) {
  rabbitPosition = { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  position(rabbit, rabbitPosition.x, rabbitPosition.y); rabbit.classList.toggle('running', running);
  coordinates.textContent = `x: ${Math.round(rabbitPosition.x)} / y: ${Math.round(rabbitPosition.y)}`;
}
function itemPayload() {
  return [...items.values()].map(item => ({
    pos: [Math.round(item.x), Math.round(item.y)],
    distance: Math.round(Math.hypot(item.x - rabbitPosition.x, item.y - rabbitPosition.y) / 10),
    type: item.type
  }));
}
function soundPayload() { return [...items.values()].filter(item => item.type === 'sound').map(item => [Math.round(item.x), Math.round(item.y)]); }

function addItem(type, x = 50, y = 50) {
  const meta = itemMeta[type]; if (!meta) return;
  const id = `item-${++itemSerial}`; const element = document.createElement('div'); element.className = `environment-item ${type}-item`; element.dataset.id = id;
  element.innerHTML = `<img src="${meta.image}" alt="${meta.label}"><button class="remove-item" type="button" aria-label="حذف ${meta.label}">×</button>`;
  habitat.append(element); const item = { id, type, x, y, element }; items.set(id, item); position(element, x, y); updateCount(); attachDrag(item);
  log('system', 'ADD', `${meta.label} placed at x:${Math.round(x)} y:${Math.round(y)}`); if (type === 'sound') playSoftTone(); startReactionLoop();
}
function pointFromEvent(event) { const rect = habitat.getBoundingClientRect(); return { x: Math.max(4, Math.min(96, (event.clientX - rect.left) / rect.width * 100)), y: Math.max(5, Math.min(95, (event.clientY - rect.top) / rect.height * 100)) }; }
function attachDrag(item) {
  let dragging = false;
  item.element.addEventListener('pointerdown', event => { if (event.target.closest('.remove-item')) return; dragging = true; item.element.classList.add('dragging'); item.element.setPointerCapture(event.pointerId); event.preventDefault(); });
  item.element.addEventListener('pointermove', event => { if (!dragging) return; const point = pointFromEvent(event); item.x = point.x; item.y = point.y; position(item.element, item.x, item.y); });
  item.element.addEventListener('pointerup', () => { if (!dragging) return; dragging = false; item.element.classList.remove('dragging'); if (item.type === 'sound') playSoftTone(); log('request', 'DRAG', `${itemMeta[item.type].label} -> x:${Math.round(item.x)} y:${Math.round(item.y)}`); startReactionLoop(); });
  item.element.addEventListener('pointercancel', () => { dragging = false; item.element.classList.remove('dragging'); });
  item.element.querySelector('.remove-item').addEventListener('click', () => { item.element.remove(); items.delete(item.id); updateCount(); startReactionLoop(); });
}
function moveByDecision(answer) {
  const moves = { '+y': [0, 1], '-y': [0, -1], '-x': [-1, 0], '+x': [1, 0] }; const delta = moves[answer?.goto];
  if (!delta) { rabbit.classList.remove('running'); rabbit.querySelector('img').style.setProperty('--rabbit-angle', '0deg'); return; }
  const speed = Math.max(0, Math.min(5, Number(answer.speed) || 0));
  if (!speed) { rabbit.classList.remove('running'); return; }
  const angle = Math.atan2(delta[1], delta[0]) * 180 / Math.PI - 90;
  rabbit.querySelector('img').style.setProperty('--rabbit-angle', `${angle}deg`);
  setRabbit(rabbitPosition.x + delta[0] * speed, rabbitPosition.y + delta[1] * speed, true);
}
function startReactionLoop() { if (!reactionLoopRunning) { reactionLoopRunning = true; reactionLoop(); } }
async function reactionLoop() {
  while (reactionLoopRunning) await requestReaction();
}
async function requestReaction() {
  const params = new URLSearchParams({ rabbit_pos: JSON.stringify([Math.round(rabbitPosition.x), Math.round(rabbitPosition.y)]), env_sounds: JSON.stringify(soundPayload()), view_feild_items: JSON.stringify(itemPayload()) });
  log('request', 'GET', `/api/rabbit? rabbit_pos=${params.get('rabbit_pos')} view_feild_items=${params.get('view_feild_items')}`); connectionStatus.textContent = 'Requesting...';
  try { const response = await fetch(`${API_URL}?${params}`, { cache: 'no-store' }); if (!response.ok) throw new Error(`HTTP ${response.status}`); const answer = await response.json(); log('response', 'JSON', `goto: ${answer.goto} / speed: ${answer.speed}`); connectionStatus.textContent = 'Connected'; moveByDecision(answer); }
  catch (error) { connectionStatus.textContent = 'Local preview'; log('error', 'ERR', `${error.message} - local movement`); localReaction(); }
}
function localReaction() {
  const nearest = [...items.values()].sort((a, b) => Math.hypot(a.x - rabbitPosition.x, a.y - rabbitPosition.y) - Math.hypot(b.x - rabbitPosition.x, b.y - rabbitPosition.y))[0]; if (!nearest) return;
  const away = ['fox', 'knife', 'sound'].includes(nearest.type); const dx = nearest.x - rabbitPosition.x; const dy = nearest.y - rabbitPosition.y; const length = Math.max(1, Math.hypot(dx, dy)); const direction = away ? -1 : 1;
  const angle = Math.atan2(dy * direction, dx * direction) * 180 / Math.PI - 90; rabbit.querySelector('img').style.setProperty('--rabbit-angle', `${angle}deg`);
  setRabbit(rabbitPosition.x + dx / length * 2.5 * direction, rabbitPosition.y + dy / length * 2.5 * direction, true);
}
document.querySelectorAll('.tool-card').forEach(tool => { tool.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', tool.dataset.type)); tool.addEventListener('click', () => addItem(tool.dataset.type, 50 + Math.random() * 20 - 10, 50 + Math.random() * 20 - 10)); });
habitat.addEventListener('dragover', event => event.preventDefault()); habitat.addEventListener('drop', event => { event.preventDefault(); const point = pointFromEvent(event); addItem(event.dataTransfer.getData('text/plain'), point.x, point.y); });
document.querySelector('#clearButton').addEventListener('click', () => { items.forEach(item => item.element.remove()); items.clear(); updateCount(); log('system', 'SYS', 'Habitat cleared'); startReactionLoop(); });
document.querySelector('#terminalClear').addEventListener('click', () => { terminalBody.innerHTML = ''; });
updateCount(); setRabbit(50, 50, false); log('system', 'SYS', `API: ${API_URL}`); startReactionLoop();