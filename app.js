import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBktdfxqqthd9BxEKYzpp846v2KUthP36Q",
  authDomain: "jestravelwebapp.firebaseapp.com",
  databaseURL: "https://jestravelwebapp-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "jestravelwebapp",
  storageBucket: "jestravelwebapp.firebasestorage.app",
  messagingSenderId: "1089232899793",
  appId: "1:1089232899793:web:c3f2b1233ab27661983ff0",
  measurementId: "G-E4M7MEQ6GK"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const state = {
    currentScreen: 'login',
    authMode: 'login',
    tripCode: '',
    userAccount: '',
    isPlanner: false,
    plannerPassword: '1234',
    selectedDay: 1,
    totalDays: 5,
    tripTitle: '浪漫之旅',
    weatherCity: '東京',
    weatherTemp: '24°C',
    scheduleData: [],
    packingList: [],
    proposalSlides: [
        { text: '這趟旅程，看似是一起計畫的冒險...', imgUrl: '' },
        { text: '但其實，這是我這輩子最用心的佈局。', imgUrl: '' },
        { text: '未來的日子，妳願意讓我繼續照顧妳嗎？', imgUrl: '', choices: '我願意 💍, 超級願意 ❤️' }
    ],
    proposalMusicUrl: '',
    currentSlideIndex: 0,
    proposalSignal: false,
    proposalReady: false
};

// ────────────────────────────────────────────────────────
// 🔧 共用小工具
// ────────────────────────────────────────────────────────
// 將使用者輸入的文字轉義成 HTML 安全字串，避免特殊符號（引號、< > 等）
// 造成畫面版面錯亂或功能中斷。所有「使用者自訂文字」在塞進 innerHTML 前都應該經過這裡。
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function isLikelyYoutubeUrl(url) {
    return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(url);
}

// ────────────────────────────────────────────────────────
// 🔄 初始化與 Face ID 本地快取
// ────────────────────────────────────────────────────────
window.onload = function() {
    const localTripCode = localStorage.getItem('local_trip_code');
    const localAccount = localStorage.getItem('local_account');
    const localPassword = localStorage.getItem('local_password');
    if (localTripCode && localAccount && localPassword) {
        document.getElementById('trip-code-input').value = localTripCode;
        document.getElementById('user-account-input').value = localAccount;
        document.getElementById('user-password-input').value = localPassword;
        document.getElementById('face-id-btn').classList.remove('hidden');
    }
    initDayTabsDragScroll();
    initScheduleContainerDelegation();
    calcUpdateDisplay();
};

async function handleFaceIDLogin() {
    const localTripCode = localStorage.getItem('local_trip_code');
    const localAccount = localStorage.getItem('local_account');
    const localPassword = localStorage.getItem('local_password');
    if (!localTripCode || !localAccount || !localPassword) return;
    const userRef = ref(db, `trips/${localTripCode}/users/${localAccount}`);
    const snapshot = await get(userRef);
    if (snapshot.exists() && snapshot.val().password === localPassword) {
        loginSuccess(localTripCode, localAccount);
    } else {
        alert("⚠️ 憑證已過期，請手動輸入登入！");
    }
}

// ────────────────────────────────────────────────────────
// 🔐 登入/註冊機制
// ────────────────────────────────────────────────────────
function switchLoginTab(mode) {
    state.authMode = mode;
    const loginBtn = document.getElementById('tab-login-btn');
    const regBtn = document.getElementById('tab-register-btn');
    const title = document.getElementById('login-title');
    const submitBtn = document.getElementById('submit-auth-btn');
    if (mode === 'register') {
        loginBtn.className = "flex-1 py-2 text-xs font-bold rounded-lg text-slate-400 hover:text-slate-600 transition-all";
        regBtn.className = "flex-1 py-2 text-xs font-black rounded-lg bg-white text-slate-700 shadow-sm transition-all";
        title.innerText = "建立新旅團或加入密謀 ✨";
        submitBtn.innerText = "註冊旅團帳號";
    } else {
        loginBtn.className = "flex-1 py-2 text-xs font-black rounded-lg bg-white text-slate-700 shadow-sm transition-all";
        regBtn.className = "flex-1 py-2 text-xs font-bold rounded-lg text-slate-400 hover:text-slate-600 transition-all";
        title.innerText = "歡迎回到旅遊小助手 👋";
        submitBtn.innerText = "確認登入";
    }
}

async function handleAuthSubmit() {
    const tripCode = document.getElementById('trip-code-input').value.trim().toUpperCase();
    const account = document.getElementById('user-account-input').value.trim().toLowerCase();
    const password = document.getElementById('user-password-input').value.trim();
    if (!tripCode || !account || !password) return alert('請填寫所有欄位！');
    const userRef = ref(db, `trips/${tripCode}/users/${account}`);
    if (state.authMode === 'register') {
        if (account === 'admin') {
            const snapshot = await get(userRef);
            if (snapshot.exists()) return alert('❌ 註冊失敗：此旅團代碼已有 admin 管理者！');
        }

        const tripRef = ref(db, `trips/${tripCode}`);
        const tripSnapshot = await get(tripRef);
        if (!tripSnapshot.exists()) {
            await set(tripRef, {
                meta: { tripTitle: '東京浪漫之旅', weatherCity: '東京', weatherTemp: '24°C', totalDays: 5 },
                packingList: { "init": { id: "init", item: '護照 / 簽證 🛂', checked: false, sortOrder: 0 } },
                scheduleData: { "init": { id: "init", day: 1, time: '12:00', title: '抵達目的地 ✈️', desc: '開啟冒險！', checked: false, sortOrder: 0, imgUrl: '' } },
                proposalSlides: state.proposalSlides,
                proposalMusicUrl: '',
                currentSlideIndex: 0,
                proposalSignal: false,
                proposalReady: false
            });
        }
        await set(userRef, { password: password });
        alert('🎉 帳號成功建立！');
        saveToLocal(tripCode, account, password);
        loginSuccess(tripCode, account);
    } else {
        const snapshot = await get(userRef);
        if (snapshot.exists() && snapshot.val().password === password) {
            saveToLocal(tripCode, account, password);
            loginSuccess(tripCode, account);
        } else {
            alert('❌ 密碼或帳號輸入錯誤！');
        }
    }
}

function saveToLocal(t, a, p) {
    localStorage.setItem('local_trip_code', t);
    localStorage.setItem('local_account', a);
    localStorage.setItem('local_password', p);
}

function loginSuccess(tripCode, account) {
    state.tripCode = tripCode;
    state.userAccount = account;
    state.isPlanner = (account === 'admin');
    switchScreen('trip');
    startRealtimeSync();
}

// ────────────────────────────────────────────────────────
// 🔄 Firebase 即時雲端數據同步
// ────────────────────────────────────────────────────────
let isProposolWindowOpened = false; // 防重複開啟標記

function startRealtimeSync() {
    // 監聽 Meta (主題、天氣、總天數)
    onValue(ref(db, `trips/${state.tripCode}/meta`), (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            state.tripTitle = data.tripTitle || '浪漫之旅';
            state.weatherCity = data.weatherCity || '東京';
            state.weatherTemp = data.weatherTemp || '24°C';
            state.totalDays = data.totalDays || 5;

            if (state.selectedDay > state.totalDays) state.selectedDay = state.totalDays;
            renderTripScreen();
            initAdminInputs();
        }
    });

    // 監聽行程並依 sortOrder 排序
    onValue(ref(db, `trips/${state.tripCode}/scheduleData`), (snapshot) => {
        state.scheduleData = snapshot.exists() ? Object.values(snapshot.val()).filter(i => i.id !== "init") : [];
        state.scheduleData.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        renderTripScreen();
    });

    // 監聽行李並依 sortOrder 排序
    onValue(ref(db, `trips/${state.tripCode}/packingList`), (snapshot) => {
        state.packingList = snapshot.exists() ? Object.values(snapshot.val()).filter(i => i.id !== "init") : [];
        state.packingList.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        if (!document.getElementById('packing-modal').classList.contains('hidden')) {
            renderPackingModalList();
        }
        renderTripScreen();
    });

    // 監聽求婚資料（Slides、音樂、控制訊號一起監聽，確保資料一致性）
    onValue(ref(db, `trips/${state.tripCode}`), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        console.log("監聽器收到資料更新:", data);

        // 1. 更新全域狀態
        state.proposalSlides = data.proposalSlides || [];
        state.proposalMusicUrl = data.proposalMusicUrl || '';
        state.proposalSignal = data.proposalSignal || false;
        state.currentSlideIndex = data.currentSlideIndex || 0;
        state.proposalReady = data.proposalReady || false;

        // 2. 更新 Admin 介面渲染
        renderAdminSlides();

        // 2-1. 同步音樂欄位（若使用者正在輸入中就不要覆蓋掉，避免打字被強制清空）
        const musicInput = document.getElementById('admin-proposal-music-url');
        if (musicInput && document.activeElement !== musicInput) {
            musicInput.value = state.proposalMusicUrl;
        }

        // 3. 更新頁碼顯示
        const pageNumText = document.getElementById('admin-current-page-num');
        if (pageNumText) {
            pageNumText.innerText = `${state.currentSlideIndex + 1}/${state.proposalSlides.length || 1}`;
        }

        // 4. 同步管理員控制台的顯示隱藏
        const ctrlBox = document.getElementById('admin-sync-controller');
        if (ctrlBox) {
            if (state.proposalSignal) ctrlBox.classList.remove('hidden');
            else ctrlBox.classList.add('hidden');
        }

        // 5. 🚀 多機即時連動 (Admin 與 User 同步)
        if (state.proposalSignal === true && !isProposolWindowOpened) {
            isProposolWindowOpened = true;
            window.open(`proposal.html?code=${state.tripCode}`, '_blank');
        }
        if (state.proposalSignal === false) {
            isProposolWindowOpened = false;
        }

        const launchBtn = document.getElementById('admin-launch-btn');
        if (launchBtn) {
            launchBtn.disabled = !state.proposalReady;
            if (state.proposalReady) {
                launchBtn.className =
                    "flex-1 py-3 bg-red-500 text-white font-black text-xs rounded-xl shadow-md transition active:scale-95";
            } else {
                launchBtn.className =
                    "flex-1 py-3 bg-slate-300 text-slate-500 font-black text-xs rounded-xl shadow-none cursor-not-allowed transition-all";
            }
        }
    });
}

function initAdminInputs() {
    if (!state.isPlanner) return;
    if (document.getElementById('admin-total-days')) document.getElementById('admin-total-days').value = state.totalDays;
    if (document.getElementById('admin-trip-title')) document.getElementById('admin-trip-title').value = state.tripTitle;
    if (document.getElementById('admin-weather-city')) document.getElementById('admin-weather-city').value = state.weatherCity;
    if (document.getElementById('admin-weather-temp')) document.getElementById('admin-weather-temp').value = state.weatherTemp;
}

// ────────────────────────────────────────────────────────
// 🌦️ 天氣自動查詢 (Open-Meteo，免金鑰) — 失敗時自動退回手動設定值
// ────────────────────────────────────────────────────────
let weatherCache = { city: null, temp: null, failedAt: 0 };
const WEATHER_RETRY_COOLDOWN = 60000; // 60 秒內查詢失敗就不重複嘗試，避免灌爆 API

async function updateWeatherDisplay() {
    const box = document.getElementById('weather-box');
    if (!box) return;
    const city = state.weatherCity;
    const fallbackTemp = state.weatherTemp || '--';

    // 先立即顯示（快取或手動備援值），避免畫面空白等待
    const initialTemp = (weatherCache.city === city && weatherCache.temp) ? weatherCache.temp : fallbackTemp;
    box.innerHTML = `
        <span class="text-[11px] text-orange-400 font-bold block mb-0.5"><i class="fa-solid fa-cloud-sun"></i> ${escapeHtml(city)}天氣</span>
        <p class="text-base font-black text-slate-700" id="weather-temp-display">${escapeHtml(initialTemp)}</p>
    `;

    // 已經有成功快取，不用重打 API
    if (weatherCache.city === city && weatherCache.temp) return;
    // 剛失敗過且還在冷卻中，不重打，維持顯示手動備援值
    if (weatherCache.city === city && Date.now() - weatherCache.failedAt < WEATHER_RETRY_COOLDOWN) return;

    try {
        const geoController = new AbortController();
        const geoTimeout = setTimeout(() => geoController.abort(), 5000);
        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`, { signal: geoController.signal });
        clearTimeout(geoTimeout);
        const geoData = await geoRes.json();
        if (!geoData.results || geoData.results.length === 0) throw new Error('找不到城市座標');
        const { latitude, longitude } = geoData.results[0];

        const wController = new AbortController();
        const wTimeout = setTimeout(() => wController.abort(), 5000);
        const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`, { signal: wController.signal });
        clearTimeout(wTimeout);
        const wData = await wRes.json();
        if (!wData.current_weather) throw new Error('查無即時天氣資料');

        const temp = `${Math.round(wData.current_weather.temperature)}°C`;
        weatherCache = { city, temp, failedAt: 0 };

        // 如果使用者還停留在同一個城市畫面，直接更新數字，不重繪整個 header 打斷操作
        if (state.weatherCity === city) {
            const displayEl = document.getElementById('weather-temp-display');
            if (displayEl) displayEl.innerText = temp;
        }
    } catch (err) {
        console.warn('自動天氣查詢失敗，改用手動設定的氣溫作為備援:', err);
        weatherCache = { city, temp: null, failedAt: Date.now() };
        // 不做任何畫面更動，維持目前顯示的備援氣溫
    }
}

// ────────────────────────────────────────────────────────
// 🖥️ UI 渲染與拖曳控制 (SortableJS 接入)
// ────────────────────────────────────────────────────────
function renderTripScreen() {
    const header = document.getElementById('trip-header');
    header.innerHTML = `
        <div>
            <span class="text-[10px] bg-orange-50 text-[#FF9E64] font-black px-2 py-0.5 rounded-md tracking-wider">團號：${escapeHtml(state.tripCode)} (${escapeHtml(state.userAccount)})</span>
            <h1 class="text-xl font-black text-[#FF9E64] mt-1">${escapeHtml(state.tripTitle)} ✈️</h1>
        </div>
        <div class="flex gap-2">
            <button onclick="openCalculatorModal()" class="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition" title="計算機"><i class="fa-solid fa-calculator text-xs"></i></button>
            ${state.isPlanner ? `
                <button onclick="triggerSecureAction('admin')" class="w-8 h-8 rounded-full bg-orange-50/50 flex items-center justify-center text-[#FF9E64] hover:bg-orange-100/50 transition"><i class="fa-solid fa-gear text-xs"></i></button>
            ` : ''}
        </div>
    `;

    updateWeatherDisplay();

    const checkedCount = state.packingList.filter(i => i.checked).length;
    document.getElementById('packing-box').innerHTML = `
        <span class="text-[11px] text-slate-400 font-bold block mb-0.5"><i class="fa-solid fa-square-check"></i> 行李清單</span>
        <p class="text-xs text-slate-500 font-medium">已完成 ${checkedCount} / ${state.packingList.length} 項</p>
    `;

    const tabsContainer = document.getElementById('day-tabs-container');
    tabsContainer.innerHTML = '';
    for (let i = 1; i <= state.totalDays; i++) {
        const isSelected = i === state.selectedDay;
        const btn = document.createElement('button');
        btn.className = `px-5 py-1.5 rounded-full text-xs font-black transition-all shrink-0 ${isSelected ? 'bg-[#FF9E64] text-white shadow-md' : 'bg-slate-100 text-slate-500'}`;
        btn.innerText = `Day ${i}`;
        btn.onclick = () => { state.selectedDay = i; renderTripScreen(); };
        tabsContainer.appendChild(btn);
    }

    const container = document.getElementById('schedule-container');
    container.innerHTML = '';
    const currentItems = state.scheduleData.filter(item => item.day === state.selectedDay);
    if (currentItems.length === 0) {
        container.innerHTML = `<div class="text-center py-12 text-slate-400 text-xs font-medium">今天還沒有安排行程喔！<br>快點擊下方開始排行程吧 ✨</div>`;
    } else {
        currentItems.forEach((item) => {
            const card = document.createElement('div');
            card.setAttribute('data-id', item.id);
            card.className = `bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col ${item.checked ? 'bg-slate-50/70 border-slate-200/50 shadow-none opacity-60' : ''}`;
            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <div class="flex items-center gap-3 flex-1">
                        <button onclick="toggleScheduleCheck('${item.id}')" class="text-base shrink-0">
                            <i class="${item.checked ? 'fa-solid fa-circle-check text-[#FF9E64]' : 'fa-regular fa-circle text-slate-300'}"></i>
                        </button>
                        <div class="flex items-center gap-2">
                            <span class="bg-orange-50 text-[#FF9E64] text-[10px] font-black px-2 py-0.5 rounded-md cursor-move"><i class="fa-solid fa-bars text-[9px] mr-1 opacity-50"></i>${escapeHtml(item.time)}</span>
                            <h3 class="font-bold text-slate-800 text-sm ${item.checked ? 'line-through text-slate-400 font-normal' : ''}">${escapeHtml(item.title)}</h3>
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        <button class="map-btn text-slate-400 hover:text-blue-500 text-xs p-1" data-title="${escapeHtml(item.title)}" title="在 Google 地圖上查看"><i class="fa-solid fa-map-location-dot"></i></button>
                        <button onclick="openScheduleModal('${item.id}')" class="text-slate-400 hover:text-[#FF9E64] text-xs p-1"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="deleteSchedule('${item.id}')" class="text-slate-400 hover:text-red-400 text-xs p-1"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
                ${item.imgUrl ? `<img src="${escapeHtml(item.imgUrl)}" class="w-full h-24 object-cover rounded-xl mt-2 shadow-sm">` : ''}
                ${item.desc ? `<p class="text-xs text-slate-500 pl-7 mt-1.5 whitespace-pre-line">${escapeHtml(item.desc)}</p>` : ''}
            `;
            container.appendChild(card);
        });
        Sortable.create(container, {
            animation: 200,
            handle: '.cursor-move',
            onEnd: function () {
                const updatedIds = Array.from(container.children).map(child => child.getAttribute('data-id')).filter(id => id);
                updatedIds.forEach((id, index) => {
                    set(ref(db, `trips/${state.tripCode}/scheduleData/${id}/sortOrder`), index);
                });
            }
        });
    }

    const addBtn = document.createElement('button');
    addBtn.className = "w-full py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-400 mt-2";
    addBtn.innerText = "+ 新增此日行程景點";
    addBtn.onclick = () => openScheduleModal(null);
    container.appendChild(addBtn);
}

// 景點卡片上的地圖按鈕：用事件委派方式綁定，避免景點名稱含特殊符號時破壞 HTML
function initScheduleContainerDelegation() {
    const container = document.getElementById('schedule-container');
    if (!container) return;
    container.addEventListener('click', function(e) {
        const btn = e.target.closest('.map-btn');
        if (btn) {
            openItemMap(btn.getAttribute('data-title'));
        }
    });
}

function openItemMap(title) {
    if (!title) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title)}`;
    window.open(url, '_blank');
}

// Day 頁籤：滑鼠拖曳捲動（觸控裝置原生就能滑動，這裡主要是為了桌機測試體驗）
function initDayTabsDragScroll() {
    const el = document.getElementById('day-tabs-container');
    if (!el) return;
    let isDown = false;
    let startX = 0;
    let scrollLeftStart = 0;

    el.addEventListener('mousedown', (e) => {
        isDown = true;
        el.classList.add('cursor-grabbing');
        startX = e.pageX - el.offsetLeft;
        scrollLeftStart = el.scrollLeft;
    });
    el.addEventListener('mouseleave', () => { isDown = false; el.classList.remove('cursor-grabbing'); });
    el.addEventListener('mouseup', () => { isDown = false; el.classList.remove('cursor-grabbing'); });
    el.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - el.offsetLeft;
        const walk = (x - startX) * 1.2;
        el.scrollLeft = scrollLeftStart - walk;
    });
}

// ────────────────────────────────────────────────────────
// 💾 行程表單儲存
// ────────────────────────────────────────────────────────
function openScheduleModal(id = null) {
    document.getElementById('schedule-modal').classList.remove('hidden');
    if (id) {
        const item = state.scheduleData.find(s => s.id === id);
        document.getElementById('form-schedule-id').value = id;
        document.getElementById('form-schedule-time').value = item.time;
        document.getElementById('form-schedule-name').value = item.title;
        document.getElementById('form-schedule-desc').value = item.desc || '';
        document.getElementById('form-schedule-img').value = item.imgUrl || '';
        document.getElementById('schedule-modal-title').innerText = "✏️ 編輯行程景點";
    } else {
        document.getElementById('form-schedule-id').value = '';
        document.getElementById('form-schedule-time').value = '12:00';
        document.getElementById('form-schedule-name').value = '';
        document.getElementById('form-schedule-desc').value = '';
        document.getElementById('form-schedule-img').value = '';
        document.getElementById('schedule-modal-title').innerText = "✨ 新增行程景點";
    }
}
function closeScheduleModal() { document.getElementById('schedule-modal').classList.add('hidden'); }

function saveScheduleForm() {
    const id = document.getElementById('form-schedule-id').value;
    const time = document.getElementById('form-schedule-time').value || '12:00';
    const title = document.getElementById('form-schedule-name').value.trim();
    const desc = document.getElementById('form-schedule-desc').value.trim();
    const imgUrl = document.getElementById('form-schedule-img').value.trim();
    if (!title) return alert('請填寫景點名稱！');
    const itemId = id ? id : "item_" + Date.now();
    const existingItem = state.scheduleData.find(s => s.id === id);
    set(ref(db, `trips/${state.tripCode}/scheduleData/${itemId}`), {
        id: itemId,
        day: state.selectedDay,
        time,
        title,
        desc,
        imgUrl,
        checked: existingItem ? existingItem.checked : false,
        sortOrder: existingItem ? (existingItem.sortOrder || 0) : state.scheduleData.length
    }).catch((err) => {
        console.error('儲存景點失敗:', err);
        alert('❌ 儲存失敗，請檢查網路連線後再試一次！');
    });
    closeScheduleModal();
}
function deleteSchedule(id) {
    if (confirm("確定要刪除這個景點嗎？")) set(ref(db, `trips/${state.tripCode}/scheduleData/${id}`), null);
}
function toggleScheduleCheck(id) {
    const item = state.scheduleData.find(s => s.id === id);
    if (item) set(ref(db, `trips/${state.tripCode}/scheduleData/${id}/checked`), !item.checked);
}

// 🎒 行李清單操作
function openPackingModal() { document.getElementById('packing-modal').classList.remove('hidden'); renderPackingModalList(); }
function closePackingModal() { document.getElementById('packing-modal').classList.add('hidden'); }
function addPackingItem() {
    const input = document.getElementById('new-packing-item');
    const txt = input.value.trim();
    if (!txt) return;
    const itemId = "pack_" + Date.now();
    set(ref(db, `trips/${state.tripCode}/packingList/${itemId}`), { id: itemId, item: txt, checked: false, sortOrder: state.packingList.length });
    input.value = '';
}
function togglePackingCheck(id, currentChecked) {
    set(ref(db, `trips/${state.tripCode}/packingList/${id}/checked`), !currentChecked);
}
function deletePackingItem(id) {
    set(ref(db, `trips/${state.tripCode}/packingList/${id}`), null);
}
function renderPackingModalList() {
    const list = document.getElementById('modal-items-list');
    list.innerHTML = '';
    state.packingList.forEach(item => {
        const div = document.createElement('div');
        div.setAttribute('data-id', item.id);
        div.className = "flex justify-between items-center p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold";
        div.innerHTML = `
            <div class="flex items-center gap-2.5 text-left flex-1">
                <button onclick="togglePackingCheck('${item.id}', ${item.checked})">
                    <i class="${item.checked ? 'fa-solid fa-square-check text-[#FF9E64]' : 'fa-regular fa-square text-slate-300'} text-base"></i>
                </button>
                <span class="pack-drag-handle cursor-move text-slate-300 mr-1"><i class="fa-solid fa-bars text-[10px]"></i></span>
                <span class="${item.checked ? 'line-through text-slate-400 font-normal' : 'text-slate-700'}">${escapeHtml(item.item)}</span>
            </div>
            <button onclick="deletePackingItem('${item.id}')" class="text-slate-300 hover:text-red-400 px-1"><i class="fa-solid fa-trash-can"></i></button>
        `;
        list.appendChild(div);
    });
    Sortable.create(list, {
        animation: 200,
        handle: '.pack-drag-handle',
        onEnd: function() {
            const updatedIds = Array.from(list.children).map(c => c.getAttribute('data-id'));
            updatedIds.forEach((id, idx) => {
                set(ref(db, `trips/${state.tripCode}/packingList/${id}/sortOrder`), idx);
            });
        }
    });
}

// ────────────────────────────────────────────────────────
// 🧮 快速計算機 (所有旅團成員可用，僅在瀏覽器端運算，不寫入資料庫)
// ────────────────────────────────────────────────────────
let calcExpr = '';
function openCalculatorModal() {
    document.getElementById('calculator-modal').classList.remove('hidden');
}
function closeCalculatorModal() {
    document.getElementById('calculator-modal').classList.add('hidden');
}
function calcUpdateDisplay() {
    const display = document.getElementById('calc-display');
    if (display) display.innerText = calcExpr || '0';
}
function calcPress(val) {
    // 白名單：只允許數字、小數點與四則運算符號
    if (!/^[0-9.+\-*/%]$/.test(val)) return;
    calcExpr += val;
    calcUpdateDisplay();
}
function calcClear() {
    calcExpr = '';
    calcUpdateDisplay();
}
function calcBackspace() {
    calcExpr = calcExpr.slice(0, -1);
    calcUpdateDisplay();
}
function calcEquals() {
    if (!calcExpr) return;
    // 二次驗證：運算式必須只包含數字、小數點與運算符號，杜絕任意程式碼執行風險
    if (!/^[0-9.+\-*/%\s]+$/.test(calcExpr)) {
        calcExpr = '錯誤';
        calcUpdateDisplay();
        return;
    }
    try {
        const result = Function('"use strict"; return (' + calcExpr + ')')();
        if (result === Infinity || result === -Infinity || Number.isNaN(result)) {
            calcExpr = '錯誤';
        } else {
            calcExpr = String(Math.round(result * 1e8) / 1e8);
        }
    } catch (e) {
        calcExpr = '錯誤';
    }
    calcUpdateDisplay();
}

// ────────────────────────────────────────────────────────
// 📖 求婚顧問後台：動態投影片渲染與儲存（支援動態增刪）
// ────────────────────────────────────────────────────────
function renderAdminSlides() {
    const container = document.getElementById('admin-slides-container');
    if (!container) return;
    container.innerHTML = '';

    state.proposalSlides.forEach((slide, idx) => {
        const isLast = (idx === state.proposalSlides.length - 1);
        const div = document.createElement('div');
        div.className = "p-3 bg-white border border-slate-100 rounded-xl space-y-2 text-xs relative";
        div.innerHTML = `
            <div class="font-black text-slate-400 flex justify-between items-center">
                <span>頁面 ${idx + 1}</span>
                <div class="flex items-center gap-2">
                    ${isLast ? '<span class="text-red-400 font-bold">🏁 最終決策頁</span>' : `
                        <button onclick="deleteProposalSlide(${idx})" class="text-slate-400 hover:text-red-500 font-bold px-1 py-0.5 border border-slate-200 rounded">
                            <i class="fa-solid fa-trash-can mr-1"></i>刪除
                        </button>
                    `}
                </div>
            </div>
            <input type="text" value="${escapeHtml(slide.text || '')}" placeholder="請輸入本頁告白文字" class="w-full px-2 py-1 border rounded-md slide-text-input">
            <input type="text" value="${escapeHtml(slide.imgUrl || '')}" placeholder="請輸入本頁背景/照片 URL" class="w-full px-2 py-1 border rounded-md slide-img-input text-[11px] font-mono">
            ${isLast ? `
                <input type="text" value="${escapeHtml(slide.choices || '我願意 💍, 超級願意 ❤️')}" placeholder="按鈕選項 (用逗號隔開)" class="w-full px-2 py-1 border rounded-md slide-choices-input">
            ` : ''}
        `;
        container.appendChild(div);
    });
    // 動態加上「+ 新增告白頁面」按鈕
    const addPageBtn = document.createElement('button');
    addPageBtn.className = "w-full py-2.5 bg-orange-50 border border-orange-100 rounded-xl text-xs font-black text-[#FF9E64] mt-2 hover:bg-orange-100/50 transition";
    addPageBtn.innerText = "+ 插入新告白頁面";
    addPageBtn.onclick = addProposalSlide;
    container.appendChild(addPageBtn);
}

// 動態新增：在「最終決策頁」的前面插入一頁
function addProposalSlide() {
    syncLocalSlidesState();
    const insertIndex = state.proposalSlides.length - 1;
    const newSlide = { text: '新告白文字...', imgUrl: '' };
    if (insertIndex < 0) {
        state.proposalSlides.push(newSlide);
    } else {
        state.proposalSlides.splice(insertIndex, 0, newSlide);
    }
    renderAdminSlides();
}

// 動態刪除指定頁面
function deleteProposalSlide(idx) {
    if (idx === state.proposalSlides.length - 1) return alert("❌ 無法刪除最終決策頁！");
    if (confirm(`確定要刪除第 ${idx + 1} 頁告白嗎？`)) {
        syncLocalSlidesState();
        state.proposalSlides.splice(idx, 1);
        renderAdminSlides();
    }
}

// 輔助函式：將畫面上輸入的值即時同步回核心 state 陣列中
function syncLocalSlidesState() {
    const container = document.getElementById('admin-slides-container');
    if (!container) return;
    const cards = Array.from(container.children).filter(el => el.classList.contains('p-3'));

    cards.forEach((card, i) => {
        if (!state.proposalSlides[i]) return;
        state.proposalSlides[i].text = card.querySelector('.slide-text-input').value.trim();
        state.proposalSlides[i].imgUrl = card.querySelector('.slide-img-input').value.trim();
        const choicesInput = card.querySelector('.slide-choices-input');
        if (choicesInput) {
            state.proposalSlides[i].choices = choicesInput.value.trim();
        }
    });
}

function saveProposalSlides() {
    syncLocalSlidesState();
    const musicUrlInput = document.getElementById('admin-proposal-music-url');
    const musicUrl = musicUrlInput ? musicUrlInput.value.trim() : '';

    if (musicUrl && !isLikelyYoutubeUrl(musicUrl)) {
        const proceed = confirm('這個連結看起來不像 YouTube 連結，仍要繼續儲存嗎？');
        if (!proceed) return;
    }

    // 用 update() 一次寫入多個路徑，確保投影片內容與音樂連結同時成功或同時失敗，避免資料不一致
    const updates = {};
    updates[`trips/${state.tripCode}/proposalSlides`] = state.proposalSlides;
    updates[`trips/${state.tripCode}/proposalMusicUrl`] = musicUrl;

    update(ref(db), updates)
        .then(() => alert('🎉 求婚動態計畫（含背景音樂設定）已成功同步至資料庫！'))
        .catch((err) => {
            console.error('儲存求婚計畫失敗:', err);
            alert('❌ 儲存失敗，請檢查網路連線後再試一次！');
        });
}

function saveAdminSettings() {
    const days = parseInt(document.getElementById('admin-total-days').value);
    const title = document.getElementById('admin-trip-title').value.trim();
    const city = document.getElementById('admin-weather-city').value.trim();
    const temp = document.getElementById('admin-weather-temp').value.trim();
    if (!(days >= 1 && days <= 30)) {
        alert('⚠️ 總天數請輸入 1~30 之間的數字！');
        return;
    }
    set(ref(db, `trips/${state.tripCode}/meta`), {
        totalDays: days, tripTitle: title, weatherCity: city, weatherTemp: temp
    }).then(() => alert('🎉 基礎與天氣資訊修改成功！'))
      .catch((err) => {
          console.error('儲存基礎設定失敗:', err);
          alert('❌ 儲存失敗，請檢查網路連線後再試一次！');
      });
}

// ────────────────────────────────────────────────────────
// 🔒 求婚啟動控制
// ────────────────────────────────────────────────────────
function previewProposalWindow() {
    console.log("🔍 開啟管理員專屬靜態預覽（不更改雲端發射狀態，防漏餡）");
    window.open(`proposal.html?code=${state.tripCode}&preview=true`, '_blank');
}

function toggleProposalReadyState(isChecked) {
    const btn = document.getElementById('admin-launch-btn');
    if (btn) btn.disabled = !isChecked;
    set(ref(db, `trips/${state.tripCode}/proposalReady`), isChecked);
    if (!isChecked) {
        set(ref(db, `trips/${state.tripCode}/proposalSignal`), false);
    }
}

function triggerProposalSignal(status) {
    console.log("嘗試將訊號寫入 Firebase:", status);
    if (status && !state.proposalReady) {
        alert("🔒 系統保護：請先開啟下方的安全模式總開關！");
        return;
    }
    set(ref(db, `trips/${state.tripCode}/proposalSignal`), status).then(() => {
        if (status) {
            set(ref(db, `trips/${state.tripCode}/currentSlideIndex`), 0);
            console.log("🚀 求婚訊號已發射！");
        } else {
            alert('求婚計畫已收回！');
        }
    }).catch((error) => {
        console.error("寫入失敗:", error);
        alert('❌ 訊號寫入失敗，請檢查網路連線！');
    });
}

function syncSlidePage(direction) {
    let nextIdx = state.currentSlideIndex + direction;
    if (nextIdx < 0) nextIdx = 0;
    if (nextIdx >= state.proposalSlides.length) nextIdx = state.proposalSlides.length - 1;
    set(ref(db, `trips/${state.tripCode}/currentSlideIndex`), nextIdx);
}

// ⚙️ 安全密碼鎖
let pendingAction = null;
function triggerSecureAction(type) { pendingAction = type; document.getElementById('security-password-input').value = ''; document.getElementById('security-modal').classList.remove('hidden'); }
function closeSecurityModal() { document.getElementById('security-modal').classList.add('hidden'); }
function verifySecurityPassword() {
    if (document.getElementById('security-password-input').value === state.plannerPassword) {
        closeSecurityModal();
        if (pendingAction === 'admin') switchScreen('admin');
    } else { alert('❌ 安全密碼錯誤！'); }
}

function switchScreen(screenId) {
    ['screen-login', 'screen-trip', 'screen-admin'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
    document.getElementById(`screen-${screenId}`)?.classList.remove('hidden');
    state.currentScreen = screenId;
    if (screenId === 'trip') renderTripScreen();
}

// 註冊全域函數
window.switchLoginTab = switchLoginTab; window.handleAuthSubmit = handleAuthSubmit; window.handleFaceIDLogin = handleFaceIDLogin;
window.openScheduleModal = openScheduleModal; window.closeScheduleModal = closeScheduleModal; window.saveScheduleForm = saveScheduleForm;
window.deleteSchedule = deleteSchedule; window.toggleScheduleCheck = toggleScheduleCheck; window.openPackingModal = openPackingModal;
window.closePackingModal = closePackingModal; window.addPackingItem = addPackingItem; window.togglePackingCheck = togglePackingCheck;
window.deletePackingItem = deletePackingItem; window.triggerSecureAction = triggerSecureAction; window.closeSecurityModal = closeSecurityModal;
window.verifySecurityPassword = verifySecurityPassword;
window.triggerProposalSignal = triggerProposalSignal;
window.switchScreen = switchScreen;
window.saveAdminSettings = saveAdminSettings;
window.saveProposalSlides = saveProposalSlides;
window.syncSlidePage = syncSlidePage;
window.addProposalSlide = addProposalSlide;
window.deleteProposalSlide = deleteProposalSlide;
window.previewProposalWindow = previewProposalWindow;
window.toggleProposalReadyState = toggleProposalReadyState;
window.openItemMap = openItemMap;
window.openCalculatorModal = openCalculatorModal;
window.closeCalculatorModal = closeCalculatorModal;
window.calcPress = calcPress;
window.calcClear = calcClear;
window.calcBackspace = calcBackspace;
window.calcEquals = calcEquals;