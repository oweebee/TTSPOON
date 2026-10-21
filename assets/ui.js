// Interface TTSpoon v2 : filtres de voix, glisser-déposer, compteurs, progression.
// Ne modifie aucune logique de synthèse : se branche sur les éléments existants.
(function () {
	const $ = id => document.getElementById(id)
	const store = {
		get(k) { try { return localStorage.getItem(k) } catch (e) { return null } },
		set(k, v) { try { localStorage.setItem(k, v) } catch (e) {} }
	}

	const voices = $('voices')
	const langFilter = $('lang-filter')
	const voiceSearch = $('voice-search')
	const voiceMeta = $('voice-meta')
	const textArea = $('text-area')
	const textCount = $('text-count')
	const dropzone = $('dropzone')
	const fileInput = $('file-input')
	const statArea = $('stat-area')
	const statStr = $('stat-str')
	const bar = $('progress-bar')
	const advanced = $('advanced')
	const textTools = $('text-tools')

	// ---------- Voix ----------
	let langNames, regionNames
	try {
		langNames = new Intl.DisplayNames(['fr'], { type: 'language' })
		regionNames = new Intl.DisplayNames(['fr'], { type: 'region' })
	} catch (e) {}

	const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s
	const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

	function parseVoice(value) {
		const [loc, raw] = value.split(', ')
		const parts = loc.split('-')
		const lang = parts[0]
		const region = parts.find((p, i) => i > 0 && /^[A-Z]{2}$/.test(p))
		const dialect = parts.slice(1).filter(p => p !== region && !/^(Latn|Cans)$/.test(p)).join(' ')
		const multi = /Multilingual/.test(raw)
		const expressive = /Expressive/.test(raw)
		const name = raw.replace(/Neural$/, '').replace('Multilingual', '').replace('Expressive', '')
		let langLabel = lang, regionLabel = region || ''
		try { langLabel = cap(langNames.of(lang)) } catch (e) {}
		try { if (region) regionLabel = regionNames.of(region) } catch (e) {}
		if (dialect) regionLabel = (regionLabel ? regionLabel + ', ' : '') + cap(dialect)
		return { loc, lang, name, multi, expressive, langLabel, regionLabel }
	}

	const meta = new Map()
	for (const opt of voices.options) {
		const v = parseVoice(opt.value)
		meta.set(opt.value, v)
		let label = v.name
		if (v.multi) label += ' · multilingue'
		if (v.expressive) label += ' · expressive'
		if (v.regionLabel) label += ' (' + v.regionLabel + ')'
		opt.textContent = label
		opt.dataset.search = norm(label + ' ' + v.langLabel + ' ' + opt.value)
	}

	// Liste des langues
	const langs = new Map()
	for (const v of meta.values()) {
		if (!langs.has(v.lang)) langs.set(v.lang, { label: v.langLabel, count: 0 })
		langs.get(v.lang).count++
	}
	const multiCount = [...meta.values()].filter(v => v.multi).length
	const addOpt = (value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; langFilter.appendChild(o) }
	addOpt('*', `Toutes les langues (${voices.options.length})`)
	addOpt('multi', `Multilingues (${multiCount})`)
	;[...langs.entries()]
		.sort((a, b) => a[1].label.localeCompare(b[1].label, 'fr'))
		.forEach(([k, l]) => addOpt(k, `${l.label} (${l.count})`))

	function applyFilter(keepSelection) {
		const f = langFilter.value
		const q = norm(voiceSearch.value.trim())
		let firstVisible = null
		for (const opt of voices.options) {
			const v = meta.get(opt.value)
			const okLang = f === '*' || (f === 'multi' ? v.multi : v.lang === f)
			const okSearch = !q || opt.dataset.search.includes(q)
			opt.hidden = !(okLang && okSearch)
			if (!opt.hidden && !firstVisible) firstVisible = opt
		}
		const current = voices.options[voices.selectedIndex]
		if (!keepSelection && (!current || current.hidden) && firstVisible) {
			voices.value = firstVisible.value
			voices.dispatchEvent(new Event('change'))
		}
		updateVoiceMeta()
	}

	function updateVoiceMeta() {
		const v = meta.get(voices.value)
		if (!v) { voiceMeta.textContent = ''; return }
		voiceMeta.textContent = v.langLabel + (v.regionLabel ? ' · ' + v.regionLabel : '') + ' · ' + v.loc
	}

	langFilter.addEventListener('change', () => { store.set('voice_lang_filter', langFilter.value); applyFilter(false) })
	voiceSearch.addEventListener('input', () => applyFilter(false))
	voices.addEventListener('change', updateVoiceMeta)

	// ---------- Langue du texte (xml:lang envoyé au service) ----------
	const textLang = $('text-lang')
	const addLang = (value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; textLang.appendChild(o) }
	addLang('auto', 'Automatique (langue de la voix)')
	const locs = [...new Set([...meta.values()].map(v => v.loc).filter(l => /^[a-z]{2,3}-[A-Z]{2}$/.test(l)))]
	const locLabel = l => { const v = [...meta.values()].find(x => x.loc === l); return v.langLabel + ' (' + v.regionLabel + ') — ' + l }
	locs.sort((a, b) => (b.startsWith('fr-') - a.startsWith('fr-')) || locLabel(a).localeCompare(locLabel(b), 'fr'))
	locs.forEach(l => addLang(l, locLabel(l)))
	const savedLang = store.get('text_lang')
	textLang.value = (savedLang && [...textLang.options].some(o => o.value === savedLang)) ? savedLang : 'auto'
	textLang.addEventListener('change', () => store.set('text_lang', textLang.value))
	window.tts_text_lang = voiceFull => {
		if (textLang.value !== 'auto') return textLang.value
		const m = /\(([^,]+),/.exec(voiceFull || '')
		return m ? m[1] : ''
	}

	// ---------- Curseurs : remplissage ----------
	function paintRange(r) {
		const min = +r.min || 0, max = +r.max || 100
		r.style.setProperty('--p', ((r.value - min) / (max - min) * 100) + '%')
	}
	const ranges = [...document.querySelectorAll('input[type="range"]')]
	ranges.forEach(r => r.addEventListener('input', () => paintRange(r)))

	// ---------- Compteur de texte ----------
	const fmt = n => n.toLocaleString('fr-FR')
	function updateCount() {
		if (textArea.style.display === 'none') {
			const n = statArea.children.length
			textCount.textContent = n ? `${fmt(n)} partie${n > 1 ? 's' : ''} chargée${n > 1 ? 's' : ''}` : 'Aucun livre chargé'
			return
		}
		const n = textArea.value.length
		textCount.textContent = `${fmt(n)} caractère${n > 1 ? 's' : ''}`
	}
	textArea.addEventListener('input', updateCount)
	textArea.addEventListener('tts-text-changed', updateCount)
	textTools.addEventListener('click', e => { if (e.target.closest('button')) setTimeout(updateCount, 0) })

	// Ctrl + Entrée lance la génération
	textArea.addEventListener('keydown', e => {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('savebutton').click() }
	})

	// ---------- Glisser-déposer ----------
	const ACCEPT = /\.(txt|fb2|epub|ini|zip)$/i
	let dragDepth = 0
	const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files')
	document.addEventListener('dragenter', e => { if (!hasFiles(e)) return; dragDepth++; dropzone.classList.add('dragging') })
	document.addEventListener('dragleave', e => { if (!hasFiles(e)) return; if (--dragDepth <= 0) { dragDepth = 0; dropzone.classList.remove('dragging') } })
	document.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault() })
	document.addEventListener('drop', e => {
		if (!hasFiles(e)) return
		e.preventDefault()
		dragDepth = 0
		dropzone.classList.remove('dragging')
		const files = [...e.dataTransfer.files].filter(f => ACCEPT.test(f.name))
		if (!files.length) return
		const dt = new DataTransfer()
		files.forEach(f => dt.items.add(f))
		fileInput.files = dt.files
		fileInput.dispatchEvent(new Event('change'))
	})

	// ---------- Progression ----------
	const legend = {}
	document.querySelectorAll('#legend b[data-k]').forEach(b => legend[b.dataset.k] = b)
	const card = statArea.closest('.progress')
	let raf = 0
	function refreshProgress() {
		raf = 0
		const counts = { 'stat-opened': 0, 'stat-started': 0, 'stat-processing': 0, 'stat-error': 0, 'stat-saved': 0 }
		for (const b of statArea.children) if (b.dataset.status in counts) counts[b.dataset.status]++
		for (const k in counts) if (legend[k]) legend[k].textContent = fmt(counts[k])
		const [done, total] = statStr.textContent.split(' / ').map(x => parseInt(x, 10) || 0)
		const pct = total ? Math.min(100, done / total * 100) : 0
		bar.firstElementChild.style.width = pct + '%'
		bar.setAttribute('aria-valuenow', Math.round(pct))
		card.classList.toggle('done', total > 0 && done >= total)
		if (textArea.style.display === 'none') updateCount()
	}
	const schedule = () => { if (!raf) raf = requestAnimationFrame(refreshProgress) }
	new MutationObserver(schedule).observe(statArea, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-status'] })
	new MutationObserver(schedule).observe(statStr, { childList: true, characterData: true, subtree: true })

	// ---------- Réglages avancés : état mémorisé ----------
	advanced.open = store.get('advanced_open') === 'true'
	advanced.addEventListener('toggle', () => store.set('advanced_open', advanced.open))
	textTools.open = store.get('tools_open') === 'true'
	textTools.addEventListener('toggle', () => store.set('tools_open', textTools.open))

	// ---------- Initialisation (après load_settings de script.js) ----------
	document.addEventListener('DOMContentLoaded', () => {
		const saved = store.get('voice_lang_filter')
		const cur = meta.get(voices.value)
		langFilter.value = (saved && [...langFilter.options].some(o => o.value === saved)) ? saved : (cur ? cur.lang : '*')
		const curVisible = () => { const v = meta.get(voices.value); const f = langFilter.value; return f === '*' || (f === 'multi' ? v.multi : v.lang === f) }
		if (cur && !curVisible()) langFilter.value = cur.lang
		applyFilter(true)
		ranges.forEach(paintRange)
		updateCount()
		refreshProgress()
	})
})();
