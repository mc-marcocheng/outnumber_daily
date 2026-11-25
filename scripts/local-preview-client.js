const difficulty = document.querySelector('#difficulty');
const puzzle = document.querySelector('#puzzle');
const frame = document.querySelector('#game');
const previous = document.querySelector('#previous');
const next = document.querySelector('#next');
const identity = document.querySelector('#identity');
const data = await fetch('/local/puzzles').then((response) => response.json());
let index = data.selectedIndex;
difficulty.value = localStorage.getItem('outnumber-local-tier') ?? 'easy';
async function load() {
  const entries = data.pools[difficulty.value];
  index = Math.min(index, entries.length - 1);
  puzzle.replaceChildren(
    ...entries.map((entry, position) => {
      const option = document.createElement('option');
      option.value = String(position);
      option.textContent = `${position + 1} / ${entries.length}`;
      return option;
    })
  );
  puzzle.value = String(index);
  previous.disabled = index === 0;
  next.disabled = index === entries.length - 1;
  await fetch('/local/select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index }),
  });
  localStorage.setItem('outnumber-difficulty', difficulty.value);
  localStorage.setItem('outnumber-local-tier', difficulty.value);
  const entry = entries[index];
  identity.textContent = `${entry.id} | ${entry.width} x ${entry.height}`;
  frame.src = `/game.html?local=${Date.now()}`;
}
difficulty.addEventListener('change', load);
puzzle.addEventListener('change', () => {
  index = Number(puzzle.value);
  void load();
});
previous.addEventListener('click', () => {
  index -= 1;
  void load();
});
next.addEventListener('click', () => {
  index += 1;
  void load();
});
await load();
