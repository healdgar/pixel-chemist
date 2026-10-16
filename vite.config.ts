function singleFileHtmlPlugin() {
  return {
    name: 'single-file-html',
    enforce: 'post' as const,
    generateBundle(_options: unknown, bundle: Record<string, any>) {
      const htmlChunk = bundle['index.html'];
      if (!htmlChunk || htmlChunk.type !== 'asset' || typeof htmlChunk.source !== 'string') return;
      let html = htmlChunk.source;

      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (fileName.endsWith('.css') && chunk.type === 'asset') {
          const css = typeof chunk.source === 'string' ? chunk.source : new TextDecoder().decode(chunk.source);
          const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const linkRe = new RegExp(`<link[^>]+href=["'](?:\\.?\\/)?${escaped}["'][^>]*>`, 'i');
          html = html.replace(linkRe, () => `<style>${css}</style>`);
          delete bundle[fileName];
        } else if (fileName.endsWith('.js') && chunk.type === 'chunk') {
          const js = String(chunk.code).replace(/<\/script>/gi, '<\\/script>');
          const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const scriptRe = new RegExp(`<script[^>]+src=["'](?:\\.?\\/)?${escaped}["'][^>]*>\\s*<\\/script>`, 'i');
          html = html.replace(scriptRe, () => `<script type="module">${js}</script>`);
          delete bundle[fileName];
        }
      }

      htmlChunk.source = html;
    },
  };
}

export default {
  base: './',
  build: {
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
  },
  plugins: [singleFileHtmlPlugin()],
};

