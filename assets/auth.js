(function () {
	const overlay = document.getElementById('login-overlay');
	const input = document.getElementById('login-password');
	const button = document.getElementById('login-button');
	const errorEl = document.getElementById('login-error');
	const STORAGE_KEY = 'edge_tts_auth_ok';

	const expectedHash = (window.APP_PASSWORD_HASH || '').trim();

	function unlock() {
		overlay.style.display = 'none';
	}

	// Pas de mot de passe configuré côté serveur -> pas de verrouillage
	if (!expectedHash) {
		unlock();
		return;
	}

	if (sessionStorage.getItem(STORAGE_KEY) === expectedHash) {
		unlock();
		return;
	}

	async function sha256(text) {
		const enc = new TextEncoder().encode(text);
		const buf = await crypto.subtle.digest('SHA-256', enc);
		return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
	}

	async function tryLogin() {
		const value = input.value;
		if (!value) return;
		button.disabled = true;
		const hash = await sha256(value);
		if (hash === expectedHash) {
			sessionStorage.setItem(STORAGE_KEY, expectedHash);
			unlock();
		} else {
			errorEl.textContent = "Mot de passe incorrect";
			input.value = '';
			input.focus();
		}
		button.disabled = false;
	}

	button.addEventListener('click', tryLogin);
	input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryLogin(); });
	input.focus();
})();
