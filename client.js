/**
 * Browser half of the Background Map bundle.
 *
 * v2 has no bundled picture: the wallpaper layer is a dark blank surface until
 * the user uploads their own picture from the settings panel. Position, glass
 * opacity, blur, and fit persist in this browser's localStorage; the main-area
 * glass lives in one fixed tint layer so every page (conversation, Plugins,
 * Settings) shares the same background whatever it paints itself.
 *
 * No Harness Client package is imported and the bundle is dependency-free.
 */
window.__ModuleLoader__.load({
	id: '@local/dsh-background',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

		const React = require('react');
		const h = React.createElement;

		/** Locale namespace owned by this plugin. */
		const NS = 'backgroundMap';
		/** Key of the wallpaper page inside the main column. */
		const PANEL_KEY = 'background';
		/** Owned stylesheet identity for the panel chrome, reused across reloads. */
		const PANEL_CSS_ID = '@local/dsh-background/panel.css';
		/** Owned stylesheet identity for the wallpaper layers, injected only
		    while a picture is set. */
		const WALL_CSS_ID = '@local/dsh-background/wallpaper.css';
		/** Runtime variables injected by this plugin while a picture is set. */
		const VAR_PREFIX = '--dsh-bgmap-';

		/**
		 * Resolve this build's hashed AppFrame class names at runtime.
		 *
		 * DSH mangles its CSS-module classes (e.g. `.mP3x-q_frame`) and the hash
		 * changes per build, so the sidebar/center selectors are read from the
		 * `ui-layout` stylesheet rather than hard-coded. Returns null if the
		 * sheet can't be found — the caller then skips the column rules so the
		 * wallpaper still shows without any glass rather than a wrong split.
		 */
		function resolveShellClasses() {
			const tag = document.querySelector('style[data-plugin-css*="ui-layout"]');
			const css = tag === null ? '' : tag.textContent;
			/* Each column is `.PREFIX_role`; grab the full class (hash + role), not
			   just the shared hash — a bare hash matches nothing and would collapse
			   every selector onto one dead class. */
			const match = (role) => {
				const m = css.match(new RegExp('\\.([A-Za-z0-9_-]+_' + role + ')\\{'));
				return m === null ? null : m[1];
			};
			const frame = match('frame');
			const sidebar = match('sidebarCol');
			const center = match('centerCol');
			if (frame === null || sidebar === null || center === null) return null;
			return { frame, sidebar, center };
		}

		/** localStorage key of the small settings record. */
		const SETTINGS_KEY = 'dsh-background.settings.v1';
		/** localStorage key of the uploaded image (data URL), kept separate so
		    slider drags never re-serialize a multi-megabyte string. */
		const IMAGE_KEY = 'dsh-background.image.v1';

		/** Largest stored data URL; ~3.3MB binary leaves headroom under the
		    5MB per-origin localStorage budget. */
		const IMAGE_BUDGET = 3_500_000;
		/** Longest stored edge of an uploaded picture before re-encoding. */
		const IMAGE_MAX_EDGE = 2560;
		/** Blank-surface base color of the wallpaper layer (neutral dark grey —
		    no hue, so it never tints the picture blue). */
		const BLANK_COLOR = '#141416';

		/** Factory defaults. */
		const DEFAULTS = Object.freeze({
			posX: 0,
			posY: 0,
			alphaMain: 0.5,
			alphaSide: 0.58,
			blur: 0,
			fit: 'cover',
		});

		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			entry: '壁纸',
			title: '壁纸设置',
			subtitle: 'DeepSeek Harness 界面背景',
			preview: '预览',
			image: '图片',
			noImage: '尚未设置图片，当前为深色空白背景',
			currentCustom: '当前使用自定义图片',
			upload: '上传图片',
			clearImage: '清除图片',
			uploadFailed: '图片处理失败',
			storageFailed: '本机存储空间不足，图片未能保存',
			position: '位置',
			posX: '水平偏移',
			posY: '垂直偏移',
			glass: '玻璃不透明度',
			glassMain: '主区域',
			glassSide: '侧栏',
			glassHint: '数值越大表面越实、文字越清楚；0% 时该区域没有玻璃，文字直接压在壁纸上。',
			blur: '背景模糊',
			blurValue: 'px',
			fit: '适应方式',
			fitCover: '填满裁剪',
			fitContain: '完整显示',
			fitTile: '平铺',
			reset: '恢复全部默认',
			storageHint: '设置与图片只保存在本机浏览器中，不会上传到任何服务器；在浏览器里打开的窗口与本桌面应用各自记忆一份。',
		};

		/* ---------------------------------------------------------- panel styles */

		/**
		 * Styles for the settings panel, the sidebar entry, and the miniature —
		 * owned chrome only, applied whenever this plugin is mounted and removed
		 * again on dispose. The wallpaper layers themselves are declared
		 * separately and injected only while a picture is set, so an idle plugin
		 * still leaves the document fully stock.
		 */
		const PANEL_CSS = [
			'.dshBgPage{height:100%;min-height:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}',
			'.dshBgHeader{flex:none;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 24px 12px;border-bottom:0.5px solid var(--dsw-alias-border-l1)}',
			'[data-platform="darwin"] .dshBgHeader{padding-top:calc(18px + var(--dsh-frame-top-clearance,0px))}',
			'.dshBgTitle{font-size:15px;line-height:22px;font-weight:600}',
			'.dshBgSubtitle{margin-top:4px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
			'.dshBgBody{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;align-items:center;gap:14px;padding:14px 24px 28px}',
			'.dshBgBody>*{flex:none;width:100%;max-width:880px;min-width:0}',
			'.dshBgLayout{display:grid;grid-template-columns:260px minmax(0,1fr);gap:12px;align-items:start}',
			'.dshBgLayoutSide,.dshBgLayoutMain{display:flex;flex-direction:column;gap:12px;min-width:0}',
			'@media (max-width:720px){.dshBgLayout{grid-template-columns:minmax(0,1fr)}}',
			'.dshBgSection{padding:14px 16px;border:0.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg,10px);background:var(--dsw-alias-bg-layer-1);overflow:hidden}',
			'.dshBgSectionTitle{margin-bottom:12px;font-size:13px;line-height:20px;font-weight:600}',
			'.dshBgPreviewWindow{position:relative;overflow:hidden;border:0.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md,8px);background:#07091a}',
			'.dshBgPreviewTitlebar{position:absolute;left:0;right:0}',
			'.dshBgPreviewSide{position:absolute;bottom:0;box-sizing:border-box;padding:5% 4%;display:flex;flex-direction:column;gap:7%;overflow:hidden}',
			'.dshBgPreviewNav{flex:none;height:9%;border-radius:999px}',
			'.dshBgPreviewMain{position:absolute;bottom:0;right:0;box-sizing:border-box;padding:5%;display:flex;flex-direction:column;gap:7%;overflow:hidden}',
			'.dshBgPreviewBubble{flex:none;height:15%;border-radius:10px}',
			'.dshBgPreviewUser{align-self:flex-end;height:10%}',
			'.dshBgPreviewComposer{margin-top:auto;flex:none;height:13%;border-radius:10px}',
			'.dshBgRow{display:flex;align-items:center;gap:12px;min-height:30px}',
			'.dshBgRow+.dshBgRow{margin-top:8px}',
			'.dshBgRowLabel{flex:none;width:72px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:20px}',
			'.dshBgRange{flex:1;min-width:0;accent-color:var(--dsw-alias-brand-primary)}',
			'.dshBgRangeValue{flex:none;width:72px;text-align:right;font-size:12px;line-height:20px;font-variant-numeric:tabular-nums}',
			'.dshBgHint{margin-top:10px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
			'.dshBgActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
			'.dshBgStatus{min-width:0;flex:1 1 240px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
			'.dshBgButton{flex:none;box-sizing:border-box;padding:5px 12px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}',
			'.dshBgButton:hover{background:var(--dsw-alias-bg-layer-2)}',
			'.dshBgButton:disabled{color:var(--dsw-alias-label-secondary);cursor:default}',
			'.dshBgSegment{display:inline-flex;border:0.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,6px);overflow:hidden}',
			'.dshBgSegmentButton{padding:5px 12px;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}',
			'.dshBgSegmentButton:hover{background:var(--dsw-alias-interactive-bg-hover)}',
			'.dshBgSegmentButton[data-active="true"]{background:var(--dsw-alias-interactive-bg-hover);font-weight:600}',
			'.dshBgEntry{box-sizing:border-box;display:inline-flex;align-items:center;gap:8px;width:100%;min-width:0;height:42px;margin:8px 0 0;padding:0 10px 0 8px;border:0;border-radius:var(--dsw-radius-md,12px);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:22px;cursor:pointer;overflow:hidden}',
			'.dshBgEntry:hover,.dshBgEntry[data-active="true"]{background:var(--dsw-alias-interactive-bg-hover)}',
			'.dshBgEntry:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:-2px}',
			'.dshBgEntry[data-rail="true"]{justify-content:center;gap:0;width:36px;height:36px;margin:0;padding:0;border-radius:50%}',
			'.dshBgEntryGlyph{flex:none}',
			'.dshBgEntryLabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.dshBgError{color:var(--dsw-alias-state-error-primary)}',
			/* The stock Windows content rounding reads as a notch over the
			   wallpaper; the user wants it square in every state, picture or not. */
			'[class*="_centerCol"]{border-radius:0!important}',
		].join('');

		/** English dictionary, checked complete against the zh key set. */
		const en = {
			entry: 'Wallpaper',
			title: 'Wallpaper settings',
			subtitle: 'DeepSeek Harness interface background',
			preview: 'Preview',
			image: 'Image',
			noImage: 'No picture set; the background is a dark blank surface',
			currentCustom: 'Using a custom picture',
			upload: 'Upload picture',
			clearImage: 'Clear picture',
			uploadFailed: 'Picture processing failed',
			storageFailed: 'Local storage is full; the picture was not saved',
			position: 'Position',
			posX: 'Horizontal offset',
			posY: 'Vertical offset',
			glass: 'Glass opacity',
			glassMain: 'Main area',
			glassSide: 'Sidebar',
			glassHint: 'Higher values make surfaces more solid and text clearer; at 0% the area has no glass and text sits directly on the wallpaper.',
			blur: 'Background blur',
			blurValue: 'px',
			fit: 'Fit',
			fitCover: 'Cover',
			fitContain: 'Contain',
			fitTile: 'Tile',
			reset: 'Reset all',
			storageHint: 'Settings and the picture live only in this browser\'s local storage; nothing is uploaded anywhere.',
		};

		/* ---------------------------------------------------------------- storage */

		/** Read the persisted settings, filling absent or invalid keys from the defaults. */
		function loadSettings() {
			const settings = { ...DEFAULTS };
			try {
				const raw = window.localStorage.getItem(SETTINGS_KEY);
				if (raw !== null) {
					const parsed = JSON.parse(raw);
					if (parsed !== null && typeof parsed === 'object') {
						for (const key of Object.keys(DEFAULTS)) {
							const value = parsed[key];
							if (typeof value === typeof DEFAULTS[key]) settings[key] = value;
						}
					}
				}
			} catch {
				/* Unreadable storage or payload: keep the defaults. */
			}
			return settings;
		}

		/** Persist the settings record; a failed write keeps the session state only. */
		function saveSettings(settings) {
			try {
				window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
			} catch {
				/* Storage unavailable (quota, privacy mode). */
			}
		}

		/** Read the persisted custom image, or null when absent or unusable. */
		function loadImage() {
			try {
				const value = window.localStorage.getItem(IMAGE_KEY);
				return typeof value === 'string' && value.startsWith('data:image/') ? value : null;
			} catch {
				return null;
			}
		}

		/** Persist or clear the custom image; false means storage refused it. */
		function saveImage(dataUrl) {
			try {
				if (dataUrl === null) window.localStorage.removeItem(IMAGE_KEY);
				else window.localStorage.setItem(IMAGE_KEY, dataUrl);
				return true;
			} catch {
				return false;
			}
		}

		/* ------------------------------------------------------------- runtime CSS */

		/**
		 * Build the whole stylesheet for one settings record. Nothing is declared
		 * while no picture is set — the document keeps its stock appearance and
		 * this plugin adds no layer, no tint, no token overrides at all. With a
		 * picture, the wallpaper layer sits behind the shell and the main-area
		 * glass lives in one fixed tint so every page (conversation, Plugins,
		 * Settings) shares the same background whatever it paints itself.
		 */
		function buildCss(settings, shell) {
			const rules = [
				/* Overscroll and pre-paint edges match the blank surface under the
				   picture; the light palette only matters once a picture exists. */
				'html{background:' + BLANK_COLOR + '}',
				'html:has(body:not([data-ds-dark-theme])){background:#f4f4f6}',
				/* The shell body paints nothing itself: the wallpaper layer below
				   holds the picture, and the per-column glass layers above read the
				   alpha variables. The glass is a neutral tint (dark: near-black
				   grey, light: white grey) — no hue of its own, so it darkens or
				   lightens the picture without pushing it blue. The base token is
				   fully transparent so every page sits on the per-column layers,
				   whatever it paints itself. The sidebar-fill token becomes the
				   sidebar's glass: the sidebar's INNER content root paints that
				   token over the whole column (an opaque stock fill otherwise),
				   and it is consumed only by sidebar surfaces, so this slider
				   stays independent of the main-area tint. */
				'body{background:0 0!important;--dsw-alias-bg-base:transparent!important',
				';--dsw-specific-sidebar-fill:rgb(24 24 26 / var(' + VAR_PREFIX + 'alpha-side))!important}',
				'body:not([data-ds-dark-theme]){--dsw-specific-sidebar-fill:rgb(244 244 246 / var(' + VAR_PREFIX + 'alpha-side))!important}',
				/* The wallpaper layer: fixed behind the shell, oversized by the blur
				   radius so a blurred picture never shows fringed edges. */
				'body::before{content:"";position:fixed;z-index:-1;inset:calc(0px - var(' + VAR_PREFIX + 'blur) - 2px)',
				';background-color:' + BLANK_COLOR,
				';background-image:var(' + VAR_PREFIX + 'image)',
				';background-position:calc(50% + var(' + VAR_PREFIX + 'x)) calc(50% + var(' + VAR_PREFIX + 'y))',
				';background-size:var(' + VAR_PREFIX + 'size);background-repeat:var(' + VAR_PREFIX + 'repeat)',
				';filter:blur(var(' + VAR_PREFIX + 'blur))}',
			];
			/* Column glass rules need the resolved class names; without them the
			   wallpaper still shows and the stock opaque columns remain on top
			   (visually plain, not wrong). */
			if (shell !== null) {
				const f = `.${shell.frame}`;
				const side = `.${shell.sidebar}`;
				const ctr = `.${shell.center}`;
				rules.push(
					/* Zero the structural layers: the sidebar's visible glass comes
					   from its inner content root via the sidebar-fill token above
					   (one layer), and the center is repainted below with its own
					   tint (one layer). Painting the sidebarCol shell too would
					   stack a second glass under the inner root. */
					`${f},${side},${ctr}{background:0 0!important}`,
					/* Main-area glass tint: applied ONLY to the center column,
					   matching the preview exactly — a per-column layer, never a
					   viewport layer, so the sidebar slider can never reach it. */
					`${ctr}{background:rgb(20 20 22 / var(${VAR_PREFIX}alpha-main))!important}`,
					`body:not([data-ds-dark-theme]) ${ctr}{background:rgb(250 250 252 / var(${VAR_PREFIX}alpha-main))!important}`,
				);
			}
			return rules.join('');
		}

		/** Remove the runtime variables and the wallpaper stylesheet. */
		function clearRuntime() {
			const root = document.documentElement.style;
			/* CSSStyleDeclaration enumerates as INDICES, not names — collect the
			   custom-property names by position first, then remove. */
			const names = [];
			for (let i = 0; i < root.length; i++) {
				const name = root[i];
				if (name.startsWith(VAR_PREFIX)) names.push(name);
			}
			for (const name of names) root.removeProperty(name);
			document.querySelector('style[data-plugin-css="' + WALL_CSS_ID + '"]')?.remove();
		}

		/**
		 * Publish the current settings to the document: with a picture, ensure the
		 * wallpaper stylesheet exists and the variables drive it; without one,
		 * ensure that stylesheet is gone and every variable is cleared, so the
		 * document is byte-for-byte the stock shell. The panel chrome stylesheet
		 * (PANEL_CSS) is mounted separately whenever this plugin is loaded.
		 */
		function applyRuntime(settings, imageDataUrl) {
			const root = document.documentElement.style;
			const set = (name, value) => root.setProperty(name, value);
			if (typeof imageDataUrl === 'string') {
				/* Rebuild the stylesheet whenever its content is stale — not only
				   when the tag is missing. `resolveShellClasses` depends on the
				   ui-layout stylesheet, which may load AFTER this plugin during
				   boot; without the refresh, a stylesheet built too early would
				   lack the column glass rules forever and the sliders would move
				   variables nothing consumed. Rebuilding is cheap (a small string
				   compared on every apply). */
				const freshCss = buildCss(settings, resolveShellClasses());
				let tag = document.querySelector('style[data-plugin-css="' + WALL_CSS_ID + '"]');
				if (tag === null) {
					tag = document.createElement('style');
					tag.dataset.plugin = '@local/dsh-background';
					tag.dataset.pluginCss = WALL_CSS_ID;
					document.head.appendChild(tag);
				}
				if (tag.textContent !== freshCss) tag.textContent = freshCss;
				set(`${VAR_PREFIX}x`, `${settings.posX}cm`);
				set(`${VAR_PREFIX}y`, `${settings.posY}cm`);
				set(`${VAR_PREFIX}alpha-main`, String(settings.alphaMain));
				set(`${VAR_PREFIX}alpha-side`, String(settings.alphaSide));
				set(`${VAR_PREFIX}blur`, `${settings.blur}px`);
				const tiled = settings.fit === 'tile';
				set(`${VAR_PREFIX}size`, tiled ? 'auto' : settings.fit === 'contain' ? 'contain' : 'cover');
				set(`${VAR_PREFIX}repeat`, tiled ? 'repeat' : 'no-repeat');
				set(`${VAR_PREFIX}image`, `url("${imageDataUrl}")`);
			} else {
				clearRuntime();
			}
		}

		/* ------------------------------------------------------------ upload codec */

		/** Draw one picture file onto a canvas bounded to maxEdge. */
		function drawToCanvas(file, maxEdge) {
			return createImageBitmap(file).then((bitmap) => {
				const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
				const width = Math.max(1, Math.round(bitmap.width * scale));
				const height = Math.max(1, Math.round(bitmap.height * scale));
				const canvas = document.createElement('canvas');
				canvas.width = width;
				canvas.height = height;
				const context = canvas.getContext('2d');
				context.drawImage(bitmap, 0, 0, width, height);
				bitmap.close();
				return canvas;
			});
		}

		/**
		 * Re-encode an uploaded picture into a storable data URL: PNG is kept when
		 * it fits (transparency preserved), otherwise a JPEG ladder steps down
		 * edge length and quality until the encoded size enters the budget.
		 */
		async function encodeUpload(file) {
			const canvas = await drawToCanvas(file, IMAGE_MAX_EDGE);
			if (file.type === 'image/png') {
				const png = canvas.toDataURL('image/png');
				if (png.length <= IMAGE_BUDGET) return png;
			}
			let edge = IMAGE_MAX_EDGE;
			let quality = 0.85;
			for (;;) {
				const stepCanvas = edge === IMAGE_MAX_EDGE ? canvas : await drawToCanvas(file, edge);
				const jpeg = stepCanvas.toDataURL('image/jpeg', quality);
				if (jpeg.length <= IMAGE_BUDGET || edge <= 720) return jpeg;
				edge = Math.round(edge * 0.75);
				quality = Math.max(0.72, quality - 0.03);
			}
		}

		/* ------------------------------------------------------------- components */

		/** Render localized copy through the slot-provided translator. */
		function translator(props) {
			return typeof props.t === 'function' ? props.t : (key) => key;
		}

		/** Rounded-rectangle picture glyph drawn from the current text color. */
		function Glyph(props) {
			const size = props.size ?? 16;
			return h(
				'svg',
				{
					className: 'dshBgEntryGlyph',
					width: size,
					height: size,
					viewBox: '0 0 16 16',
					'aria-hidden': true,
					focusable: false,
				},
				h('rect', { x: 1.5, y: 2.5, width: 13, height: 11, rx: 2, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }),
				h('circle', { cx: 5.6, cy: 6.4, r: 1.4, fill: 'currentColor' }),
				h('path', { d: 'M3 12.5 L7 8.5 L10 11 L12.8 8.4 L14.5 10', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
			);
		}

		/** The sidebar-footer entry that toggles the wallpaper page. */
		function WallpaperEntry(props) {
			const t = translator(props);
			const wide = props.wide !== false;
			const usePanelInfo = props.usePanelInfo;
			const active = typeof usePanelInfo === 'function' ? usePanelInfo((info) => info.activePanelId === PANEL_KEY) : false;
			return h(
				'button',
				{
					type: 'button',
					className: 'dshBgEntry',
					'data-rail': wide ? 'false' : 'true',
					'data-active': active ? 'true' : 'false',
					title: t('entry'),
					'aria-label': t('entry'),
					'aria-current': active ? 'page' : undefined,
					onClick: () => props.togglePanel(),
				},
				h(Glyph, { size: wide ? 16 : 18 }),
				wide ? h('span', { className: 'dshBgEntryLabel' }, t('entry')) : null,
			);
		}

		/** One labeled slider row with a live value readout. */
		function SliderRow(props) {
			return h(
				'div',
				{ className: 'dshBgRow' },
				h('span', { className: 'dshBgRowLabel' }, props.label),
				h('input', {
					className: 'dshBgRange',
					type: 'range',
					min: props.min,
					max: props.max,
					step: props.step,
					value: props.value,
					'aria-label': props.label,
					onChange: (event) => props.onChange(Number(event.target.value)),
				}),
				h('span', { className: 'dshBgRangeValue' }, props.text),
			);
		}

		/** Track the body palette attribute so previews re-render on theme flips. */
		function useDarkTheme() {
			const [dark, setDark] = React.useState(() => document.body.hasAttribute('data-ds-dark-theme'));
			React.useEffect(() => {
				const observer = new MutationObserver(() => setDark(document.body.hasAttribute('data-ds-dark-theme')));
				observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
				return () => observer.disconnect();
			}, []);
			return dark;
		}

		/**
		 * Measure the real window and shell proportions for the miniature.
		 */
		function measureShell() {
			const innerWidth = Math.max(1, window.innerWidth);
			const innerHeight = Math.max(1, window.innerHeight);
			const shell = resolveShellClasses();
			let sidebarRatio = 0.21;
			const sidebar = shell === null ? null : document.querySelector(`.${shell.sidebar}`);
			if (sidebar !== null) {
				const width = sidebar.getBoundingClientRect().width;
				if (width > 0) sidebarRatio = Math.min(0.6, width / innerWidth);
			}
			let titlebarRatio = 0;
			const frame = shell === null ? null : document.querySelector(`.${shell.frame}`);
			if (frame !== null) {
				const padding = Number.parseFloat(getComputedStyle(frame).paddingTop);
				if (Number.isFinite(padding) && padding > 0) titlebarRatio = Math.min(0.2, padding / innerHeight);
			}
			return { innerWidth, innerHeight, sidebarRatio, titlebarRatio };
		}

		/** Live shell geometry, re-measured on resize and sidebar relayout. */
		function useShellGeometry() {
			const [geo, setGeo] = React.useState(measureShell);
			React.useEffect(() => {
				const update = () => setGeo(measureShell());
				window.addEventListener('resize', update);
				const sidebar = document.querySelector('.BynINW_sidebarCol');
				const observer = sidebar === null ? null : new ResizeObserver(update);
				if (observer !== null) observer.observe(sidebar);
				return () => {
					window.removeEventListener('resize', update);
					if (observer !== null) observer.disconnect();
				};
			}, []);
			return geo;
		}

		/**
		 * Miniature of the whole application shell over the live wallpaper layer.
		 * The image layer is laid out at the REAL viewport's pixel size and then
		 * scaled into the box, so cover-cropping, percentage centering, and the
		 * centimeter offsets are exactly what the shell renders.
		 */
		function PreviewWindow(props) {
			const t = translator(props);
			const settings = props.settings;
			const image = props.image;
			const dark = useDarkTheme();
			const geo = useShellGeometry();
			const boxRef = React.useRef(null);
			const [boxWidth, setBoxWidth] = React.useState(0);
			React.useEffect(() => {
				const element = boxRef.current;
				if (element === null) return undefined;
				const observer = new ResizeObserver(() => setBoxWidth(element.getBoundingClientRect().width));
				observer.observe(element);
				return () => observer.disconnect();
			}, []);
			const scale = boxWidth > 0 ? boxWidth / geo.innerWidth : 0;
			const sideGlass = dark
				? `rgb(24 24 26 / ${settings.alphaSide})`
				: `rgb(244 244 246 / ${settings.alphaSide})`;
			const tint = dark
				? `rgb(20 20 22 / ${settings.alphaMain})`
				: `rgb(250 250 252 / ${settings.alphaMain})`;
			const nav = dark ? 'rgba(255,255,255,.08)' : 'rgba(18,22,38,.08)';
			/* Bubble/composer use the theme's default opaque surface colors — the
			   layer tokens are not overridden, so the preview matches. */
			const bubble = dark ? '#232324' : '#fff';
			const composer = dark ? '#2c2c2e' : '#fff';
			const pad = settings.blur + 2;
			const sidePercent = geo.sidebarRatio * 100;
			const titlebarPercent = geo.titlebarRatio * 100;
			return h(
				'div',
				{
					ref: boxRef,
					className: 'dshBgPreviewWindow',
					style: scale > 0 ? { aspectRatio: `${geo.innerWidth} / ${geo.innerHeight}` } : undefined,
					role: 'img',
					'aria-label': t('preview'),
				},
				scale > 0
					? h('div', {
							style: {
								position: 'absolute',
								left: -pad,
								top: -pad,
								width: geo.innerWidth + pad * 2,
								height: geo.innerHeight + pad * 2,
								transform: `scale(${scale})`,
								transformOrigin: '0 0',
								backgroundColor: BLANK_COLOR,
								backgroundImage: image !== null ? `url("${image}")` : undefined,
								backgroundPosition: `calc(50% + ${settings.posX}cm) calc(50% + ${settings.posY}cm)`,
								backgroundSize: settings.fit === 'tile' ? 'auto' : settings.fit === 'contain' ? 'contain' : 'cover',
								backgroundRepeat: settings.fit === 'tile' ? 'repeat' : 'no-repeat',
								filter: `blur(${settings.blur}px)`,
							},
						})
					: null,
				/* Main-area tint: same cut-out as the real shell — it never paints
				   over the sidebar strip, so the sidebar's own glass is the only
				   layer there and the two sliders stay independent. */
				h('div', {
					style: {
						position: 'absolute',
						top: 0,
						bottom: 0,
						left: `${sidePercent}%`,
						right: 0,
						background: tint,
					},
				}),
				geo.titlebarRatio > 0
					? h('div', { className: 'dshBgPreviewTitlebar', style: { top: 0, height: `${titlebarPercent}%`, background: sideGlass } })
					: null,
				geo.sidebarRatio > 0.02
					? h(
							'div',
							{ className: 'dshBgPreviewSide', style: { top: `${titlebarPercent}%`, left: 0, width: `${sidePercent}%`, background: sideGlass } },
							h('div', { className: 'dshBgPreviewNav', style: { background: nav } }),
							h('div', { className: 'dshBgPreviewNav', style: { background: nav } }),
							h('div', { className: 'dshBgPreviewNav', style: { background: nav } }),
						)
					: null,
				h(
					'div',
					{ className: 'dshBgPreviewMain', style: { top: `${titlebarPercent}%`, left: `${sidePercent}%` } },
					h('div', { className: 'dshBgPreviewBubble', style: { background: bubble } }),
					h('div', { className: 'dshBgPreviewBubble dshBgPreviewUser', style: { background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent)' } }),
					h('div', { className: 'dshBgPreviewComposer', style: { background: composer } }),
				),
			);
		}

		/** The wallpaper settings page rendered in the main column. */
		function WallpaperPage(props) {
			const t = translator(props);
			const [settings, setSettings] = React.useState(loadSettings);
			const [image, setImage] = React.useState(loadImage);
			const [busy, setBusy] = React.useState(false);
			const [error, setError] = React.useState(null);

			/** Fold one change into the settings, persist it, and reapply live. */
			const change = (patch) => {
				const next = { ...settings, ...patch };
				setSettings(next);
				saveSettings(next);
				applyRuntime(next, image);
			};

			/** Encode, store, and apply one uploaded picture. */
			const upload = (event) => {
				const file = event.target.files?.[0];
				event.target.value = '';
				if (file === undefined) return;
				setBusy(true);
				setError(null);
				encodeUpload(file)
					.then((dataUrl) => {
						if (!saveImage(dataUrl)) {
							setError(t('storageFailed'));
							return;
						}
						setImage(dataUrl);
						applyRuntime(settings, dataUrl);
					})
					.catch((cause) => {
						setError(cause instanceof Error ? cause.message : String(cause));
					})
					.finally(() => {
						setBusy(false);
					});
			};

			const clearImage = () => {
				saveImage(null);
				setImage(null);
				applyRuntime(settings, null);
			};

			const resetAll = () => {
				const next = { ...DEFAULTS };
				saveImage(null);
				saveSettings(next);
				setImage(null);
				setSettings(next);
				applyRuntime(next, null);
			};

			const header = h(
				'div',
				{ className: 'dshBgHeader' },
				h(
					'div',
					null,
					h('div', { className: 'dshBgTitle' }, t('title')),
					h('div', { className: 'dshBgSubtitle' }, t('subtitle')),
				),
			);

			return h(
				'div',
				{ className: 'dshBgPage' },
				header,
				h(
					'div',
					{ className: 'dshBgBody' },
					h(
						'div',
						{ className: 'dshBgLayout' },
						h(
							'div',
							{ className: 'dshBgLayoutSide' },
							h(
								'div',
								{ className: 'dshBgSection' },
								h('div', { className: 'dshBgSectionTitle' }, t('preview')),
								h(PreviewWindow, { t: props.t, settings, image }),
							),
							h(
								'div',
								{ className: 'dshBgSection' },
								h('div', { className: 'dshBgSectionTitle' }, t('image')),
								h(
									'div',
									{ className: 'dshBgActions' },
									h(
										'button',
										{ type: 'button', className: 'dshBgButton', disabled: busy, onClick: () => document.getElementById('dsh-bgmap-file').click() },
										busy ? '…' : t('upload'),
									),
									h('input', { id: 'dsh-bgmap-file', type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: upload }),
								),
								h(
									'div',
									{ className: 'dshBgStatus', style: { marginTop: '8px' } },
									image === null ? t('noImage') : t('currentCustom'),
									error !== null ? h('span', { className: 'dshBgError' }, ` · ${error}`) : null,
								),
								h(
									'div',
									{ className: 'dshBgActions', style: { marginTop: '8px' } },
									h('button', { type: 'button', className: 'dshBgButton', disabled: busy || image === null, onClick: clearImage }, t('clearImage')),
								),
							),
						),
						h(
							'div',
							{ className: 'dshBgLayoutMain' },
							h(
								'div',
								{ className: 'dshBgSection' },
									h('div', { className: 'dshBgSectionTitle' }, t('position')),
									h(SliderRow, {
										label: t('posX'),
										min: -10, max: 10, step: 0.1,
										value: settings.posX,
										text: `${settings.posX.toFixed(1)} cm`,
										onChange: (value) => change({ posX: value }),
									}),
									h(SliderRow, {
										label: t('posY'),
										min: -10, max: 10, step: 0.1,
										value: settings.posY,
										text: `${settings.posY.toFixed(1)} cm`,
										onChange: (value) => change({ posY: value }),
									}),
							),
							h(
								'div',
								{ className: 'dshBgSection' },
									h('div', { className: 'dshBgSectionTitle' }, t('glass')),
									h(SliderRow, {
										label: t('glassMain'),
										min: 0, max: 95, step: 1,
										value: Math.round(settings.alphaMain * 100),
										text: `${Math.round(settings.alphaMain * 100)}%`,
										onChange: (value) => change({ alphaMain: value / 100 }),
									}),
									h(SliderRow, {
										label: t('glassSide'),
										min: 0, max: 95, step: 1,
										value: Math.round(settings.alphaSide * 100),
										text: `${Math.round(settings.alphaSide * 100)}%`,
										onChange: (value) => change({ alphaSide: value / 100 }),
									}),
									h('div', { className: 'dshBgHint' }, t('glassHint')),
							),
							h(
								'div',
								{ className: 'dshBgSection' },
									h('div', { className: 'dshBgSectionTitle' }, t('blur')),
									h(SliderRow, {
										label: t('blur'),
										min: 0, max: 24, step: 1,
										value: settings.blur,
										text: `${settings.blur} ${t('blurValue')}`,
										onChange: (value) => change({ blur: value }),
									}),
							),
							h(
								'div',
								{ className: 'dshBgSection' },
									h('div', { className: 'dshBgSectionTitle' }, t('fit')),
									h(
										'div',
										{ className: 'dshBgSegment', role: 'group' },
										['cover', 'contain', 'tile'].map((mode) =>
											h(
												'button',
												{
													key: mode,
													type: 'button',
													className: 'dshBgSegmentButton',
													'data-active': settings.fit === mode ? 'true' : 'false',
													onClick: () => change({ fit: mode }),
												},
												t(`fit${mode[0].toUpperCase()}${mode.slice(1)}`),
											),
										),
									),
							),
							h(
								'div',
								{ className: 'dshBgActions' },
								h('button', { type: 'button', className: 'dshBgButton', onClick: resetAll }, t('reset')),
							),
							h('div', { className: 'dshBgHint' }, t('storageHint')),
						),
					),
				),
			);
		}

		/* ------------------------------------------------------------------ plugin */

		/** Client services required by this plugin. */
		const inject = ['slots', 'layout', 'locale'];

		/**
		 * Register the dictionaries, the owned stylesheet, the runtime variables,
		 * the wallpaper page, and the sidebar-footer entry.
		 * @param ctx - browser plugin context.
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'background: dictionaries');
			const t = ctx.locale.bind(NS);

			ctx.effect(() => {
				const tag = document.createElement('style');
				tag.dataset.plugin = '@local/dsh-background';
				tag.dataset.pluginCss = PANEL_CSS_ID;
				tag.textContent = PANEL_CSS;
				document.head.appendChild(tag);
				return () => {
					tag.remove();
				};
			}, 'background: panel styles');

			ctx.effect(() => {
				/* With no picture the document keeps its stock background: no
				   wallpaper stylesheet, no variables, no layers. */
				applyRuntime(loadSettings(), loadImage());
				/* Self-heal the boot race: if this plugin's stylesheet was built
				   before the ui-layout sheet existed, it lacks the column rules.
				   Watch the head and re-sync as soon as ui-layout arrives (or its
				   sheet changes across a hot reload). The check is cheap and only
				   rebuilds when the resolved classes are missing. */
				const observer = new MutationObserver(() => {
					const tag = document.querySelector('style[data-plugin-css="' + WALL_CSS_ID + '"]');
					if (tag === null) return;
					const shell = resolveShellClasses();
					if (shell === null || tag.textContent.includes(shell.frame)) return;
					applyRuntime(loadSettings(), loadImage());
				});
				observer.observe(document.head, { childList: true });
				return () => {
					observer.disconnect();
					clearRuntime();
				};
			}, 'background: runtime variables');

			/** Show this page, or return to the Conversation when it is already active. */
			const togglePanel = () => {
				const current = ctx.layout.panelInfo.getSnapshot().activePanelId;
				ctx.layout.selectPanel(current === PANEL_KEY ? null : PANEL_KEY);
			};


			ctx.slots.inject('main', () =>
				ctx.slots.register(
					{
						name: 'main',
						key: PANEL_KEY,
						locale: NS,
						inject: () => ({}),
					},
					WallpaperPage,
				),
			);

			ctx.slots.inject('sidebar.footer.action', () =>
				ctx.slots.register(
					{
						name: 'sidebar.footer.action',
						id: PANEL_KEY,
						order: -9,
						label: () => t('entry'),
						locale: NS,
						inject: () => ({ togglePanel }),
					},
					WallpaperEntry,
				),
			);
		}

		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	}
});
