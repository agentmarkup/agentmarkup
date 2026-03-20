import { readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { Plugin, ResolvedConfig } from 'vite'
import {
  generatePageMarkdown,
  markdownFileNameFromHtmlFile,
  normalizePagePath,
} from '../packages/core/dist/index.js'

interface BundleEntryLike {
  type: 'chunk' | 'asset'
}

interface OutputChunkLike extends BundleEntryLike {
  type: 'chunk'
  isEntry: boolean
  facadeModuleId?: string | null
  fileName: string
}

type OutputBundleLike = Record<string, BundleEntryLike>
type MessagePortLike = {
  close?: () => void
  unref?: () => void
}

const SOURCE_ENTRY_SCRIPT_RE =
  /<script\b(?=[^>]*\btype="module\b)(?=[^>]*\bsrc="([^"]+)")[^>]*><\/script>/i
const EMPTY_ROOT_RE = /<div id="root">\s*<\/div>/i

export function websitePrerender(): Plugin {
  let config: ResolvedConfig
  let importVersion = 0
  const prerenderEntries = new Map<string, string>()

  return {
    name: 'agentmarkup-website-prerender',
    apply: 'build',
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    generateBundle(_options, bundle: OutputBundleLike) {
      prerenderEntries.clear()

      for (const chunk of Object.values(bundle)) {
        if (!isOutputChunkLike(chunk)) {
          continue
        }

        collectPrerenderEntry(prerenderEntries, chunk)
      }
    },
    async writeBundle() {
      const activeHandlesBeforeWrite = getActiveHandlesSnapshot()
      const outDir = resolve(config.root, config.build.outDir)
      const htmlFiles = await findHtmlFiles(outDir)

      for (const htmlFile of htmlFiles) {
        const html = await readFile(htmlFile, 'utf8')
        let nextHtml = html

        if (EMPTY_ROOT_RE.test(html)) {
          const sourceHtmlFile = resolve(config.root, relative(outDir, htmlFile))
          const sourceHtml = await readFile(sourceHtmlFile, 'utf8')
          const scriptMatch = sourceHtml.match(SOURCE_ENTRY_SCRIPT_RE)

          if (scriptMatch) {
            const scriptPath = resolve(config.root, scriptMatch[1].replace(/^\//, ''))
            const builtPrerenderEntry = prerenderEntries.get(scriptPath)

            if (builtPrerenderEntry) {
              const scriptFile = resolve(outDir, builtPrerenderEntry)
              const entryModule = await import(
                `${pathToFileURL(scriptFile).href}?v=${importVersion++}`
              )

              if (typeof entryModule.prerender === 'function') {
                const prerenderedHtml = await entryModule.prerender()
                if (
                  typeof prerenderedHtml !== 'string' ||
                  prerenderedHtml.length === 0
                ) {
                  throw new Error(`Prerender for ${htmlFile} returned no HTML.`)
                }

                nextHtml = html.replace(
                  EMPTY_ROOT_RE,
                  `<div id="root">${prerenderedHtml}</div>`,
                )
                await writeFile(htmlFile, nextHtml, 'utf8')
              }
            }
          }
        }

        const relativeHtmlPath = relative(outDir, htmlFile).replace(/\\/g, '/')
        const markdown = generatePageMarkdown({
          html: nextHtml,
          pagePath: pagePathFromOutputFile(relativeHtmlPath),
        })

        if (markdown) {
          const markdownFilePath = resolve(
            outDir,
            markdownFileNameFromHtmlFile(relativeHtmlPath),
          )
          await writeFile(markdownFilePath, markdown, 'utf8')
        }
      }

      await Promise.all(
        Array.from(prerenderEntries.values()).map(async (fileName) => {
          const filePath = resolve(outDir, fileName)
          try {
            await unlink(filePath)
          } catch {
            // Ignore missing files so cleanup stays idempotent.
          }
        }),
      )

      closeNewMessagePorts(activeHandlesBeforeWrite)
    },
  }
}

async function findHtmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const htmlFiles: string[] = []

  for (const entry of entries) {
    const entryPath = resolve(dir, entry.name)

    if (entry.isDirectory()) {
      htmlFiles.push(...(await findHtmlFiles(entryPath)))
      continue
    }

    if (entry.isFile() && entry.name.endsWith('.html')) {
      htmlFiles.push(entryPath)
    }
  }

  return htmlFiles
}

function collectPrerenderEntry(
  entries: Map<string, string>,
  chunk: OutputChunkLike,
) {
  if (
    !chunk.isEntry ||
    !chunk.facadeModuleId ||
    !chunk.fileName.includes('prerender-')
  ) {
    return
  }

  entries.set(resolve(chunk.facadeModuleId), chunk.fileName)
}

function isOutputChunkLike(value: BundleEntryLike): value is OutputChunkLike {
  return value.type === 'chunk'
}

function pagePathFromOutputFile(relativeHtmlPath: string): string {
  const candidatePath =
    relativeHtmlPath === 'index.html'
      ? '/'
      : `/${relativeHtmlPath.replace(/\/index\.html$/i, '/').replace(/\.html$/i, '')}`

  return normalizePagePath(candidatePath)
}

function getActiveHandlesSnapshot(): Set<object> {
  return new Set(getActiveHandles())
}

function closeNewMessagePorts(previousHandles: Set<object>) {
  for (const handle of getActiveHandles()) {
    if (previousHandles.has(handle)) {
      continue
    }

    if (handle.constructor?.name !== 'MessagePort') {
      continue
    }

    const messagePort = handle as MessagePortLike
    messagePort.unref?.()
    messagePort.close?.()
  }
}

function getActiveHandles(): object[] {
  const processWithActiveHandles = process as NodeJS.Process & {
    _getActiveHandles?: () => object[]
  }

  return processWithActiveHandles._getActiveHandles?.() ?? []
}
