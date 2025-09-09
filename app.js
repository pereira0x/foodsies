// Foodsies — Simple localStorage based nutrition reference

const STORAGE_KEY = 'foodsiesData:v1';
const THEME_KEY = 'foodsiesTheme:v1';

/** Data shape
 * {
 *   version: 1,
 *   settings: { goalKcal?: number|null, goalProtein?: number|null },
 *   ingredients: [{ id, name, brand?, kcal100, protein100, pricePerKg?, portionName?, portionGrams?, notes? }],
 *   meals: [{ id, name, items: [{ ingredientId, mode: 'grams'|'portion', amount }] }],
 *   days: [{ id, name: string, items: [{ mealId }] }]
 * }
 */

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { version: 1, settings: { goalKcal: null, goalProtein: null }, ingredients: [], meals: [], days: [] };
  try {
    const data = JSON.parse(raw);
    // Basic migration/validation
    if (!data.version) data.version = 1;
    if (!data.settings) data.settings = { goalKcal: null, goalProtein: null };
    if (!Array.isArray(data.ingredients)) data.ingredients = [];
    // Ensure ingredient pricePerKg exists
    data.ingredients = data.ingredients.map(i => ({ ...i, pricePerKg: (i.pricePerKg ?? null) }));
    if (!Array.isArray(data.meals)) data.meals = [];
    if (!Array.isArray(data.days)) data.days = [];
    // Migrate day.date -> day.name (if needed)
    data.days = data.days.map(d => {
      if (d && !d.name && d.date) {
        return { id: d.id || uid('day'), name: d.date, items: Array.isArray(d.items) ? d.items : [] };
      }
      return { id: d.id || uid('day'), name: d.name || 'Untitled', items: Array.isArray(d.items) ? d.items : [] };
    });
    return data;
  } catch {
    return { version: 1, settings: { goalKcal: null, goalProtein: null }, ingredients: [], meals: [], days: [] };
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let state = loadData();

// ---------- Theme (dark/light) ----------
function detectPreferredTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('btn-toggle-theme');
  if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || detectPreferredTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

// Routing
function setActiveTab(hash) {
  const tab = hash.replace('#', '') || 'ingredients';
  document.querySelectorAll('.tabs a').forEach(a => a.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(`tab-${tab}`)?.classList.add('active');
  document.getElementById(`view-${tab}`)?.classList.remove('hidden');
}

window.addEventListener('hashchange', () => setActiveTab(location.hash));

// ---------- Helpers ----------
function round1(n) { return Math.round((n + Number.EPSILON) * 10) / 10; }
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
function fmtEUR(n) { return round2(n || 0).toFixed(2) + '€'; }
function getIngredient(id) { return state.ingredients.find(i => i.id === id); }
function getMeal(id) { return state.meals.find(m => m.id === id); }

function computeFrom100g(ing, grams) {
  const ratio = grams / 100;
  return {
    kcal: round1(ing.kcal100 * ratio),
    protein: round1(ing.protein100 * ratio),
    cost: ing.pricePerKg ? round2((ing.pricePerKg / 1000) * grams) : 0
  };
}

function computeFromPortion(ing, portions) {
  const grams = (ing.portionGrams || 0) * portions;
  return computeFrom100g(ing, grams);
}

// ---------- Ingredients UI ----------
const elIngList = document.getElementById('ingredient-list');
const elIngSearch = document.getElementById('ingredient-search');
const elIngDialog = document.getElementById('ingredient-dialog');
const elIngForm = document.getElementById('ingredient-form');
const elIngDialogTitle = document.getElementById('ingredient-dialog-title');
const elIngName = document.getElementById('ing-name');
const elIngBrand = document.getElementById('ing-brand');
const elIngKcal100 = document.getElementById('ing-kcal100');
const elIngProtein100 = document.getElementById('ing-protein100');
const elIngPortionName = document.getElementById('ing-portion-name');
const elIngPortionGrams = document.getElementById('ing-portion-grams');
const elIngNotes = document.getElementById('ing-notes');
const elIngPriceKg = document.getElementById('ing-price-kg');
let editingIngredientId = null;

document.getElementById('btn-add-ingredient').addEventListener('click', () => {
  openIngredientDialog();
});

function openIngredientDialog(ingredient) {
  editingIngredientId = ingredient?.id || null;
  elIngDialogTitle.textContent = editingIngredientId ? 'Edit Ingredient' : 'Add Ingredient';
  elIngName.value = ingredient?.name || '';
  elIngBrand.value = ingredient?.brand || '';
  elIngKcal100.value = ingredient?.kcal100 ?? '';
  elIngProtein100.value = ingredient?.protein100 ?? '';
  elIngPriceKg.value = ingredient?.pricePerKg ?? '';
  elIngPortionName.value = ingredient?.portionName || '';
  elIngPortionGrams.value = ingredient?.portionGrams ?? '';
  elIngNotes.value = ingredient?.notes || '';
  elIngDialog.showModal();
}

document.getElementById('btn-cancel-ing').addEventListener('click', () => elIngDialog.close());

document.getElementById('btn-save-ing').addEventListener('click', (e) => {
  e.preventDefault();
  const name = elIngName.value.trim();
  if (!name) { elIngName.focus(); return; }
  const kcal100 = parseFloat(elIngKcal100.value);
  const protein100 = parseFloat(elIngProtein100.value);
  if (!(kcal100 >= 0) || !(protein100 >= 0)) return;
  const portionName = elIngPortionName.value.trim() || null;
  const portionGrams = elIngPortionGrams.value ? parseFloat(elIngPortionGrams.value) : null;
  const pricePerKg = elIngPriceKg.value ? parseFloat(elIngPriceKg.value) : null;

  const entry = {
    id: editingIngredientId || uid('ing'),
    name,
    brand: elIngBrand.value.trim() || null,
    kcal100,
    protein100,
    pricePerKg,
    portionName,
    portionGrams,
    notes: elIngNotes.value.trim() || null,
  };

  const idx = state.ingredients.findIndex(i => i.id === entry.id);
  if (idx === -1) state.ingredients.push(entry); else state.ingredients[idx] = entry;
  saveData(state);
  elIngDialog.close();
  renderIngredients();
  refreshMealIngredientOptions();
});

function ingredientMatches(ing, q) {
  if (!q) return true;
  const s = `${ing.name} ${ing.brand || ''}`.toLowerCase();
  return s.includes(q.toLowerCase());
}

function renderIngredients() {
  const q = elIngSearch.value.trim();
  const tpl = document.getElementById('tpl-ingredient-card');
  elIngList.innerHTML = '';
  state.ingredients
    .filter(ing => ingredientMatches(ing, q))
    .sort((a,b) => a.name.localeCompare(b.name))
    .forEach(ing => {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.querySelector('.title').textContent = ing.name;
      node.querySelector('.subtitle').textContent = [ing.brand, ing.notes].filter(Boolean).join(' • ');
      let stats = `${ing.kcal100} kcal / 100g • ${ing.protein100} g protein`;
      if (ing.pricePerKg) stats += ` • ${round2(ing.pricePerKg).toFixed(2)}€/kg`;
      if (ing.portionName && ing.portionGrams) {
        const per = computeFromPortion(ing, 1);
        stats += ` | 1 ${ing.portionName} (${ing.portionGrams}g): ${per.kcal} kcal • ${per.protein} g`;
        if (per.cost) stats += ` • cost ${fmtEUR(per.cost)}`;
      }
      node.querySelector('.stats').textContent = stats;
      node.querySelector('.btn-edit').addEventListener('click', () => openIngredientDialog(ing));
      node.querySelector('.btn-delete').addEventListener('click', () => deleteIngredient(ing.id));
      elIngList.appendChild(node);
    });
}

function deleteIngredient(id) {
  if (!confirm('Delete this ingredient?')) return;
  state.ingredients = state.ingredients.filter(i => i.id !== id);
  // Also remove from any meals
  state.meals.forEach(m => m.items = m.items.filter(it => it.ingredientId !== id));
  saveData(state);
  renderIngredients();
  renderMealsList();
  renderMealComposer();
}

elIngSearch.addEventListener('input', renderIngredients);

// ---------- Meals UI ----------
const elMealName = document.getElementById('meal-name');
const elMealItems = document.getElementById('meal-items');
const elMealList = document.getElementById('meal-list');
const elTotalKcal = document.getElementById('total-kcal');
const elTotalProtein = document.getElementById('total-protein');
const elTotalCost = document.getElementById('total-cost');

document.getElementById('btn-add-meal-item').addEventListener('click', () => addMealItemRow());
document.getElementById('btn-new-meal').addEventListener('click', () => newMeal());
document.getElementById('btn-save-meal').addEventListener('click', () => saveMeal());

let currentMealId = null; // null means unsaved/new

function refreshMealIngredientOptions() {
  const options = state.ingredients
    .slice()
    .sort((a,b) => a.name.localeCompare(b.name))
    .map(ing => ({ value: ing.id, label: ing.name + (ing.brand ? ` — ${ing.brand}` : '') }));
  elMealItems.querySelectorAll('select.mi-ingredient').forEach(sel => {
    const selected = sel.value;
    sel.innerHTML = '<option value="">Select ingredient...</option>' + options.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
    if (options.some(o => o.value === selected)) sel.value = selected;
  });
}

function addMealItemRow(item = null) {
  const tpl = document.getElementById('tpl-meal-item');
  const node = tpl.content.firstElementChild.cloneNode(true);
  const selIngredient = node.querySelector('.mi-ingredient');
  const selMode = node.querySelector('.mi-mode');
  const inputAmount = node.querySelector('.mi-amount');
  const stats = node.querySelector('.mi-stats');
  const btnRemove = node.querySelector('.mi-remove');

  // Populate ingredient options
  const options = state.ingredients
    .slice()
    .sort((a,b) => a.name.localeCompare(b.name))
    .map(ing => ({ value: ing.id, label: ing.name + (ing.brand ? ` — ${ing.brand}` : '') }));
  selIngredient.innerHTML = '<option value="">Select ingredient...</option>' + options.map(o => `<option value="${o.value}">${o.label}</option>`).join('');

  if (item) {
    selIngredient.value = item.ingredientId || '';
    selMode.value = item.mode || 'grams';
    inputAmount.value = item.amount ?? '';
  }

  // If initial mode is portion but ingredient lacks portion info, fallback to grams
  const initIng = getIngredient(selIngredient.value);
  if (selMode.value === 'portion' && (!initIng?.portionName || !initIng?.portionGrams)) {
    selMode.value = 'grams';
  }

  function recalc() {
    const id = selIngredient.value;
    const ing = getIngredient(id);
    const mode = selMode.value;
    const amount = parseFloat(inputAmount.value);
    if (!ing || !(amount >= 0)) { stats.textContent = '0 kcal • 0 g protein • cost 0.00€'; updateTotals(); return; }
    let res;
    if (mode === 'grams') res = computeFrom100g(ing, amount);
    else res = computeFromPortion(ing, amount || 0);
    stats.textContent = `${res.kcal} kcal • ${res.protein} g protein • cost ${fmtEUR(res.cost)}`;
    updateTotals();
  }

  selIngredient.addEventListener('change', () => {
    // If mode is portion but ingredient has no portion, force grams
    const ing = getIngredient(selIngredient.value);
    if (selMode.value === 'portion' && (!ing?.portionName || !ing?.portionGrams)) {
      selMode.value = 'grams';
    }
    recalc();
  });
  selMode.addEventListener('change', () => {
    const ing = getIngredient(selIngredient.value);
    if (selMode.value === 'portion' && (!ing?.portionName || !ing?.portionGrams)) {
      alert('Selected ingredient has no portion defined. Using grams instead.');
      selMode.value = 'grams';
    }
    recalc();
  });
  inputAmount.addEventListener('input', recalc);
  btnRemove.addEventListener('click', () => { node.remove(); updateTotals(); });

  elMealItems.appendChild(node);
  // Calculate initial stats for loaded items
  (function initCalc(){
    const ing = getIngredient(selIngredient.value);
    if (!ing) { stats.textContent = '0 kcal • 0 g protein • cost 0.00€'; return; }
    const amt = parseFloat(inputAmount.value);
    if (!(amt >= 0)) { stats.textContent = '0 kcal • 0 g protein • cost 0.00€'; return; }
    const res = selMode.value === 'grams' ? computeFrom100g(ing, amt) : computeFromPortion(ing, amt || 0);
    stats.textContent = `${res.kcal} kcal • ${res.protein} g protein • cost ${fmtEUR(res.cost)}`;
  })();
}

function getMealFromComposer() {
  const name = elMealName.value.trim() || 'Untitled meal';
  const items = Array.from(elMealItems.querySelectorAll('.meal-item')).map(row => {
    return {
      ingredientId: row.querySelector('.mi-ingredient').value || null,
      mode: row.querySelector('.mi-mode').value,
      amount: parseFloat(row.querySelector('.mi-amount').value) || 0,
    };
  }).filter(it => it.ingredientId);
  return { id: currentMealId || uid('meal'), name, items };
}

function updateTotals() {
  const items = Array.from(elMealItems.querySelectorAll('.meal-item'));
  let totalK = 0, totalP = 0, totalC = 0;
  for (const row of items) {
    const id = row.querySelector('.mi-ingredient').value;
    const ing = getIngredient(id);
    if (!ing) continue;
    const mode = row.querySelector('.mi-mode').value;
    const amount = parseFloat(row.querySelector('.mi-amount').value);
    if (!(amount >= 0)) continue;
    const res = mode === 'grams' ? computeFrom100g(ing, amount) : computeFromPortion(ing, amount || 0);
    totalK += res.kcal;
    totalP += res.protein;
    totalC += res.cost;
  }
  elTotalKcal.textContent = round1(totalK);
  elTotalProtein.textContent = round1(totalP);
  if (elTotalCost) elTotalCost.textContent = fmtEUR(totalC);
}

function saveMeal() {
  const meal = getMealFromComposer();
  const idx = state.meals.findIndex(m => m.id === meal.id);
  if (idx === -1) state.meals.push(meal); else state.meals[idx] = meal;
  saveData(state);
  currentMealId = meal.id;
  renderMealsList();
  refreshDayMealOptions();
  renderDaysList();
  updateDayTotals();
}

function newMeal() {
  currentMealId = null;
  elMealName.value = '';
  elMealItems.innerHTML = '';
  addMealItemRow();
  updateTotals();
}

function loadMeal(id) {
  const meal = state.meals.find(m => m.id === id);
  if (!meal) return;
  currentMealId = meal.id;
  elMealName.value = meal.name;
  elMealItems.innerHTML = '';
  meal.items.forEach(it => addMealItemRow(it));
  updateTotals();
}

function deleteMeal(id) {
  if (!confirm('Delete this meal?')) return;
  state.meals = state.meals.filter(m => m.id !== id);
  // Remove from days
  state.days.forEach(d => d.items = d.items.filter(it => it.mealId !== id));
  saveData(state);
  if (currentMealId === id) newMeal();
  renderMealsList();
  refreshDayMealOptions();
  renderDaysList();
  updateDayTotals();
}

function renderMealsList() {
  elMealList.innerHTML = '';
  const frag = document.createDocumentFragment();
  state.meals.forEach(meal => {
    const div = document.createElement('div');
    div.className = 'card';
    const a = document.createElement('div');
    a.className = 'card-main';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = meal.name;
    const subtitle = document.createElement('div');
    subtitle.className = 'subtitle';
    const sums = sumMeal(meal);
    subtitle.textContent = `${sums.kcal} kcal • ${sums.protein} g protein • cost ${fmtEUR(sums.cost)}`;
    a.appendChild(title); a.appendChild(subtitle);
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const btnLoad = document.createElement('button');
    btnLoad.className = 'ghost'; btnLoad.textContent = 'Open';
    btnLoad.addEventListener('click', () => loadMeal(meal.id));
    const btnDel = document.createElement('button');
    btnDel.className = 'danger'; btnDel.textContent = 'Delete';
    btnDel.addEventListener('click', () => deleteMeal(meal.id));
    actions.appendChild(btnLoad); actions.appendChild(btnDel);
    div.appendChild(a); div.appendChild(actions);
    frag.appendChild(div);
  });
  elMealList.appendChild(frag);
}

function sumMeal(meal) {
  let totalK = 0, totalP = 0, totalC = 0;
  for (const it of meal.items) {
    const ing = getIngredient(it.ingredientId);
    if (!ing) continue;
    const res = it.mode === 'grams' ? computeFrom100g(ing, it.amount) : computeFromPortion(ing, it.amount || 0);
    totalK += res.kcal; totalP += res.protein; totalC += res.cost;
  }
  return { kcal: round1(totalK), protein: round1(totalP), cost: round2(totalC) };
}

// ---------- Days UI ----------
const elDayName = document.getElementById('day-name');
const elDayItems = document.getElementById('day-items');
const elDayList = document.getElementById('day-list');
const elDayTotalKcal = document.getElementById('day-total-kcal');
const elDayTotalProtein = document.getElementById('day-total-protein');
const elDayTotalCost = document.getElementById('day-total-cost');
const elGoalKcal = document.getElementById('goal-kcal');
const elGoalProtein = document.getElementById('goal-protein');
const elDeltaKcal = document.getElementById('delta-kcal');
const elDeltaProtein = document.getElementById('delta-protein');

document.getElementById('btn-add-day-item')?.addEventListener('click', () => addDayItemRow());
document.getElementById('btn-new-day')?.addEventListener('click', () => newDay());
document.getElementById('btn-save-day')?.addEventListener('click', () => saveDay());

let currentDayId = null;

function refreshDayMealOptions() {
  const options = state.meals
    .slice()
    .sort((a,b) => a.name.localeCompare(b.name))
    .map(meal => ({ value: meal.id, label: meal.name }));
  elDayItems.querySelectorAll('select.di-meal').forEach(sel => {
    const selected = sel.value;
    sel.innerHTML = '<option value="">Select meal...</option>' + options.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
    if (options.some(o => o.value === selected)) sel.value = selected;
  });
}

function addDayItemRow(item = null) {
  const row = document.createElement('div');
  row.className = 'meal-item';
  const sel = document.createElement('select'); sel.className = 'di-meal';
  const stats = document.createElement('div'); stats.className = 'mi-stats'; stats.textContent = '0 kcal • 0 g protein • cost 0.00€';
  const remove = document.createElement('button'); remove.className = 'ghost mi-remove'; remove.textContent = '✕'; remove.title = 'Remove';
  sel.innerHTML = '<option value="">Select meal...</option>' + state.meals.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  if (item) sel.value = item.mealId || '';

  function recalc() {
    const meal = getMeal(sel.value);
    if (!meal) { stats.textContent = '0 kcal • 0 g protein • cost 0.00€'; updateDayTotals(); return; }
    const sums = sumMeal(meal);
    stats.textContent = `${sums.kcal} kcal • ${sums.protein} g protein • cost ${fmtEUR(sums.cost)}`;
    updateDayTotals();
  }

  sel.addEventListener('change', recalc);
  remove.addEventListener('click', () => { row.remove(); updateDayTotals(); });

  // Layout similar to meal-item grid: [select][stats][remove]
  row.style.gridTemplateColumns = '3fr 3fr auto';
  row.appendChild(sel);
  row.appendChild(stats);
  row.appendChild(remove);
  elDayItems.appendChild(row);

  recalc();
}

function getDayFromComposer() {
  const name = elDayName.value.trim() || 'Untitled day';
  const items = Array.from(elDayItems.querySelectorAll('.meal-item')).map(row => {
    return { mealId: row.querySelector('select.di-meal').value || null };
  }).filter(it => it.mealId);
  return { id: currentDayId || uid('day'), name, items };
}

function updateDayTotals() {
  let totalK = 0, totalP = 0, totalC = 0;
  for (const row of Array.from(elDayItems.querySelectorAll('.meal-item'))) {
    const id = row.querySelector('select.di-meal').value;
    const meal = getMeal(id);
    if (!meal) continue;
    const sums = sumMeal(meal);
    totalK += sums.kcal; totalP += sums.protein; totalC += sums.cost;
  }
  totalK = round1(totalK); totalP = round1(totalP);
  elDayTotalKcal.textContent = totalK;
  elDayTotalProtein.textContent = totalP;
  if (elDayTotalCost) elDayTotalCost.textContent = fmtEUR(totalC);
  // Goals
  const gK = state.settings?.goalKcal ?? null;
  const gP = state.settings?.goalProtein ?? null;
  elGoalKcal.textContent = gK != null ? gK : '—';
  elGoalProtein.textContent = gP != null ? gP : '—';
  // Delta
  const dK = gK != null ? round1(totalK - gK) : 0;
  const dP = gP != null ? round1(totalP - gP) : 0;
  elDeltaKcal.textContent = (dK > 0 ? '+' : '') + dK;
  elDeltaProtein.textContent = (dP > 0 ? '+' : '') + dP;
  elDeltaKcal.classList.toggle('over', dK > 0);
  elDeltaKcal.classList.toggle('under', dK < 0);
  elDeltaProtein.classList.toggle('over', dP > 0);
  elDeltaProtein.classList.toggle('under', dP < 0);
}

function saveDay() {
  const day = getDayFromComposer();
  const idx = state.days.findIndex(d => d.id === day.id);
  if (idx === -1) state.days.push(day); else state.days[idx] = day;
  saveData(state);
  currentDayId = day.id;
  renderDaysList();
}

function newDay() {
  currentDayId = null;
  if (elDayName) elDayName.value = '';
  elDayItems.innerHTML = '';
  addDayItemRow();
  updateDayTotals();
}

function loadDay(id) {
  const day = state.days.find(d => d.id === id);
  if (!day) return;
  currentDayId = day.id;
  if (elDayName) elDayName.value = day.name || '';
  elDayItems.innerHTML = '';
  day.items.forEach(it => addDayItemRow(it));
  updateDayTotals();
}

function deleteDay(id) {
  if (!confirm('Delete this day?')) return;
  state.days = state.days.filter(d => d.id !== id);
  saveData(state);
  if (currentDayId === id) newDay();
  renderDaysList();
}

function sumDay(day) {
  let totalK = 0, totalP = 0, totalC = 0;
  for (const it of day.items) {
    const meal = getMeal(it.mealId);
    if (!meal) continue;
    const s = sumMeal(meal);
    totalK += s.kcal; totalP += s.protein; totalC += s.cost;
  }
  return { kcal: round1(totalK), protein: round1(totalP), cost: round2(totalC) };
}

function renderDaysList() {
  if (!elDayList) return;
  elDayList.innerHTML = '';
  const frag = document.createDocumentFragment();
  state.days
    .slice()
    .sort((a,b) => (a.name || '').localeCompare(b.name || ''))
    .forEach(day => {
      const div = document.createElement('div');
      div.className = 'card';
      const main = document.createElement('div'); main.className = 'card-main';
      const title = document.createElement('div'); title.className = 'title'; title.textContent = day.name || '(untitled)';
      const subtitle = document.createElement('div'); subtitle.className = 'subtitle';
      const sums = sumDay(day);
      const gK = state.settings?.goalKcal ?? null; const gP = state.settings?.goalProtein ?? null;
      const dK = gK != null ? round1(sums.kcal - gK) : null;
      const dP = gP != null ? round1(sums.protein - gP) : null;
      subtitle.textContent = `${sums.kcal} kcal • ${sums.protein} g • cost ${fmtEUR(sums.cost)}` + (gK!=null||gP!=null ? ` • Δ ${dK!=null?(dK>0?'+':'')+dK+' kcal':''}${(gK!=null&&gP!=null)?' / ':''}${dP!=null?(dP>0?'+':'')+dP+' g':''}` : '');
      main.appendChild(title); main.appendChild(subtitle);
      const actions = document.createElement('div'); actions.className = 'card-actions';
      const btnOpen = document.createElement('button'); btnOpen.className = 'ghost'; btnOpen.textContent = 'Open'; btnOpen.addEventListener('click', () => loadDay(day.id));
      const btnDel = document.createElement('button'); btnDel.className = 'danger'; btnDel.textContent = 'Delete'; btnDel.addEventListener('click', () => deleteDay(day.id));
      actions.appendChild(btnOpen); actions.appendChild(btnDel);
      div.appendChild(main); div.appendChild(actions);
      frag.appendChild(div);
    });
  elDayList.appendChild(frag);
}

// ---------- Settings: import/export/reset/demo ----------
document.getElementById('btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'foodsies-data.json';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('btn-import').addEventListener('click', () => document.getElementById('input-import').click());
document.getElementById('input-import').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.ingredients) || !Array.isArray(data.meals)) throw new Error('Invalid data');
    state = {
      version: 1,
      settings: data.settings || { goalKcal: null, goalProtein: null },
      ingredients: data.ingredients,
      meals: data.meals,
      days: Array.isArray(data.days) ? data.days : []
    };
    saveData(state);
    renderAll();
    alert('Data imported successfully.');
  } catch (err) {
    alert('Failed to import JSON.');
  } finally {
    e.target.value = '';
  }
});

document.getElementById('btn-reset').addEventListener('click', () => {
  if (!confirm('This will delete all data. Continue?')) return;
  state = { version: 1, settings: { goalKcal: null, goalProtein: null }, ingredients: [], meals: [], days: [] };
  saveData(state);
  renderAll();
});

document.getElementById('btn-demo').addEventListener('click', () => {
  const demo = {
    version: 1,
    settings: { goalKcal: 2200, goalProtein: 150 },
    ingredients: [
      { id: uid('ing'), name: 'Oats', brand: null, kcal100: 389, protein100: 16.9, pricePerKg: 2.2, portionName: null, portionGrams: null, notes: 'Raw rolled oats' },
      { id: uid('ing'), name: 'Chocolate Cookies', brand: 'Lidl', kcal100: 500, protein100: 6, pricePerKg: 6.5, portionName: 'cookie', portionGrams: 8, notes: null },
      { id: uid('ing'), name: 'Yogurt', brand: 'Aldi', kcal100: 61, protein100: 10, pricePerKg: 3.0, portionName: 'cup', portionGrams: 150, notes: 'Skyr style' },
    ],
    meals: [],
    days: []
  };
  state = demo;
  saveData(state);
  renderAll();
});

// ---------- Settings: goals ----------
const elGoalKcalInput = document.getElementById('goal-kcal-input');
const elGoalProteinInput = document.getElementById('goal-protein-input');
document.getElementById('btn-save-goals')?.addEventListener('click', () => {
  const gk = elGoalKcalInput.value ? parseFloat(elGoalKcalInput.value) : null;
  const gp = elGoalProteinInput.value ? parseFloat(elGoalProteinInput.value) : null;
  state.settings = { goalKcal: gk, goalProtein: gp };
  saveData(state);
  updateDayTotals();
  renderDaysList();
});

// ---------- Initial render ----------
function renderAll() {
  renderIngredients();
  renderMealsList();
  renderMealComposer();
  renderDaysList();
  renderDayComposer();
}

function renderMealComposer() {
  refreshMealIngredientOptions();
  updateTotals();
}

function renderDayComposer() {
  refreshDayMealOptions();
  // hydrate goals inputs
  if (elGoalKcalInput) elGoalKcalInput.value = state.settings?.goalKcal ?? '';
  if (elGoalProteinInput) elGoalProteinInput.value = state.settings?.goalProtein ?? '';
  updateDayTotals();
}

// Set initial tab
setActiveTab(location.hash || '#ingredients');
// Bootstrap
applyTheme(detectPreferredTheme());
document.getElementById('btn-toggle-theme')?.addEventListener('click', toggleTheme);
renderAll();
addMealItemRow();
// Initialize day composer defaults
if (document.getElementById('view-days')) { newDay(); }
