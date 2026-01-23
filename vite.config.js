import path from 'node:path'
import react from '@vitejs/plugin-react'
import { createLogger, defineConfig } from 'vite'

const getSafePostMessageTargetOrigin = `
function __jobySafeTargetOrigin() {
	try {
		if (document.referrer) {
			return new URL(document.referrer).origin;
		}
	} catch (e) {
		// ignore
	}
	return window.location.origin;
}
`

const configHorizonsViteErrorHandler = `
${getSafePostMessageTargetOrigin}
const observer = new MutationObserver((mutations) => {
	for (const mutation of mutations) {
		for (const addedNode of mutation.addedNodes) {
			if (
				addedNode.nodeType === Node.ELEMENT_NODE &&
				(
					addedNode.tagName?.toLowerCase() === 'vite-error-overlay' ||
					addedNode.classList?.contains('backdrop')
				)
			) {
				handleViteOverlay(addedNode);
			}
		}
	}
});

observer.observe(document.documentElement, {
	childList: true,
	subtree: true
});

function handleViteOverlay(node) {
	if (!node.shadowRoot) {
		return;
	}

	const backdrop = node.shadowRoot.querySelector('.backdrop');

	if (backdrop) {
		const overlayHtml = backdrop.outerHTML;
		const parser = new DOMParser();
		const doc = parser.parseFromString(overlayHtml, 'text/html');
		const messageBodyElement = doc.querySelector('.message-body');
		const fileElement = doc.querySelector('.file');
		const messageText = messageBodyElement ? messageBodyElement.textContent.trim() : '';
		const fileText = fileElement ? fileElement.textContent.trim() : '';
		const error = messageText + (fileText ? ' File:' + fileText : '');

		window.parent.postMessage({
			type: 'horizons-vite-error',
			error,
		}, __jobySafeTargetOrigin());
	}
}
`

const configHorizonsRuntimeErrorHandler = `
${getSafePostMessageTargetOrigin}
window.onerror = (message, source, lineno, colno, errorObj) => {
	const errorDetails = errorObj ? JSON.stringify({
		name: errorObj.name,
		message: errorObj.message,
		stack: errorObj.stack,
		source,
		lineno,
		colno,
	}) : null;

	window.parent.postMessage({
		type: 'horizons-runtime-error',
		message,
		error: errorDetails
	}, __jobySafeTargetOrigin());
};
`

const configHorizonsConsoleErrroHandler = `
${getSafePostMessageTargetOrigin}
const originalConsoleError = console.error;
console.error = function(...args) {
	originalConsoleError.apply(console, args);

	let errorString = '';

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg instanceof Error) {
			errorString = arg.stack || \`\${arg.name}: \${arg.message}\`;
			break;
		}
	}

	if (!errorString) {
		errorString = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
	}

	window.parent.postMessage({
		type: 'horizons-console-error',
		error: errorString
	}, __jobySafeTargetOrigin());
};
`

const configWindowFetchMonkeyPatch = `
const originalFetch = window.fetch;

window.fetch = function(...args) {
	const url = args[0] instanceof Request ? args[0].url : args[0];

	// Skip WebSocket URLs
	if (url.startsWith('ws:') || url.startsWith('wss:')) {
		return originalFetch.apply(this, args);
	}

	return originalFetch.apply(this, args)
		.then(async response => {
			const contentType = response.headers.get('Content-Type') || '';

			// Exclude HTML document responses
			const isDocumentResponse =
				contentType.includes('text/html') ||
				contentType.includes('application/xhtml+xml');

			if (!response.ok && !isDocumentResponse) {
					const responseClone = response.clone();
					const errorFromRes = await responseClone.text();
					const requestUrl = response.url;
					console.error(\`Fetch error from \${requestUrl}: \${errorFromRes}\`);
			}

			return response;
		})
		.catch(error => {
			if (!url.match(/\.html?$/i)) {
				console.error(error);
			}

			throw error;
		});
};
`

const addTransformIndexHtml = {
  name: 'add-transform-index-html',
  transformIndexHtml(html) {
    return {
      html,
      tags: [
        {
          tag: 'script',
          attrs: { type: 'module' },
          children: configHorizonsRuntimeErrorHandler,
          injectTo: 'head',
        },
        {
          tag: 'script',
          attrs: { type: 'module' },
          children: configHorizonsViteErrorHandler,
          injectTo: 'head',
        },
        {
          tag: 'script',
          attrs: { type: 'module' },
          children: configHorizonsConsoleErrroHandler,
          injectTo: 'head',
        },
        {
          tag: 'script',
          attrs: { type: 'module' },
          children: configWindowFetchMonkeyPatch,
          injectTo: 'head',
        },
      ],
    }
  },
}

const logger = createLogger()
const loggerError = logger.error

logger.error = (msg, options) => {
  if (options?.error?.toString().includes('CssSyntaxError: [postcss]')) {
    return
  }

  loggerError(msg, options)
}

export default defineConfig(({ command }) => {
  const isDev = command === 'serve'
  return {
    customLogger: logger,
    plugins: [react(), ...(isDev ? [addTransformIndexHtml] : [])],
    server: {
      cors: true,
      headers: {
        'Cross-Origin-Embedder-Policy': 'credentialless',
      },
      allowedHosts: true,
      host: '0.0.0.0',
      port: 5173,
			// Proxy para o Cloudflare Worker local (porta 8787).
			// Isso permite que o frontend use URLs "normais" (mesma origem)
			// inclusive quando acessado via IP da rede (ex: http://192.168.0.101:5173).
			proxy: {
				'/upload-video': {
					target: 'http://127.0.0.1:8787',
					changeOrigin: true,
				},
				'/video': {
					target: 'http://127.0.0.1:8787',
					changeOrigin: true,
				},
				'/health': {
					target: 'http://127.0.0.1:8787',
					changeOrigin: true,
				},
			},
    },
    resolve: {
      extensions: ['.jsx', '.js', '.tsx', '.ts', '.json'],
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
