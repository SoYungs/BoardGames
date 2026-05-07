import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 项目页：把仓库名改成你的 repo，或本地用 `VITE_BASE=/你的仓库名/ npm run build`
// 使用 Hash 路由时也可用 `base: './'` 便于任意子路径部署
const base = process.env.VITE_BASE ?? './'

export default defineConfig({
  plugins: [react()],
  base,
})
