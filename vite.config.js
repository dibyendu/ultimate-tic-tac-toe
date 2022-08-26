export default {
  server: {
    host: '0.0.0.0',
    hmr: {
      protocol: 'wss',
      port: 443
    }
  },
  build: {
    outDir: 'build'
  },
  resolve: {
    alias: {
      react: 'https://cdn.skypack.dev/pin/react@v17.0.1-yH0aYV1FOvoIPeKBbHxg/mode=imports,min/optimized/react.js',
      'react-dom': 'https://cdn.skypack.dev/pin/react-dom@v17.0.1-oZ1BXZ5opQ1DbTh7nu9r/mode=imports,min/optimized/react-dom.js',
      '@tensorflow/tfjs': 'https://cdn.skypack.dev/pin/@tensorflow/tfjs@v3.12.0-F9bp9qsyHrABR7f2JAQD/mode=imports,min/optimized/@tensorflow/tfjs.js'
    }
  }
}