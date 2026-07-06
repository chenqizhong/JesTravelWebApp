import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

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
const auth = getAuth(app);
const authReady = signInAnonymously(auth).catch((err) => {
    console.error("Firebase 匿名登入失敗:", err);
});

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
    expenseMembers: [],
    expenseRecords: [],
    proposalSlides: [
        { text: '這趟旅程，看似是一起計畫的冒險...', imgUrl: '' },
        { text: '但其實，這是我這輩子最用心的佈局。', imgUrl: '' },
        { text: '未來的日子，妳願意讓我繼續照顧妳嗎？', imgUrl: '', choices: '我願意 💍, 超級願意 ❤️' }
    ],
    proposalMusicUrl: '',
    currentSlideIndex: 0,
    proposalSignal: false,
    proposalReady: false,
    proposalPreviewMode: false // true：admin正在「獨享預覽」，此時不套用自動連動跳轉規則
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

// 使用者常常忘記打 https://，這裡自動補上，避免連結被瀏覽器當成本站內的相對路徑而打不開
function normalizeLinkUrl(url) {
    if (!url) return '';
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

// 圖片網址即時檢查：貼上網址後試著載入一次，成功/失敗都會顯示提示文字。
// 另外會自動把 Google Drive 的「分享連結」格式轉換成比較有機會能直接顯示的格式，
// 但 Google Drive／HackMD 這類服務本質上是「網頁」，仍可能因為平台政策改變而失效，
// 這裡的檢查機制就是為了讓 admin 在設定當下就能發現問題，而不是等到求婚當天才出包。
let previewImageDebounceTimers = {};
function previewImageUrl(inputId, hintId) {
    clearTimeout(previewImageDebounceTimers[hintId]);
    previewImageDebounceTimers[hintId] = setTimeout(() => doPreviewImageUrl(inputId, hintId), 400);
}
function doPreviewImageUrl(inputId, hintId) {
    const input = document.getElementById(inputId);
    const hint = document.getElementById(hintId);
    if (!input || !hint) return;
    let url = input.value.trim();
    if (!url) { hint.innerText = ''; return; }

    const driveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch) {
        url = `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
        input.value = url;
    }

    hint.innerText = '檢查圖片連結中...';
    hint.className = 'text-[10px] mt-1 min-h-[14px] text-slate-400';
    const testImg = new Image();
    testImg.onload = () => {
        if (input.value.trim() === url) {
            hint.innerText = '✅ 這個網址可以正常顯示圖片';
            hint.className = 'text-[10px] mt-1 min-h-[14px] text-green-500 font-bold';
        }
    };
    testImg.onerror = () => {
        if (input.value.trim() === url) {
            hint.innerText = '❌ 這個網址無法顯示圖片，建議改用 imgur.com 或 postimages.org 上傳後取得的直連圖片網址';
            hint.className = 'text-[10px] mt-1 min-h-[14px] text-red-400 font-bold';
        }
    };
    testImg.src = url;
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
    await authReady;
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
        title.innerHTML = "建立新旅團或加入密謀<img class=\"inline-block h-[2.2em] align-middle ml-1\" src=\"LOGO.gif\" alt=\"海豹\">";
        submitBtn.innerText = "註冊旅團帳號";
    } else {
        loginBtn.className = "flex-1 py-2 text-xs font-black rounded-lg bg-white text-slate-700 shadow-sm transition-all";
        regBtn.className = "flex-1 py-2 text-xs font-bold rounded-lg text-slate-400 hover:text-slate-600 transition-all";
        title.innerHTML = "沒有腳怎麼去旅遊<img class=\"inline-block h-[2.2em] align-middle ml-1\" src=\"LOGO.gif\" alt=\"海豹\">";
        submitBtn.innerText = "確認登入";
    }
}

async function handleAuthSubmit() {
    const tripCode = document.getElementById('trip-code-input').value.trim().toUpperCase();
    const account = document.getElementById('user-account-input').value.trim().toLowerCase();
    const password = document.getElementById('user-password-input').value.trim();
    if (!tripCode || !account || !password) return alert('請填寫所有欄位！');
    await authReady;
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

    // 監聽費用分攤：成員清單
    onValue(ref(db, `trips/${state.tripCode}/expenseMembers`), (snapshot) => {
        state.expenseMembers = snapshot.exists() ? Object.values(snapshot.val()) : [];
        if (!document.getElementById('expense-modal').classList.contains('hidden')) {
            renderExpenseModal();
        }
    });

    // 監聽費用分攤：花費紀錄
    onValue(ref(db, `trips/${state.tripCode}/expenseRecords`), (snapshot) => {
        state.expenseRecords = snapshot.exists() ? Object.values(snapshot.val()) : [];
        if (!document.getElementById('expense-modal').classList.contains('hidden')) {
            renderExpenseModal();
        }
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

        // 2-2. 同步安全開關 checkbox 的勾選狀態，避免「畫面看起來是關的，但其實資料庫是開的」這種誤導
        const readyToggle = document.getElementById('admin-proposal-ready-toggle');
        if (readyToggle) {
            readyToggle.checked = state.proposalReady;
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

        // 5. 🚀 全員自動連動（同視窗切換，不開新分頁）：
        //    訊號開 -> 所有人自動被帶進求婚畫面；訊號關 -> 所有人自動被送回行程。
        //    admin 若正在「獨享預覽」中，則不套用這條自動規則，避免預覽被打斷。
        if (!state.proposalPreviewMode) {
            if (state.proposalSignal === true && state.currentScreen !== 'proposal') {
                switchScreen('proposal');
            } else if (state.proposalSignal === false && state.currentScreen === 'proposal') {
                switchScreen('trip');
            } else if (state.currentScreen === 'proposal') {
                // 已經在求婚畫面上，且訊號沒有變化 -> 單純刷新頁面內容（例如有人按了上一頁/下一頁）
                renderProposalScreen();
            }
        } else if (state.currentScreen === 'proposal') {
            renderProposalScreen();
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
let scheduleSortableInstance = null;
let isScheduleReorderMode = false;

function toggleScheduleReorderMode() {
    isScheduleReorderMode = !isScheduleReorderMode;
    renderTripScreen();
}

let lastMapCity = null;
function updateMapDisplay() {
    const iframe = document.getElementById('google-map-iframe');
    if (!iframe) return;
    const city = (state.weatherCity || '').trim();
    if (!city || lastMapCity === city) return;
    lastMapCity = city;
    iframe.src = `https://www.google.com/maps?q=${encodeURIComponent(city)}&output=embed`;
}

function renderTripScreen() {
    const header = document.getElementById('trip-header');
    header.innerHTML = `
        <div>
            <span class="text-[10px] bg-orange-50 text-[#FF9E64] font-black px-2 py-0.5 rounded-md tracking-wider">團號：${escapeHtml(state.tripCode)} (${escapeHtml(state.userAccount)})</span>
            <h1 class="text-xl font-black text-[#FF9E64] mt-1">${escapeHtml(state.tripTitle)} ✈️</h1>
        </div>
        <div class="flex gap-2">
            <button onclick="openExpenseModal()" class="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition" title="費用分攤"><i class="fa-solid fa-sack-dollar text-xs"></i></button>
            <button onclick="openCalculatorModal()" class="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition" title="計算機"><i class="fa-solid fa-calculator text-xs"></i></button>
            ${state.isPlanner ? `
                <button onclick="triggerSecureAction('admin')" class="w-8 h-8 rounded-full bg-orange-50/50 flex items-center justify-center text-[#FF9E64] hover:bg-orange-100/50 transition"><i class="fa-solid fa-gear text-xs"></i></button>
            ` : ''}
        </div>
    `;

    updateWeatherDisplay();
    updateMapDisplay();

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

    const reorderBtn = document.getElementById('schedule-reorder-toggle-btn');
    if (reorderBtn) {
        reorderBtn.innerHTML = isScheduleReorderMode
            ? '<i class="fa-solid fa-check"></i> 完成排序'
            : '<i class="fa-solid fa-arrows-up-down"></i> 排序';
        reorderBtn.className = isScheduleReorderMode
            ? "text-[11px] font-bold text-white px-3 py-1 rounded-lg bg-[#FF9E64] flex items-center gap-1"
            : "text-[11px] font-bold text-slate-400 px-3 py-1 rounded-lg bg-slate-50 border border-slate-100 flex items-center gap-1";
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
            card.className = `bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col ${item.checked ? 'bg-slate-50/70 border-slate-200/50 shadow-none opacity-60' : ''} ${isScheduleReorderMode ? 'reorder-jiggle' : ''}`;
            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <div class="flex items-center gap-3 flex-1">
                        <button onclick="toggleScheduleCheck('${item.id}')" class="text-base shrink-0" ${isScheduleReorderMode ? 'disabled' : ''}>
                            <i class="${item.checked ? 'fa-solid fa-circle-check text-[#FF9E64]' : 'fa-regular fa-circle text-slate-300'}"></i>
                        </button>
                        <div class="flex items-center gap-2">
                            <span class="bg-orange-50 text-[#FF9E64] text-[10px] font-black px-2 py-0.5 rounded-md">${escapeHtml(item.time)}</span>
                            <h3 class="font-bold text-slate-800 text-sm ${item.checked ? 'line-through text-slate-400 font-normal' : ''}">${escapeHtml(item.title)}</h3>
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        ${isScheduleReorderMode ? '<i class="fa-solid fa-arrows-up-down text-slate-300 text-xs px-1"></i>' : `
                            <button class="map-btn text-slate-400 hover:text-blue-500 text-xs p-1" data-title="${escapeHtml(item.title)}" title="在 Google 地圖上查看"><i class="fa-solid fa-map-location-dot"></i></button>
                            <button onclick="openScheduleModal('${item.id}')" class="text-slate-400 hover:text-[#FF9E64] text-xs p-1"><i class="fa-solid fa-pen"></i></button>
                            <button onclick="deleteSchedule('${item.id}')" class="text-slate-400 hover:text-red-400 text-xs p-1"><i class="fa-solid fa-trash"></i></button>
                        `}
                    </div>
                </div>
                ${item.imgUrl ? `<img src="${escapeHtml(item.imgUrl)}" class="w-full h-24 object-cover rounded-xl mt-2 shadow-sm">` : ''}
                ${item.desc ? `<p class="text-xs text-slate-500 pl-7 mt-1.5 whitespace-pre-line">${escapeHtml(item.desc)}</p>` : ''}
                ${(item.link && !isScheduleReorderMode) ? `<a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" class="mt-2 inline-flex items-center gap-1.5 self-start bg-orange-50 text-[#FF9E64] text-[11px] font-bold px-3 py-1.5 rounded-full hover:bg-orange-100/70 transition"><i class="fa-solid fa-arrow-up-right-from-square"></i> 開啟參考連結</a>` : ''}
            `;
            container.appendChild(card);
        });

        // Sortable 只建立「一次」實例，之後只切換 disabled 狀態 —
        // 這是修正手機拖曳排序失效的關鍵：先前每次重新渲染都會多建立一個新的 Sortable 實例，
        // 疊加起來的多組觸控事件監聽器彼此衝突，導致手機上完全無法觸發拖曳。
        if (!scheduleSortableInstance) {
            scheduleSortableInstance = Sortable.create(container, {
                animation: 200,
                forceFallback: true,   // 統一用模擬拖曳事件，避免不同手機瀏覽器的原生拖曳支援不一致
                fallbackTolerance: 3,
                disabled: !isScheduleReorderMode,
                onEnd: function () {
                    const updatedIds = Array.from(container.children).map(child => child.getAttribute('data-id')).filter(id => id);
                    updatedIds.forEach((id, index) => {
                        set(ref(db, `trips/${state.tripCode}/scheduleData/${id}/sortOrder`), index);
                    });
                }
            });
        } else {
            scheduleSortableInstance.option('disabled', !isScheduleReorderMode);
        }
    }

    if (!isScheduleReorderMode) {
        const addBtn = document.createElement('button');
        addBtn.className = "w-full py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-400 mt-2";
        addBtn.innerText = "+ 新增此日行程景點";
        addBtn.onclick = () => openScheduleModal(null);
        container.appendChild(addBtn);
    }
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

function openScheduleModal(id = null) {
    document.getElementById('schedule-modal').classList.remove('hidden');
    if (id) {
        const item = state.scheduleData.find(s => s.id === id);
        document.getElementById('form-schedule-id').value = id;
        document.getElementById('form-schedule-time').value = item.time;
        document.getElementById('form-schedule-name').value = item.title;
        document.getElementById('form-schedule-desc').value = item.desc || '';
        document.getElementById('form-schedule-img').value = item.imgUrl || '';
        document.getElementById('form-schedule-link').value = item.link || '';
        document.getElementById('schedule-modal-title').innerText = "✏️ 編輯行程景點";
    } else {
        document.getElementById('form-schedule-id').value = '';
        document.getElementById('form-schedule-time').value = '12:00';
        document.getElementById('form-schedule-name').value = '';
        document.getElementById('form-schedule-desc').value = '';
        document.getElementById('form-schedule-img').value = '';
        document.getElementById('form-schedule-link').value = '';
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
    const link = normalizeLinkUrl(document.getElementById('form-schedule-link').value.trim());
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
        link,
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
let packingSortableInstance = null;
let isPackingReorderMode = false;

function togglePackingReorderMode() {
    isPackingReorderMode = !isPackingReorderMode;
    renderPackingModalList();
}

function openPackingModal() {
    isPackingReorderMode = false;
    document.getElementById('packing-modal').classList.remove('hidden');
    renderPackingModalList();
}
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

    const reorderBtn = document.getElementById('packing-reorder-toggle-btn');
    if (reorderBtn) {
        reorderBtn.innerHTML = isPackingReorderMode
            ? '<i class="fa-solid fa-check"></i> 完成'
            : '<i class="fa-solid fa-arrows-up-down"></i> 排序';
        reorderBtn.className = isPackingReorderMode
            ? "text-[11px] font-bold text-white px-2.5 py-1 rounded-lg bg-[#FF9E64] flex items-center gap-1"
            : "text-[11px] font-bold text-slate-400 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-100 flex items-center gap-1";
    }

    state.packingList.forEach(item => {
        const div = document.createElement('div');
        div.setAttribute('data-id', item.id);
        div.className = `flex justify-between items-center p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold ${isPackingReorderMode ? 'reorder-jiggle' : ''}`;
        div.innerHTML = `
            <div class="flex items-center gap-2.5 text-left flex-1">
                <button onclick="togglePackingCheck('${item.id}', ${item.checked})" ${isPackingReorderMode ? 'disabled' : ''}>
                    <i class="${item.checked ? 'fa-solid fa-square-check text-[#FF9E64]' : 'fa-regular fa-square text-slate-300'} text-base"></i>
                </button>
                <span class="${item.checked ? 'line-through text-slate-400 font-normal' : 'text-slate-700'}">${escapeHtml(item.item)}</span>
            </div>
            ${isPackingReorderMode ? '<i class="fa-solid fa-arrows-up-down text-slate-300 text-xs px-1"></i>' : `<button onclick="deletePackingItem('${item.id}')" class="text-slate-300 hover:text-red-400 px-1"><i class="fa-solid fa-trash-can"></i></button>`}
        `;
        list.appendChild(div);
    });

    if (!packingSortableInstance) {
        packingSortableInstance = Sortable.create(list, {
            animation: 200,
            forceFallback: true,
            fallbackTolerance: 3,
            disabled: !isPackingReorderMode,
            onEnd: function() {
                const updatedIds = Array.from(list.children).map(c => c.getAttribute('data-id'));
                updatedIds.forEach((id, idx) => {
                    set(ref(db, `trips/${state.tripCode}/packingList/${id}/sortOrder`), idx);
                });
            }
        });
    } else {
        packingSortableInstance.option('disabled', !isPackingReorderMode);
    }
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
// 💰 費用分攤功能（所有旅團成員可用，資料即時同步）
// ────────────────────────────────────────────────────────
function openExpenseModal() {
    document.getElementById('expense-modal').classList.remove('hidden');
    resetExpenseForm();
    renderExpenseModal();
}
function closeExpenseModal() {
    document.getElementById('expense-modal').classList.add('hidden');
}

function addExpenseMember() {
    const input = document.getElementById('new-expense-member');
    const name = input.value.trim();
    if (!name) return;
    if (state.expenseMembers.some(m => m.name === name)) {
        alert('⚠️ 已經有同名的成員了，換個名字或直接使用現有成員吧！');
        return;
    }
    const memberId = "member_" + Date.now();
    set(ref(db, `trips/${state.tripCode}/expenseMembers/${memberId}`), {
        id: memberId, name, sortOrder: state.expenseMembers.length
    }).catch((err) => {
        console.error('新增成員失敗:', err);
        alert('❌ 新增失敗，請檢查網路連線後再試一次！');
    });
    input.value = '';
}

function deleteExpenseMember(memberId) {
    // 防呆：這位成員如果還牽涉到任何一筆花費紀錄，不能直接刪除，避免結算金額算錯或出現「查無此人」的孤兒資料
    const isUsed = state.expenseRecords.some(e => e.payerId === memberId || (e.participantIds || []).includes(memberId));
    if (isUsed) {
        alert('⚠️ 這位成員還有相關的花費紀錄，請先處理(刪除或修改)相關花費後，才能刪除這位成員。');
        return;
    }
    if (confirm('確定要刪除這位成員嗎？')) {
        set(ref(db, `trips/${state.tripCode}/expenseMembers/${memberId}`), null);
    }
}

function saveExpenseRecordForm() {
    const id = document.getElementById('form-expense-id').value;
    const desc = document.getElementById('form-expense-desc').value.trim();
    const amount = parseFloat(document.getElementById('form-expense-amount').value);
    const currency = (document.getElementById('form-expense-currency').value.trim() || 'TWD').toUpperCase();
    const payerId = document.getElementById('form-expense-payer').value;
    const participantIds = Array.from(document.querySelectorAll('.expense-participant-checkbox:checked')).map(el => el.value);

    if (!desc) return alert('請輸入花費項目名稱！');
    if (!amount || amount <= 0 || Number.isNaN(amount)) return alert('請輸入正確的金額（需大於 0）！');
    if (!payerId) return alert('請選擇是誰先付的錢！');
    if (participantIds.length === 0) return alert('請至少勾選一位分攤成員！');

    const expenseId = id ? id : "expense_" + Date.now();
    const existing = state.expenseRecords.find(e => e.id === id);
    set(ref(db, `trips/${state.tripCode}/expenseRecords/${expenseId}`), {
        id: expenseId,
        description: desc,
        amount,
        currency,
        payerId,
        participantIds,
        createdAt: existing ? existing.createdAt : Date.now()
    }).then(() => {
        resetExpenseForm();
    }).catch((err) => {
        console.error('儲存花費失敗:', err);
        alert('❌ 儲存失敗，請檢查網路連線後再試一次！');
    });
}

function resetExpenseForm() {
    const idInput = document.getElementById('form-expense-id');
    if (!idInput) return; // 尚未開啟過費用分攤視窗，不用處理
    idInput.value = '';
    document.getElementById('form-expense-desc').value = '';
    document.getElementById('form-expense-amount').value = '';
    document.getElementById('form-expense-currency').value = '';
    document.getElementById('form-expense-payer').value = '';
    document.getElementById('expense-form-title').innerText = '新增一筆花費';
    const participantsBox = document.getElementById('form-expense-participants');
    if (participantsBox) participantsBox.dataset.rendered = 'false'; // 下次渲染恢復「全員均分」預設勾選
    renderExpenseParticipantForm();
}

function editExpenseRecord(id) {
    const item = state.expenseRecords.find(e => e.id === id);
    if (!item) return;
    document.getElementById('form-expense-id').value = item.id;
    document.getElementById('form-expense-desc').value = item.description;
    document.getElementById('form-expense-amount').value = item.amount;
    document.getElementById('form-expense-currency').value = item.currency;
    document.getElementById('expense-form-title').innerText = '編輯花費紀錄';
    renderExpensePayerOptions();
    document.getElementById('form-expense-payer').value = item.payerId;
    const participantsBox = document.getElementById('form-expense-participants');
    if (participantsBox) participantsBox.dataset.rendered = 'true'; // 標記為已渲染，避免下面重繪又蓋回全選
    renderExpenseParticipantForm();
    document.querySelectorAll('.expense-participant-checkbox').forEach(cb => {
        cb.checked = (item.participantIds || []).includes(cb.value);
    });
    // 捲動到表單位置，方便使用者看到正在編輯的內容
    document.getElementById('form-expense-desc').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function deleteExpenseRecord(id) {
    if (confirm('確定要刪除這筆花費紀錄嗎？')) {
        set(ref(db, `trips/${state.tripCode}/expenseRecords/${id}`), null);
    }
}

function renderExpenseMembersChips() {
    const list = document.getElementById('expense-members-list');
    if (!list) return;
    list.innerHTML = '';
    if (state.expenseMembers.length === 0) {
        list.innerHTML = '<span class="text-[11px] text-slate-300">尚未新增成員，請先在下方新增</span>';
        return;
    }
    state.expenseMembers.forEach(m => {
        const chip = document.createElement('span');
        chip.className = "inline-flex items-center gap-1.5 bg-orange-50 text-[#FF9E64] text-xs font-bold px-2.5 py-1 rounded-full";
        chip.innerHTML = `${escapeHtml(m.name)} <button title="刪除成員" class="text-orange-300 hover:text-red-400"><i class="fa-solid fa-xmark"></i></button>`;
        chip.querySelector('button').onclick = () => deleteExpenseMember(m.id);
        list.appendChild(chip);
    });
}

function renderExpensePayerOptions() {
    const payerSelect = document.getElementById('form-expense-payer');
    if (!payerSelect) return;
    const currentVal = payerSelect.value;
    payerSelect.innerHTML = '<option value="">請選擇付款人</option>' +
        state.expenseMembers.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    if (currentVal && state.expenseMembers.some(m => m.id === currentVal)) {
        payerSelect.value = currentVal;
    }
}

function renderExpenseParticipantForm() {
    const box = document.getElementById('form-expense-participants');
    if (!box) return;
    // 保留使用者目前已勾選的項目，避免每次重繪(例如新增成員後)把剛勾好的選項清空
    const checkedIds = new Set(Array.from(box.querySelectorAll('.expense-participant-checkbox:checked')).map(el => el.value));
    const isFirstRender = box.dataset.rendered !== 'true';
    box.innerHTML = state.expenseMembers.map(m => `
        <label class="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-full px-2.5 py-1 text-[11px] cursor-pointer">
            <input type="checkbox" value="${m.id}" class="expense-participant-checkbox" ${(isFirstRender || checkedIds.has(m.id)) ? 'checked' : ''}>
            ${escapeHtml(m.name)}
        </label>
    `).join('') || '<span class="text-[11px] text-slate-300">請先新增成員</span>';
    box.dataset.rendered = 'true';
}

function renderExpenseRecordsList() {
    const list = document.getElementById('expense-records-list');
    if (!list) return;
    if (state.expenseRecords.length === 0) {
        list.innerHTML = '<p class="text-[11px] text-slate-300 text-center py-3">尚未有任何花費紀錄</p>';
        return;
    }
    const nameMap = {};
    state.expenseMembers.forEach(m => nameMap[m.id] = m.name);

    list.innerHTML = '';
    state.expenseRecords.forEach(exp => {
        const payerName = nameMap[exp.payerId] || '(已刪除的成員)';
        const participantNames = (exp.participantIds || []).map(id => nameMap[id] || '(已刪除的成員)').join('、');
        const div = document.createElement('div');
        div.className = "bg-white border border-slate-100 rounded-xl p-2.5 text-xs shadow-sm";
        div.innerHTML = `
            <div class="flex justify-between items-start gap-2">
                <div class="flex-1 min-w-0">
                    <p class="font-bold text-slate-700">${escapeHtml(exp.description)}</p>
                    <p class="text-slate-400 mt-0.5">${escapeHtml(payerName)} 付了 <span class="font-black text-[#FF9E64]">${escapeHtml(String(exp.amount))} ${escapeHtml(exp.currency)}</span></p>
                    <p class="text-slate-300 text-[10px] mt-0.5 truncate">均分：${escapeHtml(participantNames)}</p>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                    <button onclick="editExpenseRecord('${exp.id}')" class="text-slate-400 hover:text-[#FF9E64] p-1"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="deleteExpenseRecord('${exp.id}')" class="text-slate-400 hover:text-red-400 p-1"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `;
        list.appendChild(div);
    });
}

// 依幣別分開結算(不做匯率換算)，用貪婪演算法算出「最少轉帳次數」的還款建議
function computeExpenseSettlements() {
    const currencies = [...new Set(state.expenseRecords.map(e => e.currency))];
    const nameMap = {};
    state.expenseMembers.forEach(m => nameMap[m.id] = m.name);

    return currencies.map(currency => {
        const balances = {};
        state.expenseMembers.forEach(m => balances[m.id] = 0);

        state.expenseRecords.filter(e => e.currency === currency).forEach(exp => {
            const participants = exp.participantIds || [];
            if (participants.length === 0) return;
            const share = exp.amount / participants.length;
            if (balances[exp.payerId] === undefined) balances[exp.payerId] = 0;
            balances[exp.payerId] += exp.amount;
            participants.forEach(pid => {
                if (balances[pid] === undefined) balances[pid] = 0;
                balances[pid] -= share;
            });
        });

        const creditors = [];
        const debtors = [];
        Object.keys(balances).forEach(id => {
            const amt = Math.round(balances[id] * 100) / 100;
            if (amt > 0.01) creditors.push({ id, amt });
            else if (amt < -0.01) debtors.push({ id, amt: -amt });
        });

        const settlements = [];
        let i = 0, j = 0;
        while (i < debtors.length && j < creditors.length) {
            const pay = Math.min(debtors[i].amt, creditors[j].amt);
            settlements.push({
                from: nameMap[debtors[i].id] || '(已刪除的成員)',
                to: nameMap[creditors[j].id] || '(已刪除的成員)',
                amount: Math.round(pay * 100) / 100
            });
            debtors[i].amt -= pay;
            creditors[j].amt -= pay;
            if (debtors[i].amt <= 0.01) i++;
            if (creditors[j].amt <= 0.01) j++;
        }
        return { currency, settlements };
    });
}

function renderExpenseSettlement() {
    const container = document.getElementById('expense-settlement-result');
    if (!container) return;
    if (state.expenseRecords.length === 0 || state.expenseMembers.length === 0) {
        container.innerHTML = '<p class="text-[11px] text-slate-300 text-center py-3">尚無資料可結算</p>';
        return;
    }
    const results = computeExpenseSettlements();
    container.innerHTML = '';
    results.forEach(({ currency, settlements }) => {
        const block = document.createElement('div');
        block.className = "bg-slate-50 border border-slate-100 rounded-xl p-2.5";
        if (settlements.length === 0) {
            block.innerHTML = `<p class="text-xs font-black text-slate-500 mb-1">${escapeHtml(currency)}</p><p class="text-[11px] text-green-500 font-bold">✅ 這個幣別目前帳務已平衡</p>`;
        } else {
            block.innerHTML = `<p class="text-xs font-black text-slate-500 mb-1.5">${escapeHtml(currency)}</p>` +
                settlements.map(s => `<p class="text-[11px] text-slate-600 py-0.5">👉 <span class="font-bold">${escapeHtml(s.from)}</span> 應付給 <span class="font-bold text-[#FF9E64]">${escapeHtml(s.to)}</span> <span class="font-black">${s.amount}</span> ${escapeHtml(currency)}</p>`).join('');
        }
        container.appendChild(block);
    });
}

function renderExpenseModal() {
    renderExpenseMembersChips();
    renderExpensePayerOptions();
    renderExpenseParticipantForm();
    renderExpenseRecordsList();
    renderExpenseSettlement();
}

// ────────────────────────────────────────────────────────
// 📖 求婚顧問後台：動態投影片渲染與儲存（支援動態增刪、手風琴收合、自動/手動翻頁設定）
// ────────────────────────────────────────────────────────
let expandedSlideIndexes = new Set([0]);

function toggleSlideAccordion(idx) {
    syncLocalSlidesState(); // 收合前先把目前輸入框內容同步回 state，避免收合時遺失還沒儲存的編輯內容
    if (expandedSlideIndexes.has(idx)) expandedSlideIndexes.delete(idx);
    else expandedSlideIndexes.add(idx);
    renderAdminSlides();
}

function onAdvanceModeChange(idx) {
    const secondsInput = document.getElementById(`admin-slide-seconds-${idx}`);
    const radios = document.getElementsByName(`advance-mode-${idx}`);
    let mode = 'manual';
    radios.forEach(r => { if (r.checked) mode = r.value; });
    if (secondsInput) {
        if (mode === 'auto') secondsInput.classList.remove('hidden');
        else secondsInput.classList.add('hidden');
    }
}

function renderAdminSlides() {
    const container = document.getElementById('admin-slides-container');
    if (!container) return;
    container.innerHTML = '';

    state.proposalSlides.forEach((slide, idx) => {
        const isLast = (idx === state.proposalSlides.length - 1);
        const isExpanded = expandedSlideIndexes.has(idx);
        const div = document.createElement('div');
        div.className = "bg-white border border-slate-100 rounded-xl text-xs overflow-hidden";
        div.innerHTML = `
            <button type="button" onclick="toggleSlideAccordion(${idx})" class="w-full flex justify-between items-center p-3 font-black text-slate-500 text-left">
                <span>${isLast ? '🏁 ' : ''}頁面 ${idx + 1}${isLast ? '（最終決策頁）' : ''}</span>
                <i class="fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-slate-300"></i>
            </button>
            <div class="${isExpanded ? '' : 'hidden'} p-3 pt-0 space-y-2">
                <input type="text" value="${escapeHtml(slide.text || '')}" placeholder="請輸入本頁告白文字" class="w-full px-2 py-1 border rounded-md slide-text-input">
                <div>
                    <input type="text" id="admin-slide-img-${idx}" value="${escapeHtml(slide.imgUrl || '')}" placeholder="請輸入本頁背景/照片 URL" class="w-full px-2 py-1 border rounded-md slide-img-input text-[11px] font-mono" oninput="previewImageUrl('admin-slide-img-${idx}', 'admin-slide-img-hint-${idx}')">
                    <p id="admin-slide-img-hint-${idx}" class="text-[10px] mt-1 min-h-[14px]"></p>
                </div>
                ${isLast ? `
                    <input type="text" value="${escapeHtml(slide.choices || '我願意 💍, 超級願意 ❤️')}" placeholder="按鈕選項 (用逗號隔開)" class="w-full px-2 py-1 border rounded-md slide-choices-input">
                ` : `
                    <div class="pt-2 border-t border-slate-100">
                        <label class="text-[10px] font-bold text-slate-400 block mb-1">這一頁怎麼翻到下一頁？</label>
                        <div class="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px]">
                            <label class="flex items-center gap-1">
                                <input type="radio" name="advance-mode-${idx}" value="manual" class="slide-advance-mode-input" ${(!slide.advanceMode || slide.advanceMode === 'manual') ? 'checked' : ''} onchange="onAdvanceModeChange(${idx})"> 手動點擊
                            </label>
                            <label class="flex items-center gap-1">
                                <input type="radio" name="advance-mode-${idx}" value="auto" class="slide-advance-mode-input" ${slide.advanceMode === 'auto' ? 'checked' : ''} onchange="onAdvanceModeChange(${idx})"> 定時自動
                            </label>
                            <span class="flex items-center gap-1">
                                <input type="number" min="1" max="60" value="${slide.autoSeconds || 4}" id="admin-slide-seconds-${idx}" class="slide-auto-seconds-input w-14 px-1.5 py-1 border rounded-md ${slide.advanceMode === 'auto' ? '' : 'hidden'}"> 秒
                            </span>
                        </div>
                    </div>
                    <button onclick="deleteProposalSlide(${idx})" class="text-slate-400 hover:text-red-500 font-bold px-1 py-0.5 border border-slate-200 rounded">
                        <i class="fa-solid fa-trash-can mr-1"></i>刪除此頁
                    </button>
                `}
            </div>
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
    const newSlide = { text: '新告白文字...', imgUrl: '', advanceMode: 'manual', autoSeconds: 4 };
    if (insertIndex < 0) {
        state.proposalSlides.push(newSlide);
        expandedSlideIndexes = new Set([0]);
    } else {
        state.proposalSlides.splice(insertIndex, 0, newSlide);
        expandedSlideIndexes = new Set([insertIndex]);
    }
    renderAdminSlides();
}

// 動態刪除指定頁面
function deleteProposalSlide(idx) {
    if (idx === state.proposalSlides.length - 1) return alert("❌ 無法刪除最終決策頁！");
    if (confirm(`確定要刪除第 ${idx + 1} 頁告白嗎？`)) {
        syncLocalSlidesState();
        state.proposalSlides.splice(idx, 1);
        expandedSlideIndexes = new Set([0]);
        renderAdminSlides();
    }
}

// 輔助函式：將畫面上輸入的值即時同步回核心 state 陣列中
function syncLocalSlidesState() {
    const container = document.getElementById('admin-slides-container');
    if (!container) return;
    const cards = Array.from(container.children).filter(el => el.querySelector('.slide-text-input'));

    cards.forEach((card, i) => {
        if (!state.proposalSlides[i]) return;
        state.proposalSlides[i].text = card.querySelector('.slide-text-input').value.trim();
        state.proposalSlides[i].imgUrl = card.querySelector('.slide-img-input').value.trim();
        const choicesInput = card.querySelector('.slide-choices-input');
        if (choicesInput) {
            state.proposalSlides[i].choices = choicesInput.value.trim();
        }
        const advanceRadio = card.querySelector('.slide-advance-mode-input:checked');
        if (advanceRadio) {
            state.proposalSlides[i].advanceMode = advanceRadio.value;
        }
        const secondsInput = card.querySelector('.slide-auto-seconds-input');
        if (secondsInput) {
            const secs = parseInt(secondsInput.value);
            state.proposalSlides[i].autoSeconds = (secs >= 1 && secs <= 60) ? secs : 4;
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
    state.proposalPreviewMode = true;
    switchScreen('proposal');
}

function exitProposalPreview() {
    state.proposalPreviewMode = false;
    switchScreen('admin');
}

// 所有人都可觸發：結束求婚並返回行程
// 預覽模式下只是單純離開預覽（不動雲端訊號）；正式直播模式下會關閉訊號，讓所有連線裝置一起被送回行程。
function endProposalAndReturn() {
    if (state.proposalPreviewMode) {
        exitProposalPreview();
        return;
    }
    set(ref(db, `trips/${state.tripCode}/proposalSignal`), false).catch((err) => {
        console.error('關閉求婚訊號失敗:', err);
        // 保底：就算雲端寫入失敗，也不要讓使用者卡在求婚畫面出不去
        switchScreen('trip');
    });
    // 不在這裡手動 switchScreen('trip')：等雲端監聽器收到 proposalSignal=false 後，
    // 會自動把「所有人」（包含這個裝置自己）一起帶回行程頁，避免畫面切換邏輯重複觸發。
}

// ────────────────────────────────────────────────────────
// 💍 求婚同步廣播畫面：渲染邏輯
// ────────────────────────────────────────────────────────
// 自動跳頁計時器：只有 admin(求婚發起人)的裝置會啟動這個計時器並寫入下一頁，
// 其他裝置只被動接收 currentSlideIndex 的變化 —— 避免兩支手機同時倒數、同時寫入，
// 造成「一次跳兩頁」的競爭問題。
let autoAdvanceTimerId = null;
function clearAutoAdvanceTimer() {
    if (autoAdvanceTimerId) {
        clearTimeout(autoAdvanceTimerId);
        autoAdvanceTimerId = null;
    }
}

function renderProposalScreen() {
    clearAutoAdvanceTimer(); // 每次重繪先清掉舊計時器，避免翻頁後舊計時器還在背景多跳一次

    const progressContainer = document.getElementById('proposal-progress');
    const contentArea = document.getElementById('proposal-content-area');
    const actionArea = document.getElementById('proposal-action-area');
    if (!progressContainer || !contentArea || !actionArea) return;

    const slides = state.proposalSlides;
    if (!slides || slides.length === 0) {
        progressContainer.innerHTML = '';
        contentArea.innerHTML = `<p class="text-xs text-slate-400 font-bold">目前尚未設定任何告白內容。</p>`;
        actionArea.innerHTML = '';
        return;
    }

    const currentIndex = Math.min(Math.max(state.currentSlideIndex, 0), slides.length - 1);
    const currentSlide = slides[currentIndex];
    const isLastSlide = currentIndex === slides.length - 1;

    // 1. 上方小點進度條
    progressContainer.innerHTML = '';
    slides.forEach((_, idx) => {
        const bar = document.createElement('div');
        bar.className = `h-1 rounded-full flex-1 transition-all duration-500 ${idx <= currentIndex ? 'bg-red-400 shadow-sm' : 'bg-slate-200'}`;
        progressContainer.appendChild(bar);
    });

    // 2. 主畫面內容（告白文字 + 照片）
    contentArea.innerHTML = '';
    if (currentSlide.imgUrl && currentSlide.imgUrl.trim() !== '') {
        const img = document.createElement('img');
        img.src = currentSlide.imgUrl.trim();
        img.className = "w-full max-h-64 object-cover rounded-2xl shadow-md fade-in mb-3 border-2 border-white";
        contentArea.appendChild(img);
    }
    const textParagraph = document.createElement('p');
    textParagraph.className = "text-2xl font-black text-slate-700 leading-relaxed fade-in px-4 whitespace-pre-line";
    textParagraph.innerText = currentSlide.text || '';
    contentArea.appendChild(textParagraph);

    // 3. 底部動作區
    actionArea.innerHTML = '';

    // 3-1. 上一頁 / 下一頁：所有人都能操作，同步控制所有裝置的頁面
    const navRow = document.createElement('div');
    navRow.className = "flex items-center justify-center gap-4 mb-3";
    const prevBtn = document.createElement('button');
    prevBtn.className = "w-10 h-10 rounded-full bg-white border border-slate-200 text-slate-500 shadow-sm flex items-center justify-center disabled:opacity-30 active:scale-95 transition";
    prevBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
    prevBtn.disabled = currentIndex === 0;
    prevBtn.onclick = () => syncSlidePage(-1);
    const nextBtn = document.createElement('button');
    nextBtn.className = "w-10 h-10 rounded-full bg-white border border-slate-200 text-slate-500 shadow-sm flex items-center justify-center disabled:opacity-30 active:scale-95 transition";
    nextBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
    nextBtn.disabled = isLastSlide;
    nextBtn.onclick = () => syncSlidePage(1);
    navRow.appendChild(prevBtn);
    navRow.appendChild(nextBtn);
    actionArea.appendChild(navRow);

    if (isLastSlide) {
        // 3-2. 最終決策頁：抉擇按鈕
        const btnWrapper = document.createElement('div');
        btnWrapper.className = "flex flex-col gap-2 w-full max-w-[240px] mx-auto fade-in";
        const choicesString = currentSlide.choices || "我願意 💍, 超級願意 ❤️";
        const choicesArray = choicesString.split(',');
        choicesArray.forEach(choiceText => {
            const btn = document.createElement('button');
            btn.className = "w-full py-3 bg-red-400 hover:bg-red-500 text-white font-black text-xs rounded-xl shadow-lg active:scale-95 transition-all";
            btn.innerText = choiceText.trim();
            btn.onclick = () => {
                alert('💍 恭喜！！求婚計畫特大成功！！！ 🥂✨❤️');
                endProposalAndReturn();
            };
            btnWrapper.appendChild(btn);
        });
        actionArea.appendChild(btnWrapper);

        // 3-3. 返回行程規劃：所有人都看得到
        const backBtn = document.createElement('button');
        backBtn.className = "mt-3 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-500 px-4 py-2 rounded-xl font-bold shadow-sm transition mx-auto block";
        backBtn.innerText = "↩ 返回行程規劃";
        backBtn.onclick = () => endProposalAndReturn();
        actionArea.appendChild(backBtn);
    } else {
        const hint = document.createElement('div');
        hint.className = "text-center";
        if (currentSlide.advanceMode === 'auto') {
            hint.innerHTML = `<span class="text-[10px] text-slate-300 font-bold tracking-widest"><i class="fa-solid fa-clock text-red-200 mr-1"></i> 即將自動翻到下一頁...</span>`;
        } else {
            hint.innerHTML = `<span class="text-[10px] text-slate-300 font-bold tracking-widest animate-pulse"><i class="fa-solid fa-heart text-red-200 mr-1"></i> 浪漫章節加載中...</span>`;
        }
        actionArea.appendChild(hint);

        // 只有 admin 的裝置負責倒數並推進頁面，避免多裝置同時倒數造成跳兩頁的競爭問題
        if (currentSlide.advanceMode === 'auto' && state.isPlanner) {
            const seconds = Math.max(1, parseInt(currentSlide.autoSeconds) || 4);
            autoAdvanceTimerId = setTimeout(() => {
                syncSlidePage(1);
            }, seconds * 1000);
        }
    }

    // 3-4. 預覽模式下額外顯示退出預覽的按鈕
    if (state.proposalPreviewMode) {
        const exitBtn = document.createElement('button');
        exitBtn.className = "mt-2 text-[11px] bg-slate-200 hover:bg-slate-300 text-slate-600 px-3 py-1.5 rounded-xl font-black shadow-sm transition mx-auto block";
        exitBtn.innerText = "退出預覽 (安全模式)";
        exitBtn.onclick = () => exitProposalPreview();
        actionArea.appendChild(exitBtn);
    }
}

// ────────────────────────────────────────────────────────
// 🎵 求婚背景音樂：YouTube IFrame API 控制
// （瀏覽器規範限制：有聲音的自動播放一律會被封鎖，因此一律靜音起手，
//   並提供手動的喇叭按鈕讓使用者自行點擊開啟聲音）
// ────────────────────────────────────────────────────────
let ytPlayer = null;
let ytApiReady = false;
let pendingVideoIdToPlay = null;

function extractYoutubeVideoId(url) {
    if (!url) return null;
    const patterns = [
        /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{6,})/,
        /(?:youtu\.be\/)([a-zA-Z0-9_-]{6,})/,
        /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{6,})/,
        /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{6,})/
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m && m[1]) return m[1];
    }
    return null;
}

function loadYoutubeApiIfNeeded() {
    if (window.YT && window.YT.Player) {
        ytApiReady = true;
        return;
    }
    if (document.getElementById('youtube-iframe-api-script')) return; // 已經在載入中，不要重複插入
    const tag = document.createElement('script');
    tag.id = 'youtube-iframe-api-script';
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = function () {
        ytApiReady = true;
        if (pendingVideoIdToPlay) {
            createYoutubePlayer(pendingVideoIdToPlay);
            pendingVideoIdToPlay = null;
        }
    };
}

function createYoutubePlayer(videoId) {
    const container = document.getElementById('proposal-yt-player');
    if (!container) return;
    container.innerHTML = '<div id="proposal-yt-player-inner"></div>';
    try {
        ytPlayer = new YT.Player('proposal-yt-player-inner', {
            height: '1',
            width: '1',
            videoId: videoId,
            playerVars: { autoplay: 1, mute: 1, controls: 0, loop: 1, playlist: videoId },
            events: {
                onReady: (e) => {
                    e.target.mute();
                    e.target.playVideo();
                    const toggleBtn = document.getElementById('proposal-music-toggle');
                    if (toggleBtn) toggleBtn.innerHTML = '<i class="fa-solid fa-volume-xmark text-sm"></i>';
                }
            }
        });
    } catch (err) {
        console.warn('YouTube 播放器建立失敗（不影響求婚流程本身）:', err);
    }
}

function initProposalMusicPlayer() {
    const toggleBtn = document.getElementById('proposal-music-toggle');
    const videoId = extractYoutubeVideoId(state.proposalMusicUrl);
    if (!videoId) {
        if (toggleBtn) toggleBtn.classList.add('hidden');
        return;
    }
    if (toggleBtn) toggleBtn.classList.remove('hidden');
    loadYoutubeApiIfNeeded();
    if (ytApiReady) {
        createYoutubePlayer(videoId);
    } else {
        pendingVideoIdToPlay = videoId;
    }
}

function stopProposalMusicPlayer() {
    pendingVideoIdToPlay = null;
    if (ytPlayer && typeof ytPlayer.stopVideo === 'function') {
        try { ytPlayer.stopVideo(); } catch (e) { /* 忽略，畫面即將離開不影響使用者 */ }
    }
    const container = document.getElementById('proposal-yt-player');
    if (container) container.innerHTML = '';
    ytPlayer = null;
}

function toggleProposalMusicSound() {
    if (!ytPlayer) return;
    const toggleBtn = document.getElementById('proposal-music-toggle');
    try {
        if (ytPlayer.isMuted()) {
            ytPlayer.unMute();
            ytPlayer.setVolume(70);
            if (toggleBtn) toggleBtn.innerHTML = '<i class="fa-solid fa-volume-high text-sm"></i>';
        } else {
            ytPlayer.mute();
            if (toggleBtn) toggleBtn.innerHTML = '<i class="fa-solid fa-volume-xmark text-sm"></i>';
        }
    } catch (e) {
        console.warn('音樂開關控制失敗:', e);
    }
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
    const previousScreen = state.currentScreen;
    ['screen-login', 'screen-trip', 'screen-admin', 'screen-proposal'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
    document.getElementById(`screen-${screenId}`)?.classList.remove('hidden');
    state.currentScreen = screenId;

    if (screenId === 'trip') renderTripScreen();

    if (screenId === 'proposal') {
        renderProposalScreen();
        initProposalMusicPlayer();
    }
    if (previousScreen === 'proposal' && screenId !== 'proposal') {
        stopProposalMusicPlayer();
        clearAutoAdvanceTimer();
    }
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
window.endProposalAndReturn = endProposalAndReturn;
window.exitProposalPreview = exitProposalPreview;
window.toggleProposalMusicSound = toggleProposalMusicSound;
// 以下為先前遺漏、導致按鈕點擊沒有反應的函式註冊（module 內的函式預設不會自動掛在 window 上）
window.toggleScheduleReorderMode = toggleScheduleReorderMode;
window.togglePackingReorderMode = togglePackingReorderMode;
window.toggleSlideAccordion = toggleSlideAccordion;
window.onAdvanceModeChange = onAdvanceModeChange;
window.previewImageUrl = previewImageUrl;
// 費用分攤功能
window.openExpenseModal = openExpenseModal;
window.closeExpenseModal = closeExpenseModal;
window.addExpenseMember = addExpenseMember;
window.deleteExpenseMember = deleteExpenseMember;
window.saveExpenseRecordForm = saveExpenseRecordForm;
window.resetExpenseForm = resetExpenseForm;
window.editExpenseRecord = editExpenseRecord;
window.deleteExpenseRecord = deleteExpenseRecord;