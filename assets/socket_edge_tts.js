const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4"
const GEC_ERRORS_BEFORE_SYNC = 3

class SocketEdgeTTS {
	constructor(_indexpart, _filename, _filenum,
				_voice, _pitch, _rate, _volume, _text,
				_statArea, _obj_threads_info, _save_to_var) {
		this.bytes_data_separator = new TextEncoder().encode("Path:audio\r\n")
		this.data_separator = new Uint8Array(this.bytes_data_separator)

		this.my_uint8Array = new Uint8Array(0)
		this.audios = []

		this.indexpart = _indexpart
		this.my_filename = _filename
		this.my_filenum = _filenum
		this.my_voice = _voice
		this.my_pitch = _pitch
		this.my_rate = _rate
		this.my_volume = _volume
		this.my_text = _text
		this.socket
		this.statArea = _statArea
		this.mp3_saved = false
		this.save_to_var = _save_to_var
		this.obj_threads_info = _obj_threads_info
		this.end_message_received = false
		this.start_save = false

		this.cancelled = false
		this.restart_pending = false
		this.watchdog_id = 0
		this.retry_id = 0

		//Start
		this.start_works()
	}

	clear() {
		//this.socket = null;
		this.end_message_received = false
		this.my_uint8Array = null
		this.my_uint8Array = new Uint8Array(0)
		for (let part of this.audios) {
			part = null
		}
		this.audios = []
		this.start_save = false
	}

	date_to_string() {
		const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
		const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
		const d = new Date()
		const pad = n => String(n).padStart(2, '0')
		return days[d.getUTCDay()] + ' ' + months[d.getUTCMonth()] + ' ' + pad(d.getUTCDate()) + ' ' + d.getUTCFullYear() +
			' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) +
			' GMT+0000 (Coordinated Universal Time)'
	}

	cancel() {
		this.cancelled = true
		clearTimeout(this.watchdog_id)
		clearTimeout(this.retry_id)
		if (this.socket && this.socket.readyState < 2) this.socket.close()
		this.clear()
	}

	arm_watchdog() {
		clearTimeout(this.watchdog_id)
		if (this.cancelled || this.mp3_saved || this.end_message_received || this.restart_pending) return
		if (Number.isFinite(restart_delay_msec)) {
			this.watchdog_id = setTimeout(() => this.error_restart(), restart_delay_msec)
		}
	}

	onSocketOpen(event) {
		if (this.cancelled || this.restart_pending) return
		this.arm_watchdog()
		this.end_message_received = false
		this.update_stat("Démarrée")

		var my_data = this.date_to_string()
		this.socket.send(
			"X-Timestamp:" + my_data + "\r\n" +
			"Content-Type:application/json; charset=utf-8\r\n" +
			"Path:speech.config\r\n\r\n" +
			'{"context":{"synthesis":{"audio":{"metadataoptions":{' +
			'"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},' +
			'"outputFormat":"audio-24khz-96kbitrate-mono-mp3"' +
			"}}}}\r\n"
		)

		this.socket.send(
			this.ssml_headers_plus_data(
				this.connect_id(),
				my_data,
				this.mkssml()
			)
		)
	}

	async onSocketMessage(event) {
		if (this.cancelled || this.restart_pending || this.end_message_received || this.mp3_saved) return
		this.arm_watchdog()
		const data = event.data
		if ( typeof data == "string" ) {
			if (data.includes("Path:turn.end")) {
				this.end_message_received = true
				clearTimeout(this.watchdog_id)
				// Une seule allocation finale, sans recopier tout le MP3 à chaque trame.
				const chunks = []
				let size = 0
				for (const audio of this.audios) {
					const bytes = new Uint8Array(await audio.arrayBuffer())
					const position = this.findIndex(bytes, this.data_separator)
					if (position !== -1) {
						const chunk = bytes.subarray(position + this.data_separator.length)
						chunks.push(chunk)
						size += chunk.length
					}
				}
				if (this.cancelled) return
				this.my_uint8Array = new Uint8Array(size)
				let offset = 0
				for (const chunk of chunks) {
					this.my_uint8Array.set(chunk, offset)
					offset += chunk.length
				}
				this.audios = []
				await this.save_mp3()
			}
		}

		if (data instanceof Blob) {
			await this.audios.push(data)
		}
	}

	update_stat(msg) {
		updateStatusBox(this.indexpart, msg)
	}

	onSocketClose() {
		clearTimeout(this.watchdog_id)
		if (this.cancelled) return
		if (!this.mp3_saved) {
			if (this.end_message_received && !this.restart_pending) this.update_stat("Traitement")
			else this.error_restart()
		}
		add_edge_tts()
	}

	error_restart() {
		if (this.cancelled || this.restart_pending || this.mp3_saved) return
		this.restart_pending = true
		clearTimeout(this.watchdog_id)
		this.update_stat("Erreur - REDÉMARRAGE")
		SocketEdgeTTS.gec_report_error()
		if (this.socket && this.socket.readyState < 2) this.socket.close()
		this.retry_id = setTimeout(() => {
			if (this.cancelled) return
			this.restart_pending = false
			this.my_uint8Array = new Uint8Array(0)
			this.audios = []
			this.end_message_received = false
			this.start_works()
		}, 6000)
	}

	start_works() {
		if (this.cancelled) return
		//console.log("Start works...")//console.log(this.my_filename + " " + this.my_filenum + " start works...")
		if ("WebSocket" in window) {
			const SEC_MS_GEC_VERSION = "1-151.0.4129.59";
			const secMsGec = this.generateSecMsGec();

			this.socket = new WebSocket(
				"wss://speech.platform.bing.com/consumer/speech/synthesize/" +
				"readaloud/edge/v1?TrustedClientToken=" +
				"6A5AA1D4EAFF4E9FB37E23D68491D6F4" +
				"&Sec-MS-GEC=" + secMsGec +
				"&Sec-MS-GEC-Version=" + SEC_MS_GEC_VERSION +
				"&ConnectionId=" + this.connect_id()
			);

			this.socket.addEventListener('open', this.onSocketOpen.bind(this));
			this.socket.addEventListener('message', this.onSocketMessage.bind(this));
			this.socket.addEventListener('close', this.onSocketClose.bind(this));
			this.arm_watchdog()
		} else {
			console.log("WebSocket NOT supported by your Browser!");
		}
		add_edge_tts()
	}

	mkssml() {
		return (
			"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>\n" +
			"<voice name='" + this.my_voice + "'><prosody pitch='" + this.my_pitch + "' rate='" + this.my_rate + "' volume='" + this.my_volume + "'>\n" +
			this.my_text + "</prosody></voice></speak>"
		)
	}

	connect_id() {
		const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
			const r = (Math.random() * 16) | 0;
			const v = c == 'x' ? r : (r & 0x3) | 0x8;
			return v.toString(16);
		});
		return uuid.replace(/-/g, '');
	}


	sha256(ascii) {
		function rightRotate(value, amount) {
			return (value >>> amount) | (value << (32 - amount));
		}

		var mathPow = Math.pow;
		var maxWord = mathPow(2, 32);
		var lengthProperty = 'length';
		var i, j;
		var result = '';

		var words = [];
		var asciiBitLength = ascii[lengthProperty] * 8;

		var hash = this.sha256.h = this.sha256.h || [];
		var k = this.sha256.k = this.sha256.k || [];
		var primeCounter = k[lengthProperty];

		var isComposite = {};
		for (var candidate = 2; primeCounter < 64; candidate++) {
			if (!isComposite[candidate]) {
				for (i = 0; i < 313; i += candidate) {
					isComposite[i] = candidate;
				}
				hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
				k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
			}
		}

		ascii += '\x80';
		while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
		for (i = 0; i < ascii[lengthProperty]; i++) {
			j = ascii.charCodeAt(i);
			if (j >> 8) return;
			words[i >> 2] |= j << ((3 - i) % 4) * 8;
		}
		words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
		words[words[lengthProperty]] = (asciiBitLength);

		for (j = 0; j < words[lengthProperty];) {
			var w = words.slice(j, j += 16);
			var oldHash = hash;
			hash = hash.slice(0, 8);

			for (i = 0; i < 64; i++) {
				var w15 = w[i - 15], w2 = w[i - 2];

				var a = hash[0], e = hash[4];
				var temp1 = hash[7]
					+ (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
					+ ((e & hash[5]) ^ ((~e) & hash[6]))
					+ k[i]
					+ (w[i] = (i < 16) ? w[i] : (
							w[i - 16]
							+ (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
							+ w[i - 7]
							+ (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
						) | 0
					);
				var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
					+ ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

				hash = [(temp1 + temp2) | 0].concat(hash);
				hash[4] = (hash[4] + temp1) | 0;
			}

			for (i = 0; i < 8; i++) {
				hash[i] = (hash[i] + oldHash[i]) | 0;
			}
		}

		for (i = 0; i < 8; i++) {
			for (j = 3; j + 1; j--) {
				var b = (hash[i] >> (j * 8)) & 255;
				result += ((b < 16) ? 0 : '') + b.toString(16);
			}
		}
		return result;
	}

	generateSecMsGec() {
		const WIN_EPOCH = 11644473600;
		const S_TO_NS = 1e9;

		let ticks = Date.now() / 1000 + SocketEdgeTTS.gec_clock_skew;
		ticks += WIN_EPOCH;
		ticks -= ticks % 300;
		ticks *= S_TO_NS / 100;

		const strToHash = Math.floor(ticks) + TRUSTED_CLIENT_TOKEN;

		return this.sha256(strToHash).toUpperCase();
	}

	static gec_clock_skew = 0
	static gec_error_count = 0
	static gec_sync_active = false

	static gec_report_success() {
		SocketEdgeTTS.gec_error_count = 0
	}

	static gec_report_error() {
		SocketEdgeTTS.gec_error_count += 1
		if (SocketEdgeTTS.gec_error_count >= GEC_ERRORS_BEFORE_SYNC && !SocketEdgeTTS.gec_sync_active) {
			SocketEdgeTTS.gec_error_count = 0
			SocketEdgeTTS.gec_sync_active = true
			SocketEdgeTTS.gec_sync_clock_skew().finally(() => SocketEdgeTTS.gec_sync_active = false)
		}
	}

	// Сдвиг часов (сек) по заголовку Date сервера озвучки; при неудаче остаётся прежним.
	static async gec_sync_clock_skew() {
		try {
			const response = await fetch("https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=" + TRUSTED_CLIENT_TOKEN, { cache: "no-store" })
			const server_date = Date.parse(response.headers.get("Date"))
			if (!isNaN(server_date)) SocketEdgeTTS.gec_clock_skew = (server_date - Date.now()) / 1000
		} catch (e) {}
	}

	async saveFiles(blob) {
		if (this.start_save == false) {
			this.start_save = true
			const new_folder_handle = await save_path_handle.getDirectoryHandle(this.my_filename, { create: true });
			const fileHandle = await new_folder_handle.getFileHandle(this.my_filename + " " + this.my_filenum + '.mp3', { create: true });
			const writableStream = await fileHandle.createWritable();
			const writable = writableStream.getWriter();
			await writable.write(blob);
			await writable.close();
			this.clear()
		}
	}

	async save_mp3() {
		if (this.cancelled || this.mp3_saved) return
		if ( this.my_uint8Array.length > 0 ) {
			this.mp3_saved = true
			clearTimeout(this.watchdog_id)
			SocketEdgeTTS.gec_report_success()
			if ( !this.save_to_var ) {
				var blob_mp3 = new Blob([this.my_uint8Array.buffer]);
				if (save_path_handle ?? false) {
					try {
						await this.saveFiles(blob_mp3)
					} catch (err) {
						console.error('Échec de l’écriture sur le disque :', err)
						this.update_stat("Erreur - REDÉMARRAGE")
						return
					}
				} else {
					const url = window.URL.createObjectURL(blob_mp3);
					const link = document.createElement('a');
					link.href = url;
					link.download = this.my_filename + " " + this.my_filenum + '.mp3';
					document.body.appendChild(link);
					link.click();
					document.body.removeChild(link);
					window.URL.revokeObjectURL(url);
					this.clear()
				}
			}
			if (this.cancelled) return
			this.update_stat("Enregistrée")
			this.obj_threads_info.saved += 1
			const stat_count = this.obj_threads_info.stat.textContent.split(' / ');
			this.obj_threads_info.stat.textContent = String(this.obj_threads_info.saved) + " / " + stat_count[1]
			add_edge_tts()
		} else {
			this.error_restart()
		}
	}

	ssml_headers_plus_data(request_id, timestamp, ssml) {
		return "X-RequestId:" + request_id + "\r\n" +
			"Content-Type:application/ssml+xml\r\n" +
			"X-Timestamp:" + timestamp + "Z\r\n" +
			"Path:ssml\r\n\r\n" +
			ssml
	}

	findIndex(uint8Array, separator) {
	  for (let i = 0; i < uint8Array.length - separator.length + 1; i++) {
		let found = true
		for (let j = 0; j < separator.length; j++) {
		  if (uint8Array[i + j] !== separator[j]) {
			found = false
			break
		  }
		}
		if (found) {
		  return i
		}
	  }
	  return -1
	}
}
