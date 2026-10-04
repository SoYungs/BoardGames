import { readFile } from 'node:fs/promises'
import ts from 'typescript'

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
    try { return await nextResolve(`${specifier}.ts`, context) } catch (error) {
      if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error
    }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.ts')) {
    const source = await readFile(new URL(url), 'utf8')
    const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } })
    return { format: 'module', source: result.outputText, shortCircuit: true }
  }
  return nextLoad(url, context)
}
