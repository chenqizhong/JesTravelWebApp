import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, get, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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
    currentSlideIndex: 0,
    proposalSignal: false
};

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
                currentSlideIndex: 0,
                proposalSignal: false
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

   // 監聽求婚資料（Slides 與 控制訊號一起監聽，確保資料一致性）
    onValue(ref(db, `trips/${state.tripCode}`), (snapshot) => {
        // if (!snapshot.exists()) return;
        const data = snapshot.val();
        console.log("監聽器收到資料更新:", data);
        // 1. 更新全域狀態
        state.proposalSlides = data.proposalSlides || [];
        state.proposalSignal = data.proposalSignal || false;
        state.currentSlideIndex = data.currentSlideIndex || 0;
        state.proposalReady = data.proposalReady || false;

        // 2. 更新 Admin 介面渲染
        renderAdminSlides(); // 確保 slide 列表即時更新

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
// 🖥️ UI 渲染與拖曳控制 (SortableJS 接入)
// ────────────────────────────────────────────────────────
function renderTripScreen() {
    const header = document.getElementById('trip-header');
    header.innerHTML = `
        <div>
            <span class="text-[10px] bg-orange-50 text-[#FF9E64] font-black px-2 py-0.5 rounded-md tracking-wider">團號：${state.tripCode} (${state.userAccount})</span>
            <h1 class="text-xl font-black text-[#FF9E64] mt-1">${state.tripTitle} ✈️</h1>
        </div>
        ${state.isPlanner ? `
            <div class="flex gap-2">
                <button onclick="triggerSecureAction('admin')" class="w-8 h-8 rounded-full bg-orange-50/50 flex items-center justify-center text-[#FF9E64] hover:bg-orange-100/50 transition"><i class="fa-solid fa-gear text-xs"></i></button>
            </div>
        ` : ''}
    `;

    document.getElementById('weather-box').innerHTML = `
        <span class="text-[11px] text-orange-400 font-bold block mb-0.5"><i class="fa-solid fa-cloud-sun"></i> ${state.weatherCity}天氣</span>
        <p class="text-base font-black text-slate-700">${state.weatherTemp}</p>
    `;

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
                            <span class="bg-orange-50 text-[#FF9E64] text-[10px] font-black px-2 py-0.5 rounded-md cursor-move"><i class="fa-solid fa-bars text-[9px] mr-1 opacity-50"></i>${item.time}</span>
                            <h3 class="font-bold text-slate-800 text-sm ${item.checked ? 'line-through text-slate-400 font-normal' : ''}">${item.title}</h3>
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        <button onclick="openScheduleModal('${item.id}')" class="text-slate-400 hover:text-[#FF9E64] text-xs p-1"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="deleteSchedule('${item.id}')" class="text-slate-400 hover:text-red-400 text-xs p-1"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
                ${item.imgUrl ? `<img src="${item.imgUrl}" class="w-full h-24 object-cover rounded-xl mt-2 shadow-sm">` : ''}
                ${item.desc ? `<p class="text-xs text-slate-500 pl-7 mt-1.5 whitespace-pre-line">${item.desc}</p>` : ''}
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
                <span class="${item.checked ? 'line-through text-slate-400 font-normal' : 'text-slate-700'}">${item.item}</span>
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
            <input type="text" value="${slide.text || ''}" placeholder="請輸入本頁告白文字" class="w-full px-2 py-1 border rounded-md slide-text-input">
            <input type="text" value="${slide.imgUrl || ''}" placeholder="請輸入本頁背景/照片 URL" class="w-full px-2 py-1 border rounded-md slide-img-input text-[11px] font-mono">
            ${isLast ? `
                <input type="text" value="${slide.choices || '我願意 💍, 超級願意 ❤️'}" placeholder="按鈕選項 (用逗號隔開)" class="w-full px-2 py-1 border rounded-md slide-choices-input">
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
    // 讀取目前輸入框的所有最新資料，避免被覆蓋掉
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
    set(ref(db, `trips/${state.tripCode}/proposalSlides`), state.proposalSlides)
        .then(() => alert('🎉 求婚動態計畫已成功同步至資料庫！'));
}

function saveAdminSettings() {
    const days = parseInt(document.getElementById('admin-total-days').value);
    const title = document.getElementById('admin-trip-title').value.trim();
    const city = document.getElementById('admin-weather-city').value.trim();
    const temp = document.getElementById('admin-weather-temp').value.trim();

    if (days >= 1 && days <= 30) {
        set(ref(db, `trips/${state.tripCode}/meta`), {
            totalDays: days, tripTitle: title, weatherCity: city, weatherTemp: temp
        }).then(() => alert('🎉 基礎與天氣資訊修改成功！'));
    }
}

// ────────────────────────────────────────────────────────
// 🔒 修正：對接 HTML 的獨享預覽按鈕機制 (名稱修正為 previewProposalWindow)
// ────────────────────────────────────────────────────────
function previewProposalWindow() {
    console.log("🔍 開啟管理員專屬靜態預覽（不更改雲端發射狀態，防漏餡）");
    // 打開新分頁，並額外帶入 preview=true 參數給 proposal.html
    window.open(`proposal.html?code=${state.tripCode}&preview=true`, '_blank');
}
// 當後台的開關被切換時，除了前端 UI 變色，也同步寫入雲端狀態
function toggleProposalReadyState(isChecked) {
    const btn = document.getElementById('admin-launch-btn');
    if (btn) btn.disabled = !isChecked;

    set(ref(db, `trips/${state.tripCode}/proposalReady`), isChecked);

    if (!isChecked) {
        set(ref(db, `trips/${state.tripCode}/proposalSignal`), false);
    }
}

// 🚀 統一發射控制：只負責寫入雲端，不直接操作 UI 與視窗
function triggerProposalSignal(status) {
    console.log("嘗試將訊號寫入 Firebase:", status); // 點擊時這行會出現嗎？
    // 嚴格攔截：沒開啟安全開關不能啟動
    if (status && !state.proposalReady) {
        alert("🔒 系統保護：請先開啟下方的安全模式總開關！");
        return;
    }

    // 只做一件事：更新雲端狀態
    set(ref(db, `trips/${state.tripCode}/proposalSignal`), status).then(() => {
        if (status) {
            set(ref(db, `trips/${state.tripCode}/currentSlideIndex`), 0);
            console.log("🚀 求婚訊號已發射！");
        } else {
            alert('求婚計畫已收回！');
        }
    }).catch((error) => {
        console.error("寫入失敗:", error); // 如果有錯，這裡會報錯
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
