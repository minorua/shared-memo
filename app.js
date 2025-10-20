// Simple shared memo app

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js'
import { getFirestore, collection, doc, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js'
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js'

const STORAGE_KEY = 'shared-memo:v1'
const TITLE_KEY = 'shared-memo:title'
const MAX_VISIBLE = 30

const el = id => document.getElementById(id)

let memos = []
let showAll = false
let firebaseApp = null
let auth = null
let currentUser = null

function load() {
  const raw = localStorage.getItem(STORAGE_KEY)
  memos = raw ? JSON.parse(raw) : []
  const title = localStorage.getItem(TITLE_KEY) || '共有メモ'
  el('app-title').value = title
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memos))
}

function saveTitle() {
  const v = el('app-title').value || '共有メモ'
  localStorage.setItem(TITLE_KEY, v)
  document.title = v
}

function addMemo(text) {
  const item = {id:Date.now(), text: text, created: new Date().toISOString()}
  memos.unshift(item)
  save()
  render()
}

function render() {
  el('memo-count').textContent = `メモ: ${memos.length}`
  const list = el('memo-list')
  list.innerHTML = ''
  const items = showAll ? memos : memos.slice(0, MAX_VISIBLE)
  items.forEach(m => {
    const card = document.createElement('div')
    card.className = 'memo-card'
    const meta = document.createElement('div')
    meta.className = 'memo-meta'
    meta.textContent = new Date(m.created).toLocaleString()
    const body = document.createElement('div')
    body.className = 'memo-body'
    body.textContent = m.text

    // action buttons
    const actions = document.createElement('div')
    actions.style.marginTop = '8px'
    const editBtn = document.createElement('button')
    editBtn.textContent = '編集'
    editBtn.style.marginRight = '8px'
    const delBtn = document.createElement('button')
    delBtn.textContent = '削除'
    editBtn.addEventListener('click', () => startEdit(m.id, card, body))
    delBtn.addEventListener('click', () => deleteMemo(m.id))
    actions.appendChild(editBtn)
    actions.appendChild(delBtn)

    card.appendChild(meta)
    card.appendChild(body)
    card.appendChild(actions)
    list.appendChild(card)
  })
  // show-all button
  const showWrap = el('show-all-wrap')
  if (memos.length > MAX_VISIBLE && !showAll) {
    showWrap.classList.remove('hidden')
  } else {
    showWrap.classList.add('hidden')
  }
}

function toggleMenu() {
  const menu = el('menu')
  const hidden = menu.classList.toggle('hidden')
  menu.setAttribute('aria-hidden', hidden)
}

function exportToFile() {
  const deviceName = localStorage.getItem('device-name') || null
  const payload = {title: el('app-title').value, deviceName, memos}
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(el('app-title').value||'shared-memo')}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Templates
function loadTemplates() {
  const raw = localStorage.getItem('templates') || ''
  // split by lines and filter empty
  return raw.split('\n').map(s => s.trim()).filter(s => s.length > 0)
}

function showTemplatePopup(anchorEl) {
  const popup = document.getElementById('template-popup')
  const list = document.getElementById('template-list')
  list.innerHTML = ''
  const templates = loadTemplates()
  if (templates.length === 0) {
    const p = document.createElement('div')
    p.textContent = '定型文がありません。設定で追加してください。'
    list.appendChild(p)
  } else {
    templates.forEach(t => {
      const b = document.createElement('button')
      b.textContent = t
      b.addEventListener('click', () => {
        insertAtCaret(el('memo-input'), t)
        popup.classList.add('hidden')
      })
      list.appendChild(b)
    })
  }
  // position popup near anchor
  const rect = anchorEl.getBoundingClientRect()
  popup.style.position = 'absolute'
  popup.style.left = rect.left + 'px'
  popup.style.top = (rect.bottom + window.scrollY + 8) + 'px'
  popup.classList.remove('hidden')
}

function insertAtCaret(textarea, text) {
  textarea.focus()
  const start = textarea.selectionStart || 0
  const end = textarea.selectionEnd || 0
  const value = textarea.value
  const newValue = value.slice(0, start) + text + value.slice(end)
  textarea.value = newValue
  const pos = start + text.length
  textarea.selectionStart = textarea.selectionEnd = pos
}

async function syncToFirestore() {
  if (!firebaseApp) {
    alert('Firebaseが設定されていません。設定画面でFirebaseの設定を入力して下さい。')
    return
  }
  try {
    const deviceName = localStorage.getItem('device-name') || null
    const allowed = localStorage.getItem('allowed-email') || null
    if (!currentUser) {
      alert('Firestore同期にはGoogleアカウントでのサインインが必要です。右上のサインインボタンからログインしてください。')
      return
    }
    if (allowed && currentUser.email !== allowed) {
      alert(`同期が許可されていないアカウントです: ${currentUser.email}`)
      return
    }
    const db = getFirestore(firebaseApp)
    const c = collection(db, 'shared-memo')
    const d = doc(c, 'latest')

    // 1) pull remote
    const snapshot = await getDoc(d)
    const remoteData = snapshot.exists() ? snapshot.data() : null
    const remoteMemos = remoteData && Array.isArray(remoteData.memos) ? remoteData.memos : []

    // 2) merge remote and local memos
    // Rule: if local memo has been modified (has `updated` or text differs), prefer local
    // Otherwise prefer the newest by timestamp
    const remoteMap = new Map()
    remoteMemos.forEach(r => { if (r && typeof r.id !== 'undefined') remoteMap.set(String(r.id), r) })

    // start by adding remote items
    const mergedMap = new Map(remoteMap)

    // merge local, preferring local when modified
    memos.forEach(local => {
      if (!local || typeof local.id === 'undefined') return

      const id = String(local.id)
      const remote = remoteMap.get(id)
      if (!remote) {
        // local-only
        mergedMap.set(id, local)
        return
      }

      const localTs = Date.parse(local.updated || local.created || local.id) || 0
      const remoteTs = Date.parse(remote.updated || remote.created || remote.id) || 0

      // pick the newest by timestamp
      if (remoteTs > localTs) mergedMap.set(id, remote)
      else mergedMap.set(id, local)
    })

    // Sort by created date (newest first)
    const merged = Array.from(mergedMap.values()).sort((a,b) => (Date.parse(b.created) || 0) - (Date.parse(a.created) || 0))

    // 3) save locally and push merged to Firestore
    memos = merged
    save()

    const payload = {title: el('app-title').value, deviceName, memos, updated: new Date().toISOString()}
        await setDoc(d, payload)
    alert('同期が完了しました')

    render()
  } catch (e) {
    console.error(e)
    alert('同期に失敗しました: '+e.message)
  }
}

function findIndexById(id) {
  return memos.findIndex(m => m.id === id)
}

function deleteMemo(id) {
  if (!confirm('このメモを削除しますか？')) return
  const idx = findIndexById(id)
  if (idx === -1) return
  memos.splice(idx, 1)
  save()
  render()
}

function startEdit(id, cardEl, bodyEl) {
  const idx = findIndexById(id)
  if (idx === -1) return
  const m = memos[idx]
  // hide body and show textarea + save/cancel
  bodyEl.classList.add('hidden')
  const editor = document.createElement('textarea')
  editor.value = m.text
  editor.style.width = '100%'
  editor.style.minHeight = '80px'
  const controls = document.createElement('div')
  controls.style.marginTop = '8px'
  const saveBtn = document.createElement('button')
  saveBtn.textContent = '保存'
  const cancelBtn = document.createElement('button')
  cancelBtn.textContent = 'キャンセル'
  saveBtn.style.marginRight = '8px'
  controls.appendChild(saveBtn)
  controls.appendChild(cancelBtn)
  cardEl.appendChild(editor)
  cardEl.appendChild(controls)

  saveBtn.addEventListener('click', () => {
    const text = editor.value.trim()
    if (!text) { alert('空のメモは保存できません'); return }
    memos[idx].text = text
    memos[idx].updated = new Date().toISOString()
    save()
    render()
  })
  cancelBtn.addEventListener('click', () => {
    editor.remove(); controls.remove(); bodyEl.classList.remove('hidden')
  })
}

// UI wiring
window.addEventListener('DOMContentLoaded', () => {
  // load app data
  load()
  render()
  saveTitle()

  // Try to initialize Firebase from settings stored in localStorage
  try {
    const raw = localStorage.getItem('firebase-config')
    if (raw) {
      const cfg = JSON.parse(raw)
      if (!getApps().length) {
        firebaseApp = initializeApp(cfg)
        console.log('Firebase initialized from settings')
      } else {
        firebaseApp = getApps()[0]
      }
      // init auth
      try {
        auth = getAuth(firebaseApp)
        onAuthStateChanged(auth, user => {
          currentUser = user
          const authBtn = document.getElementById('auth-btn')
          if (authBtn) authBtn.textContent = user ? `サインアウト (${user.email})` : 'サインイン'
        })
      } catch (e) {
        console.warn('Auth init failed', e)
      }
    }
  } catch (e) {
    console.warn('Failed to init firebase from settings', e)
  }

  el('add-btn').addEventListener('click', () => {
    const txt = el('memo-input').value.trim()
    if (!txt) return
    addMemo(txt)
    el('memo-input').value = ''
  })

  el('menu-btn').addEventListener('click', toggleMenu)
  const tplBtn = document.getElementById('template-btn')
  if (tplBtn) tplBtn.addEventListener('click', (e) => { e.stopPropagation(); showTemplatePopup(tplBtn) })
  // close popup when clicking elsewhere
  document.addEventListener('click', () => {
    const popup = document.getElementById('template-popup')
    if (popup) popup.classList.add('hidden')
  })
  const authBtn = document.getElementById('auth-btn')
  if (authBtn) {
    authBtn.addEventListener('click', async () => {
      if (!auth) { alert('Authが利用できません。Firebase設定を確認してください。'); return }
      if (currentUser) {
        try { await signOut(auth); alert('サインアウトしました') } catch(e){ alert('サインアウト失敗') }
      } else {
        try {
          const provider = new GoogleAuthProvider()
          await signInWithPopup(auth, provider)
        } catch(e) { alert('サインイン失敗: ' + (e.message||e)) }
      }
    })
  }
  el('sync-btn').addEventListener('click', () => { toggleMenu(); syncToFirestore() })
  el('save-file-btn').addEventListener('click', () => { toggleMenu(); exportToFile() })
  el('settings-btn').addEventListener('click', () => { toggleMenu(); window.location = 'settings.html' })
  el('show-all-btn').addEventListener('click', () => { showAll = true; render(); el('show-all-wrap').classList.add('hidden') })

  el('app-title').addEventListener('change', saveTitle)

  // register service worker
  if ('serviceWorker' in navigator) {
    // navigator.serviceWorker.register('service-worker.js').catch(err => console.error('SW登録失敗', err))
  }
})
